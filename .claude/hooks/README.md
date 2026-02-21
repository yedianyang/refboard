# Claude Code Hooks

Automated safety checks for Deco development.

## Available Hooks

### 1. **permission** — Dangerous Command Blocker
**Trigger:** Before executing any shell command

Blocks dangerous operations:
- ❌ `rm -rf` — Use `trash` instead
- ❌ `git push --force` — Use `--force-with-lease`
- ❌ Deleting project root directory
- ❌ Modifying archived files (`.claude/archive/`)
- ⚠️  Manual editing of `node_modules/` or `target/`

**How it works:**
```bash
# Claude Code asks to run: rm -rf old-code/
# Hook intercepts → Exit 1 → Command blocked
❌ 拒绝：rm -rf 太危险，请使用 trash 命令
   建议：trash <file>  （可恢复删除）
```

**Exit codes:**
- `0` — Command approved
- `1` — Command blocked (hard reject)
- `2` — Command needs user confirmation

---

### 2. **pre-commit** — Code Quality Gate
**Trigger:** Before `git commit`

Checks:
- ✅ **Frontend linting** — ESLint for JS/TS files
- ✅ **Rust compilation** — `cargo check --all-features`
- ✅ **Rust linting** — `cargo clippy` (warnings only, doesn't block)
- ⚠️  **TODO/FIXME markers** — Warns but allows commit
- ❌ **Sensitive info** — Blocks if API keys/passwords detected
- ⚠️  **Large files** — Warns for files > 1MB

**Example output:**
```bash
$ git commit -m "feat: add feature"

🔍 Pre-commit checks...

📝 Checking JavaScript/TypeScript files...
✅ ESLint passed

🦀 Checking Rust files...
✅ Cargo check passed
✅ Clippy clean

📌 Checking for TODO/FIXME markers...
⚠️  警告：提交中包含 TODO/FIXME
+   // TODO: optimize this later

🔐 Checking for sensitive information...
✅ No sensitive data detected

📦 Checking for large files...
✅ No large files

✅ All pre-commit checks passed
[main abc1234] feat: add feature
```

**If blocked:**
```bash
❌ ESLint 失败
   修复：npm run lint:fix

# Or

❌ 检测到可能的敏感信息（API key/密码/token）
+   const API_KEY = "sk-abc123xyz..."

请移除硬编码的敏感信息，使用环境变量或配置文件。
```

---

## Configuration

Hooks are configured in `.claude/settings.json`:

```json
{
  "hooks": {
    "permission": {
      "script": ".claude/hooks/permission-check.sh",
      "enabled": true
    },
    "pre-commit": {
      "script": ".claude/hooks/pre-commit.sh",
      "enabled": true
    }
  }
}
```

**Disable a hook:**
```json
"enabled": false
```

**Temporarily bypass (not recommended):**
```bash
# Claude Code doesn't support --no-verify yet
# If needed, disable in settings.json temporarily
```

---

## Testing Hooks

### Test permission hook manually
```bash
# Test dangerous command
export COMMAND_TEXT="rm -rf /"
export PERMISSION_TYPE="command"
.claude/hooks/permission-check.sh
# Expected: Exit 1

# Test safe command
export COMMAND_TEXT="npm install"
.claude/hooks/permission-check.sh
# Expected: Exit 0
```

### Test pre-commit hook manually
```bash
# Stage some changes
git add .

# Run hook
.claude/hooks/pre-commit.sh
# Expected: Runs all checks
```

---

## Hook Execution Flow

```
Claude Code prepares command
  ↓
permission hook intercepts
  ↓
Exit 0? → Execute command
Exit 1? → Block + show error
Exit 2? → Ask user confirmation
  ↓
[For git commit]
  ↓
pre-commit hook runs
  ↓
Exit 0? → Commit proceeds
Exit 1? → Commit blocked + show error
```

---

## Customization

### Add new dangerous command pattern

Edit `.claude/hooks/permission-check.sh`:

```bash
# Add to permission-check.sh
if [[ "$COMMAND" =~ your-pattern ]]; then
    echo "❌ 拒绝：reason"
    exit 1
fi
```

### Add new pre-commit check

Edit `.claude/hooks/pre-commit.sh`:

```bash
# Add before "完成" section
echo ""
echo "🔍 Your custom check..."

if ! your-check-command; then
    echo "❌ Check failed"
    exit 1
fi
echo "✅ Check passed"
```

---

## Troubleshooting

### Hook not executing
1. Check `.claude/settings.json` has `"enabled": true`
2. Verify script is executable: `chmod +x .claude/hooks/*.sh`
3. Check Claude Code version supports hooks (v2.1.32+)

### Hook blocking valid command
1. Review hook logic in the script
2. Temporarily disable in `settings.json`
3. Adjust pattern matching to be more specific

### Pre-commit too slow
Common causes:
- Large number of files changed
- Slow `npm run lint` (add `.eslintignore`)
- Slow `cargo check` (use `--quiet` flag)

Optimization:
```bash
# Only check changed files
git diff --cached --name-only | grep '\.js$' | xargs eslint
```

---

## References

- **Official docs:** https://code.claude.com/docs/en/hooks
- **Project config:** `.claude/settings.json`
- **Hook scripts:** `.claude/hooks/`

---

*Created: 2026-02-22*  
*Hooks count: 2*
