use geo::BoundingRect;
use geo::CoordsIter;
use geo::LineString;
// 别忘了引入这个 Trait
use geo::MapCoordsInPlace;
use geo::Polygon;
// 引入原地修改坐标的 Trait
use geo::Simplify;
use geo_types::Geometry;
use geojson::FeatureCollection;
use geojson::GeoJson as RawGeoJson; // 引入原始 geojson 库来辅助解析属性
use geozero::GeozeroGeometry;
use geozero::ToGeo;
use geozero::geojson::GeoJson;
use geozero::geojson::GeoJsonWriter; // 需要引入这个
use serde_json::Value as JsonValue;
use std::f64::consts::PI;
use tiny_skia::FillRule;
use tiny_skia::{Color, Paint, PathBuilder, Pixmap, Stroke, Transform};
use wasm_bindgen::prelude::*; // 引入简化算法

#[wasm_bindgen]
pub struct Viewport {
    pub min_x: f64,
    pub min_y: f64,
    pub max_x: f64,
    pub max_y: f64,
}

#[wasm_bindgen(start)]
pub fn init_panic_hook() {
    console_error_panic_hook::set_once();
}

// 测试wasm
#[wasm_bindgen]
pub fn hello_wasm(name: &str) -> String {
    format!("Hello, {}! WASM working without proj!", name)
}

// 测试几何处理
#[wasm_bindgen]
pub fn test_geometry() -> String {
    use geo::{LineString, Point};

    let points = vec![
        Point::new(0.0, 0.0),
        Point::new(1.0, 1.0),
        Point::new(2.0, 0.0),
    ];

    let line: LineString = points.into();
    format!("Created line with {} points", line.points().count())
}

#[wasm_bindgen]
pub fn get_edge_colors(geojson_str: &str, theme_json: &JsValue) -> Vec<String> {
    // 1. 解析输入的 GeoJSON 和 Theme
    let collection: FeatureCollection = geojson_str.parse().unwrap();
    let theme: serde_json::Value = serde_wasm_bindgen::from_value(theme_json.clone()).unwrap();

    collection
        .features
        .iter()
        .map(|feature| {
            // 2. 获取 highway 属性
            let highway_value = feature
                .properties
                .as_ref()
                .and_then(|props| props.get("highway"));

            // 3. 处理 Python 中的 list 或 string 逻辑
            let highway = match highway_value {
                Some(JsonValue::String(s)) => s.as_str(),
                Some(JsonValue::Array(arr)) => arr
                    .get(0)
                    .and_then(|v| v.as_str())
                    .unwrap_or("unclassified"),
                _ => "unclassified",
            };

            // 4. 匹配道路等级 (复刻 Python 逻辑)
            let color_key = match highway {
                "motorway" | "motorway_link" => "road_motorway",
                "trunk" | "trunk_link" | "primary" | "primary_link" => "road_primary",
                "secondary" | "secondary_link" => "road_secondary",
                "tertiary" | "tertiary_link" => "road_tertiary",
                "residential" | "living_street" | "unclassified" => "road_residential",
                _ => "road_default",
            };

            // 从主题配置中提取颜色字符串
            theme
                .get(color_key)
                .and_then(|v| v.as_str())
                .unwrap_or("#ffffff")
                .to_string()
        })
        .collect()
}

#[wasm_bindgen]
pub fn get_edge_widths(geojson_str: &str) -> Vec<f64> {
    let collection: FeatureCollection = geojson_str.parse().unwrap();

    collection
        .features
        .iter()
        .map(|feature| {
            let highway_value = feature
                .properties
                .as_ref()
                .and_then(|props| props.get("highway"));

            let highway = match highway_value {
                Some(JsonValue::String(s)) => s.as_str(),
                Some(JsonValue::Array(arr)) => arr
                    .get(0)
                    .and_then(|v| v.as_str())
                    .unwrap_or("unclassified"),
                _ => "unclassified",
            };

            // 复刻 Python 的宽度阶梯逻辑
            match highway {
                "motorway" | "motorway_link" => 1.2,
                "trunk" | "trunk_link" | "primary" | "primary_link" => 1.0,
                "secondary" | "secondary_link" => 0.8,
                "tertiary" | "tertiary_link" => 0.6,
                _ => 0.4,
            }
        })
        .collect()
}

#[wasm_bindgen]
pub struct MapEngine {
    // 存储解析后的几何图形，类似 Python 的 GeoDataFrame
    features: Vec<Geometry<f64>>,

    // 存储每个要素的属性
    properties: Vec<JsonValue>,
}

#[wasm_bindgen]
impl MapEngine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            features: Vec::new(),
            properties: Vec::new(),
        }
    }

    /// 核心步骤：解析来自 JS 的 GeoJSON 字符串
    /// 对应 Python: gdf = geopandas.read_file("data.json")
    pub fn parse_geojson(&mut self, json_str: &str) -> Result<(), JsValue> {
        // 1. 使用 geojson 库解析出原始结构（用于提取属性）
        let raw_geojson = json_str
            .parse::<RawGeoJson>()
            .map_err(|e| JsValue::from_str(&format!("JSON 语法错误: {}", e)))?;

        match raw_geojson {
            RawGeoJson::FeatureCollection(collection) => {
                for feature in collection.features {
                    // 提取属性：如果没有属性则存入空对象 {}
                    let props = feature
                        .properties
                        .map(|m| {
                            JsonValue::Object(
                                m.into_iter()
                                    .map(|(k, v)| (k, JsonValue::from(v)))
                                    .collect(),
                            )
                        })
                        .unwrap_or(JsonValue::Object(serde_json::Map::new()));

                    // 提取几何：利用 geozero 转换单个 geometry
                    if let Some(actual_geo) = feature.geometry {
                        let geo_json_str = actual_geo.to_string();
                        let g = GeoJson(&geo_json_str)
                            .to_geo()
                            .map_err(|e| JsValue::from_str(&format!("几何解析失败: {}", e)))?;

                        self.features.push(g);
                        self.properties.push(props);
                    }
                }
            }
            _ => return Err(JsValue::from_str("目前仅支持 FeatureCollection 格式")),
        }
        Ok(())
    }

    // 获取整个图层的边界 [min_x, min_y, max_x, max_y]
    pub fn get_bounds(&self) -> Vec<f64> {
        if self.features.is_empty() {
            return vec![0.0, 0.0, 0.0, 0.0];
        }

        let mut total_bbox = self.features[0].bounding_rect();

        for geo in self.features.iter().skip(1) {
            if let Some(rect) = geo.bounding_rect() {
                if let Some(current_total) = total_bbox {
                    // 合并两个矩形
                    let min_x = current_total.min().x.min(rect.min().x);
                    let min_y = current_total.min().y.min(rect.min().y);
                    let max_x = current_total.max().x.max(rect.max().x);
                    let max_y = current_total.max().y.max(rect.max().y);

                    // 这里需要注意：geo 0.28 的 Rect 构造方式
                    // 为了简单起见，我们手动更新边界逻辑
                    total_bbox = geo::Rect::new((min_x, min_y), (max_x, max_y)).into();
                } else {
                    total_bbox = Some(rect);
                }
            }
        }

        match total_bbox {
            Some(rect) => vec![rect.min().x, rect.min().y, rect.max().x, rect.max().y],
            None => vec![0.0, 0.0, 0.0, 0.0],
        }
    }

    // 获取要素数量
    pub fn get_feature_count(&self) -> usize {
        self.features.len()
    }

    /// 复刻 Python 的 ox.project_graph
    /// 将所有经纬度坐标转换为平面米单位坐标
    pub fn project_all(&mut self) {
        for geometry in self.features.iter_mut() {
            geometry.map_coords_in_place(|c| {
                let lon_rad = c.x * (PI / 180.0);
                let lat_rad = c.y * (PI / 180.0);

                let x = lon_rad * 6378137.0;
                let y = lat_rad.tan().asinh() * 6378137.0;

                // 方案 A：使用 into() 自动转换（最简洁）
                (x, y).into()

                // 或者方案 B：显式构造 Coord（最清晰）
                // geo_types::Coord { x, y }
            });
        }
    }

    // 测试导出 GeoJSON
    pub fn to_geojson(&self) -> Result<String, JsValue> {
        let mut json_data = Vec::new();
        let mut writer = GeoJsonWriter::new(&mut json_data);

        // 假设我们导出第一个特征作为测试
        if let Some(geo) = self.features.get(0) {
            geo.process_geom(&mut writer)
                .map_err(|e| JsValue::from_str(&format!("导出失败: {}", e)))?;
        }

        Ok(String::from_utf8(json_data).unwrap_or_default())
    }

    // 获取指定索引要素的属性字符串 (JS 端再 JSON.parse)
    pub fn get_properties_by_index(&self, index: usize) -> JsValue {
        if let Some(props) = self.properties.get(index) {
            // 将 serde_json::Value 转换为 JS 能够直接读取的 JsValue
            serde_wasm_bindgen::to_value(props).unwrap_or(JsValue::NULL)
        } else {
            JsValue::NULL
        }
    }

    // 获取所有属性的 key（方便 JS 端生成表格表头）
    pub fn get_property_keys(&self) -> JsValue {
        if let Some(JsonValue::Object(map)) = self.properties.get(0) {
            let keys: Vec<String> = map.keys().cloned().collect();
            serde_wasm_bindgen::to_value(&keys).unwrap()
        } else {
            JsValue::NULL
        }
    }

    /// 简化所有几何图形
    /// epsilon: 简化阈值（在 Web Mercator 下单位通常是“米”）
    pub fn simplify_all(&mut self, epsilon: f64) {
        for geometry in self.features.iter_mut() {
            *geometry = match geometry {
                // 基础类型直接调用 simplify
                Geometry::LineString(ls) => Geometry::LineString(ls.simplify(&epsilon)),
                Geometry::Polygon(poly) => Geometry::Polygon(poly.simplify(&epsilon)),
                Geometry::MultiLineString(mls) => Geometry::MultiLineString(mls.simplify(&epsilon)),
                Geometry::MultiPolygon(mp) => Geometry::MultiPolygon(mp.simplify(&epsilon)),

                // GeometryCollection 需要手动处理内部的每一个 geometry
                Geometry::GeometryCollection(gc) => {
                    let simplified_geos: Vec<Geometry<f64>> = gc
                        .iter()
                        .map(|g| {
                            // 递归调用（或者简单处理常用类型）
                            // 这里最稳妥的方法是再次 match 或者调用一个辅助函数
                            match g {
                                Geometry::LineString(ls) => {
                                    Geometry::LineString(ls.simplify(&epsilon))
                                }
                                Geometry::Polygon(p) => Geometry::Polygon(p.simplify(&epsilon)),
                                _ => g.clone(),
                            }
                        })
                        .collect();
                    Geometry::GeometryCollection(simplified_geos.into())
                }

                // Point, MultiPoint 等不需要简化，直接返回原样
                _ => geometry.clone(),
            };
        }
    }

    /// 统计当前所有要素的顶点总数
    pub fn get_total_points(&self) -> usize {
        self.features.iter().map(|geo| geo.coords_count()).sum()
    }

    /// 导出所有几何图形的顶点为平铺的 Float32Array
    /// 适合 WebGL 或 Canvas 直接使用
    pub fn get_vertices(&self) -> Vec<f32> {
        let mut buffer = Vec::with_capacity(self.get_total_points() * 2);

        for geo in &self.features {
            match geo {
                Geometry::LineString(ls) => {
                    for coord in ls.coords_iter() {
                        buffer.push(coord.x as f32);
                        buffer.push(coord.y as f32);
                    }
                }
                Geometry::Polygon(poly) => {
                    // 处理外环
                    for coord in poly.exterior().coords_iter() {
                        buffer.push(coord.x as f32);
                        buffer.push(coord.y as f32);
                    }
                    // 处理内环（如有）
                    for interior in poly.interiors() {
                        for coord in interior.coords_iter() {
                            buffer.push(coord.x as f32);
                            buffer.push(coord.y as f32);
                        }
                    }
                }
                Geometry::MultiLineString(mls) => {
                    for ls in mls {
                        for coord in ls.coords_iter() {
                            buffer.push(coord.x as f32);
                            buffer.push(coord.y as f32);
                        }
                    }
                }
                // ... 可以根据需要扩展 MultiPolygon 等 ...
                _ => {}
            }
        }
        buffer
    }

    /// 返回每条连续线条的顶点个数，用于 JS 循环绘制
    /// 对应 JS 的: ctx.moveTo(x1, y1); for(...) ctx.lineTo(xn, yn);
    pub fn get_counts(&self) -> Vec<u32> {
        let mut counts = Vec::new();
        for geo in &self.features {
            match geo {
                Geometry::LineString(ls) => counts.push(ls.0.len() as u32),
                Geometry::Polygon(poly) => {
                    counts.push(poly.exterior().0.len() as u32);
                    for interior in poly.interiors() {
                        counts.push(interior.0.len() as u32);
                    }
                }
                // 多线和多面类似处理...
                _ => {}
            }
        }
        counts
    }

    /// 将所有坐标映射到指定的 Canvas 尺寸，并返回平铺的像素坐标数组
    /// padding: 留白比例（0.1 表示留出 10% 的边距）
    pub fn get_pixel_vertices(&self, width: f32, height: f32, padding: f32) -> Vec<f32> {
        let bounds = self.get_bounds(); // [min_x, min_y, max_x, max_y]
        let (min_x, min_y, max_x, max_y) = (bounds[0], bounds[1], bounds[2], bounds[3]);

        let b_width = max_x - min_x;
        let b_height = max_y - min_y;

        // 计算缩放比例，保持长宽比（Aspect Ratio）
        let scale_x = width * (1.0 - 2.0 * padding) / b_width as f32;
        let scale_y = height * (1.0 - 2.0 * padding) / b_height as f32;
        let scale = scale_x.min(scale_y);

        // 计算偏移量以居中
        let offset_x = (width - b_width as f32 * scale) / 2.0;
        let offset_y = (height - b_height as f32 * scale) / 2.0;

        let mut buffer = Vec::with_capacity(self.get_total_points() * 2);

        for geo in &self.features {
            for coord in geo.coords_iter() {
                // 1. 归一化并缩放
                let x = (coord.x - min_x) as f32 * scale + offset_x;
                // 2. 翻转 Y 轴（地理坐标系 Y 向上，Canvas Y 向下）
                let y = height - ((coord.y - min_y) as f32 * scale + offset_y);

                buffer.push(x);
                buffer.push(y);
            }
        }
        buffer
    }

    // 绘制线段的辅助函数
    fn draw_line(
        &self,
        pixmap: &mut Pixmap,
        line: &LineString<f64>,
        view: &Viewport,
        w: u32,
        h: u32,
        color: Color,
        stroke_w: f32,
    ) {
        let mut pb = PathBuilder::new();
        let mut first = true;
        for coord in line.points() {
            let x = ((coord.x() - view.min_x) / (view.max_x - view.min_x)) * w as f64;
            let y = h as f64 - ((coord.y() - view.min_y) / (view.max_y - view.min_y)) * h as f64;
            if first {
                pb.move_to(x as f32, y as f32);
                first = false;
            } else {
                pb.line_to(x as f32, y as f32);
            }
        }
        if let Some(path) = pb.finish() {
            let mut paint = Paint::default();
            paint.set_color(color);
            pixmap.stroke_path(
                &path,
                &paint,
                &Stroke {
                    width: stroke_w,
                    ..Default::default()
                },
                Transform::identity(),
                None,
            );
        }
    }

    // 绘制多边形的辅助函数 (复刻 water/parks 填充)
    fn draw_polygon(
        &self,
        pixmap: &mut Pixmap,
        poly: &Polygon<f64>,
        view: &Viewport,
        w: u32,
        h: u32,
        color: Color,
    ) {
        let mut pb = PathBuilder::new();
        // 绘制外轮廓
        let exterior = poly.exterior();
        let mut first = true;
        for coord in exterior.points() {
            let x = ((coord.x() - view.min_x) / (view.max_x - view.min_x)) * w as f64;
            let y = h as f64 - ((coord.y() - view.min_y) / (view.max_y - view.min_y)) * h as f64;
            if first {
                pb.move_to(x as f32, y as f32);
                first = false;
            } else {
                pb.line_to(x as f32, y as f32);
            }
        }
        pb.close(); // 闭合路径

        if let Some(path) = pb.finish() {
            let mut paint = Paint::default();
            paint.set_color(color);
            // 使用 FillRule::EvenOdd 来处理复杂的地理多边形
            pixmap.fill_path(
                &path,
                &paint,
                FillRule::EvenOdd,
                Transform::identity(),
                None,
            );
        }
    }

    // 实现渲染函数
    pub fn render(&self, width: u32, height: u32, view: &Viewport) -> Vec<u8> {
        let mut pixmap = Pixmap::new(width, height).unwrap();
        pixmap.fill(Color::from_rgba8(24, 24, 24, 255));

        // 基础画笔设置
        let mut paint = Paint::default();
        paint.anti_alias = true;

        for geom in &self.features {
            match geom {
                // 处理道路 (LineString)
                Geometry::LineString(line) => {
                    self.draw_line(&mut pixmap, line, &view, width, height, Color::WHITE, 1.5);
                }
                // 处理水体/公园 (Polygon)
                Geometry::Polygon(poly) => {
                    self.draw_polygon(
                        &mut pixmap,
                        poly,
                        &view,
                        width,
                        height,
                        Color::from_rgba8(30, 60, 90, 255),
                    );
                }
                // 处理复杂的组合图形
                Geometry::MultiLineString(mls) => {
                    for line in mls {
                        self.draw_line(&mut pixmap, line, &view, width, height, Color::WHITE, 1.5);
                    }
                }
                _ => {} // 暂时忽略其他类型
            }
        }
        pixmap.take()
    }
}
