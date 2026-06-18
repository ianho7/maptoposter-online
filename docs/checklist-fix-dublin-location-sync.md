# Checklist Objective

修复 `Ireland / Dublin` 选择后导出仍使用旧地点，以及刷新后坐标落成 `0,0` 的问题，同时避免影响已有正常地区的精确解析路径。

- Target outcome: UI 选择、预览、导出、刷新恢复都一致指向 Dublin / Ireland 的真实坐标
- Scope: `src/App.tsx` 的地点状态流转、异常地点解析兜底、相关测试
- Non-goals: 不更换第三方地点数据源；不重做整套 location UI；不把全局匹配策略改成宽松模糊匹配

---

# Pre-Implementation Checks

- [x] 确认目标模块：`src/App.tsx`、`src/services/location-service.ts`、相关测试文件
- [x] 复查当前地点恢复与导出链路：`handleStateChange`、`handleCityChange`、localStorage restore、`handleDownload`
- [x] 确认 Dublin 数据异常事实：`Ireland/Dublin` 州和 `Dublin` 城市不在同一 `state_id`
- [x] 确认现有正常路径依赖 `state_id` 精确匹配，不能被 fallback 覆盖
- [x] 确认可用验证命令：`npm run build`、`npm run type-check` 或 `bun run type-check`
- [x] 确认是否已有 location 相关测试文件可扩展，避免把回归只留在手测

---

# Implementation Checklist

## Phase 1: Isolate Resolution Logic

- [x] 提取单一的 location 解析函数，统一处理国家、州、市、区到最终导出 location 的映射（on completion, automatically generate reflection.md）
- [x] 明确解析优先级：先走 `state_id` 精确链路，只有失败时才进入兜底分支（on completion, automatically generate reflection.md）
- [x] 将 restore 流程和交互变更流程复用同一套解析函数，减少 `selected*` 与 `location` 分叉（on completion, automatically generate reflection.md）

## Phase 2: Add Narrow Fallback For Broken Data

- [x] 为 Dublin 这类异常数据实现受限兜底，仅在精确 `state_id` 解析失败时启用（on completion, automatically generate reflection.md）
- [x] 将兜底限制在可验证条件内：同国家、同名 region、或 `state.iso2` / `city.stateCode` 可交叉验证（on completion, automatically generate reflection.md）
- [x] 禁止把宽泛模糊名称匹配作为主路径，避免误伤正常地区（on completion, automatically generate reflection.md）
- [x] 禁止在“仅名称已知但坐标未解析”时静默写入 `{ lat: 0, lng: 0 }` 作为正常 location（on completion, automatically generate reflection.md）

## Phase 3: Stabilize Restore And Export State

- [x] 修复 restore 流程中的异步覆盖问题，避免旧 `config.location` 在新选择后仍被导出使用（on completion, automatically generate reflection.md）
- [x] 检查 `handleCountryChange`、`handleStateChange`、`handleCityChange`、`handleDistrictChange` 的自动首项选择是否会覆盖用户明确选择，并补保护（on completion, automatically generate reflection.md）
- [x] 确保导出只读取已解析完成的最终 location，而不是半更新状态（on completion, automatically generate reflection.md）

## Phase 4: Lock Down Regressions

- [x] 添加最小回归测试，覆盖 Dublin 这种州/城市层级断裂时仍能得到正确坐标（on completion, automatically generate reflection.md）
- [x] 添加 restore 相关测试，覆盖“刷新后不应变成 `0,0`”的场景（on completion, automatically generate reflection.md）
- [x] 添加正常地区保护样本，确保 `Paris`、`Shanghai`、`New York` 不因 fallback 改动而回归（on completion, automatically generate reflection.md）
- [x] 如难以直接测试 UI，至少补纯函数级 location resolution 测试，确保核心逻辑可验证（on completion, automatically generate reflection.md）

---

# Validation Checklist

- [x] 运行类型检查，预期无新增 TypeScript 错误
- [x] 运行构建，预期前端可正常打包
- [x] 手动验证 `Ireland -> Dublin -> Dublin -> Dublin` 导出结果，预期国家与坐标一致
- [x] 手动刷新页面后验证预览，预期仍保持 Dublin 且不出现 `0.0000, 0.0000`
- [x] 验证 `France / Ile-de-France / Paris`，预期仍走精确解析且结果不变
- [x] 验证 `China / Shanghai / Shanghai`，预期仍走精确解析且结果不变
- [x] 验证 `United States / New York / New York`，预期不会因同名州/市引入误配
- [x] 验证仅切换标题不会影响导出地点元数据
- [x] 验证 district API 返回空时，仍保留有效城市坐标而不是回退到 `0,0`

---

# Documentation Checklist

- [x] 为非直观的 Dublin/断链兜底逻辑补简短代码注释
- [x] 记录 fallback 触发条件，明确它只服务于异常数据，不改变正常解析语义
- [x] 如新增了解析辅助函数，为其补使用意图说明
- [x] 如测试体现第三方数据源缺陷，在注释中明确记录该约束

---

# Cleanup Checklist

- [x] 移除调试日志或临时诊断分支
- [x] 清理重复的 location fallback 代码
- [x] 确保命名一致，区分“用户选择值”和“已解析导出值”
- [x] 确保错误/空值处理明确，不再把 `0,0` 当作隐式成功
- [x] 确保不会提交本地诊断文件或临时脚本

---

# Completion Criteria

- Required behavior: 选择 Dublin 后，预览、导出、刷新恢复都显示 Dublin / Ireland 的正确元数据
- Required tests: 至少有一条自动化回归覆盖 Dublin 断链场景；类型检查和构建通过
- Required documentation: 非显然兜底逻辑有注释；如生成 reflection，则落在 `docs/reflections/`
- Acceptable known limitations: 仍依赖第三方地点数据源，其他少数异常地区可能还需要单独兜底
- Final repository state: 无临时调试代码；正常地区仍保持 `state_id` 精确匹配优先；异常数据才走受限 fallback；不会再因 restore 或数据断链导出旧坐标或 `0,0`

---

# Reflection / Task Summary Generation

执行时为每个完成项生成：

`docs/reflections/task-<task-id>-<timestamp>.md`

内容模板：

- Task: `<task name>`
- Encountered Problem: `<problem description>`
- Thought Process: `<how problem was analyzed>`
- Options Considered: `<list of solutions considered>`
- Chosen Solution: `<final decision>`
- Rationale: `<reason for choosing this solution>`
