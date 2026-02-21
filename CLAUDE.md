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

### 角色定义 & 文件 Ownership（5 agents）

| Agent | Model | 文件 ownership | 用途 |
|---|---|---|---|
| **lead** | opus | 不碰源码 | 拆任务、分配、审批 Plan |
| **generator** | sonnet | `src-tauri/src/*.rs`, `Cargo.toml`, `lib/*.js`, `bin/*.js` | Rust 后端、CLI |
| **frontend** | sonnet | `canvas/*.js`, `main.js`, `search.js`, `collection.js`, `panels.js`, `styles/*.css`, `index.html`, `templates/` | 前端全栈：PixiJS + UI + CSS |
| **quality** | sonnet | `*.test.js`, `#[cfg(test)]` blocks, `docs/test-report.md` | 测试 + 代码审查 |
| **docs** | sonnet | `README.md`, `CHANGELOG.md`, `docs/*.md`, `docs/research/*.md` | 文档 + 技术调研 |

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
- frontend(JS/CSS) + generator(Rust) + docs(文档/调研)

**必须串行：**
- generator → frontend（API 契约：generator 先定义 Tauri command，frontend 再调用）
- generator + frontend → quality（功能完成后才测试/审查）
- quality → docs（测试通过后才写文档）

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

## Hooks 系统（安全加固）

自动拦截危险命令和执行代码质量检查。

### 可用 Hooks

| Hook | 触发时机 | 用途 |
|------|---------|------|
| **permission** | 执行任何命令前 | 拦截危险操作（rm -rf, force push等） |
| **pre-commit** | Git commit 前 | 代码质量检查（lint, compile, 敏感信息） |

### Permission Hook（命令拦截）

**拦截的危险操作：**
- ❌ `rm -rf` → 建议使用 `trash`
- ❌ `git push --force` → 建议使用 `--force-with-lease`
- ❌ 删除项目根目录
- ❌ 修改归档文件（`.claude/archive/`）
- ⚠️  修改 `node_modules/` 或 `target/`（警告）

**退出码：**
- `0` — 允许执行
- `1` — 阻止执行（硬拒绝）
- `2` — 需要用户确认

### Pre-Commit Hook（提交前检查）

**检查项：**
- ✅ Frontend linting（ESLint）
- ✅ Rust compilation（`cargo check`）
- ✅ Rust linting（`cargo clippy`，仅警告）
- ⚠️  TODO/FIXME 标记（警告不阻止）
- ❌ 敏感信息（API key/密码，阻止提交）
- ⚠️  大文件（> 1MB，警告）

**输出示例：**
```bash
🔍 Pre-commit checks...
✅ ESLint passed
✅ Cargo check passed
✅ Clippy clean
⚠️  警告：提交中包含 TODO
✅ No sensitive data detected
✅ All pre-commit checks passed
```

### 配置

Hooks 在 `.claude/settings.json` 中配置：

```json
{
  "hooks": {
    "permission": {
      "script": ".claude/hooks/permission-check.sh",
      "enabled": true
    },
    "pre-commit": {
      "script": ".claude/hooks/pre-commit.sh",
      "enabled": true
    }
  }
}
```

**临时禁用：** 将 `"enabled"` 设为 `false`

### Hooks 位置

```
.claude/hooks/
├── README.md             # 使用指南
├── permission-check.sh   # 命令拦截
└── pre-commit.sh         # 提交检查
```

详见：`.claude/hooks/README.md`

---

## 自我改进机制（Claude 自动更新规则）

### Past Mistakes to Avoid

> Claude Code 自动生成和维护，记录已识别的错误模式。

**最后更新：2026-02-22**

#### 协作相关
- 2026-02-21: Don't modify TEAM.md/TODO.md — use TaskList/SendMessage internal tools
- 2026-02-21: Always start context monitor before long Agent Teams sessions
- 2026-02-21: Use `/compact` when context < 15%, not wait until exhausted

#### 技术规范
- 提交前必须通过 pre-commit hook 检查，不能 bypass
- 复杂功能拆分需要先测试核心机制，避免大规模回滚（见 2026-02-18 node connections 两次 revert）
- 大文件重构需要一次性完成，避免多次拆分（canvas.js 拆分了两次）

#### 工作流程
- 每个 task 完成立即 commit，不积攒多个任务一起提交
- UI 交互功能（按钮、面板、快捷键）必须手动测试后再提交，避免 "fix: X broken" 类提交
- 发现重复代码必须立即调用 `/techdebt` 清理
- 踩坑经验必须记录到 `@.claude/reference/lessons-learned.md`

### 自动更新机制

**每周 Review（周日凌晨）：**

OpenClaw cron 任务 `claude-code-weekly-review` 会：
1. 分析过去 7 天的 git commits
2. 提取失败的尝试、修复的 bug、学到的经验
3. 更新 CLAUDE.md 的 "Past Mistakes" 章节
4. Commit 更新（如有）

**手动触发 Review：**

```bash
# 在 Claude Code 中
/review

# 或完整 prompt
"Review CLAUDE.md based on last week's work. 
Update 'Past Mistakes to Avoid' with new lessons learned.
Remove outdated rules that are now obvious.
Commit changes with message: 'docs: weekly CLAUDE.md review'"
```

**每次纠正后立即更新：**

当 Lead 纠正 teammate 的错误时：

```markdown
SendMessage(to="teammate", content="
You made mistake X. Please update CLAUDE.md:

## Past Mistakes to Avoid
- [date]: Don't do X because Y. Instead, do Z.
")
```

Teammate 执行：
1. 添加错误到 "Past Mistakes" 章节
2. Commit: `docs: add lesson learned - [简短描述]`
3. SendMessage 确认更新完成

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
