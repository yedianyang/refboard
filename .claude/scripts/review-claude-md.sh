#!/bin/bash
# Manual CLAUDE.md Review Trigger
# 手动触发 Claude Code 对 CLAUDE.md 的 review

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

echo "🔍 Analyzing last 7 days of commits..."
echo ""

# 显示最近的 commits
git log --oneline --since="7 days ago" | head -10

echo ""
echo "📝 Triggering Claude Code review..."
echo ""
echo "Please run in Claude Code:"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
cat << 'EOF'
Review CLAUDE.md based on the above commits.

Update "Past Mistakes to Avoid" section:
1. Add new lessons learned from failed attempts
2. Add patterns from bug fixes
3. Remove rules that are now obvious or outdated

Be concise. Each entry should be:
- [date]: Don't do X. Instead do Y. (because Z)

If changes made, commit with:
docs: weekly CLAUDE.md review
EOF
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Or use OpenClaw to send to Claude agent:"
echo ""
echo "  openclaw msg send --message \"<paste above>\" --agent main"
