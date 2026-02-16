#!/bin/bash
# Deco Team 监控脚本
# 用法: ./monitor-team.sh [lines] [interval]
#   lines: 显示行数 (默认 30)
#   interval: 刷新间隔秒数 (默认 2)

SESSION="deco-team"
LINES=${1:-30}
INTERVAL=${2:-2}

# 颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

# 检查 session 是否存在
check_session() {
    if ! tmux has-session -t $SESSION 2>/dev/null; then
        echo -e "${RED}❌ Session '$SESSION' not running${NC}"
        echo "   Start with: ./start-team.sh"
        exit 1
    fi
}

# 清屏并显示头部
show_header() {
    clear
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  Deco Team Monitor${NC}  |  Session: ${YELLOW}$SESSION${NC}  |  $(date '+%H:%M:%S')"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
}

# 获取并显示 pane 内容
show_pane() {
    tmux capture-pane -t $SESSION -p -S -$LINES 2>/dev/null
}

# 主循环
main() {
    check_session
    
    echo -e "${GREEN}Monitoring session: $SESSION${NC}"
    echo -e "Lines: $LINES | Refresh: ${INTERVAL}s"
    echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
    echo ""
    sleep 1
    
    while true; do
        check_session
        show_header
        show_pane
        echo ""
        echo -e "${CYAN}───────────────────────────────────────────────────────────────${NC}"
        echo -e "  ${YELLOW}a${NC}=attach  ${YELLOW}q${NC}=quit  ${YELLOW}r${NC}=refresh now  ${YELLOW}+${NC}=more lines  ${YELLOW}-${NC}=less lines"
        
        # 非阻塞读取按键
        read -t $INTERVAL -n 1 key 2>/dev/null || true
        
        case $key in
            a|A)
                echo ""
                echo -e "${GREEN}Attaching... (Ctrl+B D to detach)${NC}"
                sleep 0.5
                tmux attach -t $SESSION
                ;;
            q|Q)
                echo ""
                echo -e "${GREEN}Bye!${NC}"
                exit 0
                ;;
            +|=)
                LINES=$((LINES + 10))
                ;;
            -|_)
                LINES=$((LINES > 10 ? LINES - 10 : 10))
                ;;
        esac
    done
}

main
