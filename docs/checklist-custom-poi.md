# 自定义 POI（图钉）功能 — 实现 Checklist

## Checklist 目标

- **目标成果**: 用户可通过高德地图 API 搜索地点，选中后添加为自定义 POI，分配类型，生成海报时渲染为圆点
- **范围**: 导航、配置区块、管理弹窗、WASM 渲染、i18n、持久化
- **非目标**: SVG 按类型渲染、多搜索源、地图预览标记、拖拽排序

---

## 前置检查

- [x] 确认 `docs/plan-mvp-custom-poi.md` 已通读且无异议
- [x] 确认 CF Worker 代理端点（默认 `/api/amap-proxy/`）
- [x] 确认高德 API Key 申请流程文档（用户自行申请，免费版 5000 次/天）
- [x] 确认 `showPois` 迁移策略：旧 localStorage 数据兼容
- [x] 构建命令确认: `cd wasm && wasm-pack build --target web --out-dir ../src/pkg`
- [x] 类型检查命令确认: `bun run tsc --noEmit`

---

## 实现 Checklist

### Phase 1: 基础 — 类型、i18n、状态、导航、开关迁移

- [x] P1-1: 在 `src/lib/types.ts` 中定义 `PoiSource` 类型 (`"off" | "overpass" | "custom"`)
- [x] P1-2: 在 `src/lib/types.ts` 中定义 `POI_TYPE_CATEGORIES` 常量（15 个类别，含 id、中英文名）
- [x] P1-3: 在 `src/lib/types.ts` 中定义 `CustomPOI` 接口 (`{ id, name, lat, lng, poiType }`)
- [x] P1-4: 在 `messages/en.json` 中添加所有新 i18n key（约 35 个）
- [x] P1-5: 在 `messages/zh.json` 中添加中文翻译
- [x] P1-6: 在 `messages/ja.json` ~ `messages/ru.json` 中添加英文占位 key（6 个语言文件）
- [x] P1-7: 在 `src/App.tsx` 中将 `showPois: boolean` 替换为 `poiSource: PoiSource`
- [x] P1-8: 在 `src/App.tsx` 中添加 `customPois: CustomPOI[]` 和 `amapApiKey: string` 状态
- [x] P1-9: 在 `src/App.tsx` 中扩展 localStorage 持久化：新增字段 + 旧 `showPois` 迁移逻辑
- [x] P1-10: 更新 `src/components/render-control-settings.tsx`：`showPois` 复选框 → POI 来源三段式单选
- [x] P1-11: 在 `src/App.tsx` 的 navSections 中添加 `section-custom-pois`（图标: lucide `Pin`）
- [x] P1-12: 创建 `src/components/custom-poi-settings.tsx`：配置区块（功能简介 + "管理"按钮）
- [x] P1-13: 创建 `src/components/poi-management-dialog.tsx` 外壳：空的两栏 Dialog 布局
- [x] P1-14: 在 `src/App.tsx` 中渲染 `<CustomPOISettings>` 和 `<POIManagementDialog>`，连接 props

### Phase 2: WASM — Rust 类型、配置扩展、无上限渲染

- [x] P2-1: 在 `wasm/src/types.rs` 中添加 `CustomPOI` 结构体（name, lat, lon, poi_type）
- [x] P2-2: 在 `wasm/src/lib.rs` 的 `BinaryRenderConfig` 中添加 `custom_pois: Option<Vec<CustomPOI>>` 字段
- [x] P2-3: 在 `wasm/src/renderer.rs` 中添加 `draw_custom_pois` 方法（无 MAX_POIS 上限，保留 poi_type 以备将来 SVG）
- [x] P2-4: 在 `wasm/src/lib.rs` 的 `render_map_binary_internal` 中添加自定义 POI 投影 + 渲染调用
- [x] P2-5: 在 `wasm/src/svg_renderer.rs` 中镜像自定义 POI 渲染（SVG 导出路径）
- [x] P2-6: 在 `wasm/src/lib.rs` 的 `render_map_binary_svg` 中添加自定义 POI 渲染
- [x] P2-7: 在 `src/App.tsx` 下载管线中：`poiSource === "custom"` 时传递 `custom_pois` 到 config JSON
- [x] P2-8: 编译 WASM: `cd wasm && wasm-pack build --target web --out-dir ../src/pkg`

### Phase 3: UI — POI 管理弹窗

- [x] P3-1: 实现弹窗左栏-上部：API Key 输入框（密码遮蔽）+ "测试"按钮 + 内联反馈
- [x] P3-2: 实现弹窗左栏-下部：搜索输入框（300ms 防抖）+ CF Worker 代理调用高德 API
- [x] P3-3: 实现搜索结果列表（可滚动，每条显示名称+地址，右侧"+"按钮）
- [x] P3-4: 实现搜索状态：空闲、加载中（spinner）、有结果、无结果、错误
- [x] P3-5: 实现弹窗右栏-头部："我的 POI" + 数量角标
- [x] P3-6: 实现已添加 POI 列表项：名称（截断）、类型下拉框、↑、↓、✕ 删除
- [x] P3-7: 实现排序按钮禁用逻辑：首项 ↑ 禁用，末项 ↓ 禁用
- [x] P3-8: 实现去重：通过高德 `id` 或名称+坐标匹配，阻止重复添加
- [x] P3-9: 实现右栏空状态提示文字
- [x] P3-10: 连接弹窗与 App.tsx 的 `customPois` / `setCustomPois` / `amapApiKey` / `setAmapApiKey`

### Phase 4: 集成与收尾

- [ ] P4-1: 端到端测试：搜索 → 添加 5+ 个 POI → 排序 → 设类型 → 选 "Custom" → 下载 → 5 个圆点全部渲染
- [ ] P4-2: POI 来源切换验证：off / overpass / custom 三种状态各自正确
- [ ] P4-3: 向后兼容验证：旧 `showPois: true` 自动迁移为 `poiSource: "overpass"`
- [ ] P4-4: localStorage 持久化验证：API Key、POI 列表、poiSource 刷新后恢复
- [ ] P4-5: 错误处理排查：无效 API Key、CF Worker 宕机、高德限流、网络错误、空搜索
- [ ] P4-6: i18n 验证：切换到中文，所有新增文本翻译正确
- [ ] P4-7: 弹窗状态卫生：关闭/重开保持数据；"完成"按钮 和 "✕" 均可关闭
- [ ] P4-8: SVG 导出验证：自定义 POI 出现在 SVG 输出中
- [ ] P4-9: 回归验证：`poiSource === "overpass"` 时 Overpass POI 正常工作（50 上限不变）

---

## 验证 Checklist

- [ ] V1: 导航可见 — "图钉" 出现在侧边栏，scroll-spy 正确联动
- [ ] V2: 配置区块 — 功能描述 + "管理"按钮 正常显示
- [ ] V3: 弹窗打开/关闭 — 按钮打开，✕ / 完成 关闭，数据保留
- [ ] V4: API Key 测试（有效）— 绿色成功提示
- [ ] V5: API Key 测试（无效）— 红色错误提示 + 原因
- [ ] V6: 搜索结果 — 名称+地址列表；加载中显示 spinner
- [ ] V7: 搜索无结果 — "未找到结果" 空状态
- [ ] V8: 搜索错误 — 错误消息，不崩溃
- [ ] V9: 添加 POI — 点击"+" → 条目出现在右栏
- [ ] V10: 去重 — 同一结果点两次 "+" → 仅添加一条
- [ ] V11: 上移/下移 — 箭头移动条目；首项 ↑ 禁用，末项 ↓ 禁用
- [ ] V12: 类型切换 — 下拉框更改类型
- [ ] V13: 删除 — ✕ 移除条目
- [ ] V14: 空列表状态 — "尚未添加 POI" 提示
- [ ] V15: 来源=off — 海报无 POI 圆点
- [ ] V16: 来源=overpass — Overpass POI 正常，50 上限（无回归）
- [ ] V17: 来源=custom — 所有自定义 POI 全部渲染（无上限验证）
- [ ] V18: 50+ 自定义 POI — 全部渲染（上限验证）
- [ ] V19: SVG 导出 — 自定义 POI 在 SVG 中可见
- [ ] V20: 持久化 — 刷新后 API Key、POI 列表、poiSource 均恢复
- [ ] V21: 向后兼容 — 旧 `showPois: true` → 迁移为 `poiSource: "overpass"`
- [ ] V22: 中文 i18n — 所有新增文本为中文

---

## 文档 Checklist

- [x] 在 README 或 FAQ 中说明如何申请高德 API Key
- [x] 记录 CF Worker 代理的部署步骤（如有）
- [x] 在代码中为非显而易见的逻辑添加注释（如去重策略、迁移逻辑）

---

## 清理 Checklist

- [ ] 删除实验性/临时代码
- [ ] 删除调试日志
- [x] 确认命名一致性：`customPois` / `CustomPOI` / `poiSource` / `poiType`
- [x] 确认错误消息清晰易读
- [x] 确认无 API Key 或密钥硬编码
- [x] 确认无本地路径泄露

---

## 完成标准

| 标准 | 描述 |
|---|---|
| 功能行为 | 用户可搜索→添加→排序→设类型→生成海报→看到自定义 POI 圆点 |
| POI 来源切换 | off / overpass / custom 三种状态均正确工作，互斥 |
| 无上限渲染 | 自定义 POI 全部渲染，不受 50 上限约束 |
| 持久化 | API Key、POI 列表、来源选择在刷新后恢复 |
| 向后兼容 | 旧 `showPois` 自动迁移，不报错 |
| i18n | 英文 + 中文翻译完整，其他 6 语言回退到英文 |
| Overpass 回归 | 来源=overpass 时原有功能不受影响 |
| 已知限制 | 无 SVG 按类型渲染、无地图预览 POI、无双源同时渲染、无拖拽排序 |

---

## 已知限制（可接受）

1. 所有自定义 POI 渲染为相同颜色的圆点（使用主题 `poi_color`），不做按类型区分
2. 仅支持高德地图单一搜索源（通过 CF Worker 代理）
3. 排序仅支持 ↑↓ 按钮逐位移动，不支持拖拽
4. 搜索结果不使用城市/位置偏置过滤
5. 自定义 POI 不显示在交互式地图预览上
6. POI 来源为互斥单选，不支持同时渲染两个来源
