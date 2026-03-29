use fontdue::layout::{CoordinateSystem, Layout, TextStyle};
use fontdue::{Font, FontSettings};
use std::collections::HashMap;
use std::sync::LazyLock;
// [Road Casing] 新增 LineCap / LineJoin，用于道路圆头描边
use tiny_skia::{
    Color, FillRule, LineCap, LineJoin, Paint, PathBuilder, Pixmap, Stroke, Transform,
};

use crate::types::{BoundingBox, PolyFeature, Road, RoadType, TextPosition, Theme};
use crate::utils::{calculate_font_size, format_city_name, format_coordinates, parse_hex_color};

/// 地图渲染引擎
pub struct MapRenderer {
    pixmap: Pixmap,
    theme: Theme,
    bounds: BoundingBox,
    /// 逻辑输出宽度（最终 PNG 的像素宽，非内部画布宽）
    width: u32,
    /// 逻辑输出高度（最终 PNG 的像素高，非内部画布高）
    height: u32,
    x_factor: f64,
    y_factor: f64,
    text_position: TextPosition,
    /// [超采样] 内部渲染倍数。实际 Pixmap = width×render_scale × height×render_scale。
    /// 导出时通过 Box Filter 下采样回逻辑尺寸，所有边缘细节更平滑。
    render_scale: u32,
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
        // [超采样] 内部以 2× 分辨率创建画布；导出时再缩回逻辑尺寸
        let render_scale = 2u32;
        let render_width = width * render_scale;
        let render_height = height * render_scale;

        let pixmap = Pixmap::new(render_width, render_height)?;

        // [超采样] x_factor / y_factor 按实际像素尺寸计算，
        // world_to_screen 的输出坐标已自动处于 2× 空间，无需额外调整
        let x_factor = render_width as f64 / bounds.width();
        let y_factor = render_height as f64 / bounds.height();

        Some(Self {
            pixmap,
            theme,
            bounds,
            width, // 仅保存逻辑尺寸，用于 encode_png 最终输出
            height,
            x_factor,
            y_factor,
            text_position,
            render_scale,
        })
    }

    /// 获取当前配色
    pub fn get_theme(&self) -> &Theme {
        &self.theme
    }

    // ── [超采样] 内部辅助：实际画布像素尺寸 ──────────────────────────────────

    /// 内部 Pixmap 的实际像素宽度（= width × render_scale）
    #[inline]
    fn render_width(&self) -> u32 {
        self.width * self.render_scale
    }

    /// 内部 Pixmap 的实际像素高度（= height × render_scale）
    #[inline]
    fn render_height(&self) -> u32 {
        self.height * self.render_scale
    }

    // ── [Road Casing] 内部辅助：按道路类型返回主题颜色字符串 ─────────────────

    /// 根据道路类型返回主题色 hex 字符串引用，避免 match 重复
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
    // pub fn draw_roads_bin(&mut self, data: &[f64]) {
    //     // 【优化】委托给 scaled 版本，消除重复代码；scale_factor=1.0 等同于原无缩放行为
    //     self.draw_roads_bin_scaled(data, 1.0);
    // }

    /// 绘制道路 (二进制直读版) 使用动态缩放因子
    pub fn draw_roads_bin_scaled(&mut self, data: &[f64], scale_factor: f32) -> [f64; 6] {
        if data.is_empty() {
            return [0.0; 6];
        }

        let mut timings = [0.0; 6];

        // [超采样] 将外部传入的缩放因子乘以内部超采样倍数，
        // 使道路宽度在 2× 画布上保持与逻辑分辨率一致的视觉比例
        let scale_factor = scale_factor * self.render_scale as f32;

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
                    // 先收集屏幕坐标
                    let screen_coords: Vec<(f32, f32)> = (0..count)
                        .map(|i| {
                            self.world_to_screen((
                                data[curr_offset + i * 2],
                                data[curr_offset + i * 2 + 1],
                            ))
                        })
                        .collect();

                    // 简化：epsilon = 0.5 屏幕像素，过滤掉亚像素级冗余点
                    let simplified = simplify_screen_coords(&screen_coords, 0.5 * 0.5); // 传入 epsilon²

                    let pb = &mut pbs[t];
                    pb.move_to(simplified[0].0, simplified[0].1);
                    for &(sx, sy) in &simplified[1..] {
                        pb.line_to(sx, sy);
                    }
                    found[t] = true;
                }
            }
            curr_offset += count * 2;
        }

        // [Z-order + Road Casing] 将 PathBuilder 转为可复用的 Path（tiny_skia::Path 实现了 Clone）
        let paths: Vec<Option<tiny_skia::Path>> = pbs
            .into_iter()
            .enumerate()
            .map(|(i, pb)| if found[i] { pb.finish() } else { None })
            .collect();

        // [Z-order] 道路绘制顺序：低优先级 → 高优先级，确保主干道始终在最上层
        // 枚举 index：Motorway=0, Primary=1, Secondary=2, Tertiary=3, Residential=4, Default=5
        // 从 index 5 向 0 渲染 = 从最低优先级到最高优先级
        const DRAW_ORDER: [usize; 6] = [5, 4, 3, 2, 1, 0];

        // [Road Casing] 第一遍：按 Z 序绘制所有道路的「描边底色」（Casing）
        // 所有 Casing 先于所有 Fill 渲染，防止低等级 Casing 压住高等级 Fill
        // [优化] Residential 跳过 Casing：宽度仅 0.4px，casing 效果几乎不可见
        for &t_idx in &DRAW_ORDER {
            if t_idx == RoadType::Residential as usize {
                continue;
            }

            let Some(path) = &paths[t_idx] else {
                continue;
            };

            let start = crate::utils::performance_now();

            let road_type = RoadType::from_u32(t_idx as u32);
            let base_color = parse_hex_color(self.road_color_hex(road_type));

            // [Road Casing] Casing 宽度 = 道路宽 + 两侧各 1 逻辑像素（已含 render_scale 倍数）
            let casing_width =
                road_type.get_width_scaled(scale_factor) + 2.0 * self.render_scale as f32;
            // [Road Casing] Casing 颜色 = 道路色压暗 50%，形成描边对比
            let mut casing_color = darken_color(base_color, 0.9);

            // 把 alpha 降到 0.4，边缘隐约可见即可
            casing_color = Color::from_rgba(
                casing_color.red(),
                casing_color.green(),
                casing_color.blue(),
                0.2,
            )
            .unwrap_or(casing_color);

            let mut paint = Paint::default();
            paint.set_color(casing_color);
            paint.anti_alias = true;

            let stroke = Stroke {
                width: casing_width,
                line_cap: LineCap::Round, // [Road Casing] 圆头端点，道路末端更自然
                line_join: LineJoin::Round, // [Road Casing] 圆角拐点，消除锐角处的尖刺
                ..Default::default()
            };
            self.pixmap
                .stroke_path(path, &paint, &stroke, Transform::identity(), None);

            timings[t_idx] += crate::utils::performance_now() - start;
        }

        // [Road Casing] 第二遍：按 Z 序绘制所有道路的「填充色」（Fill）
        for &t_idx in &DRAW_ORDER {
            let Some(path) = &paths[t_idx] else {
                continue;
            };

            let start = crate::utils::performance_now();

            let road_type = RoadType::from_u32(t_idx as u32);

            let mut paint = Paint::default();
            paint.set_color(parse_hex_color(self.road_color_hex(road_type)));
            paint.anti_alias = true;

            let stroke = Stroke {
                width: road_type.get_width_scaled(scale_factor),
                line_cap: LineCap::Round,
                line_join: LineJoin::Round,
                ..Default::default()
            };
            self.pixmap
                .stroke_path(path, &paint, &stroke, Transform::identity(), None);

            timings[t_idx] += crate::utils::performance_now() - start;
        }

        timings
    }

    /// 绘制多边形 (二进制直读版)
    pub fn draw_polygons_bin(&mut self, data: &[f64], color_hex: &str) {
        if data.is_empty() {
            // 【优化】console::log_1 每次调用都会跨越 JS/WASM 边界，仅在 debug 模式保留
            #[cfg(debug_assertions)]
            web_sys::console::log_1(&format!("⚠️  多边形数据为空").into());
            return;
        }
        let poly_count = data[0] as usize;

        if poly_count == 0 {
            #[cfg(debug_assertions)]
            web_sys::console::log_1(&format!("⚠️  多边形数量为 0，颜色: {}", color_hex).into());
            return;
        }

        #[cfg(debug_assertions)]
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
                    FillRule::EvenOdd,
                    Transform::identity(),
                    None,
                );
                #[cfg(debug_assertions)]
                web_sys::console::log_1(&format!("✅ 多边形绘制完成，颜色: {}", color_hex).into());
            }
        } else {
            #[cfg(debug_assertions)]
            web_sys::console::log_1(
                &format!("⚠️  未找到有效的多边形数据，颜色: {}", color_hex).into(),
            );
        }
    }

    /// 绘制道路
    // pub fn draw_roads(&mut self, roads: &[Road]) {
    //     // 【优化】委托给 scaled 版本，消除重复代码；scale_factor=1.0 等同于原无缩放行为
    //     self.draw_roads_scaled(roads, 1.0);
    // }

    /// 绘制道路（使用动态缩放因子）
    pub fn draw_roads_scaled(&mut self, roads: &[Road], scale_factor: f32) {
        // [超采样] 将外部传入的缩放因子乘以内部超采样倍数，保持视觉比例一致
        let scale_factor = scale_factor * self.render_scale as f32;

        // 【优化】使用固定大小数组替代 HashMap，道路类型仅 6 种，无需哈希开销
        let mut groups: [Vec<&Road>; 6] = [vec![], vec![], vec![], vec![], vec![], vec![]];
        for road in roads {
            let idx = road.road_type as usize;
            if idx < 6 {
                groups[idx].push(road);
            }
        }

        // [Z-order + Road Casing] 将每种类型的 Road 列表预先构建为 Path
        let mut paths: [Option<tiny_skia::Path>; 6] = Default::default();
        for t_idx in 0..6usize {
            let road_group = &groups[t_idx];
            if road_group.is_empty() {
                continue;
            }
            let mut pb = PathBuilder::new();
            for road in road_group {
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
            paths[t_idx] = pb.finish();
        }

        // [Z-order] 低优先级 → 高优先级渲染顺序
        const DRAW_ORDER: [usize; 6] = [5, 4, 3, 2, 1, 0];

        // [Road Casing] 第一遍：所有道路的 Casing（加宽暗色描边）
        for &t_idx in &DRAW_ORDER {
            let Some(path) = &paths[t_idx] else {
                continue;
            };
            let road_type = crate::types::RoadType::from_u32(t_idx as u32);
            let base_color = parse_hex_color(self.road_color_hex(road_type));
            let casing_width =
                road_type.get_width_scaled(scale_factor) + 2.0 * self.render_scale as f32;
            let mut casing_color = darken_color(base_color, 0.9);

            // 把 alpha 降到 0.4，边缘隐约可见即可
            casing_color = Color::from_rgba(
                casing_color.red(),
                casing_color.green(),
                casing_color.blue(),
                0.2,
            )
            .unwrap_or(casing_color);

            let mut paint = Paint::default();
            paint.set_color(casing_color);
            paint.anti_alias = true;

            let stroke = Stroke {
                width: casing_width,
                line_cap: LineCap::Round,
                line_join: LineJoin::Round,
                ..Default::default()
            };
            self.pixmap
                .stroke_path(path, &paint, &stroke, Transform::identity(), None);
        }

        // [Road Casing] 第二遍：所有道路的 Fill（正常颜色和宽度）
        for &t_idx in &DRAW_ORDER {
            let Some(path) = &paths[t_idx] else {
                continue;
            };
            let road_type = crate::types::RoadType::from_u32(t_idx as u32);

            let mut paint = Paint::default();
            paint.set_color(parse_hex_color(self.road_color_hex(road_type)));
            paint.anti_alias = true;

            let stroke = Stroke {
                width: road_type.get_width_scaled(scale_factor),
                line_cap: LineCap::Round,
                line_join: LineJoin::Round,
                ..Default::default()
            };
            self.pixmap
                .stroke_path(path, &paint, &stroke, Transform::identity(), None);
        }
    }

    /// 绘制 POI 圆点（使用 POI 结构体数组）
    pub fn draw_pois(&mut self, pois: &[crate::types::POI]) {
        // 【优化】委托给 scaled 版本，消除重复代码；scale_factor=1.0 等同于原无缩放行为
        self.draw_pois_scaled(pois, 1.0);
    }

    /// 绘制 POI 圆点（使用 POI 结构体数组，带动态缩放因子）
    pub fn draw_pois_scaled(&mut self, pois: &[crate::types::POI], scale_factor: f32) {
        if pois.is_empty() {
            return;
        }

        // [超采样] 缩放因子乘以内部渲染倍数，保持圆点视觉大小与逻辑尺寸一致
        let scale_factor = scale_factor * self.render_scale as f32;

        // 使用主题中的 POI 专用颜色
        let poi_color = parse_hex_color(&self.theme.poi_color);

        let poi_radius = 10.0 * scale_factor; // POI 圆点半径随分辨率缩放
        let min_spacing = 8.0 * scale_factor; // POI 之间最小间距（像素）
        const MAX_POIS: usize = 50; // 最多渲染 50 个 POI 点
        let min_distance_sq = (poi_radius * 2.0 + min_spacing) * (poi_radius * 2.0 + min_spacing);

        // 【优化】空间网格替代 O(n²) 线性扫描，平均 O(1) 碰撞检测
        // cell_size = min_distance，只需检查 3×3 邻域即可覆盖所有可能碰撞的点
        let cell_size = ((poi_radius * 2.0 + min_spacing).ceil() as i32).max(1);
        let mut grid: HashMap<(i32, i32), Vec<(f32, f32)>> = HashMap::new();
        let mut rendered_count = 0usize;

        // 【优化】批量构建路径，所有圆点一次 fill_path 完成，减少状态切换
        let mut pb = PathBuilder::new();

        // [超采样] 边界检测使用实际画布像素尺寸
        let rw = self.render_width() as f32;
        let rh = self.render_height() as f32;

        for poi in pois {
            if rendered_count >= MAX_POIS {
                break;
            }

            let (screen_x, screen_y) = self.world_to_screen((poi.x, poi.y));

            // 检查边界
            if screen_x < 0.0 || screen_x > rw || screen_y < 0.0 || screen_y > rh {
                continue;
            }

            let cx = (screen_x / cell_size as f32).floor() as i32;
            let cy = (screen_y / cell_size as f32).floor() as i32;

            // 精确距离检测：只检查 3×3 邻域（O(1) 平均复杂度）
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
            pb.push_circle(screen_x, screen_y, poi_radius);
            rendered_count += 1;
        }

        // 一次性渲染所有圆点
        if rendered_count > 0 {
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
            }
        }
    }

    /// 绘制 POI 圆点（二进制直读版本）
    /// 数据格式：[poi_count, x1, y1, x2, y2, ...]
    pub fn draw_pois_bin(&mut self, data: &[f64]) {
        // 【优化】委托给 scaled 版本，消除重复代码；scale_factor=1.0 等同于原无缩放行为
        self.draw_pois_bin_scaled(data, 1.0);
    }

    /// 绘制 POI 圆点（二进制直读版本，带动态缩放因子）
    /// 数据格式：[poi_count, x1, y1, x2, y2, ...]
    pub fn draw_pois_bin_scaled(&mut self, data: &[f64], scale_factor: f32) {
        if data.is_empty() || data[0] as usize == 0 {
            return;
        }

        // [超采样] 缩放因子乘以内部渲染倍数，保持 POI 视觉大小一致
        let scale_factor = scale_factor * self.render_scale as f32;

        let poi_count = data[0] as usize;
        if data.len() < 1 + poi_count * 2 {
            #[cfg(debug_assertions)]
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

        let poi_radius = 8.0 * scale_factor; // POI 圆点半径随分辨率缩放
        let min_spacing = 5.0 * scale_factor; // POI 之间最小间距随分辨率缩放
        const MAX_POIS: usize = 50;
        let min_distance_sq = (poi_radius * 2.0 + min_spacing) * (poi_radius * 2.0 + min_spacing);

        // 【优化】空间网格替代 O(n²) 线性扫描，平均 O(1) 碰撞检测
        // cell_size = min_distance，只需检查 3×3 邻域即可覆盖所有可能碰撞的点
        let cell_size = ((poi_radius * 2.0 + min_spacing).ceil() as i32).max(1);
        let mut grid: HashMap<(i32, i32), Vec<(f32, f32)>> = HashMap::new();

        // 【优化】批量构建路径，所有圆点一次 fill_path 完成，减少状态切换
        let mut pb = PathBuilder::new();
        let mut rendered_count = 0usize;
        let mut offset = 1;

        // [超采样] 边界检测使用实际画布像素尺寸
        let rw = self.render_width() as f32;
        let rh = self.render_height() as f32;

        for _idx in 0..poi_count {
            // 达到最大数量则停止
            if rendered_count >= MAX_POIS {
                break;
            }

            if offset + 1 < data.len() {
                let x = data[offset];
                let y = data[offset + 1];
                let (screen_x, screen_y) = self.world_to_screen((x, y));

                // 检查边界
                if screen_x >= 0.0 && screen_x <= rw && screen_y >= 0.0 && screen_y <= rh {
                    let cx = (screen_x / cell_size as f32).floor() as i32;
                    let cy = (screen_y / cell_size as f32).floor() as i32;

                    // 精确距离检测：只检查 3×3 邻域（O(1) 平均复杂度）
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

                    if !too_close {
                        grid.entry((cx, cy)).or_default().push((screen_x, screen_y));
                        pb.push_circle(screen_x, screen_y, poi_radius);
                        rendered_count += 1;
                    }
                }

                offset += 2;
            }
        }

        // 一次性渲染所有圆点
        if rendered_count > 0 {
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
            }
        }

        #[cfg(debug_assertions)]
        web_sys::console::log_1(
            &format!(
                "🔵 POI 采样完成: 原始 {} 个 → 采样后 {} 个，颜色: {}",
                poi_count, rendered_count, &self.theme.poi_color
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
        // [超采样] 使用实际画布尺寸，确保渐变覆盖完整 2× 画布
        let height = self.render_height();
        let width = self.render_width();

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

        // [Gamma校正] 将源颜色从 sRGB 转为线性光空间，预计算到循环外
        // 所有颜色混合在线性空间完成，避免 sRGB 非线性导致的过渡偏暗问题
        let lin_base_r = srgb_to_linear(base_r);
        let lin_base_g = srgb_to_linear(base_g);
        let lin_base_b = srgb_to_linear(base_b);

        for y in y_start..y_end {
            let t = if location == "bottom" {
                (y - y_start) as f32 / (y_end - y_start) as f32
            } else {
                (y_end - y) as f32 / (y_end - y_start) as f32
            };

            // 计算当前行的源透明度
            let src_a = t * base_a;
            if src_a <= 0.0 {
                continue;
            }
            let inv_src_a = 1.0 - src_a;

            // [Gamma校正] 源颜色在线性空间的预乘值（常量 × 逐行 alpha）
            let src_r_lin = lin_base_r * src_a;
            let src_g_lin = lin_base_g * src_a;
            let src_b_lin = lin_base_b * src_a;

            let row_start = (y * width) as usize;
            let row_end = row_start + width as usize;
            let row = &mut pixels[row_start..row_end];

            for p in row.iter_mut() {
                let dst_a = p.alpha();
                let dst_a_f = dst_a as f32 / 255.0;

                // [Gamma校正] 解预乘目标像素，转换到线性光空间，再预乘（用于 SrcOver）
                let (dst_r_lin, dst_g_lin, dst_b_lin) = if dst_a > 0 {
                    let inv_a = 1.0 / dst_a_f;
                    // [优化] 用 LUT 替换 srgb_to_linear 调用
                    // 解预乘：通道值 / alpha，clamp 到 [0,255] 取整作为表索引
                    let r_idx = (p.red() as f32 * inv_a).min(255.0) as usize;
                    let g_idx = (p.green() as f32 * inv_a).min(255.0) as usize;
                    let b_idx = (p.blue() as f32 * inv_a).min(255.0) as usize;
                    (
                        SRGB_TO_LIN_LUT[r_idx] * dst_a_f,
                        SRGB_TO_LIN_LUT[g_idx] * dst_a_f,
                        SRGB_TO_LIN_LUT[b_idx] * dst_a_f,
                    )
                } else {
                    (0.0, 0.0, 0.0)
                };

                // SrcOver 混合（在线性预乘空间完成，结果正确）
                let out_r_lin = src_r_lin + dst_r_lin * inv_src_a;
                let out_g_lin = src_g_lin + dst_g_lin * inv_src_a;
                let out_b_lin = src_b_lin + dst_b_lin * inv_src_a;
                let out_a = src_a + dst_a_f * inv_src_a;

                // [Gamma校正] 解预乘、转回 sRGB、再重新预乘写入
                if out_a > 0.0 {
                    let inv_out_a = 1.0 / out_a;
                    let premul = out_a * 255.0;
                    // [优化] 用 LUT 替换 linear_to_srgb 调用
                    // 线性值解预乘后映射到 [0, 1023] 作为表索引
                    let r_idx =
                        ((out_r_lin * inv_out_a) * 1023.0 + 0.5).clamp(0.0, 1023.0) as usize;
                    let g_idx =
                        ((out_g_lin * inv_out_a) * 1023.0 + 0.5).clamp(0.0, 1023.0) as usize;
                    let b_idx =
                        ((out_b_lin * inv_out_a) * 1023.0 + 0.5).clamp(0.0, 1023.0) as usize;
                    let r =
                        ((LIN_TO_SRGB_LUT[r_idx] as f32 / 255.0) * premul + 0.5).min(255.0) as u8;
                    let g =
                        ((LIN_TO_SRGB_LUT[g_idx] as f32 / 255.0) * premul + 0.5).min(255.0) as u8;
                    let b =
                        ((LIN_TO_SRGB_LUT[b_idx] as f32 / 255.0) * premul + 0.5).min(255.0) as u8;
                    let a = (out_a * 255.0 + 0.5).min(255.0) as u8;
                    if let Some(c) = tiny_skia::PremultipliedColorU8::from_rgba(r, g, b, a) {
                        *p = c;
                    }
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
        // [超采样] 使用实际渲染像素尺寸计算 scale_factor，使字体在 2× 画布上保持正确视觉大小
        let width_scale = self.render_width() as f32 / 1200.0;
        let height_scale = (self.render_height() as f32 / 1200.0) * 1.1;
        let scale_factor = width_scale.min(height_scale);

        // 计算画幅宽高比，用于动态调整 Bottom anchor
        let aspect_ratio = self.height as f32 / self.width as f32;

        // 根据画幅比例计算 Bottom 的动态 anchor
        // - 竖版 (aspect > 1): 文字视觉偏上，增加 anchor 使其靠下
        // - 横版/方形 (aspect <= 1): 当前 0.85 效果理想
        // 公式: 0.85 + (aspect_ratio - 1.0) * 0.1，上限 0.88
        let bottom_anchor = if aspect_ratio > 1.0 {
            (0.85 + (aspect_ratio - 1.0) * 0.1).min(0.88)
        } else {
            0.85
        };

        // 计算基准锚点 Y 坐标 (屏幕绝对坐标)
        let base_y_px = match self.text_position {
            TextPosition::Top => self.render_height() as f32 * 0.10,
            TextPosition::Center => self.render_height() as f32 * 0.50,
            TextPosition::Bottom => self.render_height() as f32 * bottom_anchor,
        };

        // 减去 padding_offset，与 TSX 端的 rootFontSize 逻辑一致
        // 这样文字 baseline 不会紧贴容器底部，而是留出约一个 font-size 的边距
        let padding_offset: f32 = 16.0;
        let base_y_px = base_y_px - padding_offset;

        // 定义相对偏移量 (基于 800px 宽度的标准像素值)
        // 之前的 0.05 (5%) 在 1000px 高度下是 50px
        // 之前的 0.04 (4%) 在 1000px 高度下是 40px
        // 之前的 0.03 (3%) 在 1000px 高度下是 30px
        let city_offset = 50.0 * scale_factor;
        let coords_offset = -40.0 * scale_factor;
        // let decor_offset = 30.0 * scale_factor;

        // 绘制城市名 (增加基准大小到 80.0)
        let formatted_city = format_city_name(city);
        // 字号阈值
        let threshold = 30;
        let city_size = calculate_font_size(&formatted_city, 80.0 * scale_factor, threshold);
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
        // [超采样] 使用实际画布宽度居中，保证文字在 2× 画布的视觉中心
        // 使用 f32 计算偏移以保持亚像素精度
        let x_offset = (self.render_width() as f32 - text_width) / 2.0 - min_x;

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

        // [超采样] 使用实际画布尺寸计算右下角位置，避免文字偏移到画布中央
        let x_offset = self.render_width() as i32 - max_x - margin as i32;
        // y 是文本块的起始位置。为了让文本底部距离边缘 margin，
        // y 应该是 height - margin - text_height
        // 简单估算 text_height 为 size
        let y = self.render_height() as i32 - margin as i32 - size as i32;

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
        let pixmap_width = self.render_width();
        let pixmap_height = self.render_height();
        let pixels = self.pixmap.pixels_mut();

        // 【优化】预计算颜色分量到整数域（0-255），消除逐像素 f32 转换和除法
        // let cr = (color.red() * 255.0 + 0.5) as u32;
        // let cg = (color.green() * 255.0 + 0.5) as u32;
        // let cb = (color.blue() * 255.0 + 0.5) as u32;
        // let ca = (color.alpha() * 255.0 + 0.5) as u32;

        // [Gamma校正] 将文字颜色预转到线性光空间，避免逐像素重复计算
        let src_r_lin = srgb_to_linear(color.red());
        let src_g_lin = srgb_to_linear(color.green());
        let src_b_lin = srgb_to_linear(color.blue());
        let src_a_max = color.alpha(); // 文字颜色的最大透明度（0-1）

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

                    // [Gamma校正] 计算此像素实际源透明度（字形灰度 × 文字颜色 alpha）
                    let sa_f = (alpha as f32 / 255.0) * src_a_max; // 归一化源 alpha
                    let inv_sa_f = 1.0 - sa_f;

                    let dst = pixels[pixel_idx];
                    let dst_a = dst.alpha();
                    let dst_a_f = dst_a as f32 / 255.0;

                    // [Gamma校正] 解预乘目标像素，转线性光空间，再预乘（SrcOver 用）
                    let (dst_r_lin, dst_g_lin, dst_b_lin) = if dst_a > 0 {
                        let inv_a = 1.0 / dst_a_f;
                        (
                            srgb_to_linear((dst.red() as f32 * inv_a).min(255.0) / 255.0) * dst_a_f,
                            srgb_to_linear((dst.green() as f32 * inv_a).min(255.0) / 255.0)
                                * dst_a_f,
                            srgb_to_linear((dst.blue() as f32 * inv_a).min(255.0) / 255.0)
                                * dst_a_f,
                        )
                    } else {
                        (0.0, 0.0, 0.0)
                    };

                    // [Gamma校正] SrcOver 在线性预乘空间完成，消除文字边缘偏暗问题
                    let out_r_lin = src_r_lin * sa_f + dst_r_lin * inv_sa_f;
                    let out_g_lin = src_g_lin * sa_f + dst_g_lin * inv_sa_f;
                    let out_b_lin = src_b_lin * sa_f + dst_b_lin * inv_sa_f;
                    let out_a_f = sa_f + dst_a_f * inv_sa_f;

                    // [Gamma校正] 解预乘、转回 sRGB、重新预乘后写入
                    if out_a_f > 0.0 {
                        let inv_out_a = 1.0 / out_a_f;
                        let premul = out_a_f * 255.0;
                        let out_r =
                            (linear_to_srgb(out_r_lin * inv_out_a) * premul + 0.5).min(255.0) as u8;
                        let out_g =
                            (linear_to_srgb(out_g_lin * inv_out_a) * premul + 0.5).min(255.0) as u8;
                        let out_b =
                            (linear_to_srgb(out_b_lin * inv_out_a) * premul + 0.5).min(255.0) as u8;
                        let out_a = (out_a_f * 255.0 + 0.5).min(255.0) as u8;

                        if let Some(c) =
                            tiny_skia::PremultipliedColorU8::from_rgba(out_r, out_g, out_b, out_a)
                        {
                            pixels[pixel_idx] = c;
                        }
                    }
                }
            }
        }
    }

    /// 绘制装饰线
    // fn draw_decoration_line(&mut self, color: Color, scale_factor: f32, y_px: f32) {
    //     let y = y_px;
    //     // [超采样] 使用实际画布宽度计算装饰线端点，确保线段视觉居中
    //     let x1 = self.render_width() as f32 * 0.4;
    //     let x2 = self.render_width() as f32 * 0.6;

    //     let mut pb = PathBuilder::new();
    //     pb.move_to(x1, y);
    //     pb.line_to(x2, y);

    //     if let Some(path) = pb.finish() {
    //         let mut paint = Paint::default();
    //         paint.set_color(color);
    //         paint.anti_alias = true;

    //         let stroke = Stroke {
    //             width: 1.0 * scale_factor,
    //             ..Default::default()
    //         };

    //         self.pixmap
    //             .stroke_path(&path, &paint, &stroke, Transform::identity(), None);
    //     }
    // }

    /// 世界坐标 -> 屏幕坐标
    fn world_to_screen(&self, coord: (f64, f64)) -> (f32, f32) {
        let x = ((coord.0 - self.bounds.min_x) * self.x_factor) as f32;
        // [超采样] 使用实际画布高度做 Y 轴翻转，确保地理坐标正确映射到 2× 画布
        let y =
            self.render_height() as f32 - ((coord.1 - self.bounds.min_y) * self.y_factor) as f32;
        (x, y)
    }

    /// 导出为 PNG（带 DPI 元数据）
    pub fn encode_png(self, dpi: u32) -> Result<Vec<u8>, String> {
        let scale = self.render_scale as usize;
        let out_w = self.width as usize;
        let out_h = self.height as usize;
        let src_w = out_w * scale;

        // [超采样] 步骤 1：将 tiny_skia 的预乘 RGBA 像素转为直线性 RGBA（0-1 浮点）
        // 预乘像素：red = true_red * alpha / 255，解预乘还原真实颜色
        let src_pixels = self.pixmap.pixels();
        let scale_sq = (scale * scale) as f32;

        // [优化] 预计算 alpha 倒数查找表，索引为 u8 alpha 值（1-255 有效）
        let inv_alpha_lut: [f32; 256] =
            std::array::from_fn(|i| if i == 0 { 0.0 } else { 1.0 / i as f32 });

        // [超采样] 步骤 2：Box Filter 下采样——每 scale×scale 块的源像素取算术平均
        // Box Filter 等价于对高频锯齿做低通滤波，结合 2× 超采样可显著消除锯齿
        let mut out_rgba: Vec<u8> = Vec::with_capacity(out_w * out_h * 4);
        for oy in 0..out_h {
            for ox in 0..out_w {
                let mut acc = [0f32; 4];
                for dy in 0..scale {
                    for dx in 0..scale {
                        let p = src_pixels[(oy * scale + dy) * src_w + ox * scale + dx];
                        let a = p.alpha();
                        if a > 0 {
                            // 解预乘直接在这里做，不需要中间 Vec
                            let inv = inv_alpha_lut[a as usize];
                            acc[0] += p.red() as f32 * inv;
                            acc[1] += p.green() as f32 * inv;
                            acc[2] += p.blue() as f32 * inv;
                        }
                        acc[3] += a as f32;
                    }
                }
                out_rgba.push((acc[0] / scale_sq * 255.0 + 0.5).min(255.0) as u8);
                out_rgba.push((acc[1] / scale_sq * 255.0 + 0.5).min(255.0) as u8);
                out_rgba.push((acc[2] / scale_sq * 255.0 + 0.5).min(255.0) as u8);
                out_rgba.push((acc[3] / scale_sq + 0.5).min(255.0) as u8);
            }
        }

        // [超采样] 步骤 3：将下采样后的 RGBA 数据编码为 PNG
        let raw = encode_rgba_to_png(&out_rgba, out_w as u32, out_h as u32)?;

        // pHYs chunk 构造（逻辑不变）
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

        Ok(result)
    }
}

// ── [Gamma校正] sRGB ↔ 线性光转换工具函数 ────────────────────────────────────

/// [Gamma校正] sRGB -> 线性光（IEC 61966-2-1 标准）
/// 在此空间做颜色混合才能得到物理上正确的结果
#[inline]
fn srgb_to_linear(c: f32) -> f32 {
    if c <= 0.04045 {
        c / 12.92
    } else {
        ((c + 0.055) / 1.055).powf(2.4)
    }
}

/// [Gamma校正] 线性光 -> sRGB（混合完成后转回显示空间）
#[inline]
fn linear_to_srgb(c: f32) -> f32 {
    let c = c.clamp(0.0, 1.0);
    if c <= 0.0031308 {
        c * 12.92
    } else {
        1.055 * c.powf(1.0 / 2.4) - 0.055
    }
}

// ── [Gamma校正] 预计算查找表（LUT） ──────────────────────────────────────────

/// 预计算 sRGB u8 → 线性 f32 查找表（256 项）
/// 在 `draw_gradient` 每次调用时复用，避免重复计算
static SRGB_TO_LIN_LUT: LazyLock<[f32; 256]> = LazyLock::new(|| {
    std::array::from_fn(|i| srgb_to_linear(i as f32 / 255.0))
});

/// 预计算线性 f32 → sRGB u8 查找表（1024 项，精度 1/1023）
static LIN_TO_SRGB_LUT: LazyLock<[u8; 1024]> = LazyLock::new(|| {
    std::array::from_fn(|i| (linear_to_srgb(i as f32 / 1023.0) * 255.0 + 0.5).min(255.0) as u8)
});

// ── [Road Casing] 颜色压暗工具函数 ──────────────────────────────────────────

/// [Road Casing] 按比例压暗颜色，用于生成道路的描边底色（Casing）
/// factor=0.5 表示亮度减半，保持 alpha 不变
fn darken_color(color: Color, factor: f32) -> Color {
    Color::from_rgba(
        (color.red() * factor).clamp(0.0, 1.0),
        (color.green() * factor).clamp(0.0, 1.0),
        (color.blue() * factor).clamp(0.0, 1.0),
        color.alpha(),
    )
    .unwrap_or(color)
}

// ── [超采样] PNG 编码工具函数 ─────────────────────────────────────────────────

/// [超采样] 将直线性 RGBA 字节数组编码为 PNG 格式（使用 `png` crate）
fn encode_rgba_to_png(rgba: &[u8], width: u32, height: u32) -> Result<Vec<u8>, String> {
    let mut buf = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut buf, width, height);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        encoder.set_compression(png::Compression::Fast);
        let mut writer = encoder
            .write_header()
            .map_err(|e| format!("PNG header write failed: {}", e))?;
        writer
            .write_image_data(rgba)
            .map_err(|e| format!("PNG data write failed: {}", e))?;
    }
    Ok(buf)
}

/// 计算 CRC-32 (PNG 标准 ISO 3309)
fn crc32(data: &[u8]) -> u32 {
    // CRC-32 lookup table
    static CRC_TABLE: [u32; 256] = [
        0x00000000, 0x77073096, 0xEE0E612C, 0x990951BA, 0x076DC419, 0x706AF48F, 0xE963A535,
        0x9E6495A3, 0x0EDB8832, 0x79DCB8A4, 0xE0D5E91E, 0x97D2D988, 0x09B64C2B, 0x7EB17CBD,
        0xE7B82D07, 0x90BF1D91, 0x1DB71064, 0x6AB020F2, 0xF3B97148, 0x84BE41DE, 0x1ADAD47D,
        0x6DDDE4EB, 0xF4D4B551, 0x83D385C7, 0x136C9856, 0x646BA8C0, 0xFD62F97A, 0x8A65C9EC,
        0x14015C4F, 0x63066CD9, 0xFA0F3D63, 0x8D080DF5, 0x3B6E20C8, 0x4C69105E, 0xD56041E4,
        0xA2677172, 0x3C03E4D1, 0x4B04D447, 0xD20D85FD, 0xA50AB56B, 0x35B5A8FA, 0x42B2986C,
        0xDBBBC9D6, 0xACBCF940, 0x32D86CE3, 0x45DF5C75, 0xDCD60DCF, 0xABD13D59, 0x26D930AC,
        0x51DE003A, 0xC8D75180, 0xBFD06116, 0x21B4F4B5, 0x56B3C423, 0xCFBA9599, 0xB8BDA50F,
        0x2802B89E, 0x5F058808, 0xC60CD9B2, 0xB10BE924, 0x2F6F7C87, 0x58684C11, 0xC1611DAB,
        0xB6662D3D, 0x76DC4190, 0x01DB7106, 0x98D220BC, 0xEFD5102A, 0x71B18589, 0x06B6B51F,
        0x9FBFE4A5, 0xE8B8D433, 0x7807C9A2, 0x0F00F934, 0x9609A88E, 0xE10E9818, 0x7F6A0DBB,
        0x086D3D2D, 0x91646C97, 0xE6635C01, 0x6B6B51F4, 0x1C6C6162, 0x856530D8, 0xF262004E,
        0x6C0695ED, 0x1B01A57B, 0x8208F4C1, 0xF50FC457, 0x65B0D9C6, 0x12B7E950, 0x8BBEB8EA,
        0xFCB9887C, 0x62DD1DDF, 0x15DA2D49, 0x8CD37CF3, 0xFBD44C65, 0x4DB26158, 0x3AB551CE,
        0xA3BC0074, 0xD4BB30E2, 0x4ADFA541, 0x3DD895D7, 0xA4D1C46D, 0xD3D6F4FB, 0x4369E96A,
        0x346ED9FC, 0xAD678846, 0xDA60B8D0, 0x44042D73, 0x33031DE5, 0xAA0A4C5F, 0xDD0D7CC9,
        0x5005713C, 0x270241AA, 0xBE0B1010, 0xC90C2086, 0x5768B525, 0x206F85B3, 0xB966D409,
        0xCE61E49F, 0x5EDEF90E, 0x29D9C998, 0xB0D09822, 0xC7D7A8B4, 0x59B33D17, 0x2EB40D81,
        0xB7BD5C3B, 0xC0BA6CAD, 0xEDB88320, 0x9ABFB3B6, 0x03B6E20C, 0x74B1D29A, 0xEAD54739,
        0x9DD277AF, 0x04DB2615, 0x73DC1683, 0xE3630B12, 0x94643B84, 0x0D6D6A3E, 0x7A6A5AA8,
        0xE40ECF0B, 0x9309FF9D, 0x0A00AE27, 0x7D079EB1, 0xF00F9344, 0x8708A3D2, 0x1E01F268,
        0x6906C2FE, 0xF762575D, 0x806567CB, 0x196C3671, 0x6E6B06E7, 0xFED41B76, 0x89D32BE0,
        0x10DA7A5A, 0x67DD4ACC, 0xF9B9DF6F, 0x8EBEEFF9, 0x17B7BE43, 0x60B08ED5, 0xD6D6A3E8,
        0xA1D1937E, 0x38D8C2C4, 0x4FDFF252, 0xD1BB67F1, 0xA6BC5767, 0x3FB506DD, 0x48B2364B,
        0xD80D2BDA, 0xAF0A1B4C, 0x36034AF6, 0x41047A60, 0xDF60EFC3, 0xA867DF55, 0x316E8EEF,
        0x4669BE79, 0xCB61B38C, 0xBC66831A, 0x256FD2A0, 0x5268E236, 0xCC0C7795, 0xBB0B4703,
        0x220216B9, 0x5505262F, 0xC5BA3BBE, 0xB2BD0B28, 0x2BB45A92, 0x5CB36A04, 0xC2D7FFA7,
        0xB5D0CF31, 0x2CD99E8B, 0x5BDEAE1D, 0x9B64C2B0, 0xEC63F226, 0x756AA39C, 0x026D930A,
        0x9C0906A9, 0xEB0E363F, 0x72076785, 0x05005713, 0x95BF4A82, 0xE2B87A14, 0x7BB12BAE,
        0x0CB61B38, 0x92D28E9B, 0xE5D5BE0D, 0x7CDCEFB7, 0x0BDBDF21, 0x86D3D2D4, 0xF1D4E242,
        0x68DDB3F8, 0x1FDA836E, 0x81BE16CD, 0xF6B9265B, 0x6FB077E1, 0x18B74777, 0x88085AE6,
        0xFF0F6A70, 0x66063BCA, 0x11010B5C, 0x8F659EFF, 0xF862AE69, 0x616BFFD3, 0x166CCF45,
        0xA00AE278, 0xD70DD2EE, 0x4E048354, 0x3903B3C2, 0xA7672661, 0xD06016F7, 0x4969474D,
        0x3E6E77DB, 0xAED16A4A, 0xD9D65ADC, 0x40DF0B66, 0x37D83BF0, 0xA9BCAE53, 0xDEBB9EC5,
        0x47B2CF7F, 0x30B5FFE9, 0xBDBDF21C, 0xCABAC28A, 0x53B39330, 0x24B4A3A6, 0xBAD03605,
        0xCDD70693, 0x54DE5729, 0x23D967BF, 0xB3667A2E, 0xC4614AB8, 0x5D681B02, 0x2A6F2B94,
        0xB40BBE37, 0xC30C8EA1, 0x5A05DF1B, 0x2D02EF8D,
    ];

    let mut crc: u32 = 0xFFFFFFFF;
    for &byte in data {
        let idx = ((crc ^ byte as u32) & 0xFF) as usize;
        crc = (crc >> 8) ^ CRC_TABLE[idx];
    }
    crc ^ 0xFFFFFFFF
}

/// Douglas-Peucker 折线简化，在屏幕坐标空间消除亚像素级冗余点
/// epsilon_sq：距离阈值的平方（传入 epsilon² 避免 sqrt 开销）
/// 推荐值：道路传 0.25（= 0.5px²），多边形传 1.0（= 1.0px²）
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
        left.pop(); // 去掉重复的分割点
        left.extend(right);
        left
    } else {
        vec![first, last]
    }
}

/// 点到线段的距离平方（避免 sqrt）
fn point_to_segment_dist_sq(p: (f32, f32), a: (f32, f32), b: (f32, f32)) -> f32 {
    let (dx, dy) = (b.0 - a.0, b.1 - a.1);
    let len_sq = dx * dx + dy * dy;
    if len_sq == 0.0 {
        // a == b，退化为点距离
        let (ex, ey) = (p.0 - a.0, p.1 - a.1);
        return ex * ex + ey * ey;
    }
    // 投影参数 t，clamp 到 [0, 1] 保证落在线段上
    let t = ((p.0 - a.0) * dx + (p.1 - a.1) * dy) / len_sq;
    let t = t.clamp(0.0, 1.0);
    let (cx, cy) = (a.0 + t * dx, a.1 + t * dy);
    let (ex, ey) = (p.0 - cx, p.1 - cy);
    ex * ex + ey * ey
}
