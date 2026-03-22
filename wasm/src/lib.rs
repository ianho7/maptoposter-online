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
    pois: Option<String>, // POI 数据（JSON 字符串格式）
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
                vec![] // Fallback to empty POI list
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
        road_width_boost: 1.0,
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
    #[serde(default = "types::default_road_width_boost")]
    pub road_width_boost: f32,
    // POI 数据（可选）
    #[serde(default)]
    pub pois: Option<Vec<f64>>, // [poi_count, x1, y1, x2, y2, ...]
}

/// 主渲染函数 (二进制直读版本)
#[wasm_bindgen]
pub fn render_map_binary(
    roads_shards: JsValue,
    water_bin: &[f64],
    parks_bin: &[f64],
    config_json: &str,
) -> RenderResult {
    render_map_binary_internal(
        roads_shards,
        water_bin,
        parks_bin,
        config_json,
        ROBOTO_REGULAR,
    )
}

/// 主渲染函数 (带自定义字体版本)
#[wasm_bindgen]
pub fn render_map_binary_with_font(
    roads_shards: JsValue,
    water_bin: &[f64],
    parks_bin: &[f64],
    config_json: &str,
    font_data: &[u8],
) -> RenderResult {
    render_map_binary_internal(roads_shards, water_bin, parks_bin, config_json, font_data)
}

fn render_map_binary_internal(
    roads_shards: JsValue,
    water_bin: &[f64],
    parks_bin: &[f64],
    config_json: &str,
    font_data: &[u8],
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

    // 2. 统计元素总数
    let water_count = if water_bin.is_empty() {
        0
    } else {
        water_bin[0] as usize
    };
    let parks_count = if parks_bin.is_empty() {
        0
    } else {
        parks_bin[0] as usize
    };
    let poi_count = config
        .pois
        .as_ref()
        .map(|p| if p.is_empty() { 0 } else { p[0] as usize })
        .unwrap_or(0);

    let mut total_roads = 0usize;
    let mut road_type_counts = [0usize; 6];

    if js_sys::Array::is_array(&roads_shards) {
        let shards_array = js_sys::Array::from(&roads_shards);
        for shard_val in shards_array.iter() {
            if let Some(shard_typed) = shard_val.dyn_ref::<js_sys::Float64Array>() {
                let vec = shard_typed.to_vec();
                if !vec.is_empty() {
                    let road_count = vec[0] as usize;
                    total_roads += road_count;

                    let mut offset = 1;
                    for _ in 0..road_count {
                        if offset + 2 <= vec.len() {
                            let type_val = vec[offset] as usize;
                            let point_count = vec[offset + 1] as usize;
                            if type_val < 6 {
                                road_type_counts[type_val] += 1;
                            }
                            offset += 2 + point_count * 2;
                        }
                    }
                }
            }
        }
    } else if let Some(shard_typed) = roads_shards.dyn_ref::<js_sys::Float64Array>() {
        let vec = shard_typed.to_vec();
        if !vec.is_empty() {
            let road_count = vec[0] as usize;
            total_roads = road_count;

            let mut offset = 1;
            for _ in 0..road_count {
                if offset + 2 <= vec.len() {
                    let type_val = vec[offset] as usize;
                    let point_count = vec[offset + 1] as usize;
                    if type_val < 6 {
                        road_type_counts[type_val] += 1;
                    }
                    offset += 2 + point_count * 2;
                }
            }
        }
    }

    log(&format!(
        "[Render] Elements: {} roads, {} water polygons, {} parks, {} POIs",
        total_roads, water_count, parks_count, poi_count
    ));
    log(&format!(
        "[Render] Roads by type: Motorway={}, Primary={}, Secondary={}, Tertiary={}, Residential={}, Default={}",
        road_type_counts[0],
        road_type_counts[1],
        road_type_counts[2],
        road_type_counts[3],
        road_type_counts[4],
        road_type_counts[5]
    ));

    // 3. 创建渲染器
    let text_pos = config.text_position.unwrap_or(types::TextPosition::Top);
    let mut renderer =
        match MapRenderer::new(config.width, config.height, config.theme, bounds, text_pos) {
            Some(r) => r,
            None => return RenderResult::error("Failed to create renderer".to_string()),
        };

    // 4. 绘制
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

    let road_width_scale = types::calculate_road_width_scale(
        config.selected_size_height as f32,
        config.frontend_scale,
        config.road_width_boost,
    );

    let mut total_timings = [0.0; 6];

    if js_sys::Array::is_array(&roads_shards) {
        let shards_array = js_sys::Array::from(&roads_shards);
        for shard_val in shards_array.iter() {
            if let Some(shard_typed) = shard_val.dyn_ref::<js_sys::Float64Array>() {
                let timings =
                    renderer.draw_roads_bin_scaled(&shard_typed.to_vec(), road_width_scale);
                for i in 0..6 {
                    total_timings[i] += timings[i];
                }
            }
        }
    } else if let Some(shard_typed) = roads_shards.dyn_ref::<js_sys::Float64Array>() {
        total_timings = renderer.draw_roads_bin_scaled(&shard_typed.to_vec(), road_width_scale);
    }

    time_end("render_map_bin: draw_roads");

    log("render_map_bin: draw_roads breakdown:");
    log(&format!("  Motorway: {:.2}ms", total_timings[0]));
    log(&format!("  Primary: {:.2}ms", total_timings[1]));
    log(&format!("  Secondary: {:.2}ms", total_timings[2]));
    log(&format!("  Tertiary: {:.2}ms", total_timings[3]));
    log(&format!("  Residential: {:.2}ms", total_timings[4]));
    log(&format!("  Default: {:.2}ms", total_timings[5]));

    // 投影并绘制 POI
    if let Some(pois_data) = &config.pois {
        if !pois_data.is_empty() && pois_data[0] as usize > 0 {
            let mut projected_pois = pois_data.clone();
            let poi_count = projected_pois[0] as usize;
            for i in 0..poi_count {
                let offset = 1 + i * 2;
                let (proj_lon, proj_lat) = projection::project_point(
                    projected_pois[offset],     // lon
                    projected_pois[offset + 1], // lat
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

    // 4. 绘制文字 (使用传入的字体数据)
    if let Err(e) = renderer.draw_text(
        &config.display_city,
        &config.display_country,
        config.center.lat,
        config.center.lon,
        font_data,
    ) {
        return RenderResult::error(format!("Failed to draw text: {}", e));
    }

    // 5. 编码为 PNG
    time("render_map_bin: encode_png");
    let png_data = match renderer.encode_png(300) {
        Ok(data) => data,
        Err(e) => return RenderResult::error(format!("PNG encoding failed: {}", e)),
    };
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
        request.road_width_boost,
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
    let png_data = match renderer.encode_png(300) {
        Ok(data) => data,
        Err(e) => return RenderResult::error(format!("PNG encoding failed: {}", e)),
    };
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
pub fn parse_roads_to_bin(geojson_str: &str) -> Result<JsValue, JsValue> {
    let roads = parse_roads(geojson_str)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse roads: {}", e)))?;
    serde_wasm_bindgen::to_value(&roads)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

#[wasm_bindgen]
pub fn parse_roads_val(geojson: JsValue) -> Result<JsValue, JsValue> {
    let roads = data_processor::parse_roads_js(geojson)
        .map_err(|e| JsValue::from_str(&format!("Error parsing roads object: {}", e)))?;
    serde_wasm_bindgen::to_value(&roads)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

#[wasm_bindgen]
pub fn parse_polygons_to_bin(geojson_str: &str) -> Result<JsValue, JsValue> {
    let polys = parse_polygons(geojson_str)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse polygons: {}", e)))?;
    serde_wasm_bindgen::to_value(&polys)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

#[wasm_bindgen]
pub fn parse_polygons_val(geojson: JsValue) -> Result<JsValue, JsValue> {
    let polys = data_processor::parse_polygons_js(geojson)
        .map_err(|e| JsValue::from_str(&format!("Error parsing polygons object: {}", e)))?;
    serde_wasm_bindgen::to_value(&polys)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

#[wasm_bindgen]
pub fn parse_roads_typed(data: &[f64]) -> Result<JsValue, JsValue> {
    let roads = data_processor::parse_roads_bin(data)
        .map_err(|e| JsValue::from_str(&format!("Error parsing roads binary: {}", e)))?;
    serde_wasm_bindgen::to_value(&roads)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

#[wasm_bindgen]
pub fn parse_polygons_typed(data: &[f64]) -> Result<JsValue, JsValue> {
    let polys = data_processor::parse_polygons_bin(data)
        .map_err(|e| JsValue::from_str(&format!("Error parsing polygons binary: {}", e)))?;
    serde_wasm_bindgen::to_value(&polys)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

/// 极速处理：接收二进制，在 WASM 内部投影并返回新的二进制（Float64Array）
#[wasm_bindgen]
pub fn process_roads_bin_wasm(data: &[f64]) -> Result<js_sys::Float64Array, JsValue> {
    if data.is_empty() {
        return Ok(js_sys::Float64Array::new(&JsValue::NULL));
    }

    let roads = data_processor::parse_roads_bin(data)
        .map_err(|e| JsValue::from_str(&format!("Error parsing roads binary: {}", e)))?;

    // 预计算总长度，直接分配 Float64Array，避免中间 Vec 分配和复制
    let total_len: usize = 1 + roads.iter()
        .map(|r| 2usize + r.coords.len() * 2)
        .sum::<usize>();

    let array = js_sys::Float64Array::new_with_length(total_len as u32);
    let mut idx = 0u32;
    array.set_index(idx, roads.len() as f64);
    idx += 1;

    for road in roads {
        array.set_index(idx, road.road_type.to_u32() as f64);
        idx += 1;
        array.set_index(idx, road.coords.len() as f64);
        idx += 1;
        for (x, y) in road.coords {
            array.set_index(idx, x);
            idx += 1;
            array.set_index(idx, y);
            idx += 1;
        }
    }

    Ok(array)
}

#[wasm_bindgen]
pub fn process_polygons_bin_wasm(data: &[f64]) -> Result<js_sys::Float64Array, JsValue> {
    let polys = data_processor::parse_polygons_bin(data)
        .map_err(|e| JsValue::from_str(&format!("Error parsing polygons binary: {}", e)))?;

    // 预计算总长度，直接分配 Float64Array，避免中间 Vec 分配和复制
    let total_len: usize = 1 + polys.iter()
        .map(|p| {
            2usize + p.exterior.len() * 2 + 1 + p.interiors.iter()
                .map(|r| 1usize + r.len() * 2)
                .sum::<usize>()
        })
        .sum::<usize>();

    let array = js_sys::Float64Array::new_with_length(total_len as u32);
    let mut idx = 0u32;
    array.set_index(idx, polys.len() as f64);
    idx += 1;

    for poly in polys {
        array.set_index(idx, poly.exterior.len() as f64);
        idx += 1;
        array.set_index(idx, poly.interiors.len() as f64);
        idx += 1;
        for (x, y) in poly.exterior {
            array.set_index(idx, x);
            idx += 1;
            array.set_index(idx, y);
            idx += 1;
        }
        for ring in poly.interiors {
            array.set_index(idx, ring.len() as f64);
            idx += 1;
            for (x, y) in ring {
                array.set_index(idx, x);
                idx += 1;
                array.set_index(idx, y);
                idx += 1;
            }
        }
    }

    Ok(array)
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
