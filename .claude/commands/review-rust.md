请参考以下 skill 作为 review 的判断标准，skill 中的代码示例即为推荐写法：

@.claude/skills/rust-wasm

---

## Review 检查项

对照上述 skill，重点检查以下方面：

1. **Cargo.toml 配置** - crate-type 是否包含 cdylib、release profile 是否有 lto/opt-level
2. **wasm-bindgen 接口** - 类型映射是否合理、复杂类型是否用 serde_wasm_bindgen
3. **内存管理** - Closure 是否正确处理（forget 或主动释放）、大数据是否用 typed arrays
4. **错误处理** - 是否返回 Result<_, JsValue>、panic 是否可能泄漏到 JS 层
5. **异步处理** - JsFuture 的使用是否正确
6. **体积优化** - 是否遵循 Best Practices 中的优化建议

## 输出格式

**总体评价**：一句话总结

**问题列表**（按严重程度排序）：
- 🔴 严重：...
- 🟡 建议：...
- 🟢 优化：...

**修改建议**：给出具体的代码改写示例，参照 skill 中的推荐写法

---

现在请 review 以下文件：$ARGUMENTS