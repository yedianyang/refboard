#!/bin/bash
# 停止 Context Monitor

set -euo pipefail

PID_FILE=".claude/logs/context-monitor.pid"

if [[ ! -f "$PID_FILE" ]]; then
    echo "⚠️  Context Monitor 未运行（PID 文件不存在）"
    exit 0
fi

pid=$(cat "$PID_FILE")

if kill -0 "$pid" 2>/dev/null; then
    echo "🛑 停止 Context Monitor (PID: $pid)..."
    kill "$pid"
    rm "$PID_FILE"
    echo "✅ 已停止"
else
    echo "⚠️  进程 $pid 已不存在，清理 PID 文件"
    rm "$PID_FILE"
fi
