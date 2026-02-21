# CLAUDE.md — Deco 项目规范

## 项目概述

Deco 是一个 AI 驱动的视觉参考收集器 + 可整理的 Moodboard 工具。支持图片导入、AI 分析打标签、CLIP 相似图搜索、Web 图片采集。

## 技术栈

- **Frontend:** PixiJS 8 (WebGL 无限画布) + Vanilla JS
- **Backend:** Rust (Tauri 2.0)
- **AI:** CLIP embeddings (fastembed ONNX) + 多 Provider 支持 (OpenAI/Anthropic/Ollama/OpenRouter)
- **Database:** SQLite (FTS5 全文搜索 + 向量存储)
- **Build:** Vite + Cargo
- **Package Manager:** npm (frontend) + cargo (backend)

## 项目结构

```
deco/
├── desktop/                    # v2.0 Desktop App (Tauri)
│   ├── src/
│   │   ├── main.js            # 入口 + Home 页面 + 项目管理
│   │   ├── canvas/            # PixiJS 无限画布（8 个模块）
│   │   │   ├── init.js        #   App 启动、world container
│   │   │   ├── cards.js       #   卡片创建、纹理加载、resize
│   │   │   ├── selection.js   #   点击/拖拽、框选、drag threshold
│   │   │   ├── connections.js #   连线工具、端口检测、bezier 路径
│   │   │   ├── groups.js      #   分组创建、编辑、边框跟随
│   │   │   ├── grid.js        #   网格渲染、snap-to-grid
│   │   │   ├── minimap.js     #   小地图
│   │   │   └── state.js       #   共享状态、常量、主题色
│   │   ├── panels.js          # 侧边栏/面板 UI
│   │   ├── search.js          # 搜索 UI
│   │   ├── collection.js      # Web 采集 UI
│   │   └── styles/            # CSS 样式文件
│   │       └── settings.css   #   设置面板样式
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
node bin/deco.js help      # CLI 帮助
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
- SQLite 数据库：`{project}/.deco/search.db`
- 画布状态：`{project}/.deco/board.json`

### 日志规范 (Logging)

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

## Agent Team 协作规范

> 基于 Claude Code Agent Teams 官方架构（TeamCreate + TaskList + Mailbox + delegate mode）

### 架构总览

```
┌─────────────────────────────────────────────────┐
│  Team Lead (delegate mode, 不写代码)              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │ Mailbox  │  │ TaskList │  │ TeamConf │      │
│  │ (自动投递) │  │ (共享状态) │  │ config.json│    │
│  └──────────┘  └──────────┘  └──────────┘      │
│       ↕              ↕              ↕            │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │Designer │  │Generator│  │Template │  ...    │
│  │(独立ctx) │  │(独立ctx) │  │(独立ctx) │        │
│  └─────────┘  └─────────┘  └─────────┘        │
└─────────────────────────────────────────────────┘
```

**核心机制（用内建工具，不用手动文件）：**
- **TaskCreate/TaskList/TaskUpdate** — 共享任务列表，替代 TODO.md
- **SendMessage** — agent 间直接通讯，替代 TEAM.md 留言
- **delegate mode** (Shift+Tab) — 强制 Lead 只协调不写码
- **plan approval** — teammate 提交 Plan → Lead 审批 → 才能动手

### 角色定义 & 文件 Ownership

| Agent (name) | subagent_type | Model | 文件 ownership | 用途 |
|---|---|---|---|---|
| **lead** | main | opus | 不碰源码 | 拆任务、分配、审批 Plan、合成结果 |
| **designer** | designer | sonnet | `styles/*.css`, `index.html`, `panels.js` | UI/UX、CSS、动效 |
| **generator** | generator | opus | `src-tauri/src/*.rs`, `Cargo.toml`, `lib/*.js`, `bin/*.js` | Rust 后端、核心逻辑 |
| **template** | template | sonnet | `canvas/*.js`, `main.js`, `search.js`, `collection.js` | 前端交互、PixiJS |
| **researcher** | researcher | opus | `docs/research/*.md` | 技术调研（只读） |
| **tester** | tester | sonnet | `*.test.js`, `#[cfg(test)]` blocks, `docs/test-report.md` | 测试（不改源码） |
| **docs** | docs | sonnet | `README.md`, `CHANGELOG.md`, `docs/*.md` | 文档 |
| **code-reviewer** | code-reviewer | sonnet | 无写权限 | 只读审查 |

### Team Lead 规则

1. **启用 delegate mode** — Lead 只能用 SendMessage、TaskCreate/Update、TeamCreate 工具
2. **拆任务时确保文件不冲突** — 每个 task 明确列出 ownership 文件，避免两人改同一个文件
3. **每 task 5-6 个子步骤** — 太大容易跑偏，太小协调开销超过收益
4. **用 TaskUpdate 设 dependencies** — `addBlockedBy` 表达串行关系（如 tester 等 generator 完成）
5. **Plan Approval（分层策略）** — 仅对以下任务要求 plan approval：
   - 跨 2+ 模块 / API 契约变更
   - 架构变更 / 新依赖引入
   - 数据库 schema 变更
   - 单文件 bug fix、单模块功能不需要 plan approval

### 任务流程（内建机制驱动）

```
Lead: TaskCreate → TaskUpdate(owner=teammate)
  ↓
Teammate: TaskUpdate(status=in_progress) → [plan mode if required]
  ↓
Teammate: ExitPlanMode → Lead: plan_approval_response(approve)
  ↓
Teammate: 编码 → 测试 → git commit → TaskUpdate(status=completed)
  ↓
Lead: TaskList → 检查进度 → 分配下一个 / SendMessage 反馈
```

### 通讯规范

- **SendMessage(type=message)** — 点对点通讯，替代 @mention
- **SendMessage(type=broadcast)** — 全员广播，仅用于紧急事项（成本高）
- **idle 通知** — teammate 停下时系统自动通知 Lead，不需手动 check
- **DM 可见性** — teammate 间 DM 摘要会出现在 Lead 的 idle 通知中

### 并行策略

```
可并行（无文件冲突）：
  designer(CSS) + generator(Rust) + template(canvas JS) + researcher(docs)

必须串行（用 addBlockedBy）：
  generator → template  （API 契约：generator 先定义，template 再调用）
  generator + template → tester  （功能完成后才测试）
  tester → docs  （测试通过后才写文档）
```

### Rust ↔ JS 协作（API 契约）

当 generator 和 template 协作时：

1. **generator** 定义并实现 Tauri command + response struct
2. **generator** 完成后用 SendMessage 通知 template：
   > `invoke('cmd_xxx', {param})` 返回 `{field1, field2}`
3. **template** 按契约实现前端调用
4. Lead 用 `addBlockedBy` 确保 template 的 task 被 generator 的 task 阻塞

### Spawn 示例

```
创建一个 agent team 来实现 [功能名]：
- generator: 实现 Rust 后端 [具体描述]，文件: src-tauri/src/xxx.rs
- template: 实现前端交互 [具体描述]，文件: desktop/src/canvas/xxx.js
- designer: 更新样式 [具体描述]，文件: desktop/src/styles/xxx.css
要求 generator 和 template 提交 plan approval。
用 delegate mode，我不直接写代码。
```

---

## 工程流程

### Git 提交规范

| type | 说明 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `refactor` | 重构（不改变功能） |
| `style` | 样式/UI 调整 |
| `docs` | 文档更新 |
| `test` | 测试相关 |
| `chore` | 构建/配置/杂项 |

**规则：**
- 每个 task 完成 + 测试通过 → 立即 commit
- 不积攒多个 task 一起提交
- 不提交未测试的代码

### 踩坑经验记录

遇到 bug/问题时更新本文件「踩坑经验」章节：

```markdown
| 问题 | 原因 | 解决方案 |
|------|------|----------|
| [描述问题] | [根本原因] | [解决方法] |
```

## 注意事项

### 必须遵守
- **不要修改** `~/.deco/config.json` 的结构（向后兼容）
- **HTTP API** 只监听 localhost (安全)
- **图片压缩** 必须保留 alpha 通道
- **CLIP 模型** 启动后 3 秒延迟加载（不阻塞 UI）

### 已知限制
- CLIP embedding 首次运行需下载模型 (~150MB)
- SQLite FTS5 不支持中文分词（可改进）
- Tauri 2.0 的 `asset://` 协议路径需要 `convertFileSrc()`

### 关键路径
- 项目存储：`~/Documents/Deco/{project}/`
- 全局配置：`~/.deco/config.json`
- 缩略图缓存：`{project}/.thumbnails/`
- 搜索数据库：`{project}/.deco/search.db`

## 踩坑经验 (Lessons Learned)

> ⚠️ **重要：** 每次迭代发现的问题和解决方案必须记录在这里，避免重复踩坑！

### Tauri / Rust

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 前端调用 Rust 命令失败 | 命令名不匹配（前端用 `cmd_xxx`，Rust 用 `xxx`）| 统一命名：Rust 用 `#[tauri::command] fn xxx()`，前端 `invoke('xxx')` |
| 参数缺失导致调用失败 | 前端传的参数和 Rust 定义不一致 | 检查两边参数名和类型完全匹配 |
| CLIP 模型阻塞 UI | 模型加载在主线程 | 启动后 3 秒延迟 warmup，或用 `spawn_blocking` |
| `asset://` 路径无法加载 | Tauri 2.0 需要转换路径 | 使用 `convertFileSrc(path)` |

### 前端 / PixiJS

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 空项目卡在 loading | `loadProject()` 返回 `undefined` | 返回 `{ loaded: 0, total: 0 }`，显示空状态提示 |
| 纹理内存泄漏 | 切换项目没销毁旧纹理 | `texture.destroy(true)` 销毁 baseTexture |
| 拖拽事件穿透 | 子元素没设置 `eventMode` | 设置 `eventMode = 'static'` |
| Group 纯视觉无法交互 | Group 只是画了边框，没有选中/拖拽逻辑 | 需要 `editingGroup` 状态 + `updateGroupBounds()` + group-aware click/drag |
| Frame 缩放变形 | 直接缩放 sprite 导致图片拉伸 | 用 PixiJS mask 裁剪，sprite 保持原始尺寸 |
| 快捷键冲突 | canvas.js 和 main.js 都监听同一快捷键 | 功能区分：Cmd+G=Group, Cmd+Shift+G=Generate |
| 卡片 pointerdown 阻断 stage handler | card 的 eventMode='static' 先触发，stage 的 `if(e.target!==stage) return` 过滤 | 在 startCardDrag() 开头拦截特殊工具（如 connector） |
| 图片被不透明 bg 遮盖 | createPlaceholderCard 画了 fill，texture 加载后 bg 未清除 | texture 加载后 bg.clear() 只留 stroke，resizeCardTo 同理 |
| 单击误触发拖拽 | globalpointermove 任何移动即设 moved=true | 加 DRAG_THRESHOLD=4px dead zone，squared distance 判断 |

### 团队协作

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 重复导出错误 | 同一函数既在声明时 export 又在文件末尾 export | 只用一种方式导出 |
| 命令处理函数未定义 | 注册了命令但忘写实现 | 先写空函数骨架，再填逻辑 |
| Tester 改了源码 | 权限没限制 | Tester 只改测试文件，源码 bug @对应角色修 |

### 设计 / UI

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| emoji 不同平台显示不一致 | 系统 emoji 渲染差异 | 使用 Lucide Icons SVG |
| 磨砂玻璃效果不生效 | 没设置背景色透明 | `background: rgba(30,30,30,0.8)` + `backdrop-filter` |
| 深色模式颜色错 | 硬编码颜色 | 使用 CSS 变量 `var(--bg-color)` |

### 新增经验模板

```markdown
| 问题 | 原因 | 解决方案 |
|------|------|----------|
| [描述问题] | [根本原因] | [解决方法] |
```

---

## 当前开发重点 (2026-02)

### P1 待开始
- [ ] CLI 命令补全（还有 10 个命令待实现）
- [ ] 截图/GIF（README 演示素材）
- [ ] DMG 打包签名

### 已完成
- [x] 创建项目流程修复
- [x] 空项目处理
- [x] CLIP 模型预热
- [x] 拖拽/粘贴图片导入
- [x] Home 主页
- [x] 文本标注 + 图形框
- [x] AI Vision 配置面板（Settings UI + 后端 wiring）
- [x] CLIP HTTP API（5 个端点）
- [x] 浮动选择工具栏（基础版）
- [x] Nav bar 重构（Lucide icons）
- [x] Frame 缩放裁剪（PixiJS mask）
- [x] 图标矢量化（emoji → Lucide SVG）
- [x] Group 行为修复（选中/拖拽/边框跟随）
- [x] 浮动工具栏上下文感知（data-context 属性系统）
- [x] HTTP API ↔ CLI 同步（ops.rs + 3 个 CLI 命令）
- [x] OpenClaw 深度集成方案（调研文档）
- [x] AI Vision 模型扩展（+3 Providers）
- [x] main.js 模块化拆分（5 个独立模块）
- [x] 导入后自动 index + embed（spawn_auto_index）
- [x] BUG-009 finishRename 防重入
- [x] BUG-010 Connector 工具修复（card pointerdown 拦截）
- [x] BUG-011 图片被 bg 遮盖修复（texture 加载后清除 fill）
- [x] BUG-012 单击拖拽误触发修复（4px dead zone）
- [x] canvas.js 模块化拆分（8 个模块: init/cards/selection/connections/groups/grid/minimap/state）
- [x] Node connections 功能（bezier 路径、端口检测、curvature 调节）
- [x] UI 词汇表文档（docs/ui-vocabulary.md）
- [x] Agent Team 架构升级（内建 TaskList/Mailbox/delegate mode）
