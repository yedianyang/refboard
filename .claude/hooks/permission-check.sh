#!/bin/bash
# Permission Hook — 拦截危险命令

set -euo pipefail

COMMAND="$COMMAND_TEXT"
PERMISSION_TYPE="${PERMISSION_TYPE:-command}"

# ================== 危险命令黑名单 ==================

# 1. 禁止强制删除
if [[ "$COMMAND" =~ rm[[:space:]]+-rf[[:space:]]+ ]]; then
    echo "❌ 拒绝：rm -rf 太危险，请使用 trash 命令"
    echo "   建议：trash <file>  （可恢复删除）"
    exit 1
fi

# 2. 禁止删除整个项目目录
if [[ "$COMMAND" =~ rm.*refboard || "$COMMAND" =~ rm.*deco ]]; then
    echo "❌ 拒绝：不能删除项目根目录"
    exit 1
fi

# 3. 强制推送需要确认
if [[ "$COMMAND" =~ git[[:space:]]+push.*--force ]]; then
    echo "⚠️  警告：强制推送会覆盖远程历史"
    echo "   命令：$COMMAND"
    echo ""
    echo "如果确认要执行，请使用："
    echo "   git push --force-with-lease  （更安全的强制推送）"
    exit 2  # 需要用户确认
fi

# 4. 禁止修改已归档文件
if [[ "$COMMAND" =~ \.claude/archive ]]; then
    echo "❌ 拒绝：不能修改归档文件"
    echo "   归档文件是历史记录，应保持只读"
    exit 1
fi

# 5. 禁止直接修改 node_modules 或 target
if [[ "$COMMAND" =~ (node_modules|target/debug|target/release) ]]; then
    if [[ "$COMMAND" =~ (rm|mv|cp|edit) ]]; then
        echo "⚠️  警告：不应手动修改构建产物目录"
        echo "   node_modules → npm install"
        echo "   target/ → cargo build"
        exit 2
    fi
fi

# 6. 禁止在生产环境执行危险操作（如果有）
# if [[ "$COMMAND" =~ production && "$COMMAND" =~ (drop|truncate|delete) ]]; then
#     echo "❌ 拒绝：生产环境禁止危险操作"
#     exit 1
# fi

# ================== 允许执行 ==================

echo "✅ 命令安全检查通过"
exit 0
