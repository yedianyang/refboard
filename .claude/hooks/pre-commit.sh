#!/bin/bash
# Pre-Commit Hook — 提交前代码质量检查

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

echo "🔍 Pre-commit checks..."

# ================== 1. Frontend Linting ==================

if git diff --cached --name-only | grep -qE '\.(js|jsx|ts|tsx)$'; then
    echo ""
    echo "📝 Checking JavaScript/TypeScript files..."
    
    cd desktop
    if ! npm run lint --silent 2>/dev/null; then
        echo ""
        echo "❌ ESLint 失败"
        echo "   修复：npm run lint:fix"
        exit 1
    fi
    echo "✅ ESLint passed"
    cd "$REPO_ROOT"
fi

# ================== 2. Rust Checks ==================

if git diff --cached --name-only | grep -qE '\.rs$'; then
    echo ""
    echo "🦀 Checking Rust files..."
    
    cd desktop/src-tauri
    
    # 编译检查
    if ! cargo check --all-features --quiet 2>/dev/null; then
        echo ""
        echo "❌ Rust 编译失败"
        echo "   修复：cargo check"
        exit 1
    fi
    echo "✅ Cargo check passed"
    
    # Clippy 检查（仅警告，不阻止提交）
    if cargo clippy --all-features --quiet 2>&1 | grep -q "warning:"; then
        echo ""
        echo "⚠️  Clippy warnings detected (不阻止提交)"
        cargo clippy --all-features 2>&1 | head -20
    else
        echo "✅ Clippy clean"
    fi
    
    cd "$REPO_ROOT"
fi

# ================== 3. 检查未解决的 TODO/FIXME ==================

echo ""
echo "📌 Checking for TODO/FIXME markers..."

TODOS=$(git diff --cached | grep -E "^\+.*\b(TODO|FIXME)\b" || true)

if [[ -n "$TODOS" ]]; then
    echo ""
    echo "⚠️  警告：提交中包含 TODO/FIXME"
    echo "$TODOS"
    echo ""
    echo "这不会阻止提交，但请确保这些是有意保留的。"
fi

# ================== 4. 检查敏感信息 ==================

echo ""
echo "🔐 Checking for sensitive information..."

SENSITIVE=$(git diff --cached | grep -iE '(api_key|secret|password|token).*=.*["\'][^"\']{10,}' || true)

if [[ -n "$SENSITIVE" ]]; then
    echo ""
    echo "❌ 检测到可能的敏感信息（API key/密码/token）"
    echo "$SENSITIVE"
    echo ""
    echo "请移除硬编码的敏感信息，使用环境变量或配置文件。"
    exit 1
fi

# ================== 5. 检查大文件 ==================

echo ""
echo "📦 Checking for large files..."

LARGE_FILES=$(git diff --cached --name-only | while read file; do
    if [[ -f "$file" ]]; then
        size=$(wc -c < "$file" | xargs)
        # 警告超过 1MB 的文件
        if [[ $size -gt 1048576 ]]; then
            echo "$file ($(numfmt --to=iec-i --suffix=B $size))"
        fi
    fi
done)

if [[ -n "$LARGE_FILES" ]]; then
    echo ""
    echo "⚠️  警告：提交中包含大文件"
    echo "$LARGE_FILES"
    echo ""
    echo "考虑使用 Git LFS 或将大文件放到外部存储。"
    # 不阻止提交，仅警告
fi

# ================== 完成 ==================

echo ""
echo "✅ All pre-commit checks passed"
exit 0
