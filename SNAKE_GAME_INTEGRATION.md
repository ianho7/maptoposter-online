# 贪吃蛇游戏整合到 Loading 界面

## 背景

首次下载新城市数据时需要 1-3 分钟等待时间，用户容易感到枯燥。SnakeGame 贪吃蛇游戏组件可以缓解这种等待感。

## 需求

1. 生成图片时，在 loading 最下方展示 SnakeGame 入口按钮
2. 图片生成完毕时：
   - 若游戏未打开：正常关闭 loading
   - 若游戏已打开：不关闭 loading，修改文字提示用户已完成，让用户自行关闭

## 已完成的修改

### 1. SnakeGame.tsx 修改

添加 `onOpenChange` prop，让父组件感知游戏打开/关闭状态：

```tsx
export interface SnakeGameProps {
  // ... existing props
  /** Callback when game modal open state changes */
  onOpenChange?: (open: boolean) => void
}
```

组件内部通过 `handleSetOpen` 包装 `setOpen`，同时触发回调：

```tsx
const handleSetOpen = useCallback((value: boolean) => {
  setOpen(value)
  onOpenChange?.(value)
}, [onOpenChange])
```

### 2. App.tsx 修改

- 导入 SnakeGame 组件
- 添加 state 和 ref：
  - `isGameOpen` - 跟踪游戏是否打开
  - `generationCompleteRef` - 跟踪生成是否完成（避免闭包问题）
- 生成开始时重置 ref
- 生成完成时设置 ref 为 true
- finally 块：如果游戏未打开才关闭 loading
- loading overlay 底部添加 SnakeGame 入口按钮
- 生成完成 + 游戏打开时显示 `game_complete_hint` 提示
- 游戏关闭时：如果生成已完成则关闭 loading

### 3. 多语言消息

添加到 8 个语言文件（en, zh-CN, ja, ko, fr, de, es, ru）：

- `snake_game_trigger`: 游戏入口按钮文字（如 "消消时间"、"Kill Time"）
- `game_complete_hint`: 生成完成时提示（如 "图片已生成！请关闭游戏后继续"）

## 当前问题

用户反馈：生成完成后，正在进行的游戏被直接关闭了。

### 问题分析

用户点击 loading 遮罩背景关闭游戏时，`SnakeGame` 的 `close()` 函数**确实被调用了**（代码 `onClick={e => { if (e.target === e.currentTarget) close() }}`），会清除 timer 并设置 `open = false`。

但问题可能在于：当用户还没来得及点击关闭游戏，生成就完成了，此时：

1. `generationCompleteRef.current = true`
2. `finally` 块中因为 `isGameOpen = true`，不执行 `setIsGenerating(false)`
3. loading overlay 保持显示

但此时 SnakeGame 组件仍在渲染中（因为 loading overlay 包裹着它），游戏应该继续运行。

**可能的原因**：SnakeGame 内部的 `open` 状态被意外重置？

让我检查一下 `onOpenChange` 回调的逻辑：

```tsx
onOpenChange={(open) => {
  setIsGameOpen(open);
  if (!open && generationCompleteRef.current) {
    setIsGenerating(false);
    generationCompleteRef.current = false;
  }
}}
```

这个回调在 `handleSetOpen` 中被调用，当 `open = false` 时会触发。

但这不应该导致游戏被关闭，因为游戏是否显示是由 SnakeGame 内部的 `open` state 决定的，`onOpenChange` 只是通知父组件。

## 待排查

需要进一步确认用户操作的具体场景：
1. 用户是否在生成完成前就关闭了游戏？
2. 生成完成时游戏是否仍在运行？
3. 关闭游戏的操作是什么（点击遮罩？点击关闭按钮？按 ESC？）？

建议添加调试日志或进行实际测试来确认具体问题。
