---
name: techdebt
description: Find and eliminate duplicated code, update documentation
disable-model-invocation: false
---

# Techdebt Cleanup Skill

Run at the end of each development session to maintain code quality.

## Steps

1. **Search for duplicate functions**
   - Scan JavaScript files for duplicate implementations
   - Look for repeated patterns in Rust code

2. **Extract to shared utilities**
   - Move duplicates to `desktop/src/utils/` (JS) or appropriate Rust module
   - Update imports across codebase

3. **Update stale documentation**
   - Check if README.md reflects recent changes
   - Update code comments if APIs changed

4. **Run tests**
   - Frontend: `cd desktop && npm test`
   - Backend: `cd desktop/src-tauri && cargo test`

5. **Commit if changes made**
   - Use conventional commit: `refactor: eliminate code duplication`
   - Include what was deduplicated in commit message

## When to run

- End of each coding session
- Before major releases
- When code review identifies duplication

## Manual trigger

```bash
/techdebt
```

Or let Claude auto-invoke when appropriate (e.g., after implementing multiple similar features).
