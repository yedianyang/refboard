#!/bin/bash
# Tauri Rebuild Skill

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT/desktop"

# Parse flags
CLEAN=false
if [[ "${1:-}" == "--clean" ]]; then
    CLEAN=true
fi

# Clean if requested
if $CLEAN; then
    echo "🧹 Cleaning previous build..."
    cd src-tauri
    cargo clean
    cd ..
fi

# Rebuild
echo "🔨 Building Tauri app (debug mode)..."
npm run tauri build -- --debug

# Find and launch app
APP_PATH="src-tauri/target/debug/bundle/macos/Deco.app"

if [[ ! -d "$APP_PATH" ]]; then
    echo "❌ App bundle not found at $APP_PATH"
    exit 1
fi

echo "✅ Build complete"
echo "🚀 Launching $APP_PATH..."
open "$APP_PATH"
