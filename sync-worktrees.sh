#!/bin/bash
# 同步所有 worktree 到最新 main
set -e

echo "📦 Syncing all worktrees to main..."

cd ~/Projects/refboard
echo "→ Pulling main..."
git pull 2>/dev/null || true

for wt in refboard-frontend refboard-quality refboard-docs; do
  dir=~/Projects/$wt
  if [ -d "$dir" ]; then
    echo "→ Syncing $wt..."
    cd "$dir" && git merge main --no-edit 2>/dev/null && echo "  ✅ $wt synced" || echo "  ⚠️  $wt has conflicts — resolve manually"
  fi
done

echo ""
echo "Done! Worktree status:"
cd ~/Projects/refboard && git worktree list
