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
            return;
        }
        let poly_count = data[0] as usize;
        let mut offset = 1;
        let color = parse_hex_color(color_hex);

        let mut pb = PathBuilder::new();
        let mut found = false;

        for _ in 0..poly_count {
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
                    FillRule::EvenOdd,
                    Transform::identity(),
                    None,
                );
            }
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

    /// 导出为 PNG
    pub fn encode_png(self) -> Vec<u8> {
        self.pixmap.encode_png().unwrap()
    }
}
