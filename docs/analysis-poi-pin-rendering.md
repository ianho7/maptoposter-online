# 自定义 POI 图钉渲染分析与改进方案

## 1. 当前渲染链路

### 1.1 参数来源

图钉视觉参数定义在 [src/App.tsx](../src/App.tsx) 的 `INTERNAL_PIN_THEME_CONFIGS` 中，通过 render config 的 `pin_theme_config` 字段传给 WASM：

```
TS 常量 → /worker → Rust render_config → MapRenderer::draw_custom_pois()
```

切换风格只需改 `INTERNAL_PIN_THEME_STYLE`，调参只需改 `INTERNAL_PIN_THEME_CONFIGS`，保存刷新即可——不需要重编 WASM。

### 1.2 PNG 渲染 ([wasm/src/renderer.rs](../wasm/src/renderer.rs))

`draw_pin_badge` (L829-928) 对每种风格用 **多层纯色圆形叠加** 来模拟立体感：

```
Puff (气泡):
  1. shadow   — 偏移黑圆，透明度 shadowAlpha
  2. body     — 主体色实心圆
  3. highlight — 偏移白圆，透明度 highlightAlpha（左上高光点）
  4. inner shadow — 偏移黑圆，透明度 innerShadowAlpha（底部暗部）
  5. inner body   — 主体色稍小圆（覆盖回来，形成"内缩"感）

Badge (徽章):
  1. shadow     — 偏移黑圆
  2. rim        — rimDarken 压暗的圆（边缘金属感）
  3. inner body — 主体色稍小圆
  4. highlight  — 左上白点

Pinhead (玻璃球):
  1. shadow              — 偏移黑圆
  2. outer rim           — rimDarken 压暗圆（玻璃折射暗边）
  3. inner body          — innerBodyDarken 压暗圆（内部背景色）
  4. highlight           — 左上白点（镜面反射）
  5. secondary highlight — 右下白点（环境光反射）
```

### 1.3 SVG 渲染 ([wasm/src/svg_renderer.rs](../wasm/src/svg_renderer.rs))

`push_pin_badge_svg` (L630-749) 逻辑完全对应 PNG 版本，用原生 SVG `<circle>` 元素拼出同样的叠层结构。

---

## 2. 为什么看起来不够真实

### 2.1 根本原因：纯色圆叠层模型的天花板

每一层都是一个 **颜色均匀、边缘清晰的圆**。现实中的 3D 物体不是这样的：

| 视觉特征 | 当前做法 | 现实情况 |
|---|---|---|
| 球体曲面 | 2-3 层不同大小的纯色圆叠出假层次 | 从中心到边缘的 **连续色调渐变** |
| 阴影 | 偏移纯色黑圆，硬边 | 从中心向外的 **逐渐淡出** |
| 高光 | 纯白圆，清晰边界 | 中心最亮、边缘渐隐的 **光晕** |
| 玻璃折射 | 一个更暗的圆套在里面 | 中心到边缘的折射 **色阶连续变化** |

### 2.2 参数调优的极限

`INTERNAL_PIN_THEME_CONFIGS` 只能控制每层圆的 **位置、大小、透明度、压暗系数**。这些参数能改善叠圆效果，但无法改变"叠圆"这个根本模型。

例如：把 `puff` 的 `highlightRadiusScale` 从 0.72 调到 1.0，高光确实更大了，但它仍然是一个边界清晰的白圆，不是自然光晕。

---

## 3. 解决方案：用径向渐变替代纯色圆叠层

### 3.1 核心思路

保持现有参数架构不变，但将"多层纯色圆叠加"改为 **每层用径向渐变**：

```
改造前: 图层 = 纯色圆(颜色, 透明度)
改造后: 图层 = 径向渐变(中心色 → 边缘色, 中心透明度 → 边缘透明度)
```

### 3.2 每种风格的具体改进

**Puff（气泡）：**

| 图层 | 改前 | 改后 |
|---|---|---|
| 主体（合并 body + inner body + rim） | 2-3 层纯色圆叠出假层次 | **1 个径向渐变圆**：中心亮（主题色）→ 边缘暗（主题色×0.85），直接就是球体明暗 |
| 阴影 | 偏移硬边黑圆 | 径向渐变：中心黑(alpha=shadowAlpha) → 边缘透明(alpha=0)，自然羽化 |
| 高光 | 硬边白圆 | 径向渐变：中心白(alpha=highlightAlpha) → 边缘透明(alpha=0)，光晕自然衰减 |

需要增加的参数：`body_gradient_inner_lighten`（球体中心提亮系数）、`body_gradient_outer_darken`（球体边缘压暗系数）、`highlight_gradient_spread`（高光扩散范围）。

**Badge（徽章）：**

| 图层 | 改前 | 改后 |
|---|---|---|
| 主体 + 边框 | 纯色 rim 圆 + 纯色 inner 圆 | 1 个径向渐变：边缘深色（rim 效果）→ 内部浅色，过渡连续 |
| 高光 | 硬边白点 | 渐变光晕 |

**Pinhead（玻璃球）：**

| 图层 | 改前 | 改后 |
|---|---|---|
| 球体 | 3 层纯色圆（rim + inner body + shadow） | 1 个径向渐变：边缘深（折射）→ 中心稍亮（透光），关键是 **非线性过渡**，模拟玻璃折射率 |
| 主高光 | 硬边白点 | 小范围径向渐变，模拟镜面反射点 |
| 次级高光 | 硬边白点 | 大范围径向渐变，模拟环境光漫反射 |

### 3.3 技术可行性

| 输出 | 渐变支持 |
|---|---|
| PNG (tiny_skia) | `RadialGradient` + `Paint::set_shader()` 原生支持 |
| SVG | `<defs><radialGradient>` 原生支持，语法比 tiny_skia 还简单 |

两个目标格式都原生支持径向渐变，不需要引入新依赖或 hack。

---

## 4. 改动范围估算

| 文件 | 改动 | 行数 |
|---|---|---|
| `wasm/src/types.rs` | `PinThemeConfig` 加渐变色标字段（~8 个新字段） | +20 |
| `wasm/src/renderer.rs` | 重写 `draw_pin_badge`：3 种风格 × 3 层渐变 ≈ 每个风格 ~25 行，删掉原来 ~90 行叠圆代码 | 净增 ~10 |
| `wasm/src/svg_renderer.rs` | 在 `<defs>` 生成 `<radialGradient>`，重写 `push_pin_badge_svg` | +60 |
| `src/App.tsx` | 更新 `INTERNAL_PIN_THEME_CONFIGS`，三种风格各补渐变参数 | +30 |
| `src/pkg/` | `wasm-pack build --release` 刷新 | 自动生成 |

**总净增约 120 行**，改动集中在 4 个文件里。

### 4.1 调试流程

改渐变参数要么改 TS 常量（刷新即可），要么改 Rust 渐变逻辑（需重跑 `wasm-pack build`）。建议一开始在 TS 侧把渐变参数定义得足够细，这样后续调参仍然可以走纯前端路径。

---

## 5. 风险与注意事项

1. **SVG/PNG 一致性** — 两个渲染器需要独立实现各自的渐变逻辑，必须保持视觉一致。建议先调好 PNG 的渐变效果，再照搬到 SVG。

2. **渐变参数不宜过多** — 每个风格控制在 3-4 个渐变色标以内。参数越多调起来越困难，且容易产生不一致的组合。

3. **主题色适配** — 渐变需要在运行时基于 `theme.poi_color` 动态计算色标值（lighten / darken），不能写死颜色。这样切换地图主题时图钉自动适配。

4. **性能** — 径向渐变在 tiny_skia 中是软件渲染，但自定义 POI 数量通常很少（<50 个），性能影响可忽略。

5. **向后兼容** — 如果之后要开放给用户选主题，当前 `PinThemeConfig` 架构（前端参数 → WASM）已经是正确的扩展基础。
