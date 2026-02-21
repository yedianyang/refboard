# Git Worktree 使用指南

## 什么是 Worktree？

一个 Git 仓库可以有多个工作目录（worktree），每个在不同的分支上独立工作。
它们**共享同一个 .git 数据库**，但文件系统完全隔离。

```
refboard/           ← 主仓库 (main) — Lead + Generator
refboard-frontend/  ← worktree (wt/frontend) — Frontend agent
refboard-quality/   ← worktree (wt/quality) — Quality agent  
refboard-docs/      ← worktree (wt/docs) — Docs agent
```

## 为什么用 Worktree？

- **完全隔离**：每个 agent 在自己的目录工作，不会文件冲突
- **独立 git 状态**：各自 commit，互不影响
- **可以同时运行**：3-4 个 Claude Code session 并行

## 日常使用

### 启动开发（每次开工）

```bash
# 先同步所有 worktree 到最新 main
cd ~/Projects/refboard && git pull
cd ~/Projects/refboard-frontend && git merge main
cd ~/Projects/refboard-quality && git merge main
cd ~/Projects/refboard-docs && git merge main
```

或者用快捷脚本：
```bash
~/Projects/refboard/sync-worktrees.sh
```

### 在各 worktree 启动 Claude Code

```bash
# Terminal 1: Lead + Generator（主仓库）
cd ~/Projects/refboard && claude

# Terminal 2: Frontend
cd ~/Projects/refboard-frontend && claude

# Terminal 3: Quality (测试/审查)
cd ~/Projects/refboard-quality && claude

# Terminal 4: Docs (文档/调研)
cd ~/Projects/refboard-docs && claude
```

### 合并工作成果

每个 worktree 完成后，把成果合并回 main：

```bash
# 1. Frontend 完成 → 合并回 main
cd ~/Projects/refboard
git merge wt/frontend

# 2. 如果有冲突
git mergetool   # 或手动解决
git commit

# 3. 合并后同步其他 worktree
cd ~/Projects/refboard-quality && git merge main
cd ~/Projects/refboard-docs && git merge main
```

### 重置 worktree 分支（开始新任务时）

```bash
# 把 wt/frontend 重置到最新 main
cd ~/Projects/refboard-frontend
git checkout wt/frontend
git reset --hard main
```

## 快捷 Aliases（可选）

加到 `~/.zshrc`：

```bash
# Deco worktree 快捷
alias deco='cd ~/Projects/refboard && claude'
alias deco-fe='cd ~/Projects/refboard-frontend && claude'
alias deco-qa='cd ~/Projects/refboard-quality && claude'
alias deco-docs='cd ~/Projects/refboard-docs && claude'
```

## 查看/管理 Worktree

```bash
# 列出所有 worktree
git worktree list

# 删除 worktree（不需要时）
git worktree remove ../refboard-frontend

# 重新创建
git worktree add ../refboard-frontend wt/frontend
```

## 注意事项

1. **不要在两个 worktree 同时 checkout 同一个 branch** — Git 不允许
2. **合并前先 commit** — 未提交的修改不能合并
3. **定期同步** — 避免分支差距太大导致冲突多
4. **主仓库是权威** — Lead/Generator 在主仓库工作，其他 merge 回来
