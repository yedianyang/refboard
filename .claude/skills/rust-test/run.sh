#!/bin/bash
# Rust Test + Lint Skill

set -euo pipefail

cd "$(git rev-parse --show-toplevel)/desktop/src-tauri"

echo "🧪 Running Rust tests..."
if cargo test --all-features --quiet "$@"; then
    echo "✅ Tests passed"
else
    echo "❌ Tests failed"
    exit 1
fi

echo ""
echo "🔍 Running Clippy..."
if cargo clippy --all-features -- -D warnings 2>&1 | grep -q "warning:"; then
    echo "❌ Clippy warnings found"
    cargo clippy --all-features -- -D warnings
    exit 1
else
    echo "✅ Clippy clean"
fi

echo ""
echo "✅ All Rust checks passed"
