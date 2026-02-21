#!/bin/bash
# 测试 Context Monitor 的日志解析功能

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/monitor-context.sh"

echo "=== Context Monitor 功能测试 ==="
echo

# 测试1：模拟 Claude Code 输出格式1
echo "测试 1: 'Context: 45234/200000 (22%)' 格式"
test_output="Some output
Context: 45234/200000 (22%)
More text"
result=$(echo "$test_output" | grep -oE 'Context:.*\(([0-9]+)%\)' | grep -oE '[0-9]+%' | tr -d '%')
echo "  解析结果: ${result}%"
echo "  预期: 22"
[[ "$result" == "22" ]] && echo "  ✅ 通过" || echo "  ❌ 失败"
echo

# 测试2：模拟格式2
echo "测试 2: '⚠️ Context low: 8%' 格式"
test_output="Warning
⚠️ Context low: 8%
End"
result=$(echo "$test_output" | grep -oE 'Context low:.*([0-9]+)%' | grep -oE '[0-9]+%' | tr -d '%')
echo "  解析结果: ${result}%"
echo "  预期: 8"
[[ "$result" == "8" ]] && echo "  ✅ 通过" || echo "  ❌ 失败"
echo

# 测试3：模拟格式3（分数计算）
echo "测试 3: '45234/200000' 格式（需计算）"
test_output="Usage: 45234/200000"
used=$(echo "$test_output" | grep -oE '[0-9]+/[0-9]+' | cut -d/ -f1)
total=$(echo "$test_output" | grep -oE '[0-9]+/[0-9]+' | cut -d/ -f2)
result=$(( (total - used) * 100 / total ))
echo "  已用: $used / 总量: $total"
echo "  计算结果: ${result}%"
echo "  预期: 77"
[[ "$result" == "77" ]] && echo "  ✅ 通过" || echo "  ❌ 失败"
echo

echo "=== 测试完成 ==="
