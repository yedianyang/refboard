#!/bin/bash
# Claude Code Context Monitor
# 监控 Agent Teams session 的 context 使用情况，低于阈值时发出警告

set -euo pipefail

# ================== 配置 ==================
THRESHOLD_PERCENT=10        # 警告阈值（剩余 < 10% 时报警）
CHECK_INTERVAL=60           # 检查间隔（秒）
SESSION_NAME="refboard-team"  # tmux session 名称
LOG_FILE=".claude/logs/context-monitor.log"

# ================== 函数 ==================

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

# 从 tmux pane 输出中提取 context 信息
# Claude Code 通常在底部状态栏显示 context 使用情况，格式如：
#   "Context: 45234/200000 (22%)"
#   或 "⚠️ Context low: 8%"
get_context_status() {
    local pane_output
    pane_output=$(tmux capture-pane -t "$SESSION_NAME" -p -S -30 2>/dev/null || echo "")
    
    # 尝试匹配多种可能的格式
    # 格式1: "Context: 45234/200000 (22%)"
    if echo "$pane_output" | grep -qE 'Context:.*\([0-9]+%\)'; then
        local percent
        percent=$(echo "$pane_output" | grep -oE 'Context:.*\(([0-9]+)%\)' | tail -1 | grep -oE '[0-9]+%' | tr -d '%')
        echo "$percent"
        return 0
    fi
    
    # 格式2: "⚠️ Context low: 8%"
    if echo "$pane_output" | grep -qE 'Context low:.*[0-9]+%'; then
        local percent
        percent=$(echo "$pane_output" | grep -oE 'Context low:.*([0-9]+)%' | tail -1 | grep -oE '[0-9]+%' | tr -d '%')
        echo "$percent"
        return 0
    fi
    
    # 格式3: "45234/200000" (需计算百分比)
    if echo "$pane_output" | grep -qE '[0-9]+/[0-9]+'; then
        local used total percent
        used=$(echo "$pane_output" | grep -oE '[0-9]+/[0-9]+' | tail -1 | cut -d/ -f1)
        total=$(echo "$pane_output" | grep -oE '[0-9]+/[0-9]+' | tail -1 | cut -d/ -f2)
        percent=$(( (total - used) * 100 / total ))
        echo "$percent"
        return 0
    fi
    
    # 无法检测
    echo "unknown"
    return 1
}

# 发送 Discord 通知
send_alert() {
    local remaining_percent=$1
    local message="⚠️ **Claude Code Context 预警**

Session: \`$SESSION_NAME\`
剩余 Context: **${remaining_percent}%**
阈值: ${THRESHOLD_PERCENT}%

**建议操作：**
1. 保存当前进度到文件
2. 使用 \`/compact\` 压缩 context
3. 或准备重启 session"

    # 调用 OpenClaw message 工具发送到当前频道
    # 这里假设有 openclaw CLI 可用
    if command -v openclaw &> /dev/null; then
        echo "$message" | openclaw msg send --channel discord --target "#claude-code-research"
    else
        log "警告：无法发送 Discord 通知（openclaw CLI 不可用）"
        log "$message"
    fi
}

# 检查 tmux session 是否存活
check_session_alive() {
    tmux has-session -t "$SESSION_NAME" 2>/dev/null
}

# ================== 主循环 ==================

main() {
    mkdir -p "$(dirname "$LOG_FILE")"
    log "=== Context Monitor 启动 ==="
    log "Session: $SESSION_NAME"
    log "警告阈值: ${THRESHOLD_PERCENT}%"
    log "检查间隔: ${CHECK_INTERVAL}s"
    
    local last_alert_time=0
    local alert_cooldown=1800  # 冷却时间 30 分钟，避免重复通知
    
    while true; do
        if ! check_session_alive; then
            log "Session '$SESSION_NAME' 不存在或已结束，监控停止"
            exit 0
        fi
        
        local remaining
        remaining=$(get_context_status)
        
        if [[ "$remaining" == "unknown" ]]; then
            log "无法检测 context 状态（可能 Claude Code 未显示）"
        else
            log "当前剩余 context: ${remaining}%"
            
            # 检查是否低于阈值
            if (( remaining < THRESHOLD_PERCENT )); then
                local now
                now=$(date +%s)
                local time_since_last_alert=$(( now - last_alert_time ))
                
                if (( time_since_last_alert > alert_cooldown )); then
                    log "🚨 警告：Context 剩余 ${remaining}% < 阈值 ${THRESHOLD_PERCENT}%"
                    send_alert "$remaining"
                    last_alert_time=$now
                else
                    log "⏳ Context 仍低于阈值，但处于冷却期（距上次通知 ${time_since_last_alert}s）"
                fi
            fi
        fi
        
        sleep "$CHECK_INTERVAL"
    done
}

# ================== 入口 ==================

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
