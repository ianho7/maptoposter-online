# Nominatim 扩展自定义 POI — 实施 Checklist

## Checklist 目标

- **目标成果**：在现有“旅行图钉”管理对话框中加入 Nominatim 搜索；中国大陆默认高德，其余地区默认 Nominatim；两者输出统一为可保存、可渲染的自定义 POI。
- **范围**：服务选择 UI、搜索适配器、POI 来源元数据、Nominatim Worker + Durable Object、缓存与限流、i18n、验证及部署文档。
- **非目标**：同时展示两个服务的混合结果；地图视窗硬边界；自动跨服务回退；将服务选择保存到海报配置；修改高德直连方式；Nominatim 的输入联想。

## 已确认的产品约束

- [x] 仅 ISO `CN` 默认高德；港澳台与其他地区默认 Nominatim。
- [x] 用户可在当前弹窗会话手动切换服务；重新打开弹窗或切换地点后恢复默认服务。
- [x] 高德保留 300ms 防抖即时搜索及用户自备 Key；仅高德模式显示 Key 配置与测试。
- [x] Nominatim 仅由 Enter 或搜索按钮提交；显示 OpenStreetMap 署名。
- [x] Nominatim 查询采用“地点词 + 当前城市 + 当前国家”、`countrycodes=<ISO2>` 硬过滤与当前 UI 语言；第一版不使用地图视窗硬边界。
- [x] 新增的 Nominatim 代理独立部署为 Cloudflare Worker + Durable Object；不恢复已删除的高德 Worker。
- [x] POI 保存来源命名空间（如 `amap:<id>`、`nominatim:<osm_type><osm_id>`）；不在已保存 POI 列表重复展示来源。

## 前置检查

- [x] N0-1：确认当前国家选择数据可稳定提供 ISO2，并定位 `src/App.tsx` 向 `POIManagementDialog` 传递国家、城市与界面语言的最小 props。（完成后生成 reflection）
- [ ] N0-2：核验 Nominatim 当前使用政策、Search API 参数及 OSM 署名要求，并将最终端点、请求头和速率限制写入部署文档。（完成后生成 reflection）
- [ ] N0-3：确认 Cloudflare 账号、Worker 部署方式、可用域名路由，以及 Durable Object 的绑定名称和迁移配置。（完成后生成 reflection）
- [x] N0-4：确定项目现有测试工具；如没有适合的单元测试运行器，为纯搜索适配器选择最小测试方案。（完成后生成 reflection）

## 实施 Checklist

### Phase 1：领域模型与服务选择

- [x] N1-1：在 `src/lib/types.ts` 定义 `PoiSearchProvider`（`"amap" | "nominatim"`）及规范化搜索结果类型。（完成后生成 reflection）
- [x] N1-2：扩展 `CustomPOI` 的可选来源字段或规范化 `sourceId`，确保新图钉使用服务命名空间、旧图钉可继续读取。（完成后生成 reflection）
- [ ] N1-3：新增纯函数：根据 ISO2 返回默认服务（仅 `CN`→`amap`），并为 CN、HK、MO、TW、非中国国家添加测试。（完成后生成 reflection）
- [x] N1-4：重构现有高德响应映射与去重逻辑，使其消费统一结果；保留 GCJ-02→WGS-84 转换。（完成后生成 reflection）

### Phase 2：Nominatim 代理与运行时约束

- [x] N2-1：创建独立的 Nominatim Cloudflare Worker，定义受控的 `/search` 请求与统一 JSON 响应契约。（完成后生成 reflection）
- [x] N2-2：在 Worker 中校验查询、城市、国家 ISO2 与语言参数；拒绝未知参数及空/过短查询。（完成后生成 reflection）
- [x] N2-3：实现查询构造：地点词、当前城市、当前国家、`countrycodes`、`accept-language`、有限结果数与 `addressdetails=1`；不发送 `viewbox`/`bounded`。（完成后生成 reflection）
- [x] N2-4：以 Durable Object 串行化上游请求，确保整个应用对公开 Nominatim 最多 1 次/秒；缓存命中不进入上游队列。（完成后生成 reflection）
- [x] N2-5：以 Cloudflare Cache API 缓存规范化成功结果与安全的短期空结果；为缓存键纳入查询、城市、国家与语言。（完成后生成 reflection）
- [x] N2-6：设置可识别应用的上游请求头，映射上游超时、429 和非成功响应为不泄露内部细节的错误。（完成后生成 reflection）
- [ ] N2-7：在本地 Worker 测试或 mock 中验证：缓存命中、节流、参数校验、上游错误和标准响应映射。（完成后生成 reflection）

### Phase 3：对话框 UI 与前端搜索流

- [ ] N3-1：更新 `POIManagementDialog` props，接收当前 ISO2、城市、国家显示名、界面语言及 Nominatim 代理基址。（完成后生成 reflection）
- [ ] N3-2：在搜索区最顶部添加服务选择器，默认值由 ISO2 推导；切换值只保留在 Dialog 组件状态中。（完成后生成 reflection）
- [ ] N3-3：高德模式仅显示现有 Key 输入、测试按钮和即时搜索；Nominatim 模式隐藏这些配置。（完成后生成 reflection）
- [ ] N3-4：Nominatim 模式实现显式搜索按钮与 Enter 提交，阻止输入事件、300ms 防抖或状态刷新自动发起请求。（完成后生成 reflection）
- [ ] N3-5：调用 Nominatim Worker，取消过期请求；将返回项映射为 WGS-84 统一结果并显示名称与精简地址。（完成后生成 reflection）
- [ ] N3-6：在 Nominatim 结果区域显示当前服务名和 `© OpenStreetMap contributors` 署名链接；高德模式显示当前服务名但不显示 OSM 署名。（完成后生成 reflection）
- [ ] N3-7：复用统一去重逻辑，确保跨服务同一 ID 不冲突、同名近坐标结果仍可阻止重复添加。（完成后生成 reflection）
- [ ] N3-8：确保更改国家、关闭后重开 Dialog 或重新进入 POI 管理时服务恢复默认值，不写入导出配置/localStorage。（完成后生成 reflection）

### Phase 4：文案、配置与部署

- [ ] N4-1：为所有支持语言添加服务选择、Nominatim 搜索按钮、显式提交提示、来源名称、结果/错误状态与 OSM 署名的 i18n key。（完成后生成 reflection）
- [ ] N4-2：记录 Worker 的环境/绑定、Durable Object migration、部署命令、域名路由、缓存行为及可替换上游接口。（完成后生成 reflection）
- [ ] N4-3：更新 README 中的 POI 搜索说明：高德为用户 Key 直连；海外 Nominatim 经应用代理且遵守其使用限制。（完成后生成 reflection）

## 验证 Checklist

- [ ] V1：纯函数测试：CN 默认高德，HK/MO/TW/US/FR 默认 Nominatim。（完成后生成 reflection）
- [ ] V2：高德回归：输入后即时搜索、Key 测试、GCJ-02→WGS-84 转换和添加 POI 均保持有效。（完成后生成 reflection）
- [ ] V3：Nominatim 请求仅由 Enter 或按钮触发；连续输入不产生上游请求。（完成后生成 reflection）
- [ ] V4：Nominatim 请求包含城市/国家语境、`countrycodes`、UI 语言；不包含 `viewbox` 或 `bounded`。（完成后生成 reflection）
- [ ] V5：Worker：同一缓存键第二次请求不访问 Nominatim；不同语言或国家不会错误复用缓存。（完成后生成 reflection）
- [ ] V6：Worker：并发未命中请求在 Durable Object 中限为最多 1 次/秒上游调用。（完成后生成 reflection）
- [ ] V7：UI：切换服务仅在当前对话框会话有效；关闭重开和变更地点后回到默认服务。（完成后生成 reflection）
- [ ] V8：UI：高德模式显示 Key 配置，Nominatim 模式隐藏它并显示 OSM 署名。（完成后生成 reflection）
- [ ] V9：数据兼容：旧 `CustomPOI` 无来源字段时能加载、编辑、渲染；新图钉来源 ID 有命名空间。（完成后生成 reflection）
- [ ] V10：去重：高德与 Nominatim 的同一裸 ID 不会相互误判；相同地址且近坐标仍能被阻止重复。（完成后生成 reflection）
- [ ] V11：错误处理：Nominatim 无结果、429、网络错误和代理错误均可读、无崩溃、可再次提交。（完成后生成 reflection）
- [ ] V12：运行 `bun run build`；期望 Paraglide 编译、TypeScript 检查和 Vite 构建全部通过。（完成后生成 reflection）
- [ ] V13：部署后手动冒烟：CN 与非 CN 地点各添加一个图钉，刷新后保存状态与海报渲染正确。（完成后生成 reflection）

## 文档 Checklist

- [ ] D1：在 `docs/` 记录搜索提供商边界、坐标系差异和来源 ID 规则。（完成后生成 reflection）
- [ ] D2：在部署文档记录 Nominatim 使用政策链接、OSM 署名和更换上游服务的步骤。（完成后生成 reflection）
- [ ] D3：为 Worker 的缓存、队列与错误转换添加必要注释，避免将其误改为客户端自动补全。（完成后生成 reflection）

## 清理 Checklist

- [ ] C1：确认不重新引入 `workers/amap-proxy`、`/api/amap-proxy/` 或高德后端转发逻辑。（完成后生成 reflection）
- [ ] C2：删除测试用缓存键、临时 Worker URL、调试日志和未使用的适配器。（完成后生成 reflection）
- [ ] C3：检查配置、文档和提交记录中没有 API Key、私有 Worker URL 或本地绝对路径。（完成后生成 reflection）

## Completion Criteria

- 中国大陆与海外地点各自默认正确服务，且用户能在当前 Dialog 会话中切换。
- 高德既有行为无回归；Nominatim 不实现自动补全，并经过 Worker 的缓存、全局节流和可替换上游层。
- 新旧图钉均能加载、去重、编辑并渲染；新图钉来源标识不冲突。
- 所有新增文案有翻译，Nominatim 显示 OSM 署名。
- 聚焦测试、Worker 验证、手动冒烟与 `bun run build` 均提供可复查证据。
- 已知限制：首期仅限制到国家与城市语境，不使用地图视窗或城市行政边界硬过滤；不自动跨服务回退。

## Reflection / Task Summary Generation

每个完成项必须在同一轮生成 `docs/reflections/task-<task-id>-<timestamp>.md`，格式如下：

```md
- Task: <task name>
- Encountered Problem: <problem description>
- Thought Process: <analysis>
- Options Considered: <alternatives>
- Chosen Solution: <decision>
- Rationale: <why it was chosen>
```
