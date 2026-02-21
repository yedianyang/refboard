# CLAUDE.md — Deco 核心规范

## ⚠️ 重要：废弃文件说明

**已废弃（2026-02-21）：**
- ❌ `TEAM.md` — 已归档至 `.claude/archive/`，改用 **SendMessage** 工具通讯
- ❌ `TODO.md` — 已归档至 `.claude/archive/`，改用 **TaskList** 工具管理任务

**新的协作方式：**
- 任务管理 → 使用 `TaskCreate/TaskList/TaskUpdate` 工具（Claude Code 内建）
- Agent 通讯 → 使用 `SendMessage` 工具（点对点/广播）
- 进度追踪 → 使用 `TaskList` 查看所有任务状态

详见下方「Agent Team 协作规范」章节。

---

## 项目概述

Deco 是一个 AI 驱动的视觉参考收集器 + 可整理的 Moodboard 工具。支持图片导入、AI 分析打标签、CLIP 相似图搜索、Web 图片采集。

## 技术栈

- **Frontend:** PixiJS 8 (WebGL 无限画布) + Vanilla JS
- **Backend:** Rust (Tauri 2.0)
- **AI:** CLIP embeddings (fastembed ONNX) + 多 Provider 支持 (OpenAI/Anthropic/Ollama/OpenRouter)
- **Database:** SQLite (FTS5 全文搜索 + 向量存储)
- **Build:** Vite + Cargo
- **Package Manager:** npm (frontend) + cargo (backend)

## 项目结构（简化）

```
deco/
├── desktop/                    # v2.0 Desktop App (Tauri)
│   ├── src/                    # 前端代码（main.js, canvas/, panels.js, etc.）
│   └── src-tauri/src/          # Rust 后端（lib.rs, ai.rs, search.rs, etc.）
├── lib/                        # v1.0 CLI 库
├── bin/                        # v1.0 CLI 入口
└── docs/                       # 文档
```

完整结构见原 CLAUDE.md 第 16-52 行。

## 开发命令

详见 @.claude/reference/commands.md

**快速开始：**
```bash
cd desktop && npm run tauri dev   # 启动开发模式
```

## 代码规范

详见 @.claude/reference/code-style.md

**核心原则：**
- 函数命名：camelCase (JS) / snake_case (Rust)
- 每个功能完成后必须测试通过再 commit
- 所有新功能必须记录日志：`crate::log::log("TAG", &format!("..."))`

---

## Agent Team 协作规范

> 基于 Claude Code Agent Teams 官方架构（TaskList + Mailbox + delegate mode）

### 核心机制

- **TaskCreate/TaskList/TaskUpdate** — 共享任务列表，替代手动 TODO.md
- **SendMessage** — agent 间直接通讯，替代 TEAM.md 留言
- **delegate mode** (Shift+Tab) — 强制 Lead 只协调不写码
- **plan approval** — teammate 提交 Plan → Lead 审批 → 执行

### 角色定义 & 文件 Ownership

| Agent | Model | 文件 ownership | 用途 |
|---|---|---|---|
| **lead** | opus | 不碰源码 | 拆任务、分配、审批 Plan |
| **designer** | sonnet | `styles/*.css`, `index.html`, `panels.js` | UI/UX、CSS、动效 |
| **generator** | opus | `src-tauri/src/*.rs`, `Cargo.toml`, `lib/*.js`, `bin/*.js` | Rust 后端、核心逻辑 |
| **template** | sonnet | `canvas/*.js`, `main.js`, `search.js`, `collection.js` | 前端交互、PixiJS |
| **researcher** | opus | `docs/research/*.md` | 技术调研（只读） |
| **tester** | sonnet | `*.test.js`, `#[cfg(test)]` blocks, `docs/test-report.md` | 测试（不改源码） |
| **docs** | sonnet | `README.md`, `CHANGELOG.md`, `docs/*.md` | 文档 |
| **code-reviewer** | sonnet | 无写权限 | 只读审查 |

### Team Lead 规则

1. **启用 delegate mode** — Lead 只能用 SendMessage、TaskCreate/Update、TeamCreate 工具
2. **拆任务时确保文件不冲突** — 每个 task 明确列出 ownership 文件
3. **每 task 5-6 个子步骤** — 避免任务过大或过小
4. **用 TaskUpdate 设 dependencies** — `addBlockedBy` 表达串行关系
5. **Plan Approval（分层策略）** — 仅对以下任务要求 plan approval：
   - 跨 2+ 模块 / API 契约变更
   - 架构变更 / 新依赖引入
   - 数据库 schema 变更
   - 单文件 bug fix、单模块功能**不需要** plan approval

### 任务流程

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

- **SendMessage(type=message)** — 点对点通讯
- **SendMessage(type=broadcast)** — 全员广播（仅紧急事项）
- **idle 通知** — teammate 停下时系统自动通知 Lead

### 并行策略

**可并行：**
- designer(CSS) + generator(Rust) + template(canvas JS) + researcher(docs)

**必须串行：**
- generator → template（API 契约：generator 先定义，template 再调用）
- generator + template → tester（功能完成后才测试）
- tester → docs（测试通过后才写文档）

### Rust ↔ JS 协作（API 契约）

1. **generator** 定义并实现 Tauri command + response struct
2. **generator** 完成后用 SendMessage 通知 template：
   > `invoke('cmd_xxx', {param})` 返回 `{field1, field2}`
3. **template** 按契约实现前端调用
4. Lead 用 `addBlockedBy` 确保 template 的 task 被 generator 的 task 阻塞

### Context 监控（防止意外中断）

**问题：** Agent Teams 长时间运行时 context 可能耗尽，导致任务中断。

**解决方案：** 自动监控 context 使用，低于阈值时提醒。

**使用方法：**

```bash
# 启动监控（后台运行）
.claude/scripts/start-context-monitor.sh

# 停止监控
.claude/scripts/stop-context-monitor.sh

# 查看日志
tail -f .claude/logs/context-monitor.log
```

**监控机制：**
- 每 60 秒检查一次 tmux session 输出
- 提取 context 剩余百分比
- < 10% 时发送 Discord 警告到 #claude-code-research
- 30 分钟冷却期，避免重复通知

**收到警告后的操作：**
1. 保存当前进度（`git commit`）
2. 使用 `/compact` 压缩 context
3. 或准备重启 session（Lead 重新分配任务）

---

## Skills 系统（高频操作自动化）

Deco 项目预置了 4 个 Skills，将重复操作封装为可复用工具。

### 可用 Skills

| Skill | 触发方式 | 用途 |
|-------|---------|------|
| **techdebt** | 自动/手动 | 清理重复代码、更新文档 |
| **rust-test** | 自动/手动 | 运行 Rust 测试 + Clippy |
| **tauri-rebuild** | 仅手动 | 完整重建 Tauri app 并启动 |
| **context-dump** | 自动/手动 | 7天 git 历史摘要（快速恢复上下文） |

### 自动触发（disable-model-invocation: false）

Claude Code 会在合适时机自动调用：

- **techdebt** — session 结束时自动检查代码重复
- **rust-test** — 修改 Rust 文件后自动测试
- **context-dump** — 新 session 开始时自动恢复上下文

### 手动触发

在 Claude Code 中输入：

```bash
# 清理技术债
/techdebt

# 运行 Rust 测试
/rust-test

# 重建 Tauri app
/tauri-rebuild

# 生成上下文摘要
/context-dump
```

或对话方式：
```
"Run rust-test to verify my changes"
"Dump context for last week"
```

### Skills 位置

所有 Skills 位于 `.claude/skills/` 目录：

```
.claude/skills/
├── techdebt/
│   └── SKILL.md
├── rust-test/
│   ├── SKILL.md
│   └── run.sh
├── tauri-rebuild/
│   ├── SKILL.md
│   └── run.sh
└── context-dump/
    ├── SKILL.md
    └── run.sh
```

### 创建新 Skill

1. 在 `.claude/skills/` 创建新目录
2. 添加 `SKILL.md` 包含元数据和描述
3. （可选）添加 `run.sh` 执行脚本
4. 设置 `disable-model-invocation: true/false`

详见官方文档：https://code.claude.com/docs/en/skills

---

## 工程流程

详见 @.claude/reference/workflow.md

**核心规则：**
- 每个 task 完成 + 测试通过 → 立即 commit（不积攒）
- Git commit 格式：`feat: xxx` / `fix: xxx` / `docs: xxx`
- 踩坑经验必须记录到 @.claude/reference/lessons-learned.md

## 踩坑经验

详见 @.claude/reference/lessons-learned.md

## 开发重点

详见 @.claude/reference/roadmap.md
