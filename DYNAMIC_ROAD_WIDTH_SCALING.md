# 动态道路线宽缩放 - 实施文档

## 概述

已实施了一个动态道路线宽缩放系统，使得道路线宽能够根据前端的缩放倍数和输出尺寸自动调整，无需硬编码常量。

## 核心函数和方法

### 1. `calculate_road_width_scale()` 函数

**位置：** `wasm/src/types.rs`

**签名：**
```rust
pub fn calculate_road_width_scale(selected_size_height: f32, frontend_scale: f32) -> f32
```

**功能：** 根据选定尺寸和前端缩放倍数，计算合理的道路线宽缩放因子

**参数：**
- `selected_size_height`: 选定尺寸的原始高度（像素），例如：
  - A4 Portrait: 3508 px
  - A4 Landscape: 2480 px
  - Square: 3000 px
  - Phone: 2532 px
  - 16x9: 2160 px
- `frontend_scale`: 前端应用的缩放倍数（例如 8）

**返回值：** 道路线宽的缩放因子（浮点数）

**计算公式：**
```
actual_height_px = selected_size_height × frontend_scale
scale = actual_height_px / 4800.0
```

其中 4800.0 是 Python 标准输出的参考高度（12" × 16" @ 300 DPI）。

**使用示例：**
```rust
// A4 Portrait, 8x 缩放
let scale = calculate_road_width_scale(3508.0, 8.0);
// 结果：28064 / 4800 = 5.846
```

### 2. `RoadType::get_width_scaled()` 方法

**位置：** `wasm/src/types.rs` 中的 `impl RoadType`

**签名：**
```rust
pub fn get_width_scaled(self, scale_factor: f32) -> f32
```

**功能：** 获取动态缩放后的道路线宽

**参数：**
- `scale_factor`: 缩放因子（通常由 `calculate_road_width_scale()` 计算）

**返回值：** 缩放后的线宽（浮点数）

**使用示例：**
```rust
let scale = calculate_road_width_scale(3508.0, 8.0);
let motorway_width = RoadType::Motorway.get_width_scaled(scale);
// 结果：1.2 × 5.846 = 7.015
```

### 3. 保留的 `RoadType::get_width()` 方法

**位置：** `wasm/src/types.rs` 中的 `impl RoadType`

**签名：**
```rust
pub fn get_width(self) -> f32
```

**功能：** 获取使用固定缩放因子（8.0）的道路线宽

**说明：** 此方法保留以保持向后兼容，但推荐使用 `get_width_scaled()` 替代。

---

## 数据流

### RenderRequest 的新增字段

在 WASM 的 `RenderRequest` 结构体中添加了两个新字段：

```rust
pub struct RenderRequest {
    // ... 其他字段 ...
    
    /// 选定尺寸的原始高度（像素）
    #[serde(default = "default_selected_size_height")]
    pub selected_size_height: u32,
    
    /// 前端应用的缩放倍数
    #[serde(default = "default_frontend_scale")]
    pub frontend_scale: f32,
}
```

**默认值：**
- `selected_size_height`: 3508 (A4 Portrait)
- `frontend_scale`: 8.0

---

## 集成指南

### 在 TypeScript 端 (App.tsx) 修改

需要在发送 WASM 渲染请求时，添加这两个参数：

```typescript
// 当前代码
const width = selectedSize.width * 8;
const height = selectedSize.height * 8;

// 需要发送到 WASM 的参数
const wasmRequest = {
    // ... 其他参数 ...
    selected_size_height: selectedSize.height,  // 新增
    frontend_scale: 8,                           // 新增
};
```

### 在 Rust 端 (renderer.rs) 修改

在 `MapRenderer` 中使用动态缩放：

```rust
// 在 render_map_internal() 中
let road_width_scale = calculate_road_width_scale(
    request.selected_size_height as f32, 
    request.frontend_scale
);

// 在 draw_roads_bin() 或 draw_roads() 中
let stroke = Stroke {
    width: road_type.get_width_scaled(road_width_scale),  // 使用动态缩放
    ..Default::default()
};
```

---

## 数值示例

### 不同尺寸和缩放倍数的缩放因子

| 尺寸 | 高度 (px) | 前端缩放 | 实际高度 (px) | 缩放因子 | Residential 线宽 |
|------|----------|--------|------------|---------|-----------------|
| A4 Portrait | 3508 | 8 | 28064 | 5.846 | 2.338 |
| A4 Landscape | 2480 | 8 | 19840 | 4.133 | 1.653 |
| Square | 3000 | 8 | 24000 | 5.000 | 2.000 |
| Phone | 2532 | 8 | 20256 | 4.221 | 1.688 |
| 16x9 | 2160 | 8 | 17280 | 3.600 | 1.440 |
| A4 Portrait | 3508 | 6 | 21048 | 4.385 | 1.754 |
| A4 Portrait | 3508 | 4 | 14032 | 2.923 | 1.169 |

---

## 优势

1. **灵活性**：前端改变缩放倍数时，道路线宽自动调整
2. **一致性**：所有尺寸的线宽比例与 Python 版本保持一致
3. **可维护性**：不需要硬编码多个常量或复杂的条件逻辑
4. **向后兼容**：保留了 `get_width()` 方法，现有代码仍可使用

---

## 常见问题

### Q: 如果不想用动态缩放怎么办？
A: 可以继续使用 `get_width()` 方法，该方法使用固定的 RESOLUTION_SCALE (8.0)。

### Q: 如果前端没有传递 selected_size_height 或 frontend_scale 会怎样？
A: 会使用默认值（A4 Portrait, 8x 缩放），确保程序不会崩溃。

### Q: 线宽会不会过细或过粗？
A: 不会。缩放因子基于实际分辨率与 Python 标准输出的比例计算，确保视觉效果一致。

---

## 未来扩展

该系统设计可以容易扩展以支持：
1. 不同的标准参考分辨率（目前固定为 Python 的 4800px）
2. 按道路类型的不同缩放比例
3. 考虑屏幕 DPI 的自适应缩放

