请用 ai-friendly-web-design Skill 审查 $ARGUMENTS 文件。

对每个问题，输出：
- 文件路径 + 行号
- 违反了哪条原则
- 具体修改建议（附代码片段）

按严重程度排序：🔴 高（会导致 Agent 操作失败）/ 🟡 中 / 🟢 低
```

然后在 Claude Code 里就可以直接跑：
```
/review-ai-accessibility src/components/CheckoutForm.tsx
/review-ai-accessibility src/components/