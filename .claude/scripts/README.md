# Claude Code Context Monitor

自动监控 Agent Teams session 的 context 使用情况，防止因 context 耗尽导致任务中断。

## 快速开始

```bash
# 启动监控（后台运行）
.claude/scripts/start-context-monitor.sh

# 查看日志
tail -f .claude/logs/context-monitor.log

# 停止监控
.claude/scripts/stop-context-monitor.sh
```

## 工作原理

1. **监控 tmux session** — 每 60 秒抓取 `refboard-team` session 的输出
2. **解析 context 百分比** — 支持多种 Claude Code 输出格式：
   - `Context: 45234/200000 (22%)`
   - `⚠️ Context low: 8%`
   - `45234/200000` (自动计算剩余)
3. **阈值检查** — 剩余 < 10% 时触发警告
4. **Discord 通知** — 发送警告到 #claude-code-research 频道
5. **冷却机制** — 30 分钟内不重复通知

## 配置

编辑 `monitor-context.sh` 头部的配置项：

```bash
THRESHOLD_PERCENT=10        # 警告阈值（剩余 < 10%）
CHECK_INTERVAL=60           # 检查间隔（秒）
SESSION_NAME="refboard-team"  # tmux session 名称
```

## 警告消息示例

```
⚠️ **Claude Code Context 预警**

Session: `refboard-team`
剩余 Context: **8%**
阈值: 10%

**建议操作：**
1. 保存当前进度到文件
2. 使用 `/compact` 压缩 context
3. 或准备重启 session
```

## 收到警告后的操作

### 1. 立即保存进度
```bash
# Lead 通知所有 agents
SendMessage(type="broadcast", content="Context 不足，所有人立即 commit 进度")

# 各 agent 执行
git add .
git commit -m "wip: save progress before context compact"
TaskUpdate(taskId="xxx", note="已保存进度，等待 context 压缩")
```

### 2. 压缩 context
```bash
# 在 Claude Code 中执行
/compact
```

### 3. 或重启 session（最后手段）
```bash
# 停止当前 session
tmux kill-session -t refboard-team

# 重新启动
cd ~/Projects/refboard && claude

# Lead 重新分配任务
TaskList()  # 查看未完成任务
TaskCreate(...)  # 重新创建任务
```

## 测试

```bash
# 运行测试脚本验证解析功能
.claude/scripts/test-monitor.sh
```

## 日志

日志文件位置：`.claude/logs/context-monitor.log`

示例：
```
[2026-02-21 23:35:12] === Context Monitor 启动 ===
[2026-02-21 23:35:12] Session: refboard-team
[2026-02-21 23:35:12] 警告阈值: 10%
[2026-02-21 23:35:12] 检查间隔: 60s
[2026-02-21 23:36:12] 当前剩余 context: 45%
[2026-02-21 23:37:12] 当前剩余 context: 32%
[2026-02-21 23:38:12] 🚨 警告：Context 剩余 8% < 阈值 10%
```

## 故障排查

### 监控未启动
```bash
# 检查 PID 文件是否存在
ls -la .claude/logs/context-monitor.pid

# 检查进程是否运行
ps aux | grep monitor-context
```

### 无法检测 context
可能原因：
- Claude Code 未显示 context 信息（版本过旧）
- tmux session 名称不匹配
- Claude Code 输出格式变更

解决：检查 tmux 输出格式，更新 `get_context_status()` 函数的正则表达式。

### Discord 通知未发送
检查 `openclaw` CLI 是否可用：
```bash
which openclaw
openclaw --version
```

如不可用，监控会将警告写入日志但不发送 Discord 通知。

## 集成到 Workflow

建议在启动 Agent Teams 前自动启动监控：

```bash
# 在 start-team.sh 中添加
.claude/scripts/start-context-monitor.sh

# 在 stop-team.sh 中添加
.claude/scripts/stop-context-monitor.sh
```

---

*Created: 2026-02-21*  
*Last updated: 2026-02-21*
