# 代码规范

## 通用规范

- 函数命名：camelCase (JS) / snake_case (Rust)
- 文件命名：kebab-case
- commit message：`feat: xxx` / `fix: xxx` / `docs: xxx` / `refactor: xxx`
- 每个功能完成后必须测试通过再 commit

## Rust (Tauri Backend)

- Tauri 命令用 `#[tauri::command]`，薄包装，业务逻辑放 helper 函数
- 错误处理返回 `Result<T, String>`
- 不要在 lib 函数里 panic，用 `?` 传播错误
- SQLite 数据库：`{project}/.deco/search.db`
- 画布状态：`{project}/.deco/board.json`

## 日志规范 (Logging)

**所有新功能必须记录日志！**

```rust
crate::log::log("TAG", &format!("操作描述: {}", value));
```

**已有 TAG：**

| TAG | 用途 |
|-----|------|
| `AI` | 图片分析、批量分析、图片生成 |
| `API` | HTTP 端点操作 |
| `CLIP` | 模型加载、embedding 生成 |
| `IMPORT` | 图片导入 |
| `SEARCH` | 搜索相关 |

**日志位置：** `~/.deco/debug.log`（同时输出 stdout）

**记录时机：**
- ✅ 关键操作开始/完成
- ✅ 错误和警告
- ✅ 外部 API 调用
- ❌ 不记录敏感信息（API key、用户数据）

**示例：**
```rust
crate::log::log("AI", &format!("Analyzing image: {filename} (provider: {provider})"));
crate::log::log("AI", &format!("Response received: {status}, {len} bytes"));
crate::log::log("API", &format!("POST /api/import → project: {project}"));
crate::log::log("CLIP", "Model warmup started");
```

## JavaScript (Frontend)

- ESM 模块，支持 Node >= 18
- 库函数不调用 `console.log`（只在 CLI 层输出）
- 前端通过 `window.__TAURI__.core.invoke("command", {args})` 调用 Rust

## macOS 设计规范

- 字体：SF Pro (`-apple-system, BlinkMacSystemFont`)
- 侧边栏：vibrancy 磨砂玻璃 (`backdrop-filter: blur(20px)`)
- 圆角：8px (按钮/卡片)，12px (面板)
- 间距：紧凑 (8px/12px/16px)
- 动效：`ease-out` 0.2s (按钮)，0.35s (面板)
