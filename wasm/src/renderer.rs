use fontdue::layout::{CoordinateSystem, Layout, TextStyle};
use fontdue::{Font, FontSettings};
use std::collections::HashMap;
use tiny_skia::{Color, FillRule, Paint, PathBuilder, Pixmap, Stroke, Transform};

use crate::types::{BoundingBox, PolyFeature, Road, RoadType, TextPosition, Theme};
use crate::utils::{calculate_font_size, format_city_name, format_coordinates, parse_hex_color};

/// 地图渲染引擎
pub struct MapRenderer {
    pixmap: Pixmap,
    theme: Theme,
    bounds: BoundingBox,
    width: u32,
    height: u32,
    x_factor: f64,
    y_factor: f64,
    text_position: TextPosition,
}

impl MapRenderer {
    /// 创建渲染器
    pub fn new(
        width: u32,
        height: u32,
        theme: Theme,
        bounds: BoundingBox,
        text_position: TextPosition,
    ) -> Option<Self> {
        let pixmap = Pixmap::new(width, height)?;
        let x_factor = width as f64 / bounds.width();
        let y_factor = height as f64 / bounds.height();
        Some(Self {
            pixmap,
            theme,
            bounds,
            width,
            height,
            x_factor,
            y_factor,
            text_position,
        })
    }

    /// 获取当前配色
    pub fn get_theme(&self) -> &Theme {
        &self.theme
    }

    /// 绘制背景
    pub fn draw_background(&mut self) {
        let color = parse_hex_color(&self.theme.bg);
        self.pixmap.fill(color);
    }

    /// 绘制水体
    pub fn draw_water(&mut self, water_features: &[PolyFeature]) {
        if water_features.is_empty() {
            return;
        }
        let color = parse_hex_color(&self.theme.water);
        let mut pb = PathBuilder::new();
        for feature in water_features {
            self.add_poly_to_path(&mut pb, feature);
        }

        if let Some(path) = pb.finish() {
            let mut paint = Paint::default();
            paint.set_color(color);
            paint.anti_alias = true;

            self.pixmap.fill_path(
                &path,
                &paint,
                FillRule::EvenOdd,
                Transform::identity(),
                None,
            );
        }
    }

    /// 绘制公园
    pub fn draw_parks(&mut self, park_features: &[PolyFeature]) {
        if park_features.is_empty() {
            return;
        }
        let color = parse_hex_color(&self.theme.parks);
        let mut pb = PathBuilder::new();
        for feature in park_features {
            self.add_poly_to_path(&mut pb, feature);
        }

        if let Some(path) = pb.finish() {
            let mut paint = Paint::default();
            paint.set_color(color);
            paint.anti_alias = true;

            self.pixmap.fill_path(
                &path,
                &paint,
                FillRule::EvenOdd,
                Transform::identity(),
                None,
            );
        }
    }

    /// 绘制道路 (二进制直读版 - 极致单次扫描优化)
    pub fn draw_roads_bin(&mut self, data: &[f64]) {
        if data.is_empty() {
            return;
        }
        let road_count = data[0] as usize;

        // 准备 6 个路径构建器，对应 6 种道路类型
        let mut pbs: Vec<PathBuilder> = (0..6).map(|_| PathBuilder::new()).collect();
        let mut found = vec![false; 6];

        let mut curr_offset = 1;

        // 【优化】：单次遍历二进制数据，按类型分发到不同的路径构建器
        for _ in 0..road_count {
            if curr_offset + 2 > data.len() {
                break;
            }
            let t = data[curr_offset] as usize;
            let count = data[curr_offset + 1] as usize;
            curr_offset += 2;

            if t < 6 {
                if curr_offset + count * 2 <= data.len() && count >= 2 {
                    let pb = &mut pbs[t];
                    let (sx, sy) = self.world_to_screen((data[curr_offset], data[curr_offset + 1]));
                    pb.move_to(sx, sy);
                    for i in 1..count {
                        let (sx, sy) = self.world_to_screen((
                            data[curr_offset + i * 2],
                            data[curr_offset + i * 2 + 1],
                        ));
                        pb.line_to(sx, sy);
                    }
                    found[t] = true;
                }
            }
            curr_offset += count * 2;
        }

        // 统一渲染 6 种类型的道路
        for (t_idx, pb) in pbs.into_iter().enumerate() {
            if !found[t_idx] {
                continue;
            }

            if let Some(path) = pb.finish() {
                let road_type = RoadType::from_u32(t_idx as u32);
                let color_hex = match road_type {
                    RoadType::Motorway => &self.theme.road_motorway,
                    RoadType::Primary => &self.theme.road_primary,
                    RoadType::Secondary => &self.theme.road_secondary,
                    RoadType::Tertiary => &self.theme.road_tertiary,
                    RoadType::Residential => &self.theme.road_residential,
                    RoadType::Default => &self.theme.road_default,
                };

                let mut paint = Paint::default();
                paint.set_color(parse_hex_color(color_hex));
                paint.anti_alias = true;
                let stroke = Stroke {
                    width: road_type.get_width(),
                    ..Default::default()
                };

                self.pixmap
                    .stroke_path(&path, &paint, &stroke, Transform::identity(), None);
            }
        }
    }

    /// 绘制道路 (二进制直读版) 使用动态缩放因子
    pub fn draw_roads_bin_scaled(&mut self, data: &[f64], scale_factor: f32) {
        if data.is_empty() {
            return;
        }
        let road_count = data[0] as usize;

        // 准备 6 个路径构建器，对应 6 种道路类型
        let mut pbs: Vec<PathBuilder> = (0..6).map(|_| PathBuilder::new()).collect();
        let mut found = vec![false; 6];

        let mut curr_offset = 1;

        for _ in 0..road_count {
            if curr_offset + 2 > data.len() {
                break;
            }
            let t = data[curr_offset] as usize;
            let count = data[curr_offset + 1] as usize;
            curr_offset += 2;

            if t < 6 {
                if curr_offset + count * 2 <= data.len() && count >= 2 {
                    let pb = &mut pbs[t];
                    let (sx, sy) = self.world_to_screen((data[curr_offset], data[curr_offset + 1]));
                    pb.move_to(sx, sy);
                    for i in 1..count {
                        let (sx, sy) = self.world_to_screen((
                            data[curr_offset + i * 2],
                            data[curr_offset + i * 2 + 1],
                        ));
                        pb.line_to(sx, sy);
                    }
                    found[t] = true;
                }
            }
            curr_offset += count * 2;
        }

        for (t_idx, pb) in pbs.into_iter().enumerate() {
            if !found[t_idx] {
                continue;
            }

            if let Some(path) = pb.finish() {
                let road_type = RoadType::from_u32(t_idx as u32);
                let color_hex = match road_type {
                    RoadType::Motorway => &self.theme.road_motorway,
                    RoadType::Primary => &self.theme.road_primary,
                    RoadType::Secondary => &self.theme.road_secondary,
                    RoadType::Tertiary => &self.theme.road_tertiary,
                    RoadType::Residential => &self.theme.road_residential,
                    RoadType::Default => &self.theme.road_default,
                };

                let mut paint = Paint::default();
                paint.set_color(parse_hex_color(color_hex));
                paint.anti_alias = true;
                let stroke = Stroke {
                    width: road_type.get_width_scaled(scale_factor),
                    ..Default::default()
                };

                self.pixmap
                    .stroke_path(&path, &paint, &stroke, Transform::identity(), None);
            }
        }
    }

    /// 绘制多边形 (二进制直读版)
    pub fn draw_polygons_bin(&mut self, data: &[f64], color_hex: &str) {
        if data.is_empty() {
            web_sys::console::log_1(&format!("⚠️  多边形数据为空").into());
            return;
        }
        let poly_count = data[0] as usize;

        if poly_count == 0 {
            web_sys::console::log_1(&format!("⚠️  多边形数量为 0，颜色: {}", color_hex).into());
            return;
        }

        web_sys::console::log_1(
            &format!("🌊 开始绘制 {} 个多边形，颜色: {}", poly_count, color_hex).into(),
        );

        let mut offset = 1;
        let color = parse_hex_color(color_hex);

        let mut pb = PathBuilder::new();
        let mut found = false;

        for _idx in 0..poly_count {
            if offset + 2 > data.len() {
                break;
            }
            let ext_count = data[offset] as usize;
            let int_ring_count = data[offset + 1] as usize;
            offset += 2;

            if offset + ext_count * 2 <= data.len() && ext_count >= 3 {
                let (sx, sy) = self.world_to_screen((data[offset], data[offset + 1]));
                pb.move_to(sx, sy);
                for i in 1..ext_count {
                    let (sx, sy) =
                        self.world_to_screen((data[offset + i * 2], data[offset + i * 2 + 1]));
                    pb.line_to(sx, sy);
                }
                pb.close();
                found = true;
            }
            offset += ext_count * 2;

            for _ in 0..int_ring_count {
                if offset + 1 > data.len() {
                    break;
                }
                let count = data[offset] as usize;
                offset += 1;
                if offset + count * 2 <= data.len() && count >= 3 {
                    let (sx, sy) = self.world_to_screen((data[offset], data[offset + 1]));
                    pb.move_to(sx, sy);
                    for i in 1..count {
                        let (sx, sy) =
                            self.world_to_screen((data[offset + i * 2], data[offset + i * 2 + 1]));
                        pb.line_to(sx, sy);
                    }
                    pb.close();
                }
                offset += count * 2;
            }
        }

        if found {
            if let Some(path) = pb.finish() {
                let mut paint = Paint::default();
                paint.set_color(color);
                paint.anti_alias = true;
                self.pixmap.fill_path(
                    &path,
                    &paint,
                    FillRule::Winding,
                    Transform::identity(),
                    None,
                );
                web_sys::console::log_1(&format!("✅ 多边形绘制完成，颜色: {}", color_hex).into());
            }
        } else {
            web_sys::console::log_1(
                &format!("⚠️  未找到有效的多边形数据，颜色: {}", color_hex).into(),
            );
        }
    }

    /// 绘制道路
    pub fn draw_roads(&mut self, roads: &[Road]) {
        let mut groups: HashMap<crate::types::RoadType, Vec<&Road>> = HashMap::new();
        for road in roads {
            groups.entry(road.road_type).or_default().push(road);
        }

        for (road_type, roads) in groups {
            let color_hex = match road_type {
                crate::types::RoadType::Motorway => &self.theme.road_motorway,
                crate::types::RoadType::Primary => &self.theme.road_primary,
                crate::types::RoadType::Secondary => &self.theme.road_secondary,
                crate::types::RoadType::Tertiary => &self.theme.road_tertiary,
                crate::types::RoadType::Residential => &self.theme.road_residential,
                crate::types::RoadType::Default => &self.theme.road_default,
            };

            let color = parse_hex_color(color_hex);
            let width = road_type.get_width();

            let mut pb = PathBuilder::new();
            for road in roads {
                if road.coords.len() < 2 {
                    continue;
                }
                let (x, y) = self.world_to_screen(road.coords[0]);
                pb.move_to(x, y);
                for &coord in &road.coords[1..] {
                    let (x, y) = self.world_to_screen(coord);
                    pb.line_to(x, y);
                }
            }

            if let Some(path) = pb.finish() {
                let mut paint = Paint::default();
                paint.set_color(color);
                paint.anti_alias = true;

                let stroke = Stroke {
                    width,
                    ..Default::default()
                };

                self.pixmap
                    .stroke_path(&path, &paint, &stroke, Transform::identity(), None);
            }
        }
    }

    /// 绘制道路（使用动态缩放因子）
    pub fn draw_roads_scaled(&mut self, roads: &[Road], scale_factor: f32) {
        let mut groups: HashMap<crate::types::RoadType, Vec<&Road>> = HashMap::new();
        for road in roads {
            groups.entry(road.road_type).or_default().push(road);
        }

        for (road_type, roads) in groups {
            let color_hex = match road_type {
                crate::types::RoadType::Motorway => &self.theme.road_motorway,
                crate::types::RoadType::Primary => &self.theme.road_primary,
                crate::types::RoadType::Secondary => &self.theme.road_secondary,
                crate::types::RoadType::Tertiary => &self.theme.road_tertiary,
                crate::types::RoadType::Residential => &self.theme.road_residential,
                crate::types::RoadType::Default => &self.theme.road_default,
            };

            let color = parse_hex_color(color_hex);
            let width = road_type.get_width_scaled(scale_factor);

            let mut pb = PathBuilder::new();
            for road in roads {
                if road.coords.len() < 2 {
                    continue;
                }
                let (x, y) = self.world_to_screen(road.coords[0]);
                pb.move_to(x, y);
                for &coord in &road.coords[1..] {
                    let (x, y) = self.world_to_screen(coord);
                    pb.line_to(x, y);
                }
            }

            if let Some(path) = pb.finish() {
                let mut paint = Paint::default();
                paint.set_color(color);
                paint.anti_alias = true;

                let stroke = Stroke {
                    width,
                    ..Default::default()
                };

                self.pixmap
                    .stroke_path(&path, &paint, &stroke, Transform::identity(), None);
            }
        }
    }

    /// 绘制 POI 圆点（使用 POI 结构体数组）
    pub fn draw_pois(&mut self, pois: &[crate::types::POI]) {
        if pois.is_empty() {
            return;
        }

        // 使用主题中的 POI 专用颜色
        let poi_color = parse_hex_color(&self.theme.poi_color);

        const POI_RADIUS: f32 = 10.0; // POI 圆点半径（像素）
        const MIN_SPACING: f32 = 8.0; // POI 之间最小间距（像素）
        const MAX_POIS: usize = 50; // 最多渲染 50 个 POI 点
        const MIN_DISTANCE_SQ: f32 =
            (POI_RADIUS * 2.0 + MIN_SPACING) * (POI_RADIUS * 2.0 + MIN_SPACING);

        let mut rendered_positions: Vec<(f32, f32)> = Vec::with_capacity(MAX_POIS);

        for poi in pois {
            if rendered_positions.len() >= MAX_POIS {
                break;
            }

            let (screen_x, screen_y) = self.world_to_screen((poi.x, poi.y));

            // 检查边界
            if screen_x < 0.0
                || screen_x > self.width as f32
                || screen_y < 0.0
                || screen_y > self.height as f32
            {
                continue;
            }

            // 精确距离检测：检查与已选择渲染的 POI 是否太近
            let mut too_close = false;
            for (rx, ry) in &rendered_positions {
                let dx = screen_x - rx;
                let dy = screen_y - ry;
                let dist_sq = dx * dx + dy * dy;
                if dist_sq < MIN_DISTANCE_SQ {
                    too_close = true;
                    break;
                }
            }

            if too_close {
                continue;
            }

            // 绘制圆点
            let mut pb = PathBuilder::new();
            pb.push_circle(screen_x, screen_y, POI_RADIUS);

            if let Some(path) = pb.finish() {
                let mut paint = Paint::default();
                paint.set_color(poi_color);
                paint.anti_alias = true;

                self.pixmap.fill_path(
                    &path,
                    &paint,
                    FillRule::Winding,
                    Transform::identity(),
                    None,
                );

                rendered_positions.push((screen_x, screen_y));
            }
        }
    }

    /// 绘制 POI 圆点（二进制直读版本）
    /// 数据格式：[poi_count, x1, y1, x2, y2, ...]
    pub fn draw_pois_bin(&mut self, data: &[f64]) {
        if data.is_empty() || data[0] as usize == 0 {
            return;
        }

        let poi_count = data[0] as usize;
        if data.len() < 1 + poi_count * 2 {
            web_sys::console::log_1(
                &format!(
                    "❌ POI 数据长度不足: {} < {}",
                    data.len(),
                    1 + poi_count * 2
                )
                .into(),
            );
            return; // 数据长度不足
        }

        // 使用主题中的 POI 专用颜色
        let poi_color = parse_hex_color(&self.theme.poi_color);

        const POI_RADIUS: f32 = 8.0;
        const MIN_SPACING: f32 = 5.0;
        const MAX_POIS: usize = 200;
        const MIN_DISTANCE_SQ: f32 =
            (POI_RADIUS * 2.0 + MIN_SPACING) * (POI_RADIUS * 2.0 + MIN_SPACING);

        let mut rendered_positions: Vec<(f32, f32)> = Vec::with_capacity(MAX_POIS);
        let mut offset = 1;

        for _idx in 0..poi_count {
            // 达到最大数量则停止
            if rendered_positions.len() >= MAX_POIS {
                break;
            }

            if offset + 1 < data.len() {
                let x = data[offset];
                let y = data[offset + 1];
                let (screen_x, screen_y) = self.world_to_screen((x, y));

                // 检查边界
                if screen_x >= 0.0
                    && screen_x <= self.width as f32
                    && screen_y >= 0.0
                    && screen_y <= self.height as f32
                {
                    // 精确距离检测
                    let mut too_close = false;
                    for (rx, ry) in &rendered_positions {
                        let dx = screen_x - rx;
                        let dy = screen_y - ry;
                        let dist_sq = dx * dx + dy * dy;
                        if dist_sq < MIN_DISTANCE_SQ {
                            too_close = true;
                            break;
                        }
                    }

                    if !too_close {
                        // 绘制圆点
                        let mut pb = PathBuilder::new();
                        pb.push_circle(screen_x, screen_y, POI_RADIUS);

                        if let Some(path) = pb.finish() {
                            let mut paint = Paint::default();
                            paint.set_color(poi_color);
                            paint.anti_alias = true;

                            self.pixmap.fill_path(
                                &path,
                                &paint,
                                FillRule::Winding,
                                Transform::identity(),
                                None,
                            );
                            rendered_positions.push((screen_x, screen_y));
                        }
                    }
                }

                offset += 2;
            }
        }

        web_sys::console::log_1(
            &format!(
                "🔵 POI 采样完成: 原始 {} 个 → 采样后 {} 个，颜色: {}",
                poi_count,
                rendered_positions.len(),
                &self.theme.poi_color
            )
            .into(),
        );
    }

    /// 绘制渐变（顶部和底部）
    pub fn draw_gradients(&mut self) {
        let gradient_color = parse_hex_color(&self.theme.gradient_color);

        // 底部渐变
        self.draw_gradient("bottom", gradient_color);

        // 顶部渐变
        self.draw_gradient("top", gradient_color);
    }

    /// 绘制单个渐变（手动扫描线优化）
    fn draw_gradient(&mut self, location: &str, base_color: Color) {
        let height = self.height;
        let width = self.width;

        let (y_start, y_end) = if location == "bottom" {
            ((height as f32 * 0.75) as u32, height)
        } else {
            (0, (height as f32 * 0.25) as u32)
        };

        if y_start >= y_end {
            return;
        }

        let pixels = self.pixmap.pixels_mut();
        let base_r = base_color.red();
        let base_g = base_color.green();
        let base_b = base_color.blue();
        let base_a = base_color.alpha();

        for y in y_start..y_end {
            let t = if location == "bottom" {
                (y - y_start) as f32 / (y_end - y_start) as f32
            } else {
                (y_end - y) as f32 / (y_end - y_start) as f32
            };

            // 计算当前行的源颜色（预乘）
            let alpha = t * base_a;
            if alpha <= 0.0 {
                continue;
            }

            let src_r = base_r * alpha;
            let src_g = base_g * alpha;
            let src_b = base_b * alpha;
            let src_a_inv = 1.0 - alpha;

            // 转换到 0-255 整数以加速计算
            let isrc_r = (src_r * 255.0 + 0.5) as u32;
            let isrc_g = (src_g * 255.0 + 0.5) as u32;
            let isrc_b = (src_b * 255.0 + 0.5) as u32;

            let row_start = (y * width) as usize;
            let row_end = row_start + width as usize;
            let row = &mut pixels[row_start..row_end];

            for p in row {
                let da = p.alpha();
                if da == 0 {
                    // 如果底色是透明的，直接覆盖
                    *p = tiny_skia::PremultipliedColorU8::from_rgba(
                        isrc_r as u8,
                        isrc_g as u8,
                        isrc_b as u8,
                        (alpha * 255.0 + 0.5) as u8,
                    )
                    .unwrap();
                } else {
                    // SrcOver 混合 (bland existing pixels)
                    let r = (isrc_r + (p.red() as f32 * src_a_inv + 0.5) as u32).min(255) as u8;
                    let g = (isrc_g + (p.green() as f32 * src_a_inv + 0.5) as u32).min(255) as u8;
                    let b = (isrc_b + (p.blue() as f32 * src_a_inv + 0.5) as u32).min(255) as u8;
                    let a = ((alpha + (da as f32 / 255.0) * src_a_inv) * 255.0 + 0.5) as u8;

                    *p = tiny_skia::PremultipliedColorU8::from_rgba(r, g, b, a).unwrap();
                }
            }
        }
    }

    fn add_poly_to_path(&self, pb: &mut PathBuilder, poly: &PolyFeature) {
        if poly.exterior.len() < 3 {
            return;
        }

        // 外圈
        let (x, y) = self.world_to_screen(poly.exterior[0]);
        pb.move_to(x, y);
        for &coord in &poly.exterior[1..] {
            let (x, y) = self.world_to_screen(coord);
            pb.line_to(x, y);
        }
        pb.close();

        // 内圈（洞）
        for interior in &poly.interiors {
            if interior.len() < 3 {
                continue;
            }
            let (x, y) = self.world_to_screen(interior[0]);
            pb.move_to(x, y);
            for &coord in &interior[1..] {
                let (x, y) = self.world_to_screen(coord);
                pb.line_to(x, y);
            }
            pb.close();
        }
    }

    /// 绘制文字（使用 fontdue）
    pub fn draw_text(
        &mut self,
        city: &str,
        country: &str,
        lat: f64,
        lon: f64,
        font_data: &[u8],
    ) -> Result<(), String> {
        let font = Font::from_bytes(font_data, FontSettings::default())
            .map_err(|e| format!("Failed to load font: {}", e))?;

        let text_color = parse_hex_color(&self.theme.text);

        // 改进：限制缩放系数
        // 取 Width/800 和 Height/800*1.1 中的较小值。
        // *1.1 是为了让 A4 (0.7宽高比) 这种瘦长比例依然由宽度主导缩放。
        // 但是对于 16:9 (1.77宽高比) 这种扁平比例，Height/800*1.1 (约0.6) 会小于 Width/800 (1.0)，
        // 从而强制缩小字体，避免文字撑出高度。
        let width_scale = self.width as f32 / 1200.0;
        let height_scale = (self.height as f32 / 1200.0) * 1.1;
        let scale_factor = width_scale.min(height_scale);

        // 计算基准锚点 Y 坐标 (屏幕绝对坐标)
        // 依然保留 height 的百分比作为"定位锚点"，但元素之间的间距不再依赖 height
        let base_y_px = match self.text_position {
            TextPosition::Top => self.height as f32 * 0.10,
            TextPosition::Center => self.height as f32 * 0.50,
            TextPosition::Bottom => self.height as f32 * 0.88,
        };

        // 定义相对偏移量 (基于 800px 宽度的标准像素值)
        // 之前的 0.05 (5%) 在 1000px 高度下是 50px
        // 之前的 0.04 (4%) 在 1000px 高度下是 40px
        // 之前的 0.03 (3%) 在 1000px 高度下是 30px
        let city_offset = 50.0 * scale_factor;
        let coords_offset = -40.0 * scale_factor;
        let decor_offset = 30.0 * scale_factor;

        // 绘制城市名 (增加基准大小到 80.0)
        let formatted_city = format_city_name(city);
        let city_size = calculate_font_size(&formatted_city, 80.0 * scale_factor, 10);
        // 位置：锚点 + 偏移
        self.draw_text_centered(
            &font,
            &formatted_city,
            base_y_px + city_offset,
            city_size,
            text_color,
        );

        // 绘制国家名 (增加基准大小到 28.0)
        let country_upper = country.to_uppercase();
        let country_size = 28.0 * scale_factor;
        // 位置：锚点本身
        self.draw_text_centered(&font, &country_upper, base_y_px, country_size, text_color);

        // 绘制坐标 (增加基准大小到 18.0)
        let coords_str = format_coordinates(lat, lon);
        let coords_size = 18.0 * scale_factor;
        // 位置：锚点 - 偏移
        self.draw_text_centered(
            &font,
            &coords_str,
            base_y_px + coords_offset,
            coords_size,
            text_color,
        );

        // 绘制装饰线
        // self.draw_decoration_line(text_color, scale_factor, base_y_px + decor_offset);

        // 绘制署名 (修正底部边距逻辑)
        let attr_text = "© OpenStreetMap contributors";
        self.draw_text_bottom_right(
            &font,
            attr_text,
            10.0 * scale_factor,
            text_color,
            scale_factor,
        );

        Ok(())
    }

    /// 居中绘制文字
    fn draw_text_centered(
        &mut self,
        font: &Font,
        text: &str,
        y_baseline: f32, // 改为绝对坐标
        size: f32,
        color: Color,
    ) {
        let mut layout = Layout::new(CoordinateSystem::PositiveYDown);
        layout.append(&[font], &TextStyle::new(text, size, 0));

        let y = y_baseline as i32;

        // 计算文字宽度以居中
        let glyphs = layout.glyphs();
        if glyphs.is_empty() {
            return;
        }

        let min_x = glyphs.iter().map(|g| g.x).fold(f32::INFINITY, f32::min);
        let max_x = glyphs
            .iter()
            .map(|g| g.x + g.width as f32)
            .fold(f32::NEG_INFINITY, f32::max);

        let text_width = max_x - min_x;
        // 使用 f32 计算偏移以保持亚像素精度
        let x_offset = (self.width as f32 - text_width) / 2.0 - min_x;

        for glyph in glyphs {
            let (metrics, bitmap) = font.rasterize_config(glyph.key);
            self.draw_glyph_bitmap(
                &bitmap,
                metrics.width,
                metrics.height,
                (x_offset + glyph.x).round() as i32,
                (y as f32 + glyph.y).round() as i32,
                color,
            );
        }
    }

    /// 右下角绘制文字
    fn draw_text_bottom_right(
        &mut self,
        font: &Font,
        text: &str,
        size: f32,
        color: Color,
        scale_factor: f32,
    ) {
        let mut layout = Layout::new(CoordinateSystem::PositiveYDown);
        layout.append(&[font], &TextStyle::new(text, size, 0));

        let glyphs = layout.glyphs();
        if glyphs.is_empty() {
            return;
        }

        let max_x = glyphs
            .iter()
            .map(|g| (g.x + g.width as f32) as i32)
            .max()
            .unwrap_or(0);

        // 动态计算边距
        let margin = 20.0 * scale_factor;

        let x_offset = self.width as i32 - max_x - margin as i32;
        // y 是文本块的起始位置。为了让文本底部距离边缘 margin，
        // y 应该是 height - margin - text_height
        // 简单估算 text_height 为 size
        let y = self.height as i32 - margin as i32 - size as i32;

        for glyph in glyphs {
            let (metrics, bitmap) = font.rasterize_config(glyph.key);
            self.draw_glyph_bitmap(
                &bitmap,
                metrics.width,
                metrics.height,
                x_offset + glyph.x as i32,
                y + glyph.y as i32,
                color,
            );
        }
    }

    /// 绘制字形位图（实现正确的 SrcOver 混合以解决边缘发虚问题）
    fn draw_glyph_bitmap(
        &mut self,
        bitmap: &[u8],
        width: usize,
        height: usize,
        x: i32,
        y: i32,
        color: Color,
    ) {
        let pixmap_width = self.width;
        let pixmap_height = self.height;
        let pixels = self.pixmap.pixels_mut();

        for dy in 0..height {
            for dx in 0..width {
                let alpha = bitmap[dy * width + dx];
                if alpha == 0 {
                    continue;
                }

                let px = x + dx as i32;
                let py = y + dy as i32;

                if px >= 0 && px < pixmap_width as i32 && py >= 0 && py < pixmap_height as i32 {
                    let pixel_idx = py as usize * pixmap_width as usize + px as usize;
                    let alpha_f = (alpha as f32 / 255.0) * color.alpha();

                    // 获取已有背景像素
                    let dst = pixels[pixel_idx];
                    let dr = dst.red() as f32 / 255.0;
                    let dg = dst.green() as f32 / 255.0;
                    let db = dst.blue() as f32 / 255.0;
                    let da = dst.alpha() as f32 / 255.0;

                    // 计算源颜色（预乘）
                    let sr = color.red() * alpha_f;
                    let sg = color.green() * alpha_f;
                    let sb = color.blue() * alpha_f;
                    let sa = alpha_f;

                    // SrcOver 混合公式: out = src + dst * (1 - src_alpha)
                    let inv_sa = 1.0 - sa;
                    let out_r = sr + dr * inv_sa;
                    let out_g = sg + dg * inv_sa;
                    let out_b = sb + db * inv_sa;
                    let out_a = sa + da * inv_sa;

                    // 写回像素
                    if let Some(c) = tiny_skia::PremultipliedColorU8::from_rgba(
                        (out_r * 255.0 + 0.5) as u8,
                        (out_g * 255.0 + 0.5) as u8,
                        (out_b * 255.0 + 0.5) as u8,
                        (out_a * 255.0 + 0.5) as u8,
                    ) {
                        pixels[pixel_idx] = c;
                    }
                }
            }
        }
    }

    /// 绘制装饰线
    fn draw_decoration_line(&mut self, color: Color, scale_factor: f32, y_px: f32) {
        let y = y_px;
        let x1 = self.width as f32 * 0.4;
        let x2 = self.width as f32 * 0.6;

        let mut pb = PathBuilder::new();
        pb.move_to(x1, y);
        pb.line_to(x2, y);

        if let Some(path) = pb.finish() {
            let mut paint = Paint::default();
            paint.set_color(color);
            paint.anti_alias = true;

            let stroke = Stroke {
                width: 1.0 * scale_factor,
                ..Default::default()
            };

            self.pixmap
                .stroke_path(&path, &paint, &stroke, Transform::identity(), None);
        }
    }

    /// 世界坐标 -> 屏幕坐标
    fn world_to_screen(&self, coord: (f64, f64)) -> (f32, f32) {
        let x = ((coord.0 - self.bounds.min_x) * self.x_factor) as f32;
        let y = self.height as f32 - ((coord.1 - self.bounds.min_y) * self.y_factor) as f32;
        (x, y)
    }

    /// 导出为 PNG（带 DPI 元数据）
    pub fn encode_png(self, dpi: u32) -> Vec<u8> {
        let raw = self.pixmap.encode_png().unwrap();

        // pHYs chunk 构造
        let ppm = (dpi as u64 * 10000 / 254) as u32; // 300 DPI = 11811
        let mut phys: Vec<u8> = Vec::with_capacity(21);

        // chunk data length = 9 bytes
        phys.extend_from_slice(&9u32.to_be_bytes());
        // chunk type: "pHYs"
        phys.extend_from_slice(b"pHYs");
        // pixels per unit X (big-endian)
        phys.extend_from_slice(&ppm.to_be_bytes());
        // pixels per unit Y (big-endian)
        phys.extend_from_slice(&ppm.to_be_bytes());
        // unit: 1 = meter
        phys.push(1u8);
        // CRC-32 (覆盖 type + data)
        let crc = crc32(&phys[4..17]);
        phys.extend_from_slice(&crc.to_be_bytes());

        // 在 IHDR 之后 (offset 33) 插入 pHYs chunk
        let insert_pos = 33;
        let mut result = Vec::with_capacity(raw.len() + 21);
        result.extend_from_slice(&raw[..insert_pos]);
        result.extend_from_slice(&phys);
        result.extend_from_slice(&raw[insert_pos..]);

        result
    }
}

/// 计算 CRC-32 (PNG 标准 ISO 3309)
fn crc32(data: &[u8]) -> u32 {
    // CRC-32 lookup table
    static CRC_TABLE: [u32; 256] = [
        0x00000000, 0x77073096, 0xEE0E612C, 0x990951BA, 0x076DC419, 0x706AF48F, 0xE963A535, 0x9E6495A3,
        0x0EDB8832, 0x79DCB8A4, 0xE0D5E91E, 0x97D2D988, 0x09B64C2B, 0x7EB17CBD, 0xE7B82D07, 0x90BF1D91,
        0x1DB71064, 0x6AB020F2, 0xF3B97148, 0x84BE41DE, 0x1ADAD47D, 0x6DDDE4EB, 0xF4D4B551, 0x83D385C7,
        0x136C9856, 0x646BA8C0, 0xFD62F97A, 0x8A65C9EC, 0x14015C4F, 0x63066CD9, 0xFA0F3D63, 0x8D080DF5,
        0x3B6E20C8, 0x4C69105E, 0xD56041E4, 0xA2677172, 0x3C03E4D1, 0x4B04D447, 0xD20D85FD, 0xA50AB56B,
        0x35B5A8FA, 0x42B2986C, 0xDBBBC9D6, 0xACBCF940, 0x32D86CE3, 0x45DF5C75, 0xDCD60DCF, 0xABD13D59,
        0x26D930AC, 0x51DE003A, 0xC8D75180, 0xBFD06116, 0x21B4F4B5, 0x56B3C423, 0xCFBA9599, 0xB8BDA50F,
        0x2802B89E, 0x5F058808, 0xC60CD9B2, 0xB10BE924, 0x2F6F7C87, 0x58684C11, 0xC1611DAB, 0xB6662D3D,
        0x76DC4190, 0x01DB7106, 0x98D220BC, 0xEFD5102A, 0x71B18589, 0x06B6B51F, 0x9FBFE4A5, 0xE8B8D433,
        0x7807C9A2, 0x0F00F934, 0x9609A88E, 0xE10E9818, 0x7F6A0DBB, 0x086D3D2D, 0x91646C97, 0xE6635C01,
        0x6B6B51F4, 0x1C6C6162, 0x856530D8, 0xF262004E, 0x6C0695ED, 0x1B01A57B, 0x8208F4C1, 0xF50FC457,
        0x65B0D9C6, 0x12B7E950, 0x8BBEB8EA, 0xFCB9887C, 0x62DD1DDF, 0x15DA2D49, 0x8CD37CF3, 0xFBD44C65,
        0x4DB26158, 0x3AB551CE, 0xA3BC0074, 0xD4BB30E2, 0x4ADFA541, 0x3DD895D7, 0xA4D1C46D, 0xD3D6F4FB,
        0x4369E96A, 0x346ED9FC, 0xAD678846, 0xDA60B8D0, 0x44042D73, 0x33031DE5, 0xAA0A4C5F, 0xDD0D7CC9,
        0x5005713C, 0x270241AA, 0xBE0B1010, 0xC90C2086, 0x5768B525, 0x206F85B3, 0xB966D409, 0xCE61E49F,
        0x5EDEF90E, 0x29D9C998, 0xB0D09822, 0xC7D7A8B4, 0x59B33D17, 0x2EB40D81, 0xB7BD5C3B, 0xC0BA6CAD,
        0xEDB88320, 0x9ABFB3B6, 0x03B6E20C, 0x74B1D29A, 0xEAD54739, 0x9DD277AF, 0x04DB2615, 0x73DC1683,
        0xE3630B12, 0x94643B84, 0x0D6D6A3E, 0x7A6A5AA8, 0xE40ECF0B, 0x9309FF9D, 0x0A00AE27, 0x7D079EB1,
        0xF00F9344, 0x8708A3D2, 0x1E01F268, 0x6906C2FE, 0xF762575D, 0x806567CB, 0x196C3671, 0x6E6B06E7,
        0xFED41B76, 0x89D32BE0, 0x10DA7A5A, 0x67DD4ACC, 0xF9B9DF6F, 0x8EBEEFF9, 0x17B7BE43, 0x60B08ED5,
        0xD6D6A3E8, 0xA1D1937E, 0x38D8C2C4, 0x4FDFF252, 0xD1BB67F1, 0xA6BC5767, 0x3FB506DD, 0x48B2364B,
        0xD80D2BDA, 0xAF0A1B4C, 0x36034AF6, 0x41047A60, 0xDF60EFC3, 0xA867DF55, 0x316E8EEF, 0x4669BE79,
        0xCB61B38C, 0xBC66831A, 0x256FD2A0, 0x5268E236, 0xCC0C7795, 0xBB0B4703, 0x220216B9, 0x5505262F,
        0xC5BA3BBE, 0xB2BD0B28, 0x2BB45A92, 0x5CB36A04, 0xC2D7FFA7, 0xB5D0CF31, 0x2CD99E8B, 0x5BDEAE1D,
        0x9B64C2B0, 0xEC63F226, 0x756AA39C, 0x026D930A, 0x9C0906A9, 0xEB0E363F, 0x72076785, 0x05005713,
        0x95BF4A82, 0xE2B87A14, 0x7BB12BAE, 0x0CB61B38, 0x92D28E9B, 0xE5D5BE0D, 0x7CDCEFB7, 0x0BDBDF21,
        0x86D3D2D4, 0xF1D4E242, 0x68DDB3F8, 0x1FDA836E, 0x81BE16CD, 0xF6B9265B, 0x6FB077E1, 0x18B74777,
        0x88085AE6, 0xFF0F6A70, 0x66063BCA, 0x11010B5C, 0x8F659EFF, 0xF862AE69, 0x616BFFD3, 0x166CCF45,
        0xA00AE278, 0xD70DD2EE, 0x4E048354, 0x3903B3C2, 0xA7672661, 0xD06016F7, 0x4969474D, 0x3E6E77DB,
        0xAED16A4A, 0xD9D65ADC, 0x40DF0B66, 0x37D83BF0, 0xA9BCAE53, 0xDEBB9EC5, 0x47B2CF7F, 0x30B5FFE9,
        0xBDBDF21C, 0xCABAC28A, 0x53B39330, 0x24B4A3A6, 0xBAD03605, 0xCDD70693, 0x54DE5729, 0x23D967BF,
        0xB3667A2E, 0xC4614AB8, 0x5D681B02, 0x2A6F2B94, 0xB40BBE37, 0xC30C8EA1, 0x5A05DF1B, 0x2D02EF8D,
    ];

    let mut crc: u32 = 0xFFFFFFFF;
    for &byte in data {
        let idx = ((crc ^ byte as u32) & 0xFF) as usize;
        crc = (crc >> 8) ^ CRC_TABLE[idx];
    }
    crc ^ 0xFFFFFFFF
}
