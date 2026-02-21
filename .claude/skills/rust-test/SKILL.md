---
name: rust-test
description: Run Rust tests and linting in one command
disable-model-invocation: false
---

# Rust Test Skill

Quick test + lint execution for Tauri backend.

## What it does

1. **Run all tests**
   ```bash
   cd desktop/src-tauri
   cargo test --all-features
   ```

2. **Run clippy linter**
   ```bash
   cargo clippy -- -D warnings
   ```

3. **Report results**
   - Exit 0 if all pass
   - Exit 1 if any fail (blocks commit)

## When to auto-invoke

- After modifying Rust files in `src-tauri/src/`
- Before git commit (if Rust changes detected)
- When Claude asks "Should I test this?"

## Manual trigger

```bash
/rust-test
```

Or in Claude Code prompt:
```
Run rust-test to verify my changes
```

## Output format

```
✅ Tests passed (12/12)
✅ Clippy clean (0 warnings)

Or:

❌ Test failed: test_ai_analysis::test_openai_parse
❌ Clippy warnings: 3
```
