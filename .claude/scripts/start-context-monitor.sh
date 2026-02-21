#!/bin/bash
# 启动 Context Monitor（后台运行）

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONITOR_SCRIPT="$SCRIPT_DIR/monitor-context.sh"
PID_FILE=".claude/logs/context-monitor.pid"
LOG_FILE=".claude/logs/context-monitor.log"

# 检查是否已在运行
if [[ -f "$PID_FILE" ]]; then
    old_pid=$(cat "$PID_FILE")
    if kill -0 "$old_pid" 2>/dev/null; then
        echo "⚠️  Context Monitor 已在运行 (PID: $old_pid)"
        echo "如需重启，请先执行: .claude/scripts/stop-context-monitor.sh"
        exit 1
    else
        echo "清理旧的 PID 文件..."
        rm "$PID_FILE"
    fi
fi

# 启动监控
echo "🚀 启动 Context Monitor..."
nohup "$MONITOR_SCRIPT" >> "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"

echo "✅ Context Monitor 已启动 (PID: $(cat "$PID_FILE"))"
echo "日志: $LOG_FILE"
echo ""
echo "停止监控: .claude/scripts/stop-context-monitor.sh"
echo "查看日志: tail -f .claude/logs/context-monitor.log"
