仔细阅读位于 .claude/skills/animation-best-practices/SKILL.md 的动画最佳实践 skill，然后再开始操作。

---

## 项目背景

- 技术栈：React + TypeScript + Tailwind CSS + Vite
- 当前状态：前端页面完全没有动画效果
- 可以按需安装动画相关依赖（如 framer-motion、tailwindcss-animate 等），但优先使用 Tailwind CSS 内置的 transition / animate 工具类解决

---

## 动画风格基调

整体风格定位为**轻盈克制**：
- 时长控制在 150ms ~ 400ms 之间
- 缓动函数优先使用 ease-out / ease-in-out
- 避免过度动效，动画应服务于功能（反馈、引导、层级），而非单纯装饰

---

## 执行步骤

1. **审查代码库**，识别所有没有动画的关键 UI 元素，包括但不限于：
   - 页面/路由切换
   - 列表与卡片的进入/退出
   - 按钮、链接的 hover / active 状态
   - 弹窗、抽屉、Tooltip 的出现与消失
   - 加载态与骨架屏
   - 表单反馈（错误提示、成功状态等）

2. **严格遵循 skill 中的所有规范**，包括工具类命名、组合方式和禁止事项

3. **性能要求**（必须遵守）：
   - 只对 `transform` 和 `opacity` 做动画，禁止直接动画 `width`、`height`、`top`、`left` 等会触发 layout 的属性
   - 对持续动画元素添加 `will-change: transform` 或 `translateZ(0)` 以启用 GPU 合成层
   - 避免在同一帧内读写 DOM 尺寸（防止 layout thrashing）

4. **无障碍支持**：所有动画必须包裹在 `prefers-reduced-motion` 媒体查询或 Tailwind 的 `motion-safe:` / `motion-reduce:` 变体中

5. **不得修改任何业务逻辑**，只允许新增动画相关的类名、样式和必要的包装元素

---

## 输出要求

完成后输出一份改动摘要，格式如下：

| 文件路径 | 涉及元素 | 动画类型 | 使用技术 | 选择理由 |
|----------|----------|----------|----------|----------|

最后注明是否安装了新依赖，以及安装原因。