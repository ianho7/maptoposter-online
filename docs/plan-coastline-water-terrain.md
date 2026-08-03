# 海岸线海面补全与水体地形优先级改造计划

## Objective

解决城市海报中与海面、水体和绿地有关的三类错误，同时不恢复脆弱的前端几何布尔运算：

- 海口等沿海城市因 `natural=coastline` 是线而缺少海面；
- 南京玄武湖等水体与公园/景区重叠时，被绿地层覆盖；
- 纽约等多岛、两岸或多块断开陆地城市，被错误的海岸线补面涂成海。

本期范围是以现有 OSM/Overpass 数据为基础，建立保守的 coastline 海面推断，并固定 water 高于 parks 的渲染规则。道路是否避让 terrain 仍是独立的视觉选项。

本期不包含：切换外部地图数据源、引入完整全球陆地掩膜、桥梁/堤路的语义保留，或在 JS 中重新进行 `water - parks` / `union` 几何布尔处理。

## Background and Context

当前数据与渲染链路为：

```text
Overpass water GeoJSON
  -> mergeSeaPolygonsIntoWaterGeoJSON
  -> flattenPolygonsGeoJSON
  -> WASM process_polygons_bin_wasm
  -> WASM PNG/SVG renderer
```

`src/services/sea-polygons.ts` 会把裁切后的 coastline 和视口边界 polygonize。现行算法把包含海报中心点的一个 face 认作陆地，再把所有其他 face 追加为 `generated: "coastline-sea"`。

该假设仅在视口内只有一块连续陆地时成立。纽约 fixture 已证明其失效：中心位于曼哈顿时，布鲁克林和泽西市的陆地 face 也被追加为水体。处理后的 `water-bin` 中，布鲁克林和泽西市采样点分别被无孔洞的大型水面覆盖。

南京玄武湖是另一类问题：OSM 允许湖、湖公园和大风景区的 polygon 重叠。此前的结论是水体应在最终视觉上优先于绿地；前端对公共 OSM 几何做 union/difference 曾触发拓扑错误，因此该关系应由渲染层表达。

### 已验证事实

- `mergeSeaPolygonsIntoWaterGeoJSON` 会把生成的 sea features 追加回 water collection。
- `hasGeneratedSeaPolygons` 会阻止已缓存水数据重新生成海面；修复需要新的缓存版本。
- `enable_road_mask_optimization` 当前同时影响道路 terrain mask 和 parks-water mask，语义耦合不合理。
- 现有 `src/services/sea-polygons.test.ts` 共 9 项测试通过；海口样例的几何测试约 245 ms，但没有多陆地 face 覆盖。

## Current State Analysis

### Implementation status (2026-07-23)

> 2026-08-01 更新：本节的 `directed-coastline-v1` 偏移采样方案已由 [海岸线拓扑分类 V2](./plan-coastline-topology-v2.md) 取代。迁移原因是固定线段预算和任一局部采样歧义都会使整片外海归零；V2 改用分辨率感知简化、带来源切分和精确区域边邻接。水体优先于绿地、递归成员语义过滤和 WASM 图层顺序结论保持不变。

- Implemented: the center-point sea classifier was replaced with directed right-side face evidence, a bounded face index, provenance, and safe rejection of ambiguous linework.
- Implemented: PNG, SVG, legacy JSON, uniform-scale, and non-uniform-scale paths now draw `parks` before `water`; the road terrain switch no longer controls that relationship. The obsolete park-water offscreen mask was removed.
- Implemented: cache version was advanced to `v11-canonical-fetch-viewport-semantic-terrain-filtering`; legacy generated sea is removed before a fresh classification and pre-filter terrain cache entries cannot be reused.
- Implemented: after recursive Overpass members are converted to GeoJSON, the water and parks collections are filtered back to their requested tag taxonomies. This removes `place=island` relation members from water while retaining genuine lake/park overlap for the renderer's water-over-parks rule.
- Implemented: when the existing local diagnostic-fixture switch is enabled, the water cache is bypassed once and the app downloads `*-raw-water-geo.json` before sea merging. This preserves coastline direction for local NYC diagnosis without retaining raw data in normal memory/cache flows or committing the full download to the repository.
- Implemented: the worker now emits one sea-classifier timing summary per processing pass (`clip`, `merge`, `nodePolygonize`, `classify`) together with fragment/face/generated/ambiguous counts and any safety downgrade reason.
- Diagnosed and corrected: an initial Nanjing retest still showed the old switch-dependent behavior because the app was loading a stale `src/pkg/wasm_bg.wasm`. The WASM package was rebuilt after the Rust layer-order change; the compiled artifact is now part of the worktree changes.
- Verified locally: synthetic direction/multi-land regression, Haikou no-self-intersection regression, TypeScript build check, WASM check, and focused renderer tests.
- Still open: Nanjing water/parks fixture, true data-worker/WASM offline harness, and city timing/memory measurements. NYC raw data remains an on-demand local diagnostic asset rather than a committed fixture; its manual visual regression has passed.

| 模块 | 当前职责 | 局限 |
|---|---|---|
| `src/services/sea-polygons.ts` | coastline 裁切、连线、node、polygonize、生成 sea polygon | 使用单一中心点区分海陆，无法表达多块陆地 |
| `src/data-worker.ts` | 抓取、缓存、调用海面合并、扁平化 | 缓存会保存错误生成的 sea polygon |
| `wasm/src/lib.rs` | 决定 water、parks、roads 的绘制路径 | parks-water 规则被道路开关意外控制 |
| `wasm/src/renderer.rs` | PNG 多层绘制 | park-water mask 使用完整离屏图层，增加内存和路径构建成本 |
| `wasm/src/svg_renderer.rs` | SVG 多层绘制 | 必须与 PNG 图层优先级保持一致 |

当前 `water-bin` 仅保留投影后的 polygon 坐标，已丢失 `natural=coastline` 属性及原始线方向。因此它能验证“错误水面覆盖了哪里”，不能直接作为 coastline 方向分类的输入 fixture。

## Proposed Solution

采用“带置信度门槛的有向 coastline 海面推断 + water 优先图层顺序”。这是不更换数据源条件下最保守的可行方案，不把它视为全球海陆数据的等价替代。

### 1. 有向 coastline 海面推断

OSM coastline 的规范语义是水在 way 行进方向的右侧。算法不再使用中心点选出唯一陆地，而是使用每段 coastline 的右侧作为水面证据。

1. 裁切原始 coastline 片段到实际渲染视口，保留其原始方向。
2. 同时生成可供 polygonize 的连通线网；此步骤可以合并/反转线，但不能替代第 1 步中保存的有向片段。
3. 用 coastline 线网和视口边界生成 candidate faces。
4. 对每段原始有向片段，在右法线方向取小距离采样点；用 face bbox 索引定位该点落入的 face。
5. 对每个 face 累加 coastline 长度权重的 water/land 证据：右侧是 water，左侧是 land。
6. 仅在满足以下条件时生成 `coastline-sea`：
   - water 证据达到最小阈值；
   - 没有相反的 land 证据；
   - face 接触 viewport 边界；
   - component 没有几何异常、定位失败或方向冲突。
7. 任一条件不满足时跳过该 component 的补海。缺少补海是允许的保守降级，覆盖陆地不是。

“接触 viewport 边界”将生成器限定在补外海；封闭湖泊应来自原始明确 water polygon，而不应由 coastline 补面推断。

### 2. 固定 water 高于 parks 的渲染规则

PNG 与 SVG 使用相同的层级：

```text
background -> parks/greenery -> water -> roads -> POIs/text
```

这使玄武湖等明确水面自然覆盖同处的 park/greenery，不需要在数据 worker 中对坏拓扑做布尔运算，也不需要额外 park-water 离屏 `Clear` mask。

`enable_road_mask_optimization` 仅保留为道路是否避让最终 `water ∪ parks` terrain 的开关；它不再影响 water/parks 的视觉优先级。

### 3. 生成 provenance 与缓存隔离

生成的海面保留 provenance，例如：

```ts
{
  generated: "coastline-sea",
  generator_version: "directed-coastline-v1",
  classification: "right-side-confidence"
}
```

升级 `MAP_DATA_CACHE_VERSION`，使当前已缓存的错误 sea polygon 不再被 `hasGeneratedSeaPolygons` 直接复用。

## Alternatives Considered

### 仅删除 coastline 海面补全

- 优点：立刻停止纽约陆地被覆盖。
- 缺点：海口等沿海城市重新缺海。
- 结论：仅可作为紧急回退，不是正式方案。

### 继续以中心点区分海陆，增加多个中心点/启发式

- 优点：实现改动小。
- 缺点：岛屿、两岸城市、半岛、海湾仍需不断添加规则。
- 结论：根模型错误，拒绝。

### 方向判定但不做置信度校验

- 优点：能修正中心点模型。
- 缺点：依赖 OSM coastline 方向正确且线网完整；单个异常 way 仍可生成错误海面。
- 结论：不足以单独采用，必须配合 face 边界、冲突与异常门槛。

### 在 JS 数据层进行 water/parks union 或 difference

- 优点：可得到显式裁剪后的几何。
- 缺点：南京案例已出现公共 OSM 非 noded intersection 和拓扑异常，且大范围城市成本高。
- 结论：拒绝；保持原始数据，渲染层处理覆盖关系。

### 引入权威全球 land/ocean mask

- 优点：长期最可靠；海陆不再依赖局部 coastline 推断。
- 缺点：新增数据资产或服务、许可、体积、更新和离线策略。
- 结论：长期架构方向；本期不更换数据源时不作为阻塞项。

## Implementation Plan

### Phase 1: 建立原始输入与失败回归样例

- Goal: 保存可以重放 coastline 推断的原始数据，并先把纽约错误变成自动化失败。
- Files: `src/services/sea-polygons.test.ts`；新增测试 fixtures 目录；必要时仅为诊断扩展 `src/data-worker.ts` 的 fixture 导出。
- Tasks:
  - 保存纽约 `mergeSeaPolygonsIntoWaterGeoJSON` 调用前的 raw `waterGeo` fixture，包含 coastline 属性与方向。
  - 为纽约加入水/陆 probe：曼哈顿、布鲁克林、泽西市、哈德逊河、东河。
  - 添加最小 synthetic 多陆地 face 测试，明确证明中心点算法会把非中心陆地错误当海。
  - 添加正向/反向 coastline 测试，明确 water 在右侧的规则。
- Expected Result: 当前实现对纽约/多陆地测试为红；测试不依赖浏览器或网络。

### Phase 2: 实现保守的有向 coastline classifier

- Goal: 以方向证据给 candidate faces 分类，不再使用 `landFaceIndex`。
- Files: `src/services/sea-polygons.ts`、`src/services/sea-polygons.test.ts`。
- Tasks:
  - 定义 `ClippedDirectedCoastlineSegment`，在裁切时保留 source 方向。
  - 保持现有 merge/noding/polygonize 用于构造 faces，但禁止从合并线推断方向。
  - 创建 face bbox 索引，支持右/左采样点定位。
  - 按边长累计 face evidence，并实现冲突、边界接触、最小支持长度和异常 component 的拒绝逻辑。
  - 为跳过原因返回/记录结构化诊断计数，避免逐段 console 日志。
- Expected Result: 纽约布鲁克林、泽西市不再进入 generated sea；海口能在高置信度时继续补海。

### Phase 3: 固定 terrain 图层顺序并解耦道路开关

- Goal: 无条件保证 water 覆盖 parks，同时只让道路开关控制道路。
- Files: `wasm/src/lib.rs`、`wasm/src/renderer.rs`、`wasm/src/svg_renderer.rs`、可能的文案文件。
- Tasks:
  - 将 parks 绘制置于 water 之前，并在 PNG/SVG 保持同一顺序。
  - 移除 parks-water mask 对 `enable_road_mask_optimization` 的依赖。
  - 评估并删除不再需要的 parks 离屏 mask 与对应计时/内存日志。
  - 确认 roads 的 mask 仍基于 water 与 parks，但仅在开关开启时执行。
- Expected Result: 玄武湖在道路开关开启和关闭时都显示为水；道路行为才随开关变化。

### Phase 4: 缓存迁移与数据 provenance

- Goal: 阻止旧错误 sea polygon 继续命中缓存，并让后续问题可追溯。
- Files: `src/lib/poster-viewport.ts`、`src/data-worker.ts`、`src/services/sea-polygons.ts`。
- Tasks:
  - 增加海面生成版本并升级 `MAP_DATA_CACHE_VERSION`。
  - 在生成 water feature 写入 provenance。
  - 在缓存恢复与新抓取路径统一记录 sea 生成摘要。
  - 验证缓存命中不会重复几何处理，缓存失效会使用新分类器。
- Expected Result: 用户获得新水体数据；新旧生成器缓存不会混用。

### Phase 5: 端到端 fixture 回归与性能基线

- Goal: 验证三类城市、两种导出格式和缓存路径。
- Files: 新增 fixtures/harness；`src/services/sea-polygons.test.ts`；可能新增离线 WASM render 测试。
- Tasks:
  - 纽约：断言陆地 probe 不被 water 覆盖，水域 probe 保持水。
  - 南京：同一 water/park 重叠 fixture 中，湖中心渲染水色、紫金山渲染绿地。
  - 海口：海面存在且生成面无自交。
  - PNG/SVG：验证 water 在 parks 之上，结果语义一致。
  - 记录首次生成、缓存命中、1x/2x 导出的耗时和峰值内存。
- Expected Result: 三类历史问题均有离线、可重复的回归信号。

## Validation Strategy

### Unit tests

- `bun test src/services/sea-polygons.test.ts`
- 新增有向 coastline、多陆地 face、冲突降级、无闭合 coastline、缓存 provenance 测试。

### Fixture/integration tests

- 使用 raw NYC water fixture 重放 `mergeSeaPolygonsIntoWaterGeoJSON`，再经过 flatten/process 后检查地理 probe。
- 使用南京 water + parks fixture 通过 WASM 产生 PNG/SVG；检查湖/绿地固定坐标的图层结果。
- 使用海口 fixture 检查生成海面数量、无自交和海域 probe。

### Manual checks

- 首次缓存失效后的纽约、南京、海口各导出 PNG 和 SVG。
- 再次导出同一城市，确认缓存命中且不重复做 coastline 几何处理。
- 分别切换道路 terrain mask，确认只影响道路，不影响水与绿地的关系。

### Expected failure cases

- 方向冲突或 coastline 不完整：不生成可疑 sea polygon。
- face 不触碰 viewport：不由 coastline 补海生成。
- 超过处理预算：记录降级并保留原始 water，而非覆盖陆地。

## Performance Considerations

现有热点是 coastline 的 noding 与 polygonize。新 classifier 的复杂度必须受控，禁止逐段遍历全部 face 和全部顶点。

- 使用 face bbox 空间索引；采样点只对少量候选面做 point-in-polygon。
- 索引只保存 bbox 和 face 引用，不复制 polygon 坐标。
- 仅处理实际 render viewport 内的 coastline。
- 为每个 coastline component 设置片段数、总顶点数和耗时预算；超限安全降级。
- 仅在缓存失效时运行；缓存命中时利用 generated provenance 跳过。
- 将 `clip`、`merge`、`node`、`polygonize`、`classify`、`flatten` 分别计时，避免总时长掩盖回归。

图层重排预计比现有 park-water mask 更省内存：不再创建完整临时 parks pixmap。道路 terrain mask 仍保留为可选的每次导出成本。

## Risks and Mitigations

| 风险 | 影响 | 缓解 | 回退 |
|---|---|---|---|
| OSM coastline 方向错误 | 可能仍误判局部海陆 | 双侧证据、冲突拒绝、边界与长度门槛 | 该 component 不补海 |
| coastline 不完整 | 海口等海面不完整 | 保留原始明确水面，记录降级 | 临时关闭 generated sea |
| 多岛/海湾复杂拓扑 | classifier 结果不稳定 | NYC 多陆地和海口 fixture 回归 | 对问题 component 跳过 |
| 缓存保留旧错误面 | 修复后仍显示错误 | 升缓存版本、记录 generator version | 清理对应缓存 key |
| PNG/SVG 规则分叉 | 一种格式正确，另一种错误 | 同一图层顺序、两种格式回归测试 | 暂停对应格式的优化路径 |
| 性能回归 | 首次导出卡顿或内存上涨 | bbox 索引、预算、阶段计时 | 不补海而继续原始 water 渲染 |

## Open Questions

- 长期是否接受引入权威全球 land/ocean mask，取代局部 coastline 推断？这会显著提高可靠性，但需要单独决定数据包/服务、许可、更新与离线策略。
- NYC raw `waterGeo` fixture 的保存方式应选调试开关下载、测试资源提交，还是两者兼有？该选择会影响 fixture 体积与维护方式，但不阻塞 Phase 1 的最小 synthetic 测试。

## Recommended Next Step

先执行 Phase 1：保存纽约 `mergeSeaPolygonsIntoWaterGeoJSON` 前的 raw `waterGeo`，并加入多陆地 face 的红色回归测试。没有这份保留 coastline 属性与方向的输入，无法可靠实现或验证有向 coastline 分类。
