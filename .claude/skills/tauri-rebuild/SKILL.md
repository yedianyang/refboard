---
name: tauri-rebuild
description: Rebuild Tauri app and launch for testing
disable-model-invocation: true
---

# Tauri Rebuild Skill

Full rebuild of Tauri desktop app in debug mode, then launch.

## What it does

1. **Clean previous build** (optional, use `--clean` flag)
   ```bash
   cd desktop/src-tauri
   cargo clean
   ```

2. **Build debug app**
   ```bash
   cd desktop
   npm run tauri build -- --debug
   ```

3. **Launch app**
   ```bash
   open src-tauri/target/debug/bundle/macos/Deco.app
   ```

## When to use

- After major Rust API changes
- Testing packaging configuration
- Validating app bundle integrity
- Before creating release builds

## Manual trigger only

This skill requires **manual invocation** (`disable-model-invocation: true`) because:
- Rebuilds take 2-5 minutes
- Should not auto-trigger on every change
- User needs to verify timing

```bash
/tauri-rebuild
```

Or with clean:
```bash
/tauri-rebuild --clean
```

## Platform support

Currently macOS only. For other platforms:
- **Linux**: `target/debug/bundle/appimage/deco_*.AppImage`
- **Windows**: `target/debug/bundle/msi/Deco_*.msi`
