# Deco 开发完整流程

## 快速开始（每次开工）

### 1. 同步代码

```bash
cd ~/Projects/refboard
./sync-worktrees.sh
```

### 2. 启动 Lead session

```bash
cd ~/Projects/refboard
claude
```

进入后 Claude Code 会自动：
- 读取 CLAUDE.md
- 运行 TaskList 查看待办
- 等你的指令

---

## 场景 A：简单任务（1 个 agent 能搞定）

> 例：修个 bug、加个小功能

直接在主仓库告诉 Lead：

```
修复搜索栏输入中文时闪烁的问题
```

Lead 会判断这是 frontend 的活，直接 SendMessage 给 frontend agent。

你不需要开其他 worktree。Lead + 一个 teammate 在同一个 session 里就够。

---

## 场景 B：中型任务（2-3 个 agent 并行）

> 例：新增"收藏夹"功能，涉及 Rust 后端 + 前端 UI

### Step 1: Interview（Lead 问你）

Lead 会先进 plan mode 问你：
- 收藏夹的数据存哪？新建表还是加字段？
- 一张图能属于多个收藏夹吗？
- 收藏夹有排序吗？有封面图吗？
- 删除收藏夹时里面的图怎么办？

你回答完，Lead 输出 spec 到 `docs/specs/`。

### Step 2: Lead 拆任务

Lead 用 TaskCreate 创建任务，你能看到：

```
TaskCreate:
  title: "收藏夹 - Rust 数据层"
  description: "新建 favorites 表，CRUD 命令..."
  assignee: generator

TaskCreate:
  title: "收藏夹 - 前端面板"
  description: "左侧新增收藏夹面板..."
  assignee: frontend
  blockedBy: [task-1]   ← 等 generator 先定义 API
```

### Step 3: 开 worktree sessions

```bash
# Terminal 1: Lead + Generator（主仓库）
cd ~/Projects/refboard && claude

# Terminal 2: Frontend（等 generator 完成 API 后开始）
cd ~/Projects/refboard-frontend && claude
```

### Step 4: 监控进度

在 Lead session 中随时输入：
```
TaskList
```

会显示：
```
✅ task-1: 收藏夹 - Rust 数据层 (completed)
🔄 task-2: 收藏夹 - 前端面板 (in_progress)
⬜ task-3: 收藏夹 - 测试 (blocked by task-2)
```

### Step 5: 合并成果

各 worktree 完成后：

```bash
cd ~/Projects/refboard

# 合并 frontend 的工作
git merge wt/frontend

# 如果有冲突 → 手动解决 → git commit
# 没冲突 → 自动合并

# 同步回其他 worktree
./sync-worktrees.sh
```

### Step 6: 验证

```bash
# 自动验证
cd desktop/src-tauri && cargo check && cargo test && cargo clippy -- -D warnings
cd ../.. && cd desktop && npx eslint src/ --quiet

# 人工验证（如果涉及 UI）
cd desktop && npm run tauri dev
# 目视确认 → 操作测试
```

---

## 场景 C：大型任务（全员并行）

> 例：v2.0 重构

```bash
# Terminal 1: Lead + Generator
cd ~/Projects/refboard && claude

# Terminal 2: Frontend
cd ~/Projects/refboard-frontend && claude

# Terminal 3: Quality（测试）
cd ~/Projects/refboard-quality && claude

# Terminal 4: Docs
cd ~/Projects/refboard-docs && claude
```

每个 terminal 里的 Claude Code 只关心自己的文件，互不干扰。

---

## TaskList 使用指南

### 你能用的命令

在 Claude Code 里直接说自然语言，Lead 会翻译成工具调用：

| 你说 | Lead 做 |
|------|---------|
| "看看现在有什么任务" | `TaskList` |
| "加个任务：优化搜索性能" | `TaskCreate(title, description, assignee)` |
| "把任务 3 标记完成" | `TaskUpdate(id, status=completed)` |
| "任务 2 被任务 1 阻塞" | `TaskUpdate(id, addBlockedBy=[task-1])` |

### 任务状态

```
⬜ pending     — 待开始
🔄 in_progress — 进行中
✅ completed   — 已完成
🚫 blocked     — 被其他任务阻塞
```

### 实际例子

```
你：我想加一个标签批量编辑功能

Lead：好，让我先问几个问题...
（Interview Mode：问边界、取舍）

Lead：明白了，我拆成这些任务：
  Task 1: [generator] 批量更新 tags 的 Rust command
  Task 2: [frontend] 多选后显示批量编辑栏 (blocked by 1)
  Task 3: [quality] 测试批量操作边界情况 (blocked by 1,2)

你：开始吧

Lead：SendMessage → generator："开始 Task 1..."
```

---

## Worktree 日常操作速查

### 每天开工

```bash
./sync-worktrees.sh          # 一键同步
```

### 合并成果回 main

```bash
cd ~/Projects/refboard
git merge wt/frontend         # 合并 frontend 的工作
git merge wt/quality          # 合并 quality 的工作
git merge wt/docs             # 合并 docs 的工作
```

### 开始新任务前重置分支

```bash
cd ~/Projects/refboard-frontend
git reset --hard main         # 清空 worktree，重新从 main 开始
```

### 查看所有 worktree 状态

```bash
cd ~/Projects/refboard
git worktree list
```

### 出问题了？

```bash
# worktree 坏了 → 删除重建
git worktree remove ../refboard-frontend
git worktree add ../refboard-frontend wt/frontend
```

---

## 典型一天

```
09:30  ./sync-worktrees.sh
09:31  cd ~/Projects/refboard && claude
09:32  "今天要做 XXX 功能"
       → Lead: Interview Mode 提问
09:40  回答完问题 → Lead 输出 spec + 拆任务
09:45  开第二个 terminal: cd ~/Projects/refboard-frontend && claude
       → Lead 分配任务给 generator 和 frontend
10:30  TaskList 看进度
11:00  generator 完成 → frontend 开始（解除阻塞）
12:00  全部完成 → git merge → sync → 验证
12:10  npm run tauri dev → 目视确认 → 
```

---

## 注意事项

1. **Lead 不写代码** — 它只协调。如果你看到 Lead 在写代码，提醒它
2. **一个 branch 只能在一个 worktree** — 不要手动 checkout 相同分支
3. **合并前必须 commit** — 未提交的改动不能 merge
4. **频繁同步** — 避免分支差太远导致冲突多
5. **UI 改动看 🔍** — 有这个标记的 commit 需要你亲眼确认
