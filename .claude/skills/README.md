# Deco Skills

High-frequency automation tools for Deco development.

## Available Skills

### 1. **techdebt** — Code Quality Maintenance
**Trigger:** Auto (session end) / Manual (`/techdebt`)

Finds and eliminates duplicated code:
- Scans for duplicate functions in JS and Rust
- Extracts to shared utilities
- Updates imports across codebase
- Runs tests to verify no breakage

**When to use:**
- End of each development session
- After implementing similar features
- Before major releases

---

### 2. **rust-test** — Quick Rust Validation
**Trigger:** Auto (Rust file changes) / Manual (`/rust-test`)

Runs comprehensive Rust checks:
```bash
cargo test --all-features
cargo clippy -- -D warnings
```

**Output:**
- ✅ Tests passed (12/12)
- ✅ Clippy clean (0 warnings)

**When to use:**
- After modifying Rust backend
- Before git commit (auto-triggered)
- Verifying API contract changes

---

### 3. **tauri-rebuild** — Full App Rebuild
**Trigger:** Manual only (`/tauri-rebuild`)

Rebuilds Tauri app in debug mode and launches:
```bash
cd desktop
npm run tauri build -- --debug
open src-tauri/target/debug/bundle/macos/Deco.app
```

**Flags:**
- `--clean` — Clean previous build first

**When to use:**
- Testing major Rust API changes
- Validating app bundle integrity
- Before creating release builds

**Duration:** 2-5 minutes

---

### 4. **context-dump** — Context Recovery
**Trigger:** Auto (session start) / Manual (`/context-dump`)

Generates markdown summary of last 7 days:
- Recent commits (with dates)
- Most changed files
- Branch status
- Uncommitted changes
- Statistics (commits, lines added/removed)

**Output example:**
```markdown
# 📊 Project Context Dump

## 📝 Recent Commits (Last 7 Days)
68428a7 2026-02-22 docs: add context monitor testing
caa8b70 2026-02-22 feat: add context monitoring
...

## 📁 Most Changed Files
  15  desktop/src/main.js
  12  desktop/src-tauri/src/lib.rs
...
```

**When to use:**
- Starting new session after break
- After `/compact` context compression
- When Claude asks "What was I working on?"

---

## Manual vs Auto-Invoke

### Auto-invoke (disable-model-invocation: false)
Claude Code decides when to run:
- ✅ **techdebt** — Session end
- ✅ **rust-test** — Rust file changes
- ✅ **context-dump** — Session start

### Manual-only (disable-model-invocation: true)
Requires explicit trigger:
- 🔒 **tauri-rebuild** — Too slow for auto (2-5 min)

## Creating New Skills

1. Create directory: `.claude/skills/my-skill/`
2. Add `SKILL.md` with metadata:
   ```markdown
   ---
   name: my-skill
   description: What this skill does
   disable-model-invocation: false
   ---
   
   # My Skill
   
   Detailed description and usage...
   ```
3. (Optional) Add `run.sh` executable script
4. Update `CLAUDE.md` to document the new skill

## Testing Skills

```bash
# Test directly
.claude/skills/context-dump/run.sh

# Or via Claude Code
/context-dump
```

## Skill Execution Flow

```
User/Claude triggers skill
  ↓
Claude Code reads SKILL.md
  ↓
Executes run.sh (if exists)
  ↓
Returns output to Claude
  ↓
Claude interprets and acts on results
```

---

## References

- **Official docs:** https://code.claude.com/docs/en/skills
- **Project docs:** `CLAUDE.md` → Skills 系统章节
- **Skill examples:** `~/.openclaw/skills/` (OpenClaw preset skills)

---

*Created: 2026-02-22*  
*Skills count: 4*
