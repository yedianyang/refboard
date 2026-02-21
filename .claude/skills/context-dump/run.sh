#!/bin/bash
# Context Dump Skill

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

echo "# 📊 Project Context Dump"
echo ""
echo "**Generated:** $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# Recent commits (last 7 days)
echo "## 📝 Recent Commits (Last 7 Days)"
echo ""
echo "\`\`\`"
git log --oneline --since="7 days ago" --pretty=format:"%h %ad %s" --date=short | head -20
echo ""
echo "\`\`\`"
echo ""

# Changed files summary
echo "## 📁 Most Changed Files (Last 7 Days)"
echo ""
echo "\`\`\`"
git log --since="7 days ago" --pretty=format: --name-only | \
    sort | uniq -c | sort -rn | head -10 | \
    awk '{printf "%-5s %s\n", $1, $2}'
echo "\`\`\`"
echo ""

# Current branch and status
echo "## 🌿 Branch Status"
echo ""
echo "**Current branch:** \`$(git branch --show-current)\`"
echo ""
echo "**Active branches:**"
echo "\`\`\`"
git branch -a | head -10
echo "\`\`\`"
echo ""

# Uncommitted changes
echo "## 🔄 Uncommitted Changes"
echo ""
if git diff --quiet && git diff --cached --quiet; then
    echo "✅ Working directory clean"
else
    echo "**Staged:**"
    git diff --cached --name-status | head -10
    echo ""
    echo "**Modified:**"
    git diff --name-status | head -10
fi
echo ""

# Untracked files
UNTRACKED=$(git ls-files --others --exclude-standard | wc -l | xargs)
if [[ "$UNTRACKED" -gt 0 ]]; then
    echo "**Untracked files:** $UNTRACKED"
    git ls-files --others --exclude-standard | head -5
    echo ""
fi

# Statistics
echo "## 📈 Statistics (Last 7 Days)"
echo ""
COMMIT_COUNT=$(git log --since="7 days ago" --oneline | wc -l | xargs)
ADDITIONS=$(git log --since="7 days ago" --numstat --pretty="%H" | \
    awk 'NF==3 {plus+=$1} END {print plus}')
DELETIONS=$(git log --since="7 days ago" --numstat --pretty="%H" | \
    awk 'NF==3 {minus+=$2} END {print minus}')

echo "- **Commits:** $COMMIT_COUNT"
echo "- **Lines added:** ${ADDITIONS:-0}"
echo "- **Lines removed:** ${DELETIONS:-0}"
echo ""

# Recent tags (if any)
LATEST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "none")
if [[ "$LATEST_TAG" != "none" ]]; then
    echo "## 🏷️  Latest Tag"
    echo ""
    echo "\`$LATEST_TAG\`"
    echo ""
fi

echo "---"
echo "*Use this summary to quickly understand recent project activity.*"
