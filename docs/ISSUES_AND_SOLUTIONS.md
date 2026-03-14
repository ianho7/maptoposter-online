# Map Poster 生成缺陷修复 Checklist

## 问题列表

- [ ] **Issue #1: 小道路和街道缺失**
  - 症状：Residential、Tertiary 等级别的小街道在高分辨率输出中完全不可见
  - 根本原因：线宽参数 (0.4pt) 在 8x 分辨率放大后相对大小变得极小
  - 优先级：🔴 **高** (严重影响视觉效果)

- [ ] **Issue #2: 橙色 POI 圆点完全缺失**
  - 症状：地点兴趣点 (Amenity、Shop 等) 标记圆点在生成图片中完全看不到
  - 根本原因：完全没有实现 OSM POI 数据获取和渲染逻辑
  - 优先级：🟡 **中** (增强视觉丰富度，非关键)

---

## 解决方案设计

### Issue #1: 小道路线宽不足

#### 🎯 核心思路

**问题的本质：** 当分辨率增加 8 倍时，固定的像素点数线宽相对变小 8 倍。

**解决方向有三种：**

**方案 A: 按分辨率倍数缩放线宽** ⭐ 推荐
- 在 WASM 渲染器中引入分辨率倍数因子 (8x)
- 所有 `RoadType::get_width()` 的返回值乘以 8
- 例如：Residential 0.4pt → 3.2pt (最小路) / Motorway 1.2pt → 9.6pt (最大路)
- ✅ 优点：简单直接，无需改变数据结构
- ✅ 优点：保持 Python 版本和 WASM 版本的视觉一致性
- ❌ 缺点：需要在 Rust 代码中修改

**方案 B: 调整基础线宽参数**
- 直接增加 `RoadType::get_width()` 中的数值
- 例如：Residential 0.4pt → 1.6pt / Motorway 1.2pt → 4.8pt
- ✅ 优点：对所有分辨率都适用，全局改进
- ❌ 缺点：可能影响较小分辨率的视觉效果（虽然可能改善）
- ❌ 缺点：与 Python 版本的参数不一致，难以维护

**方案 C: 在 TypeScript 层进行分辨率补偿**
- 在 `App.tsx` 中计算分辨率倍数，传入 WASM
- WASM 根据倍数动态调整线宽
- ✅ 优点：灵活可配置，易于调整
- ✅ 优点：支持未来的自适应分辨率需求
- ❌ 缺点：需要修改 TypeScript 和 Rust 的接口

**建议：** 采用 **方案 A** (最简单高效)
- 位置：`wasm/src/types.rs` 的 `RoadType::get_width()` 方法
- 修改：增加分辨率倍数参数或使用常量

#### 📝 具体改动清单

1. **Rust 端 (`wasm/src/types.rs`)**
   - 修改 `RoadType::get_width()` 方法，增加分辨率缩放因子参数
   - 或定义常量 `RESOLUTION_SCALE = 8.0`，应用于所有返回值
   - 示例：`RoadType::Motorway => 1.2 * RESOLUTION_SCALE` → 9.6

2. **Rust 端 (`wasm/src/renderer.rs`)**
   - 更新 `draw_roads_bin()` 和 `draw_roads()` 中调用 `road_type.get_width()` 的地方
   - 如果 `get_width()` 的签名改变，需要传递缩放因子

3. **TypeScript 端 (`src/App.tsx`)**
   - 可选：验证高分辨率输出是否正常（增加测试用例）

---

### Issue #2: POI 圆点缺失

#### 🎯 核心思路

**问题的本质：** 完全缺少从 OpenStreetMap 获取 POI 数据和渲染逻辑。

**实现方案：**

**方案 A: 添加 POI 数据获取和渲染** ⭐ 完整方案
- 在 TypeScript 中扩展 Overpass 查询，获取 POI 数据（amenity、shop、cafe 等）
- 定义 POI 类型和颜色映射
- 将 POI 坐标转换为二进制数据格式，传入 WASM
- 在 WASM 的 MapRenderer 中添加 `draw_pois()` 方法
- 渲染为小圆点，颜色使用主题中的 POI 颜色（如 "gradient_color" 或新增 "poi_color"）

**子步骤详解：**

1. **TypeScript 端 (`src/utils.ts`)**
   - 新增 `fetchPOIs()` 函数，从 Overpass API 获取 POI 要素
   - 查询标签：`amenity`, `shop`, `cafe`, `restaurant`, `bar`, `park`, `museum` 等
   - 返回 GeoJSON FeatureCollection
   - 新增 `flattenPOIsGeometry()` 函数，将 POI 点转为 Float64Array 二进制格式
   - 格式：`[poi_count, [x, y], [x, y], ...]` （每个 POI 仅需坐标）

2. **TypeScript 端 (`src/App.tsx`)**
   - 在数据获取流程中调用 `mapDataService.getPOIs()`
   - 将 POI 二进制数据添加到 WASM 渲染请求中
   - 更新进度条步骤（新增"获取 POI 数据"）

3. **MapDataService (`src/services/map-data.ts`)**
   - 扩展 `getMapData()` 方法或新增 `getPOIs()` 方法
   - 实现 L1/L2 缓存（与 roads/water/parks 一致）
   - 支持缓存和网络获取

4. **WASM 端 (`wasm/src/types.rs`)**
   - 在 `RenderRequest` 结构体中新增 `pois: Vec<POI>` 字段
   - 定义 `POI` 结构体：`{ x: f64, y: f64 }`
   - 或在 JSON 传入时直接使用二进制 Float64Array

5. **WASM 端 (`wasm/src/renderer.rs`)**
   - 新增 `draw_pois()` 方法
   - 使用 `tiny_skia` 绘制小圆点（半径 4-6 像素）
   - 颜色：从主题读取 POI 颜色（或默认使用 `gradient_color` / 橙色）

6. **主题配置 (`themes/*.json`)**
   - 可选：为每个主题添加 `poi_color` 字段（默认橙色 `#FF8C00` 或类似）

**方案 B: 简化版本 (MVP)**
- 仅获取最常见的 POI 类型（amenity、shop）
- 使用固定的小圆点大小和颜色
- 不分类渲染（所有 POI 颜色相同）
- ✅ 优点：快速实现，工作量最小
- ❌ 缺点：功能有限

**建议：** 采用 **方案 A**（完整实现，复用现有架构）

#### 📝 具体改动清单

1. **`src/utils.ts`**
   - 新增 `fetchPOIs()` 函数 (类似 `fetchGraph()`)
   - 新增 `flattenPOIsGeometry()` 函数 (类似 `flattenRoadsGeoJSON()`)

2. **`src/services/map-data.ts`**
   - 扩展或新增 `getPOIs()` 方法
   - 添加 L1/L2 缓存逻辑

3. **`src/App.tsx`**
   - 在数据获取流程中调用 `mapDataService.getPOIs()`
   - 将 POI 二进制数据传入 WASM 渲染请求
   - 更新进度条显示

4. **`wasm/src/types.rs`**
   - 在 `RenderRequest` 中新增 `pois` 字段
   - 定义 `POI` 或使用 `Vec<(f64, f64)>` 直接表示

5. **`wasm/src/renderer.rs`**
   - 新增 `draw_pois(&mut self, pois: &[(f64, f64)], color: Color)`
   - 在 `render_map_internal()` 中调用此方法

6. **`wasm/src/lib.rs`**
   - 更新 `JsonRenderRequest` 结构体，新增 `pois` 字段

7. **`themes/*.json`**
   - 可选：新增 `poi_color` 字段（如未定义，使用 `gradient_color` 作为默认值）

---

## 实施顺序建议

1. **先修复 Issue #1** (小道路线宽)
   - 改动范围小，立竿见影
   - 可以立即看到效果
   - 工作量：约 30 分钟

2. **再实施 Issue #2** (POI 圆点)
   - 工作量较大，涉及多个模块
   - 但复用现有架构，相对规范
   - 工作量：约 2-3 小时

---

## 风险和注意事项

### Issue #1 风险
- ⚠️ **线宽增加 8 倍后，需验证在小分辨率输出上是否过粗**
  - 解决：可添加 `min(resolution_scale, max_scale)` 的上限控制
- ⚠️ **需要测试不同尺寸 (A4、Phone、Desktop) 的视觉一致性**

### Issue #2 风险
- ⚠️ **Overpass API 查询性能**
  - POI 数据量可能很大，建议限制最多返回 5000 个点
  - 或按地图半径动态调整查询范围
- ⚠️ **缓存策略**
  - POI 数据变化频率可能比 roads/parks 高，考虑使用较短的缓存过期时间
- ⚠️ **圆点渲染顺序**
  - 应在道路之上渲染，确保不被覆盖 (zorder/zindex)

---

## 验证方案

### Issue #1 验证
```
对比标准：tokyo_japanese_ink_20260118_142446.png
- 肉眼观察小街道是否可见
- 对比 Residential 和 Tertiary 的相对粗细
- 测试多个城市和主题，确保一致性
```

### Issue #2 验证
```
对比标准：tokyo_japanese_ink_20260118_142446.png
- 观察是否有橙色圆点出现在地图上
- 圆点数量是否合理（几十到几百个）
- 圆点不应与路网重叠过多
```

---

## 关键决策点

| 决策 | 建议 | 理由 |
|------|------|------|
| Issue #1 方案 | **方案 A** (分辨率缩放) | 最简单，代码改动最少，效果最直接 |
| Issue #2 方案 | **方案 A** (完整 POI) | 虽然工作量大，但复用现有架构，易维护 |
| POI 颜色 | 使用主题中的 `gradient_color` | 与现有设计一致，无需新增配置 |
| POI 圆点大小 | 固定 4-5 像素 (未来可配置) | 简单高效，在各分辨率下都清晰可见 |
| 缓存策略 | POI 与 roads 使用相同缓存期 | 简化数据管理，保证一致性 |

