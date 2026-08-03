# 海岸线海面补全与水体地形优先级 Checklist

> 迁移说明（2026-08-01）：本清单中的 V1 左右采样海岸线分类已由 [Topology V2 checklist](./checklist/coastline-topology-v2-checklist.md) 取代。旧项仅保留历史证据；水体/绿地语义与 WASM 图层验收仍然有效。

关联计划：[plan-coastline-water-terrain.md](plan-coastline-water-terrain.md)

## Checklist Objective

在不更换数据源的前提下，安全地修复 coastline 海面补全的多陆地误判，并建立 water 高于 parks/greenery 的固定渲染规则。

目标结果：

- 海口仍能在有足够证据时补出海面；
- 纽约的布鲁克林、泽西市等陆地绝不被生成 sea polygon 覆盖；
- 南京玄武湖在道路遮罩开/关时都保持水色；
- PNG 和 SVG 的水体/绿地层级一致；
- 不恢复前端 `union` / `difference` 几何布尔处理。

非目标：引入全球 land/ocean 数据资产、修复 OSM 原始数据、保留桥梁道路、或宣称 coastline 推断可替代权威海陆掩膜。

## Closed-loop Spec

### Goal and acceptance surface

- 用户可见症状：沿海城市可能缺海，或多岛/两岸城市的陆地被刷成水；湖泊可能被公园/绿地覆盖。
- 接受面：使用同一份离线 raw GeoJSON/渲染 fixture，经真实 data-worker -> WASM PNG/SVG 路径得到正确地形颜色和覆盖关系。
- 完成证据：纽约、南京、海口的独立 fixture 断言和 PNG/SVG 回归均通过；缓存迁移后的首次与命中缓存路径均通过。

### Durable state

- 计划：`docs/plan-coastline-water-terrain.md`
- 执行清单：本文档
- 任务反思：`docs/reflections/task-<task-id>-<timestamp>.md`
- 原始 fixtures：提交到专用测试 fixture 目录；不得只保存在下载目录或聊天附件中。
- 每次开始一个新阶段时，记录当前 hypothesis、已运行命令、退出码、fixture 版本和未关闭的 acceptance gate。

### Next-action rule

1. 若 raw NYC water GeoJSON 尚未保存，先补 fixture；不得对已丢失 coastline 属性/方向的 `water-bin` 猜测修复。
2. 若最小多陆地测试不为红，先修测试而不是修改分类器。
3. 若 classifier 结果与预期冲突，保留原始证据并切换到“拒绝补海”策略；不得增加中心点启发式。
4. 若组件测试为绿但 PNG/SVG acceptance fixture 未跑，状态仍为 `running`，不能声明修复完成。
5. 若外部/人工导出是唯一未关门的 acceptance gate，状态写为 `mitigated`，并明确列出该 gate。

### Retry and exit policy

- 同一 transient 命令最多原样重试 1 次；第二次失败后收集环境证据。
- 同一分类策略被 fixture 证伪后，不再调整阈值重试；先切换到更保守的 component 拒绝或回到设计复核。
- 遇到不完整、方向冲突、超预算的 coastline component，降级为“不生成 sea polygon”。
- `complete`：所有 acceptance + regression gates 通过。
- `mitigated`：安全降级已保护陆地，但某些海面缺失或人工导出 gate 待验证。
- `blocked`：缺少 raw fixture、环境或用户输入，且已记录精确缺口。

## Evidence-surface Map

| Probe ID | 用户症状/接受面 | Verifier | Coverage | 证据角色 | 不能证明什么 |
|---|---|---|---|---|---|
| E1 | 纽约陆地不被补成海 | raw NYC GeoJSON -> sea merge -> water probes | partial | diagnostic + regression | 不证明最终 PNG/SVG 图层顺序 |
| E2 | 南京湖优先于绿地 | water+parks fixture -> PNG/SVG pixel/probe assertion | yes | acceptance | 不证明海口海面生成 |
| E3 | 海口海面存在且无异常几何 | raw Haikou GeoJSON -> sea merge geometry checks | partial | regression | 不证明复杂多岛城市正确 |
| E4 | 最终导出行为 | 离线 WASM PNG/SVG fixture harness | yes | acceptance | 不证明浏览器下载生命周期 |
| E5 | 缓存不会复用错误 sea | cache version + restore path test | partial | regression | 不证明真实 IndexedDB 迁移 UI |

## Pre-Implementation Checks

- [x] `CW-01` 阅读并确认 [plan-coastline-water-terrain.md](plan-coastline-water-terrain.md) 的范围、非目标和长期数据源边界。
- [x] `CW-02` 审核 `src/services/sea-polygons.ts`，确认有向原始裁切片段与可反转的 merged line 必须分离。
- [x] `CW-03` 审核 `src/data-worker.ts` 的新抓取、缓存恢复、缓存回写三条 water 路径，列出所有 `mergeSeaPolygonsIntoWaterGeoJSON` 调用点。
- [x] `CW-04` 审核 `wasm/src/lib.rs`、`wasm/src/renderer.rs`、`wasm/src/svg_renderer.rs` 的 parks/water/roads 实际绘制顺序。
- [x] `CW-05` 运行并记录 `bun test src/services/sea-polygons.test.ts` 的基线结果、耗时和退出码。
- [x] `CW-06` 确认 `MAP_DATA_CACHE_VERSION` 的现有值、`hasGeneratedSeaPolygons` 的短路行为与版本迁移影响。

## Implementation Checklist

### Phase 1: 建立红色回归与原始证据

- [x] `CW-101` 为纽约保存 `mergeSeaPolygonsIntoWaterGeoJSON` 调用前的 raw `waterGeo` fixture，保留 coastline properties、MultiLineString 与原始坐标方向。（已通过受控导出收集并离线验证；按约定不提交整份本地调试数据）
- [x] `CW-102` 为纽约 fixture 定义地理 probe：曼哈顿、布鲁克林、泽西市、哈德逊河、东河，并记录预期 water/land 分类。（本地 raw 重放与实际导出完成；仓库保留 NYC-scale 安全预算回归而非完整 raw）
- [x] `CW-103` 写入最小 synthetic 多陆地 face fixture；确认当前中心点算法会把非中心陆地 face 误生成 sea，测试必须先红。
- [x] `CW-104` 写入单条 coastline 的正向/反向测试，明确“右侧为水、左侧为陆”的预期，并避免沿用中心点语义。
- [ ] `CW-105` 为南京保存 water 与 parks 重叠的 fixture，至少包含玄武湖中心和相邻紫金山绿地 probe。
- [ ] `CW-106` 记录海口 raw fixture 的来源和当前 expected sea probes；确认它可独立重放。

### Phase 2: 实现有向 coastline 分类器

- [x] `CW-201` 在裁切阶段返回保留 source 方向的 `ClippedDirectedCoastlineSegment`；禁止从 merged line 读取方向。
- [x] `CW-202` 保留现有合并、noding 与 polygonize 路径，仅将其输出用作 candidate faces。
- [x] `CW-203` 为 candidate faces 实现 bbox 空间索引；查询返回少量候选 face 引用，不复制 polygon 坐标。
- [x] `CW-204` 为每个有向 coastline 片段计算左右采样点，按边长累加 face 的 water/land evidence。
- [ ] `CW-205` 实现 confidence gate：最小支持长度、无相反证据、touches-viewport-boundary、无 component 几何异常。（已实现前 3 项；component 预算待补）
- [ ] `CW-206` 对方向冲突、face 定位失败、非闭合线网、预算超限 component 返回“跳过补海”的结构化结果。（已实现非闭合/定位失败的全局安全降级；component 预算待补）
- [ ] `CW-207` 更新 sea polygon provenance：生成器版本、分类方法、component/统计摘要；不要写入逐段调试日志。（已写入生成器与分类方法；component 摘要待补）
- [ ] `CW-208` 运行 NYC 与 synthetic fixtures，确认布鲁克林/泽西市不被生成 sea 覆盖，且该阶段测试转绿。

### Phase 3: 固定 water/parks 优先级

- [x] `CW-301` 在 PNG 渲染路径中实现 `background -> parks -> water -> roads`，并记录替换前后的层级理由。
- [x] `CW-302` 在 SVG 渲染路径中实现与 PNG 相同的 parks/water 层级。
- [x] `CW-303` 移除 parks-water 视觉规则对 `enable_road_mask_optimization` 的依赖；该开关只控制 roads 是否避让 terrain。
- [x] `CW-304` 删除或隔离不再需要的 park-water 离屏 clear mask，确保没有遗留不可达路径。
- [ ] `CW-305` 用南京 fixture 在道路遮罩开、关两种配置下验证：玄武湖均为水色，紫金山仍为绿地。（WASM 旧产物已重建；待手工复测）
- [ ] `CW-306` 用同一 terrain fixture 验证 PNG 与 SVG 的 water-over-parks 语义一致。
- [x] `CW-307` 在 Overpass GeoJSON 转换后按 water/parks 标签语义过滤递归成员；南京 raw-water 中的 `place=island` 不得进入 water layer。（本地 raw 检查：13/13 已排除）

### Phase 4: 缓存迁移与诊断

- [x] `CW-401` 升级 `MAP_DATA_CACHE_VERSION`，隔离现有错误的 generated sea cache。（当前为 `v11-canonical-fetch-viewport-semantic-terrain-filtering`，同时隔离过滤前 terrain 缓存）
- [x] `CW-402` 覆盖缓存恢复路径：旧/无 provenance 的 water 数据不可被当作新生成器结果复用。
- [ ] `CW-403` 为 coastline 处理记录分阶段耗时：clip、merge、node、polygonize、classify、flatten。（已记录前 4 项；flatten 仍由既有 worker 总计时覆盖）
- [ ] `CW-404` 为每个 component 设置片段数、顶点数和耗时预算；超限时记录安全降级原因。（已实现全局 fragment/vertex 安全预算与结构化降级；component 级预算待补）
- [ ] `CW-405` 验证首次生成与缓存命中两条路径：命中缓存不重复 coastline 几何处理。

### Phase 5: 离线端到端回归与性能验收

- [ ] `CW-501` 创建/扩展离线 harness：相同 raw fixture 可驱动 data 处理、WASM PNG 和 SVG 输出，不调用浏览器或网络。
- [ ] `CW-502` 在 NYC fixture 上断言陆地/水域 probes，并保存 baseline 与新结果的原始输出和退出码。
- [ ] `CW-503` 在海口 fixture 上断言海面存在、生成 polygon 无自交、无异常陆地覆盖。
- [ ] `CW-504` 在南京 fixture 上断言水/绿地 probe 的最终颜色与图层关系。
- [ ] `CW-505` 分别记录 NYC、南京、海口的首次处理耗时、缓存命中耗时、1x/2x 导出耗时与峰值内存。
- [ ] `CW-506` 审核 performance data：`classify` 必须明显低于既有 noding/polygonize；若不满足，先优化索引/预算，不扩大策略范围。

## Validation Checklist

- [ ] `CV-01` `bun test src/services/sea-polygons.test.ts` 通过，包含新的正反方向、多陆地、冲突降级回归。
- [ ] `CV-02` 运行新增离线 fixture harness；E1、E2、E3 的原始输出、断言和退出码写入任务 reflection。
- [ ] `CV-03` 运行适用的 TypeScript/build 检查；退出码为 0。
- [ ] `CV-04` 检查 PNG 与 SVG 的纽约、南京、海口输出，确认没有仅单格式存在的回归。
- [ ] `CV-05` 手动验收实际导出：缓存失效后首次纽约、南京、海口导出；该项是 E4 的最终 acceptance gate。
- [ ] `CV-06` 再次导出相同位置，确认缓存命中且无重复 sea 分类耗时。
- [ ] `CV-07` 对不完整、反向冲突和超预算 coastline fixture 验证安全降级为“不补海”，而非覆盖陆地。

## Documentation Checklist

- [ ] `CD-01` 更新本计划的已实施决定、阈值含义和已知降级行为。
- [ ] `CD-02` 更新与海面生成相关的架构/开发文档，说明 raw water、generated sea 和 renderer 的职责边界。
- [ ] `CD-03` 为 provenance、预算与降级原因添加简洁代码注释。
- [ ] `CD-04` 记录缓存版本变更与用户可见影响：首次导出需要重新获取水体数据。
- [ ] `CD-05` 为任何未关闭的浏览器生命周期 acceptance gate 写出精确手工验证步骤。

## Cleanup Checklist

- [ ] `CC-01` 删除只服务于一次性排查的日志、下载 fixture 开关和实验性分支。
- [ ] `CC-02` 确认测试 fixture 不含用户本地绝对路径、密钥或临时下载文件名。
- [ ] `CC-03` 确认 coastline、sea、water、parks、terrain 的命名在 TS/Rust/测试中一致。
- [ ] `CC-04` 确认 cache/provenance 和所有错误信息包含可行动的降级或恢复说明。
- [ ] `CC-05` 运行格式化、类型检查与相关测试，检查工作树只保留预期实现、fixture、文档和 reflection 文件。

## Completion Criteria

- 纽约 raw fixture 的布鲁克林与泽西市 probes 不被 generated sea 覆盖；水域 probes 仍为水。
- 南京玄武湖在 PNG 和 SVG、道路遮罩开和关时均为水，紫金山等相邻绿地仍可见。
- 海口在高置信度 coastline 输入下继续补海；不确定输入安全降级而不填陆地。
- 所有新增 unit、fixture/integration、构建和缓存回归检查通过。
- E4 的实际导出 acceptance gate 已通过；若未运行，状态只能是 `mitigated` 或 `blocked`，不得称为完成。
- 旧生成器缓存被版本隔离，且没有临时调试路径或本地数据被提交。

## Reflection / Task Summary Generation

每完成一个带 ID 的 checklist 项，自动创建：

```text
docs/reflections/task-<task-id>-<timestamp>.md
```

模板：

```md
# Task <task-id>: <task name>

- Task:
- Evidence / command / exit code:
- Encountered Problem:
- Thought Process:
- Options Considered:
- Chosen Solution:
- Rationale:
- Acceptance-surface coverage: acceptance | supporting | diagnostic-only
- What this proves:
- What remains unproven:
- Next action rule:
```

对失败或降级项，reflection 必须记录 failure class（`transient`、`strategy`、`environment`、`policy`、`unknown`）和是否消耗了重试预算。
