use fontdue::layout::{CoordinateSystem, Layout, TextStyle};
use fontdue::{Font, FontSettings};
use std::collections::HashMap;
use tiny_skia::Color;

use crate::projection;
use crate::types::{BoundingBox, PinThemeConfig, PinThemeStyle, RoadType, TextPosition, Theme};
use crate::utils::{calculate_font_size, format_city_name, format_coordinates, parse_hex_color};

pub struct SvgRenderer {
    svg: String,
    theme: Theme,
    bounds: BoundingBox,
    width: u32,
    height: u32,
    x_factor: f64,
    y_factor: f64,
    text_position: TextPosition,
    next_path_id: u32,
    next_mask_id: u32,
    next_pin_id: u32,
}

impl SvgRenderer {
    pub fn new(
        width: u32,
        height: u32,
        theme: Theme,
        bounds: BoundingBox,
        text_position: TextPosition,
    ) -> Self {
        let mut svg = String::new();
        svg.push_str(&format!(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" shape-rendering="geometricPrecision" text-rendering="geometricPrecision">"#
        ));
        Self {
            svg,
            theme,
            bounds,
            width,
            height,
            x_factor: width as f64 / bounds.width(),
            y_factor: height as f64 / bounds.height(),
            text_position,
            next_path_id: 0,
            next_mask_id: 0,
            next_pin_id: 0,
        }
    }

    pub fn draw_background(&mut self) {
        self.svg.push_str(&format!(
            r#"<rect width="100%" height="100%" fill="{}"/>"#,
            escape_attr(&self.theme.bg)
        ));
    }

    pub fn draw_polygons_bin(&mut self, data: &[f64], color_hex: &str) {
        if data.is_empty() || data[0] as usize == 0 {
            return;
        }

        for d in self.build_polygon_path_data_list(data) {
            self.svg.push_str(&format!(
                r#"<path d="{d}" fill="{}" fill-rule="evenodd"/>"#,
                escape_attr(color_hex)
            ));
        }
    }

    pub fn draw_parks_bin_masked_by_water(
        &mut self,
        parks_data: &[f64],
        water_data: &[f64],
        color_hex: &str,
    ) {
        if parks_data.is_empty() || parks_data[0] as usize == 0 {
            return;
        }

        let park_paths = self.build_polygon_path_data_list(parks_data);
        if park_paths.is_empty() {
            return;
        }

        let water_paths = self.build_polygon_path_data_list(water_data);
        if water_paths.is_empty() {
            for parks_d in park_paths {
                self.svg.push_str(&format!(
                    r#"<path d="{parks_d}" fill="{}" fill-rule="evenodd"/>"#,
                    escape_attr(color_hex)
                ));
            }
            return;
        }

        let mask_id = format!("m{}", self.next_mask_id);
        self.next_mask_id += 1;
        let water_mask_content = water_paths
            .iter()
            .map(|d| format!(r#"<path d="{d}" fill="black" fill-rule="evenodd"/>"#))
            .collect::<String>();
        self.svg.push_str(&format!(
            r#"<defs><mask id="{mask_id}" maskUnits="userSpaceOnUse" x="0" y="0" width="{}" height="{}"><rect x="0" y="0" width="{}" height="{}" fill="white"/>{water_mask_content}</mask></defs>"#,
            self.width,
            self.height,
            self.width,
            self.height
        ));
        for parks_d in park_paths {
            self.svg.push_str(&format!(
                r#"<path d="{parks_d}" fill="{}" fill-rule="evenodd" mask="url(#{mask_id})"/>"#,
                escape_attr(color_hex)
            ));
        }
    }

    pub fn draw_road_shards_masked_by_terrain_scaled(
        &mut self,
        road_shards: &[Vec<f64>],
        water_data: &[f64],
        parks_data: &[f64],
        scale_factor: f32,
    ) -> [f64; 6] {
        if road_shards.is_empty() {
            return [0.0; 6];
        }

        let mut timings = [0.0; 6];
        let scale_factor = scale_factor.max(0.0);
        let mut terrain_paths = self.build_polygon_path_data_list(water_data);
        terrain_paths.extend(self.build_polygon_path_data_list(parks_data));

        let mask_id = if terrain_paths.is_empty() {
            None
        } else {
            let mask_id = format!("m{}", self.next_mask_id);
            self.next_mask_id += 1;
            let terrain_mask_content = terrain_paths
                .iter()
                .map(|d| format!(r#"<path d="{d}" fill="black" fill-rule="evenodd"/>"#))
                .collect::<String>();
            self.svg.push_str(&format!(
                r#"<defs><mask id="{mask_id}" maskUnits="userSpaceOnUse" x="0" y="0" width="{}" height="{}"><rect x="0" y="0" width="{}" height="{}" fill="white"/>{terrain_mask_content}</mask></defs>"#,
                self.width,
                self.height,
                self.width,
                self.height
            ));
            Some(mask_id)
        };

        let mut combined_paths: [String; 6] = std::array::from_fn(|_| String::new());
        for shard in road_shards {
            if shard.is_empty() {
                continue;
            }
            let shard_paths = self.build_road_path_data(shard);
            for i in 0..6 {
                combined_paths[i].push_str(&shard_paths[i]);
            }
        }

        self.draw_road_paths(&combined_paths, scale_factor, mask_id.as_deref(), &mut timings);

        timings
    }

    pub fn draw_road_shards_scaled(
        &mut self,
        road_shards: &[Vec<f64>],
        scale_factor: f32,
    ) -> [f64; 6] {
        if road_shards.is_empty() {
            return [0.0; 6];
        }

        let mut timings = [0.0; 6];
        let scale_factor = scale_factor.max(0.0);
        let mut combined_paths: [String; 6] = std::array::from_fn(|_| String::new());
        for shard in road_shards {
            if shard.is_empty() {
                continue;
            }
            let shard_paths = self.build_road_path_data(shard);
            for i in 0..6 {
                combined_paths[i].push_str(&shard_paths[i]);
            }
        }

        self.draw_road_paths(&combined_paths, scale_factor, None, &mut timings);
        timings
    }

    fn draw_road_paths(
        &mut self,
        paths: &[String; 6],
        scale_factor: f32,
        mask_id: Option<&str>,
        timings: &mut [f64; 6],
    ) {
        let mask_attr = mask_id
            .map(|id| format!(r#" mask="url(#{id})""#))
            .unwrap_or_default();

        const DRAW_ORDER: [usize; 6] = [5, 4, 3, 2, 1, 0];
        let path_ids: [Option<String>; 6] = std::array::from_fn(|idx| {
            if paths[idx].is_empty() {
                None
            } else {
                Some(self.define_path(&paths[idx]))
            }
        });

        for &t_idx in &DRAW_ORDER {
            if t_idx == RoadType::Residential as usize || paths[t_idx].is_empty() {
                continue;
            }
            let road_type = RoadType::from_u32(t_idx as u32);
            let Some(path_id) = &path_ids[t_idx] else {
                continue;
            };

            let start = crate::utils::performance_now();
            let base_color = parse_hex_color(self.road_color_hex(road_type));
            let casing_color = darken_color(base_color, 0.9);
            let casing_width = road_type.get_width_scaled(scale_factor) + 2.0;
            self.svg.push_str(&format!(
                r##"<use href="#{}" fill="none" stroke="{}" stroke-opacity="0.2" stroke-width="{}" stroke-linecap="round" stroke-linejoin="round"{} />"##,
                path_id,
                color_to_hex(casing_color),
                fmt2(casing_width),
                mask_attr
            ));
            timings[t_idx] += crate::utils::performance_now() - start;
        }

        for &t_idx in &DRAW_ORDER {
            if paths[t_idx].is_empty() {
                continue;
            }
            let road_type = RoadType::from_u32(t_idx as u32);
            let Some(path_id) = &path_ids[t_idx] else {
                continue;
            };

            let start = crate::utils::performance_now();
            self.svg.push_str(&format!(
                r##"<use href="#{}" fill="none" stroke="{}" stroke-width="{}" stroke-linecap="round" stroke-linejoin="round"{} />"##,
                path_id,
                escape_attr(self.road_color_hex(road_type)),
                fmt2(road_type.get_width_scaled(scale_factor)),
                mask_attr
            ));
            timings[t_idx] += crate::utils::performance_now() - start;
        }
    }

    pub fn draw_pois_bin_scaled(&mut self, data: &[f64], poi_ratio: f32) {
        if data.is_empty() || data[0] as usize == 0 {
            return;
        }

        let poi_count = data[0] as usize;
        if data.len() < 1 + poi_count * 2 {
            return;
        }

        let short_side = self.width.min(self.height) as f32;
        let poi_radius = short_side * poi_ratio * 0.5;
        let min_spacing = poi_radius * 0.25;
        let min_distance_sq = (poi_radius * 2.0 + min_spacing) * (poi_radius * 2.0 + min_spacing);
        let cell_size = ((poi_radius * 2.0 + min_spacing).ceil() as i32).max(1);
        let mut grid: HashMap<(i32, i32), Vec<(f32, f32)>> = HashMap::new();
        let mut rendered_count = 0usize;
        let mut offset = 1;

        self.svg.push_str(&format!(
            r#"<g fill="{}">"#,
            escape_attr(&self.theme.poi_color)
        ));

        for _ in 0..poi_count {
            if rendered_count >= 50 || offset + 1 >= data.len() {
                break;
            }

            let projected = projection::project_point(data[offset], data[offset + 1]);
            let (screen_x, screen_y) = self.world_to_screen(projected);
            offset += 2;

            if screen_x < 0.0
                || screen_x > self.width as f32
                || screen_y < 0.0
                || screen_y > self.height as f32
            {
                continue;
            }

            let cx = (screen_x / cell_size as f32).floor() as i32;
            let cy = (screen_y / cell_size as f32).floor() as i32;
            let mut too_close = false;
            'outer: for dy in -1..=1i32 {
                for dx in -1..=1i32 {
                    if let Some(pts) = grid.get(&(cx + dx, cy + dy)) {
                        for &(rx, ry) in pts {
                            let ddx = screen_x - rx;
                            let ddy = screen_y - ry;
                            if ddx * ddx + ddy * ddy < min_distance_sq {
                                too_close = true;
                                break 'outer;
                            }
                        }
                    }
                }
            }

            if too_close {
                continue;
            }

            grid.entry((cx, cy)).or_default().push((screen_x, screen_y));
            self.svg.push_str(&format!(
                r#"<circle cx="{}" cy="{}" r="{}"/>"#,
                fmt1(screen_x),
                fmt1(screen_y),
                fmt2(poi_radius)
            ));
            rendered_count += 1;
        }

        self.svg.push_str("</g>");
    }

    pub fn draw_custom_pois(
        &mut self,
        pois: &[crate::types::CustomPOI],
        pin_theme_config: &PinThemeConfig,
    ) {
        if pois.is_empty() {
            return;
        }

        let short_side = self.width.min(self.height) as f32;
        let marker_diameter = short_side * pin_theme_config.poi_ratio;
        let marker_radius = marker_diameter * 0.5;
        let min_spacing = 5.0;
        let min_distance_sq = (marker_diameter + min_spacing) * (marker_diameter + min_spacing);
        let cell_size = ((marker_diameter + min_spacing).ceil() as i32).max(1);
        let mut grid: HashMap<(i32, i32), Vec<(f32, f32)>> = HashMap::new();

        for poi in pois {
            let projected = projection::project_point(poi.lon, poi.lat);
            let (screen_x, screen_y) = self.world_to_screen(projected);

            if screen_x < 0.0
                || screen_x > self.width as f32
                || screen_y < 0.0
                || screen_y > self.height as f32
            {
                continue;
            }

            let cx = (screen_x / cell_size as f32).floor() as i32;
            let cy = (screen_y / cell_size as f32).floor() as i32;
            let mut too_close = false;
            'outer: for dy in -1..=1i32 {
                for dx in -1..=1i32 {
                    if let Some(pts) = grid.get(&(cx + dx, cy + dy)) {
                        for &(rx, ry) in pts {
                            let ddx = screen_x - rx;
                            let ddy = screen_y - ry;
                            if ddx * ddx + ddy * ddy < min_distance_sq {
                                too_close = true;
                                break 'outer;
                            }
                        }
                    }
                }
            }

            if too_close {
                continue;
            }

            grid.entry((cx, cy)).or_default().push((screen_x, screen_y));
            if pin_theme_config.gradient_enabled {
                self.push_gradient_pin_badge_svg(screen_x, screen_y, marker_radius, pin_theme_config);
            } else {
                self.push_solid_pin_badge_svg(screen_x, screen_y, marker_radius, pin_theme_config);
            }
            let fallback_radius = marker_radius * pin_theme_config.fallback_dot_scale;
            if !self.push_custom_poi_icon_svg(
                poi,
                screen_x,
                screen_y,
                marker_diameter * pin_theme_config.icon_scale,
            ) {
                self.svg.push_str(&format!(
                    r#"<circle cx="{}" cy="{}" r="{}" fill="{}"/>"#,
                    fmt1(screen_x),
                    fmt1(screen_y),
                    fmt2(fallback_radius),
                    escape_attr(&self.theme.poi_icon_color)
                ));
            }
        }
    }

    pub fn draw_gradients(&mut self) {
        let gradient_color = escape_attr(&self.theme.gradient_color);
        let top_h = self.height as f32 * 0.25;
        let bottom_y = self.height as f32 * 0.75;
        let bottom_h = self.height as f32 - bottom_y;

        self.svg.push_str(&format!(
            r##"<defs><linearGradient id="mp-top" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{gradient_color}" stop-opacity="1"/><stop offset="1" stop-color="{gradient_color}" stop-opacity="0"/></linearGradient><linearGradient id="mp-bottom" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{gradient_color}" stop-opacity="0"/><stop offset="1" stop-color="{gradient_color}" stop-opacity="1"/></linearGradient></defs><rect x="0" y="0" width="{}" height="{}" fill="url(#mp-top)"/><rect x="0" y="{}" width="{}" height="{}" fill="url(#mp-bottom)"/>"##,
            self.width,
            fmt1(top_h),
            fmt1(bottom_y),
            self.width,
            fmt1(bottom_h)
        ));
    }

    pub fn draw_text(
        &mut self,
        city: &str,
        country: &str,
        lat: f64,
        lon: f64,
        font_data: &[u8],
        show_city: bool,
        show_country: bool,
        show_coords: bool,
        embed_font: bool,
    ) -> Result<(), String> {
        let font = Font::from_bytes(font_data, FontSettings::default())
            .map_err(|e| format!("Failed to load font: {}", e))?;
        let font_family = "MapPosterExportFont";
        if embed_font {
            let encoded_font = encode_base64(font_data);
            self.svg.push_str(&format!(
                r#"<style>@font-face{{font-family:'{font_family}';src:url(data:font/ttf;base64,{encoded_font}) format('truetype');}}.mp-text{{font-family:'{font_family}',serif;fill:{};font-weight:400;}}</style>"#,
                escape_attr(&self.theme.text)
            ));
        } else {
            self.svg.push_str(&format!(
                r#"<style>.mp-text{{font-family:serif;fill:{};font-weight:400;}}</style>"#,
                escape_attr(&self.theme.text)
            ));
        }

        let width_scale = self.width as f32 / 1200.0;
        let height_scale = (self.height as f32 / 1200.0) * 1.1;
        let scale_factor = width_scale.min(height_scale);
        let aspect_ratio = self.height as f32 / self.width as f32;
        let bottom_anchor = if aspect_ratio > 1.0 {
            (0.85 + (aspect_ratio - 1.0) * 0.1).min(0.88)
        } else {
            0.85
        };
        let base_y_px = match self.text_position {
            TextPosition::Top => self.height as f32 * 0.10,
            TextPosition::Center => self.height as f32 * 0.50,
            TextPosition::Bottom => self.height as f32 * bottom_anchor,
        } - 16.0;

        let offset_pool: [f32; 3] = [50.0 * scale_factor, 0.0, -40.0 * scale_factor];
        let mut visible_index = 0usize;
        let mut draw_visible_text = |text: &str, font_size: f32| {
            let top_y = base_y_px + offset_pool[visible_index];
            let y = svg_baseline_y(&font, font_size, top_y);
            let letter_spacing = estimate_svg_letter_spacing(&font, text, font_size);
            self.svg.push_str(&format!(
                r#"<text class="mp-text" x="{}" y="{}" font-size="{}" text-anchor="middle" dominant-baseline="alphabetic" letter-spacing="{}">{}</text>"#,
                fmt1(self.width as f32 / 2.0),
                fmt1(y),
                fmt2(font_size),
                fmt2(letter_spacing),
                escape_text(text)
            ));
            visible_index += 1;
        };

        if show_city {
            let formatted_city = format_city_name(city);
            let city_size = calculate_font_size(&formatted_city, 80.0 * scale_factor, 30);
            draw_visible_text(&formatted_city, city_size);
        }
        if show_country {
            let country_upper = country.to_uppercase();
            draw_visible_text(&country_upper, 28.0 * scale_factor);
        }
        if show_coords {
            let coords = format_coordinates(lat, lon);
            draw_visible_text(&coords, 18.0 * scale_factor);
        }

        let attr_size = 10.0 * scale_factor;
        let margin = 20.0 * scale_factor;
        let attr_top_y = self.height as f32 - margin - attr_size;
        let attr_y = svg_baseline_y(&font, attr_size, attr_top_y);
        self.svg.push_str(&format!(
            r#"<text class="mp-text" x="{}" y="{}" font-size="{}" text-anchor="end">© OpenStreetMap contributors</text>"#,
            fmt1(self.width as f32 - margin),
            fmt1(attr_y),
            fmt2(attr_size)
        ));

        Ok(())
    }

    pub fn finish(mut self) -> Vec<u8> {
        self.svg.push_str("</svg>");
        self.svg.into_bytes()
    }

    #[inline]
    fn world_to_screen(&self, coord: (f64, f64)) -> (f32, f32) {
        let x = ((coord.0 - self.bounds.min_x) * self.x_factor) as f32;
        let y = self.height as f32 - ((coord.1 - self.bounds.min_y) * self.y_factor) as f32;
        (x, y)
    }

    #[inline]
    fn road_color_hex(&self, road_type: RoadType) -> &str {
        match road_type {
            RoadType::Motorway => &self.theme.road_motorway,
            RoadType::Primary => &self.theme.road_primary,
            RoadType::Secondary => &self.theme.road_secondary,
            RoadType::Tertiary => &self.theme.road_tertiary,
            RoadType::Residential => &self.theme.road_residential,
            RoadType::Default => &self.theme.road_default,
        }
    }

    fn define_path(&mut self, d: &str) -> String {
        let id = format!("p{}", self.next_path_id);
        self.next_path_id += 1;
        self.svg
            .push_str(&format!(r#"<defs><path id="{id}" d="{d}"/></defs>"#));
        id
    }

    fn build_polygon_path_data_list(&self, data: &[f64]) -> Vec<String> {
        if data.is_empty() || data[0] as usize == 0 {
            return Vec::new();
        }

        let mut offset = 1;
        let poly_count = data[0] as usize;
        let mut paths = Vec::new();

        for _ in 0..poly_count {
            let mut d = String::new();
            if offset + 2 > data.len() {
                break;
            }
            let ext_count = data[offset] as usize;
            let int_ring_count = data[offset + 1] as usize;
            offset += 2;

            if offset + ext_count * 2 <= data.len() && ext_count >= 3 {
                push_ring_path(&mut d, data, offset, ext_count, |coord| {
                    self.world_to_screen(coord)
                });
            }
            offset += ext_count * 2;

            for _ in 0..int_ring_count {
                if offset + 1 > data.len() {
                    break;
                }
                let count = data[offset] as usize;
                offset += 1;
                if offset + count * 2 <= data.len() && count >= 3 {
                    push_ring_path(&mut d, data, offset, count, |coord| {
                        self.world_to_screen(coord)
                    });
                }
                offset += count * 2;
            }

            if !d.is_empty() {
                paths.push(d);
            }
        }

        paths
    }

    fn build_road_path_data(&self, data: &[f64]) -> [String; 6] {
        let road_count = data[0] as usize;
        let mut paths: [String; 6] = std::array::from_fn(|_| String::new());
        let mut offset = 1;

        for _ in 0..road_count {
            if offset + 2 > data.len() {
                break;
            }
            let t = data[offset] as usize;
            let count = data[offset + 1] as usize;
            offset += 2;

            if t < 6 && offset + count * 2 <= data.len() && count >= 2 {
                let coords: Vec<(f32, f32)> = (0..count)
                    .map(|i| self.world_to_screen((data[offset + i * 2], data[offset + i * 2 + 1])))
                    .collect();
                let simplified = simplify_screen_coords(&coords, 0.25);
                push_line_path(&mut paths[t], &simplified);
            }
            offset += count * 2;
        }

        paths
    }
}

fn push_ring_path<F>(d: &mut String, data: &[f64], offset: usize, count: usize, project: F)
where
    F: Fn((f64, f64)) -> (f32, f32),
{
    let (sx, sy) = project((data[offset], data[offset + 1]));
    d.push('M');
    d.push_str(&fmt1(sx));
    d.push(',');
    d.push_str(&fmt1(sy));
    for i in 1..count {
        let (sx, sy) = project((data[offset + i * 2], data[offset + i * 2 + 1]));
        d.push('L');
        d.push_str(&fmt1(sx));
        d.push(',');
        d.push_str(&fmt1(sy));
    }
    d.push('Z');
}

fn push_line_path(d: &mut String, coords: &[(f32, f32)]) {
    if coords.len() < 2 {
        return;
    }
    d.push('M');
    d.push_str(&fmt1(coords[0].0));
    d.push(',');
    d.push_str(&fmt1(coords[0].1));
    for &(sx, sy) in &coords[1..] {
        d.push('L');
        d.push_str(&fmt1(sx));
        d.push(',');
        d.push_str(&fmt1(sy));
    }
}

fn fmt1(value: f32) -> String {
    trim_number(format!("{value:.1}"))
}

fn fmt2(value: f32) -> String {
    trim_number(format!("{value:.2}"))
}

fn trim_number(mut value: String) -> String {
    if value.contains('.') {
        while value.ends_with('0') {
            value.pop();
        }
        if value.ends_with('.') {
            value.pop();
        }
    }
    if value == "-0" {
        "0".to_string()
    } else {
        value
    }
}

fn estimate_svg_letter_spacing(font: &Font, text: &str, size: f32) -> f32 {
    if !text.contains("  ") {
        return 0.0;
    }

    let mut layout = Layout::new(CoordinateSystem::PositiveYDown);
    layout.append(&[font], &TextStyle::new(text, size, 0));
    let glyphs = layout.glyphs();
    if glyphs.len() < 2 {
        return 0.0;
    }

    let min_x = glyphs.iter().map(|g| g.x).fold(f32::INFINITY, f32::min);
    let max_x = glyphs
        .iter()
        .map(|g| g.x + g.width as f32)
        .fold(f32::NEG_INFINITY, f32::max);
    let layout_width = max_x - min_x;
    let compact_len = text.chars().filter(|c| !c.is_whitespace()).count();

    if compact_len <= 1 {
        return 0.0;
    }

    (layout_width / compact_len as f32 * 0.35).max(0.0)
}

fn svg_baseline_y(font: &Font, size: f32, top_y: f32) -> f32 {
    font.horizontal_line_metrics(size)
        .map(|metrics| top_y + metrics.ascent)
        .unwrap_or(top_y + size * 0.8)
}

fn darken_color(color: Color, factor: f32) -> Color {
    Color::from_rgba(
        (color.red() * factor).clamp(0.0, 1.0),
        (color.green() * factor).clamp(0.0, 1.0),
        (color.blue() * factor).clamp(0.0, 1.0),
        color.alpha(),
    )
    .unwrap_or(color)
}

fn lighten_color(color: Color, factor: f32) -> Color {
    let inv = 1.0 - factor;
    Color::from_rgba(
        (color.red() * inv + factor).clamp(0.0, 1.0),
        (color.green() * inv + factor).clamp(0.0, 1.0),
        (color.blue() * inv + factor).clamp(0.0, 1.0),
        color.alpha(),
    )
    .unwrap_or(color)
}

fn color_to_hex(color: Color) -> String {
    format!(
        "#{:02X}{:02X}{:02X}",
        (color.red() * 255.0 + 0.5) as u8,
        (color.green() * 255.0 + 0.5) as u8,
        (color.blue() * 255.0 + 0.5) as u8
    )
}

fn escape_attr(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn escape_text(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

impl SvgRenderer {
    fn push_custom_poi_icon_svg(
        &mut self,
        poi: &crate::types::CustomPOI,
        screen_x: f32,
        screen_y: f32,
        icon_size: f32,
    ) -> bool {
        let Some(icon) = &poi.icon else {
            return false;
        };
        if icon.view_box_width <= 0.0 || icon.view_box_height <= 0.0 || icon.paths.is_empty() {
            return false;
        }

        let icon_scale = icon_size / icon.view_box_width.max(icon.view_box_height);
        let translate_x = screen_x - icon.view_box_width * icon_scale * 0.5;
        let translate_y = screen_y - icon.view_box_height * icon_scale * 0.5;

        self.svg.push_str(&format!(
            r#"<g transform="translate({} {}) scale({})" fill="{}">"#,
            fmt1(translate_x),
            fmt1(translate_y),
            fmt2(icon_scale),
            escape_attr(&self.theme.poi_icon_color)
        ));

        let mut pushed_any = false;
        for path in &icon.paths {
            self.svg.push_str(&format!(r#"<path d="{}""#, escape_attr(&path.d)));
            if let Some(fill_rule) = &path.fill_rule {
                self.svg
                    .push_str(&format!(r#" fill-rule="{}""#, escape_attr(fill_rule)));
            }
            self.svg.push_str("/>");
            pushed_any = true;
        }

        self.svg.push_str("</g>");
        pushed_any
    }

    fn push_gradient_pin_badge_svg(
        &mut self,
        screen_x: f32,
        screen_y: f32,
        marker_radius: f32,
        pin_theme_config: &PinThemeConfig,
    ) {
        let pin_id = self.next_pin_id;
        self.next_pin_id += 1;
        let poi_color = parse_hex_color(&self.theme.poi_color);
        let base_hex = escape_attr(&self.theme.poi_color);
        let shadow_base = parse_hex_color(&pin_theme_config.shadow_color);
        let shadow_base_hex = escape_attr(&pin_theme_config.shadow_color);

        match pin_theme_config.style {
            PinThemeStyle::Puff => {
                // Layer 1: soft shadow with radial gradient
                let shadow_y = screen_y + marker_radius * pin_theme_config.shadow_offset_y_scale;
                let shadow_r = marker_radius * pin_theme_config.shadow_radius_scale * pin_theme_config.shadow_spread;
                let shadow_c = Color::from_rgba(
                    shadow_base.red(), shadow_base.green(), shadow_base.blue(),
                    pin_theme_config.shadow_alpha,
                ).unwrap();
                let shadow_hex = color_to_hex(shadow_c);
                self.svg.push_str(&format!(
                    r##"<defs><radialGradient id="mp-pin-shadow-{pin_id}" gradientUnits="userSpaceOnUse" cx="{}" cy="{}" r="{}"><stop offset="0%" stop-color="{shadow_hex}" stop-opacity="1"/><stop offset="100%" stop-color="{shadow_base_hex}" stop-opacity="0"/></radialGradient></defs><circle cx="{}" cy="{}" r="{}" fill="url(#mp-pin-shadow-{pin_id})"/>"##,
                    fmt1(screen_x), fmt1(shadow_y), fmt2(shadow_r),
                    fmt1(screen_x), fmt1(shadow_y), fmt2(shadow_r),
                ));

                // Layer 2: body sphere with radial gradient
                let body_light = lighten_color(poi_color, pin_theme_config.body_lighten);
                let body_dark = darken_color(poi_color, pin_theme_config.body_darken);
                let body_light_hex = color_to_hex(body_light);
                let body_dark_hex = color_to_hex(body_dark);
                let grad_cx = screen_x + marker_radius * 0.15;
                let grad_cy = screen_y + marker_radius * -0.15;
                let body_grad_r = marker_radius * 1.3;
                self.svg.push_str(&format!(
                    r##"<defs><radialGradient id="mp-pin-body-{pin_id}" gradientUnits="userSpaceOnUse" cx="{}" cy="{}" r="{}"><stop offset="0%" stop-color="{body_light_hex}" stop-opacity="1"/><stop offset="55%" stop-color="{base_hex}" stop-opacity="1"/><stop offset="100%" stop-color="{body_dark_hex}" stop-opacity="1"/></radialGradient></defs><circle cx="{}" cy="{}" r="{}" fill="url(#mp-pin-body-{pin_id})"/>"##,
                    fmt1(grad_cx), fmt1(grad_cy), fmt2(body_grad_r),
                    fmt1(screen_x), fmt1(screen_y), fmt2(marker_radius),
                ));

                // Layer 3: soft highlight with radial gradient
                let hl_x = screen_x + marker_radius * pin_theme_config.highlight_offset_x_scale;
                let hl_y = screen_y + marker_radius * pin_theme_config.highlight_offset_y_scale;
                let hl_r = marker_radius * pin_theme_config.highlight_radius_scale * pin_theme_config.highlight_spread;
                let hl_color = Color::from_rgba(1.0, 1.0, 1.0, pin_theme_config.highlight_alpha).unwrap();
                let hl_hex = color_to_hex(hl_color);
                self.svg.push_str(&format!(
                    r##"<defs><radialGradient id="mp-pin-hl-{pin_id}" gradientUnits="userSpaceOnUse" cx="{}" cy="{}" r="{}"><stop offset="0%" stop-color="{hl_hex}" stop-opacity="1"/><stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient></defs><circle cx="{}" cy="{}" r="{}" fill="url(#mp-pin-hl-{pin_id})"/>"##,
                    fmt1(hl_x), fmt1(hl_y), fmt2(hl_r),
                    fmt1(hl_x), fmt1(hl_y), fmt2(hl_r),
                ));
            }
            _ => {
                self.push_solid_pin_badge_svg(screen_x, screen_y, marker_radius, pin_theme_config);
            }
        }
    }

    fn push_solid_pin_badge_svg(
        &mut self,
        screen_x: f32,
        screen_y: f32,
        marker_radius: f32,
        pin_theme_config: &PinThemeConfig,
    ) {
        let base = escape_attr(&self.theme.poi_color);
        match pin_theme_config.style {
            PinThemeStyle::Puff => {
                self.svg.push_str(&format!(
                    r##"<circle cx="{}" cy="{}" r="{}" fill="#000000" fill-opacity="0.12"/>"##,
                    fmt1(screen_x),
                    fmt1(screen_y + marker_radius * pin_theme_config.shadow_offset_y_scale),
                    fmt2(marker_radius * pin_theme_config.shadow_radius_scale)
                ));
                self.svg.push_str(&format!(
                    r#"<circle cx="{}" cy="{}" r="{}" fill="{}"/>"#,
                    fmt1(screen_x),
                    fmt1(screen_y),
                    fmt2(marker_radius),
                    base
                ));
                self.svg.push_str(&format!(
                    r##"<circle cx="{}" cy="{}" r="{}" fill="#FFFFFF" fill-opacity="{}"/>"##,
                    fmt1(screen_x + marker_radius * pin_theme_config.highlight_offset_x_scale),
                    fmt1(screen_y + marker_radius * pin_theme_config.highlight_offset_y_scale),
                    fmt2(marker_radius * pin_theme_config.highlight_radius_scale),
                    fmt2(pin_theme_config.highlight_alpha)
                ));
                self.svg.push_str(&format!(
                    r##"<circle cx="{}" cy="{}" r="{}" fill="#000000" fill-opacity="{}"/>"##,
                    fmt1(screen_x),
                    fmt1(screen_y + marker_radius * pin_theme_config.inner_shadow_offset_y_scale),
                    fmt2(marker_radius * pin_theme_config.inner_shadow_radius_scale),
                    fmt2(pin_theme_config.inner_shadow_alpha)
                ));
                self.svg.push_str(&format!(
                    r#"<circle cx="{}" cy="{}" r="{}" fill="{}"/>"#,
                    fmt1(screen_x),
                    fmt1(screen_y),
                    fmt2(marker_radius * pin_theme_config.inner_body_scale),
                    base
                ));
            }
            PinThemeStyle::Badge => {
                let rim =
                    color_to_hex(darken_color(parse_hex_color(&self.theme.poi_color), pin_theme_config.rim_darken));
                self.svg.push_str(&format!(
                    r##"<circle cx="{}" cy="{}" r="{}" fill="#000000" fill-opacity="{}"/>"##,
                    fmt1(screen_x),
                    fmt1(screen_y + marker_radius * pin_theme_config.shadow_offset_y_scale),
                    fmt2(marker_radius * pin_theme_config.shadow_radius_scale),
                    fmt2(pin_theme_config.shadow_alpha)
                ));
                self.svg.push_str(&format!(
                    r#"<circle cx="{}" cy="{}" r="{}" fill="{}"/>"#,
                    fmt1(screen_x),
                    fmt1(screen_y),
                    fmt2(marker_radius),
                    rim
                ));
                self.svg.push_str(&format!(
                    r#"<circle cx="{}" cy="{}" r="{}" fill="{}"/>"#,
                    fmt1(screen_x),
                    fmt1(screen_y),
                    fmt2(marker_radius * pin_theme_config.inner_body_scale),
                    base
                ));
                self.svg.push_str(&format!(
                    r##"<circle cx="{}" cy="{}" r="{}" fill="#FFFFFF" fill-opacity="{}"/>"##,
                    fmt1(screen_x + marker_radius * pin_theme_config.highlight_offset_x_scale),
                    fmt1(screen_y + marker_radius * pin_theme_config.highlight_offset_y_scale),
                    fmt2(marker_radius * pin_theme_config.highlight_radius_scale),
                    fmt2(pin_theme_config.highlight_alpha)
                ));
            }
            PinThemeStyle::Pinhead => {
                let outer_rim =
                    color_to_hex(darken_color(parse_hex_color(&self.theme.poi_color), pin_theme_config.rim_darken));
                let inner_body = color_to_hex(
                    darken_color(parse_hex_color(&self.theme.poi_color), pin_theme_config.inner_body_darken),
                );
                self.svg.push_str(&format!(
                    r##"<circle cx="{}" cy="{}" r="{}" fill="#000000" fill-opacity="{}"/>"##,
                    fmt1(screen_x),
                    fmt1(screen_y + marker_radius * pin_theme_config.shadow_offset_y_scale),
                    fmt2(marker_radius * pin_theme_config.shadow_radius_scale),
                    fmt2(pin_theme_config.shadow_alpha)
                ));
                self.svg.push_str(&format!(
                    r#"<circle cx="{}" cy="{}" r="{}" fill="{}"/>"#,
                    fmt1(screen_x),
                    fmt1(screen_y),
                    fmt2(marker_radius),
                    outer_rim
                ));
                self.svg.push_str(&format!(
                    r#"<circle cx="{}" cy="{}" r="{}" fill="{}"/>"#,
                    fmt1(screen_x),
                    fmt1(screen_y),
                    fmt2(marker_radius * pin_theme_config.inner_body_scale),
                    inner_body
                ));
                self.svg.push_str(&format!(
                    r##"<circle cx="{}" cy="{}" r="{}" fill="#FFFFFF" fill-opacity="{}"/>"##,
                    fmt1(screen_x + marker_radius * pin_theme_config.highlight_offset_x_scale),
                    fmt1(screen_y + marker_radius * pin_theme_config.highlight_offset_y_scale),
                    fmt2(marker_radius * pin_theme_config.highlight_radius_scale),
                    fmt2(pin_theme_config.highlight_alpha)
                ));
                self.svg.push_str(&format!(
                    r##"<circle cx="{}" cy="{}" r="{}" fill="#FFFFFF" fill-opacity="{}"/>"##,
                    fmt1(screen_x + marker_radius * pin_theme_config.secondary_highlight_offset_x_scale),
                    fmt1(screen_y + marker_radius * pin_theme_config.secondary_highlight_offset_y_scale),
                    fmt2(marker_radius * pin_theme_config.secondary_highlight_radius_scale),
                    fmt2(pin_theme_config.secondary_highlight_alpha)
                ));
            }
        }
    }
}

fn encode_base64(data: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);

    for chunk in data.chunks(3) {
        let b0 = chunk[0];
        let b1 = *chunk.get(1).unwrap_or(&0);
        let b2 = *chunk.get(2).unwrap_or(&0);

        out.push(TABLE[(b0 >> 2) as usize] as char);
        out.push(TABLE[(((b0 & 0b0000_0011) << 4) | (b1 >> 4)) as usize] as char);

        if chunk.len() > 1 {
            out.push(TABLE[(((b1 & 0b0000_1111) << 2) | (b2 >> 6)) as usize] as char);
        } else {
            out.push('=');
        }

        if chunk.len() > 2 {
            out.push(TABLE[(b2 & 0b0011_1111) as usize] as char);
        } else {
            out.push('=');
        }
    }

    out
}

fn simplify_screen_coords(coords: &[(f32, f32)], epsilon_sq: f32) -> Vec<(f32, f32)> {
    if coords.len() < 3 {
        return coords.to_vec();
    }

    let (first, last) = (coords[0], *coords.last().unwrap());
    let mut max_dist_sq = 0f32;
    let mut max_idx = 0;

    for (i, &p) in coords[1..coords.len() - 1].iter().enumerate() {
        let d = point_to_segment_dist_sq(p, first, last);
        if d > max_dist_sq {
            max_dist_sq = d;
            max_idx = i + 1;
        }
    }

    if max_dist_sq > epsilon_sq {
        let mut left = simplify_screen_coords(&coords[..=max_idx], epsilon_sq);
        let right = simplify_screen_coords(&coords[max_idx..], epsilon_sq);
        left.pop();
        left.extend(right);
        left
    } else {
        vec![first, last]
    }
}

fn point_to_segment_dist_sq(p: (f32, f32), a: (f32, f32), b: (f32, f32)) -> f32 {
    let (dx, dy) = (b.0 - a.0, b.1 - a.1);
    let len_sq = dx * dx + dy * dy;
    if len_sq == 0.0 {
        let (ex, ey) = (p.0 - a.0, p.1 - a.1);
        return ex * ex + ey * ey;
    }
    let t = ((p.0 - a.0) * dx + (p.1 - a.1) * dy) / len_sq;
    let t = t.clamp(0.0, 1.0);
    let (cx, cy) = (a.0 + t * dx, a.1 + t * dy);
    let (ex, ey) = (p.0 - cx, p.1 - cy);
    ex * ex + ey * ey
}
