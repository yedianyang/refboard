# CLAUDE.md - RefBoard 项目规范

## 代码规范

### 组件化
- **每个功能用独立组件实现**
- 前端：每个功能一个 JS 模块（如 `src/text-tool.js`, `src/shape-tool.js`）
- 后端：每个功能一个 Rust 模块（如 `src-tauri/src/storage.rs`）
- 避免在单个文件中堆积多个功能

### 文档
- 每个组件/模块顶部写功能说明
- 公开函数写 JSDoc / Rustdoc 注释
- 复杂逻辑写行内注释

### 提交规范
- 每完成一个核心功能，**测试通过后**再 commit
- commit message 格式：`feat: xxx` / `fix: xxx` / `docs: xxx`
- 不要积攒多个功能一起提交

### 测试
- 每个功能完成后，Tester 创建测试用例
- 测试通过后才能 commit

## 项目结构

```
desktop/
├── src/
│   ├── main.js         # 入口
│   ├── canvas.js       # PixiJS 画布
│   ├── panels.js       # 侧边栏/面板
│   ├── search.js       # 搜索功能
│   ├── collection.js   # Web 采集
│   ├── text-tool.js    # 文本标注（待实现）
│   └── shape-tool.js   # 图形框（待实现）
├── src-tauri/src/
│   ├── lib.rs          # Tauri 命令
│   ├── ai.rs           # AI Provider
│   ├── search.rs       # 搜索后端
│   ├── storage.rs      # 统一储存（待实现）
│   └── api.rs          # HTTP API（待实现）
└── docs/
    ├── figma-home-ux.md
    └── ...
```

## 当前任务优先级

P0:
1. 路径 bug 修复
2. HTTP API `/api/import`

P1:
3. 文本标注工具 (T)
4. 图形框工具 (R/O/L)
5. Backend 统一储存
6. macOS UI 优化
