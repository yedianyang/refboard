# CLAUDE.md — RefBoard 项目规范

## 项目概述

RefBoard 是一个 AI 驱动的视觉参考收集器 + 可整理的 Moodboard 工具。支持图片导入、AI 分析打标签、CLIP 相似图搜索、Web 图片采集。

## 技术栈

- **Frontend:** PixiJS 8 (WebGL 无限画布) + Vanilla JS
- **Backend:** Rust (Tauri 2.0)
- **AI:** CLIP embeddings (fastembed ONNX) + 多 Provider 支持 (OpenAI/Anthropic/Ollama/OpenRouter)
- **Database:** SQLite (FTS5 全文搜索 + 向量存储)
- **Build:** Vite + Cargo
- **Package Manager:** npm (frontend) + cargo (backend)

## 项目结构

```
refboard/
├── desktop/                    # v2.0 Desktop App (Tauri)
│   ├── src/
│   │   ├── main.js            # 入口 + Home 页面 + 项目管理
│   │   ├── canvas.js          # PixiJS 无限画布 + 卡片交互
│   │   ├── panels.js          # 侧边栏/面板 UI
│   │   ├── search.js          # 搜索 UI
│   │   └── collection.js      # Web 采集 UI
│   ├── src-tauri/src/
│   │   ├── lib.rs             # Tauri 命令注册 + 文件操作
│   │   ├── ai.rs              # AI Provider 抽象层
│   │   ├── search.rs          # SQLite FTS5 + CLIP embedding
│   │   ├── embed.rs           # CLIP 模型加载
│   │   ├── api.rs             # HTTP API (localhost:7890)
│   │   └── web.rs             # Brave Search + 图片下载
│   └── docs/                  # 功能文档
├── lib/                       # v1.0 CLI 库
├── bin/                       # v1.0 CLI 入口
├── docs/
│   ├── research/              # 技术调研
│   └── reference/             # UI 参考图
├── TEAM.md                    # 团队协作看板
├── TODO.md                    # 任务追踪
└── CHANGELOG.md               # 版本历史
```

## 开发命令

```bash
# Desktop App 开发
cd desktop
npm install                    # 安装前端依赖
npm run tauri dev              # 启动开发模式（前端 + Rust 热重载）
npm run tauri build            # 构建 .app / .dmg

# Rust 检查
cd desktop/src-tauri
cargo check                    # 类型检查
cargo test                     # 运行测试
cargo clippy                   # Lint

# v1 CLI（可选）
npm install                    # 根目录
node bin/refboard.js help      # CLI 帮助
```

## 代码规范

### 通用
- 函数命名：camelCase (JS) / snake_case (Rust)
- 文件命名：kebab-case
- commit message：`feat: xxx` / `fix: xxx` / `docs: xxx` / `refactor: xxx`
- 每个功能完成后必须测试通过再 commit

### Rust (Tauri Backend)
- Tauri 命令用 `#[tauri::command]`，薄包装，业务逻辑放 helper 函数
- 错误处理返回 `Result<T, String>`
- 不要在 lib 函数里 panic，用 `?` 传播错误
- SQLite 数据库：`{project}/.refboard/search.db`
- 画布状态：`{project}/.refboard/board.json`

### JavaScript (Frontend)
- ESM 模块，支持 Node >= 18
- 库函数不调用 `console.log`（只在 CLI 层输出）
- 前端通过 `window.__TAURI__.core.invoke("command", {args})` 调用 Rust

### macOS 设计规范
- 字体：SF Pro (`-apple-system, BlinkMacSystemFont`)
- 侧边栏：vibrancy 磨砂玻璃 (`backdrop-filter: blur(20px)`)
- 圆角：8px (按钮/卡片)，12px (面板)
- 间距：紧凑 (8px/12px/16px)
- 动效：`ease-out` 0.2s (按钮)，0.35s (面板)
- 参考：`~/.claude/CLAUDE.md` macOS HIG 详细规范

## Agent Team 分工指南

| Agent | Model | 职责 | 文件 ownership |
|-------|-------|------|----------------|
| **Designer** | opus-4-6 | UI/UX、CSS、动效 | `*.css`, `panels.js`, HTML 模板 |
| **Generator** | opus-4-6 | Rust 后端、核心逻辑 | `src-tauri/src/*.rs`, `lib/*.js` |
| **Researcher** | opus-4-6 | 技术调研、竞品分析 | `docs/research/*.md` |
| **Template** | sonnet-4-5 | 前端交互、DOM 操作 | `main.js`, `canvas.js`, `search.js` |
| **Tester** | sonnet-4-5 | 功能测试、Bug 报告 | `docs/test-report.md` |
| **Docs** | sonnet-4-5 | 文档更新、发布准备 | `README.md`, `CHANGELOG.md`, `docs/*.md` |

### 协作规则
1. 开始工作前在 `TEAM.md` 写消息
2. 完成任务后更新 `TODO.md`
3. Bug 修复：Tester 报告 → 对应 Agent 修复 → Tester 验证
4. 需要协作时 @对应角色

### Tester 角色特殊规范

**Tester agent 权限受限：**
- ✅ 读取所有源码（理解逻辑）
- ✅ 创建/修改测试文件：`*.test.js`, `*.test.ts`, `#[cfg(test)]` 块
- ✅ 运行测试命令
- ❌ **不能修改非测试源码**

**Tester 工作流程：**
1. 先读 `.claude/skills/testing/SKILL.md`
2. 读懂被测模块逻辑，不要盲写测试
3. 写测试 → 运行 → 如果测试代码有问题自己修
4. **发现源码 Bug → 在 TEAM.md @对应角色，不要自己改源码**
5. 测试全绿后报告完成

**Spawn Tester 示例：**
```
@tester 请为 desktop/src/canvas.js 编写单元测试：
1. 读取并理解 canvas.js 的所有导出函数
2. 为每个函数编写测试，覆盖正常路径 + 边界条件 + 错误处理
3. 测试文件写到 desktop/src/canvas.test.js
4. 运行 npm test 确认全部通过
5. 如有失败，修复测试代码（不要改源码）
6. 完成后在 TEAM.md 报告
```

## 注意事项

### 必须遵守
- **不要修改** `~/.refboard/config.json` 的结构（向后兼容）
- **HTTP API** 只监听 localhost (安全)
- **图片压缩** 必须保留 alpha 通道
- **CLIP 模型** 启动后 3 秒延迟加载（不阻塞 UI）

### 已知限制
- CLIP embedding 首次运行需下载模型 (~150MB)
- SQLite FTS5 不支持中文分词（可改进）
- Tauri 2.0 的 `asset://` 协议路径需要 `convertFileSrc()`

### 关键路径
- 项目存储：`~/Documents/RefBoard/{project}/`
- 全局配置：`~/.refboard/config.json`
- 缩略图缓存：`{project}/.thumbnails/`
- 搜索数据库：`{project}/.refboard/search.db`

## 当前开发重点 (2026-02)

### P0 进行中
- [ ] AI Vision 配置面板（Settings > AI Vision）
- [ ] HTTP API `/api/import`、`/api/delete`、`/api/move`、`/api/update`

### P1 待开始
- [ ] 统一项目存储位置
- [ ] DMG 打包签名
- [ ] npm 发布 v1 CLI

### 已完成
- [x] 创建项目流程修复
- [x] 空项目处理
- [x] CLIP 模型预热
- [x] 拖拽/粘贴图片导入
- [x] Home 主页
- [x] 文本标注 + 图形框
