# Nominatim POI 实施闭环

## Loop Spec

**层级**：运行时级编码闭环；产品取舍已由开发者反馈环确认，不在编码过程中重新猜测。

### Goal

- 交付 `docs/checklist-nominatim-poi.md` 所定义的海外 Nominatim POI 搜索扩展。
- 完成证据：各项 V1–V13 的命令输出、测试结果、部署/冒烟记录和对应 reflection 文件。

### State

- **事实来源**：`docs/checklist-nominatim-poi.md` 的勾选状态、`docs/reflections/`、git diff、测试输出。
- **每轮持久状态**：当前 checklist 项、改动文件、最后验证结果、失败分类、重试次数、下一步假设。
- **不持久化**：冗长工具输出；保留命令、退出码和必要的失败摘要即可。

### Planner

- 从最早一个未完成且其依赖已满足的 N 项开始。
- 优先完成可降低后续风险的纯函数/契约与 Worker 参数校验，再做 UI，最后部署和端到端冒烟。
- 验证失败时，只重试直接相关的最小任务；两次同类策略失败后，回到 checklist 更新假设或请求开发者决策。

### Actor

- 可安全修改工作区中的前端、Worker、测试与文档。
- 部署 Worker、绑定 Durable Object、配置域名、使用真实 API Key 或提交外部请求前，必须取得所需权限与配置。
- 每完成一个原子任务，立即生成 checklist 所要求的 reflection 文档。

### Observer

- 捕获 git diff、测试命令、构建命令、Worker 本地测试和部署输出。
- 将观察与解释分离：先记录退出码/响应/断言，再决定是否推进。

### Verifier

1. 纯函数与请求契约测试；
2. Worker 缓存、参数校验与全局节流测试；
3. TypeScript/Paraglide/Vite：`bun run build`；
4. 已部署服务的手动 UI 冒烟（CN 与非 CN 各一次）。

通过标准是独立验证满足当前 checklist 项，而不是仅凭实现代码“看起来合理”。

### Failure Semantics

| 分类 | 首次处置 | 上限/升级条件 |
|---|---|---|
| Transient（网络、临时上游 5xx） | 原样重试一次 | 第二次失败：记录并延后，避免重复请求上游 |
| Strategy（测试失败、契约不匹配） | 检查最小 diff 和测试假设后改策略 | 两次后：更新 checklist/请求产品或架构决策 |
| Environment（Cloudflare 账号、绑定、域名缺失） | 收集精确缺失项 | 不尝试绕过；请求开发者提供配置 |
| Policy（权限、配额、公开服务限制） | 停止高风险动作 | 请求授权或切换已确认的替代上游 |
| Unknown | 缩小为可复现的单元测试或 mock | 两次无法分类：人工接管 |

### Exit Conditions

- **Complete**：Completion Criteria 全部满足，所有 required reflection 与验证证据存在。
- **Blocked**：连续三轮因同一外部配置/权限问题无法取得进展，或需要新的产品决策。
- **Risk exit**：下一步会违反 Nominatim 使用政策、暴露密钥或未经授权部署。
- **Human takeover**：需要提供 Cloudflare 凭据、域名路由、部署许可或真实环境验收。

### Policy

- 不把 Nominatim 实现为客户端自动补全；不取消全局节流；不将高德改回代理。
- 不将 Key、私有 Worker URL 或机密配置写入代码、reflection 或 README。
- 外部部署和真实上游验证必须在用户授权与资源到位后进行。

## Round Template

```md
Current task: N<phase>-<item>
Evidence from previous round: <command / assertion / diff>
Hypothesis: <what the next smallest change will prove>
Action: <one atomic edit or verifier>
Result: <raw concise observation>
Decision: continue | replan | blocked | complete
Reflection: docs/reflections/task-<id>-<timestamp>.md
```

## Goal Recommendation

该任务涉及前端、Worker、Durable Object、外部部署与多轮验证，适合在开始实施时建立一个持久化 goal；当前仅建立计划文档，不创建 goal。
