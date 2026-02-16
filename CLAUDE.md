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

## Agent Team 分工指南

| Agent | Model | 职责 | 文件 ownership |
|-------|-------|------|----------------|
| **Main (Team Lead)** | opus-4-6 | 任务协调、进度追踪 | `TEAM.md`, `TODO.md` |
| **Designer** | opus-4-6 | UI/UX、CSS、动效 | `*.css`, `panels.js`, HTML 模板 |
| **Generator** | opus-4-6 | Rust 后端、核心逻辑 | `src-tauri/src/*.rs`, `lib/*.js` |
| **Researcher** | opus-4-6 | 技术调研、竞品分析 | `docs/research/*.md` |
| **Template** | sonnet-4-5 | 前端交互、DOM 操作 | `main.js`, `canvas.js`, `search.js` |
| **Tester** | sonnet-4-5 | 功能测试、Bug 报告 | `docs/test-report.md` |
| **Docs** | sonnet-4-5 | 文档更新、发布准备 | `README.md`, `CHANGELOG.md`, `docs/*.md` |

### Team Lead 职责

**⚠️ 核心原则：Team Lead 不写代码！**
- ❌ 禁止自己写代码、修改源文件
- ✅ 必须把任务分配给对应 teammate
- ✅ 可以更新 TEAM.md / TODO.md

**任务下发流程：**
1. 分析任务涉及哪些文件
2. 确定分配给哪个 teammate
3. 用标准模板写任务描述
4. @teammate 下发任务
5. 等待完成，检查结果

**Checkpoint（每 10 分钟）：**
- 检查 context 剩余量
- 更新 TEAM.md 当前状态
- Context < 30% 立即保存进度

**并行策略：**
- ✅ 可并行：Designer + Generator（前后端）、Researcher
- ❌ 必须串行：Tester 等功能完成、Docs 等测试完成

### 协作规则
1. 开始工作前在 `TEAM.md` 写消息
2. **修改代码前必须提交 Plan**（见下方模板）
3. 完成任务后更新 `TODO.md`
4. Bug 修复：Tester 报告 → 对应 Agent 修复 → Tester 验证
5. 需要协作时 @对应角色
6. **踩坑必记录** → 更新 `CLAUDE.md`「踩坑经验」章节
7. **完成任务后必须 Git 提交**

---

## 工程流程

### 任务循环 (Task Loop)

```
Plan → 审批 → 编码 → 测试 → Commit → Push
```

每个任务必须完整走完这个循环，不允许跳过任何步骤。

### Plan 审批模板

**修改代码前必须先提交 Plan，等 Team Lead `✅ Approved` 后再动手：**

```markdown
## Plan: [任务名称]

**目标：** [一句话描述]

**修改文件：**
- `path/to/file.rs` — [改什么]
- `path/to/file.js` — [改什么]

**实现步骤：**
1. [步骤1]
2. [步骤2]
3. [步骤3]

**影响范围：** [可能影响的其他功能]

**测试方案：** [如何验证]
```

### Git 提交规范

**每个任务完成后必须提交：**
```bash
git add -A
git commit -m "type: 简短描述"
git push
```

**Commit 类型：**
| type | 说明 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `refactor` | 重构（不改变功能） |
| `style` | 样式/UI 调整 |
| `docs` | 文档更新 |
| `test` | 测试相关 |
| `chore` | 构建/配置/杂项 |

**示例：**
```
feat: add batch analyze API endpoint
fix: resolve empty project loading issue
style: replace emoji with Lucide icons
docs: update HTTP API reference
```

**提交时机：**
- ✅ 任务完成 + 测试通过 → 立即提交
- ❌ 不要积攒多个任务一起提交
- ❌ 不要提交未测试的代码

### Generator + Template 协作（API 契约）

当任务涉及 Rust 后端 + JS 前端协作时：

**1. Generator 先定义 API 契约**
```rust
#[tauri::command]
fn cmd_xxx(param: String) -> Result<XxxResponse, String>

#[derive(Serialize)]
struct XxxResponse {
    field1: String,
    field2: Vec<String>,
}
```

**2. Generator 完成后通知 Template**
> @Template API 已就绪：`invoke('cmd_xxx', {param})` 返回 `{field1, field2}`

**3. Template 按契约实现前端调用**
```javascript
const result = await invoke('cmd_xxx', { param: 'value' });
console.log(result.field1, result.field2);
```

### Tester 持续监控

- 持续运行 `npm test` / `cargo test`
- 发现回归 → **立即通知对应 teammate**
- 通知格式：`🔴 回归！@Generator xxx.rs 第 N 行，原本 pass 现在 fail`

### 踩坑经验记录

每次遇到 bug/问题/解决方案，**立即更新本文件「踩坑经验」章节**：

```markdown
| 问题 | 原因 | 解决方案 |
|------|------|----------|
| [描述问题] | [根本原因] | [解决方法] |
```

避免后续 agent 重复踩坑。

---

### Tester 角色特殊规范

**Tester agent 权限受限：**
- ✅ 读取所有源码（理解逻辑）
- ✅ 创建/修改测试文件：`*.test.js`, `*.test.ts`, `#[cfg(test)]` 块
- ✅ 运行测试命令
- ❌ **不能修改非测试源码**

**持续监控模式：**
- 持续运行 `npm test` / `cargo test`
- 发现回归 → **立即通知对应 teammate**
- 通知格式：`🔴 回归！@Generator xxx.rs 第 N 行，原本 pass 现在 fail`

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

### P0 进行中
- [ ] canvas.js 模块化拆分（7 个模块文件）
- [ ] 浮动工具栏上下文感知（不同对象类型显示不同工具）
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
- [x] AI Vision 配置面板（Settings UI + 后端 wiring）
- [x] CLIP HTTP API（5 个端点）
- [x] 浮动选择工具栏（基础版）
- [x] Nav bar 重构（Lucide icons）
- [x] Frame 缩放裁剪（PixiJS mask）
- [x] 图标矢量化（emoji → Lucide SVG）
- [x] Group 行为修复（选中/拖拽/边框跟随）
