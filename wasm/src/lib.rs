mod data_processor;
mod projection;
mod renderer;
mod types;
mod utils;

use crate::utils::{log, time, time_end};
use data_processor::{parse_polygons, parse_roads};
use projection::{calculate_bounds, project_points_mut};
use renderer::MapRenderer;
use serde::Deserialize;
use types::{RenderRequest, RenderResult};
use wasm_bindgen::prelude::*;

#[derive(Deserialize)]
struct JsonRenderRequest {
    center: types::Center,
    radius: f64,
    roads: String,
    water: String,
    parks: String,
    pois: Option<String>,  // POI 数据（JSON 字符串格式）
    theme: types::Theme,
    width: u32,
    height: u32,
    display_city: String,
    display_country: String,
}

// 嵌入 Roboto 字体（需要将字体文件放到 fonts/ 目录）
const ROBOTO_REGULAR: &[u8] = include_bytes!("../fonts/Roboto-Regular.ttf");

/// 初始化 panic hook
#[wasm_bindgen(start)]
pub fn init_panic_hook() {
    console_error_panic_hook::set_once();
}

/// 主渲染函数 (JSON 版本)
#[wasm_bindgen]
pub fn render_map(request_json: &str) -> RenderResult {
    // 1. 解析请求 (使用旧版平铺结构)
    let json_req: JsonRenderRequest = match serde_json::from_str(request_json) {
        Ok(req) => req,
        Err(e) => return RenderResult::error(format!("Failed to parse JSON request: {}", e)),
    };

    // 2. 将 JSON 字符串解析为结构化数据 (由于 JSON 接口仍传递字符串)
    time("render_map: parse_roads");
    let roads = match parse_roads(&json_req.roads) {
        Ok(r) => r,
        Err(e) => return RenderResult::error(format!("Failed to parse roads: {}", e)),
    };
    time_end("render_map: parse_roads");

    time("render_map: parse_water");
    let water = match parse_polygons(&json_req.water) {
        Ok(w) => w,
        Err(e) => return RenderResult::error(format!("Failed to parse water: {}", e)),
    };
    time_end("render_map: parse_water");

    time("render_map: parse_parks");
    let parks = match parse_polygons(&json_req.parks) {
        Ok(p) => p,
        Err(e) => return RenderResult::error(format!("Failed to parse parks: {}", e)),
    };
    time_end("render_map: parse_parks");
    time("render_map: parse_pois");
    let pois = if let Some(pois_json) = &json_req.pois {
        match parse_pois_json(pois_json) {
            Ok(p) => p,
            Err(e) => {
                log(&format!("Warning: Failed to parse POIs: {}", e));
                vec![]  // Fallback to empty POI list
            }
        }
    } else {
        vec![]
    };
    time_end("render_map: parse_pois");

    let request = RenderRequest {
        center: json_req.center,
        radius: json_req.radius,
        roads,
        water,
        parks,
            pois,
        theme: json_req.theme,
        width: json_req.width,
        height: json_req.height,
        display_city: json_req.display_city,
        display_country: json_req.display_country,
        text_position: None, // Default to None which maps to Top/Default in internal logic usually
        needs_projection: false,
        // Backwards-compatible defaults for dynamic road width scaling
        selected_size_height: 3508,
        frontend_scale: 2.0,
    };

    render_map_internal(request)
}

#[derive(Deserialize)]
pub struct BinaryRenderConfig {
    pub center: types::Center,
    pub radius: f64,
    pub theme: types::Theme,
    pub width: u32,
    pub height: u32,
    pub display_city: String,
    pub display_country: String,
    pub text_position: Option<types::TextPosition>,
    // dynamic scaling params (optional)
    #[serde(default = "types::default_selected_size_height")]
    pub selected_size_height: u32,
    #[serde(default = "types::default_frontend_scale")]
    pub frontend_scale: f32,
    // POI 数据（可选）
    #[serde(default)]
    pub pois: Option<Vec<f64>>,  // [poi_count, x1, y1, x2, y2, ...]
}

/// 主渲染函数 (二进制直读版本)
/// 彻底跳过 MessagePack！直接接收多个二进制分片和基础配置 JSON
#[wasm_bindgen]
pub fn render_map_binary(
    roads_shards: JsValue, // 可以是单个 Float64Array 或 Array<Float64Array>
    water_bin: &[f64],
    parks_bin: &[f64],
    config_json: &str,
) -> RenderResult {
    let config: BinaryRenderConfig = match serde_json::from_str(config_json) {
        Ok(c) => c,
        Err(e) => return RenderResult::error(format!("Config JSON parse failed: {}", e)),
    };

    // 1. 计算边界框
    let bounds = calculate_bounds(
        config.center.lat,
        config.center.lon,
        config.radius,
        config.width,
        config.height,
    );

    // 2. 创建渲染器
    let text_pos = config.text_position.unwrap_or(types::TextPosition::Top);
    let mut renderer =
        match MapRenderer::new(config.width, config.height, config.theme, bounds, text_pos) {
            Some(r) => r,
            None => return RenderResult::error("Failed to create renderer".to_string()),
        };

    // 3. 绘制
    time("render_map_bin: draw_background");
    renderer.draw_background();
    time_end("render_map_bin: draw_background");

    let water_color = renderer.get_theme().water.clone();
    let parks_color = renderer.get_theme().parks.clone();

    time("render_map_bin: draw_water");
    renderer.draw_polygons_bin(water_bin, &water_color);
    time_end("render_map_bin: draw_water");

    time("render_map_bin: draw_parks");
    renderer.draw_polygons_bin(parks_bin, &parks_color);
    time_end("render_map_bin: draw_parks");

    time("render_map_bin: draw_roads");

    // 处理多线程分片 (Array<Float64Array>) 或 单个大分片 (Float64Array)
    // Compute dynamic road width scale from config (fallback to defaults)
    let road_width_scale = types::calculate_road_width_scale(
        config.selected_size_height as f32,
        config.frontend_scale,
    );

    if js_sys::Array::is_array(&roads_shards) {
        let shards_array = js_sys::Array::from(&roads_shards);
        for shard_val in shards_array.iter() {
            if let Some(shard_typed) = shard_val.dyn_ref::<js_sys::Float64Array>() {
                renderer.draw_roads_bin_scaled(&shard_typed.to_vec(), road_width_scale);
            }
        }
    } else if let Some(shard_typed) = roads_shards.dyn_ref::<js_sys::Float64Array>() {
        renderer.draw_roads_bin_scaled(&shard_typed.to_vec(), road_width_scale);
    }

    time_end("render_map_bin: draw_roads");

    // 投影并绘制 POI
    if let Some(pois_data) = &config.pois {
        if !pois_data.is_empty() && pois_data[0] as usize > 0 {
            // 投影 POI 坐标（从 WGS84 → Web Mercator）
            let mut projected_pois = pois_data.clone();
            let poi_count = projected_pois[0] as usize;
            for i in 0..poi_count {
                let offset = 1 + i * 2;
                let (proj_lon, proj_lat) = projection::project_point(
                    projected_pois[offset],      // lon
                    projected_pois[offset + 1],  // lat
                );
                projected_pois[offset] = proj_lon;
                projected_pois[offset + 1] = proj_lat;
            }
            
            time("render_map_bin: draw_pois");
            renderer.draw_pois_bin(&projected_pois);
            time_end("render_map_bin: draw_pois");
        }
    }

    time("render_map_bin: draw_gradients");
    renderer.draw_gradients();
    time_end("render_map_bin: draw_gradients");

    // 4. 绘制文字
    if let Err(e) = renderer.draw_text(
        &config.display_city,
        &config.display_country,
        config.center.lat,
        config.center.lon,
        ROBOTO_REGULAR,
    ) {
        return RenderResult::error(format!("Failed to draw text: {}", e));
    }

    // 5. 编码为 PNG
    time("render_map_bin: encode_png");
    let png_data = renderer.encode_png();
    time_end("render_map_bin: encode_png");

    RenderResult::success(config.width, config.height, png_data)
}

/// 主渲染函数 (MessagePack 版本)
#[wasm_bindgen]
pub fn render_map_msgpack(request_bin: &[u8]) -> RenderResult {
    time("render_map: msgpack_parse");
    let request: RenderRequest = match rmp_serde::from_slice(request_bin) {
        Ok(req) => req,
        Err(e) => {
            return RenderResult::error(format!("Failed to parse MessagePack request: {}", e));
        }
    };
    time_end("render_map: msgpack_parse");

    render_map_internal(request)
}

fn render_map_internal(mut request: RenderRequest) -> RenderResult {
    // 2. 检查并执行投影（可选）
    if request.needs_projection {
        time("render_map: projection_pass");
        for road in request.roads.iter_mut() {
            project_points_mut(&mut road.coords);
        }
        for poly in request.water.iter_mut() {
            project_points_mut(&mut poly.exterior);
            for interior in poly.interiors.iter_mut() {
                project_points_mut(interior);
            }
        }
        for poly in request.parks.iter_mut() {
            project_points_mut(&mut poly.exterior);
            for interior in poly.interiors.iter_mut() {
                project_points_mut(interior);
            }
        }
        // 投影 POI 点
        for poi in request.pois.iter_mut() {
            let mut coords = vec![(poi.x, poi.y)];
            project_points_mut(&mut coords);
            poi.x = coords[0].0;
            poi.y = coords[0].1;
        }
        time_end("render_map: projection_pass");
    }

    // 3. 计算边界框
    let bounds = calculate_bounds(
        request.center.lat,
        request.center.lon,
        request.radius,
        request.width,
        request.height,
    );

    // 4. 创建渲染器
    let text_pos = request.text_position.unwrap_or(types::TextPosition::Top);
    let mut renderer = match MapRenderer::new(
        request.width,
        request.height,
        request.theme,
        bounds,
        text_pos,
    ) {
        Some(r) => r,
        None => return RenderResult::error("Failed to create renderer".to_string()),
    };

    // 5. 按顺序绘制图层
    time("render_map: draw_background");
    renderer.draw_background();
    time_end("render_map: draw_background");

    time("render_map: draw_water");
    renderer.draw_water(&request.water);
    time_end("render_map: draw_water");

    time("render_map: draw_parks");
    renderer.draw_parks(&request.parks);
    time_end("render_map: draw_parks");

    time("render_map: draw_roads");
    // 计算动态道路线宽缩放因子并调用缩放绘制方法
    let road_width_scale = types::calculate_road_width_scale(
        request.selected_size_height as f32,
        request.frontend_scale,
    );
    renderer.draw_roads_scaled(&request.roads, road_width_scale);
    time_end("render_map: draw_roads");

    // 绘制 POI
    if !request.pois.is_empty() {
        time("render_map: draw_pois");
        renderer.draw_pois(&request.pois);
        time_end("render_map: draw_pois");
    }

    time("render_map: draw_gradients");
    renderer.draw_gradients();
    time_end("render_map: draw_gradients");

    // 6. 绘制文字
    if let Err(e) = renderer.draw_text(
        &request.display_city,
        &request.display_country,
        request.center.lat,
        request.center.lon,
        ROBOTO_REGULAR,
    ) {
        return RenderResult::error(format!("Failed to draw text: {}", e));
    }

    // 7. 编码为 PNG
    time("render_map: encode_png");
    let png_data = renderer.encode_png();
    time_end("render_map: encode_png");

    RenderResult::success(request.width, request.height, png_data)
}

/// 获取版本信息
#[wasm_bindgen]
pub fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

fn parse_pois_json(_pois_json: &str) -> Result<Vec<types::POI>, String> {
    // POI JSON 格式：扁平数组 [poi_count, x1, y1, x2, y2, ...]
    // 为了简单起见，直接返回空 POI 列表，因为 POI 数据应该已经是二进制格式通过 config 传递
    Ok(vec![])
}

#[wasm_bindgen]
pub fn parse_roads_to_bin(geojson_str: &str) -> JsValue {
    match parse_roads(geojson_str) {
        Ok(roads) => serde_wasm_bindgen::to_value(&roads).unwrap_or(JsValue::NULL),
        Err(_) => JsValue::NULL,
    }
}

#[wasm_bindgen]
pub fn parse_roads_val(geojson: JsValue) -> JsValue {
    match data_processor::parse_roads_js(geojson) {
        Ok(roads) => serde_wasm_bindgen::to_value(&roads).unwrap_or(JsValue::NULL),
        Err(e) => {
            log(&format!("Error parsing roads object: {}", e));
            JsValue::NULL
        }
    }
}

#[wasm_bindgen]
pub fn parse_polygons_to_bin(geojson_str: &str) -> JsValue {
    match parse_polygons(geojson_str) {
        Ok(polys) => serde_wasm_bindgen::to_value(&polys).unwrap_or(JsValue::NULL),
        Err(_) => JsValue::NULL,
    }
}

#[wasm_bindgen]
pub fn parse_polygons_val(geojson: JsValue) -> JsValue {
    match data_processor::parse_polygons_js(geojson) {
        Ok(polys) => serde_wasm_bindgen::to_value(&polys).unwrap_or(JsValue::NULL),
        Err(e) => {
            log(&format!("Error parsing polygons object: {}", e));
            JsValue::NULL
        }
    }
}

#[wasm_bindgen]
pub fn parse_roads_typed(data: &[f64]) -> JsValue {
    match data_processor::parse_roads_bin(data) {
        Ok(roads) => serde_wasm_bindgen::to_value(&roads).unwrap_or(JsValue::NULL),
        Err(e) => {
            log(&format!("Error parsing roads binary: {}", e));
            JsValue::NULL
        }
    }
}

#[wasm_bindgen]
pub fn parse_polygons_typed(data: &[f64]) -> JsValue {
    match data_processor::parse_polygons_bin(data) {
        Ok(polys) => serde_wasm_bindgen::to_value(&polys).unwrap_or(JsValue::NULL),
        Err(e) => {
            log(&format!("Error parsing polygons binary: {}", e));
            JsValue::NULL
        }
    }
}

/// 极速处理：接收二进制，在 WASM 内部投影并返回新的二进制（Float64Array）
#[wasm_bindgen]
pub fn process_roads_bin_wasm(data: &[f64]) -> js_sys::Float64Array {
    let roads = data_processor::parse_roads_bin(data).unwrap_or_default();

    let mut result = Vec::with_capacity(data.len() + 2);
    if data.is_empty() {
        return js_sys::Float64Array::new(&JsValue::NULL);
    }

    result.push(roads.len() as f64);
    for road in roads {
        result.push(road.road_type.to_u32() as f64);
        result.push(road.coords.len() as f64);
        for (x, y) in road.coords {
            result.push(x);
            result.push(y);
        }
    }

    js_sys::Float64Array::from(result.as_slice())
}

#[wasm_bindgen]
pub fn process_polygons_bin_wasm(data: &[f64]) -> js_sys::Float64Array {
    let polys = data_processor::parse_polygons_bin(data).unwrap_or_default();
    let mut result = Vec::new();

    result.push(polys.len() as f64);
    for poly in polys {
        result.push(poly.exterior.len() as f64);
        result.push(poly.interiors.len() as f64);
        for (x, y) in poly.exterior {
            result.push(x);
            result.push(y);
        }
        for ring in poly.interiors {
            result.push(ring.len() as f64);
            for (x, y) in ring {
                result.push(x);
                result.push(y);
            }
        }
    }

    js_sys::Float64Array::from(result.as_slice())
}

/// 测试函数
#[wasm_bindgen]
pub fn hello_wasm(name: &str) -> String {
    format!("Hello, {}! Map Poster WASM v{}", name, get_version())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_version() {
        let version = get_version();
        assert!(!version.is_empty());
    }
}
