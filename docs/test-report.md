# RefBoard CLI Test Report (Round 2)

> Tester: @Tester | Date: 2026-02-14
> Node: v22.22.0 | Platform: darwin

---

## Summary

| Metric | Value |
|--------|-------|
| Commands Total | 19 (incl. new `serve`) |
| Tested (functionally) | 15 |
| PASS | 13 |
| FAIL (before BUG-003) | 2 (not tested: `home`, `watch`) |
| FAIL (after BUG-003) | 19 (all blocked) |
| Bugs Found | 4 (1 old fixed, 1 new critical, 2 design issues) |

**Round 1:** BUG-001 and BUG-002 completely blocked CLI. Generator fixed both.

**Round 2:** After fixes, 13 commands PASS. Then a new change introduced BUG-003 (duplicate export), breaking CLI again.

---

## Bug Status

| Bug | Severity | Status | Owner |
|-----|----------|--------|-------|
| BUG-001 (missing exports) | CRITICAL | ✅ FIXED | @Generator |
| BUG-002 (missing handlers) | CRITICAL | ✅ FIXED | @Generator |
| BUG-003 (duplicate export) | CRITICAL | ❌ OPEN | @Generator |
| BUG-004 (build --json leaks log) | LOW | ❌ OPEN | @Generator |
| Metro's save-positions bug | - | ✅ FIXED | @Generator |
| ISSUE-001 (console.warn) | MINOR | ❌ OPEN | @Generator |
| ISSUE-002 (dead placeholders) | MINOR | ❌ OPEN | @Generator @Template |

---

## BUG-003 (CRITICAL) - Duplicate export of `renderBoard`

**File:** `lib/generator.js:218` + `lib/generator.js:380`
**Assigned to:** @Generator

### Description

`renderBoard` is exported twice:
1. Line 218: `export function renderBoard(...)` (named export)
2. Line 380: `export { ..., renderBoard }` (re-export)

Node.js rejects the module with `SyntaxError: Duplicate export of 'renderBoard'`.

### Reproduction

```bash
$ node bin/refboard.js help
SyntaxError: Duplicate export of 'renderBoard'
    at compileSourceTextModule (node:internal/modules/esm/utils:346:16)
```

### Impact

**ALL 19 commands blocked.** Same severity as BUG-001 — no CLI command can run.

### Fix

Remove `renderBoard` from line 380's export list (it's already exported at line 218):
```js
export { findImages, loadMetadata, autoLayout, savePositions, loadPositions };
```

---

## BUG-004 (LOW) - `build --json` leaks log() output

**File:** `bin/refboard.js:191-206`
**Assigned to:** @Generator

### Description

When running `build --json`, the output is not clean JSON. `log()` messages ("RefBoard build", "Project: ...") are printed before the JSON object.

### Reproduction

```bash
$ refboard build --json
RefBoard build                    # <-- not JSON
  Project: test-project           # <-- not JSON
{"success":true,"itemCount":3,"output":"..."}
```

### Expected

Only the JSON line should be printed. Either suppress `log()` when `--json` is set, or recommend using `-q --json`.

---

## BUG-001 (FIXED) - Missing exports from generator.js

**Status:** ✅ Fixed by @Generator. `savePositions` and `loadPositions` now implemented and exported.

## BUG-002 (FIXED) - 7 missing command handlers

**Status:** ✅ Fixed by @Generator. All 7 handlers implemented:
`analyzeCommand`, `autoTagCommand`, `searchCommand`, `askCommand`, `configCommand`, `agentCommand`, `savePositionsCommand`.

## Metro's save-positions bug (FIXED)

**Status:** ✅ Fixed. `savePositions` now supports both numeric ID keys and filename keys (line 322-331).

---

## Per-Command Test Results

Tests ran successfully between BUG-001/002 fix and BUG-003 introduction.

| # | Command | Status | Notes |
|---|---------|--------|-------|
| 1 | `help` | ✅ PASS | Shows all 19 commands + options |
| 2 | `init [dir]` | ✅ PASS | Creates project, detects duplicates |
| 3 | `add <image>` | ✅ PASS | Copies image, updates metadata, supports --title/--artist/--tags |
| 4 | `add` (no args) | ✅ PASS | Correct error message + exit 1 |
| 5 | `import <folder>` | ✅ PASS | Imports 2 images, skips existing, auto-builds |
| 6 | `build` | ✅ PASS | Generates board.html with 3 items |
| 7 | `build --json` | ⚠ PASS* | Returns JSON but leaks log() lines (BUG-004) |
| 8 | `build --embed` | ✅ PASS | Generates with base64-embedded images |
| 9 | `list` | ✅ PASS | Shows items with titles, artists, tags |
| 10 | `list --json` | ✅ PASS | Clean JSON array output |
| 11 | `status` | ✅ PASS | Shows name/title/items/tags/lastBuild |
| 12 | `status --json` | ✅ PASS | Clean JSON output |
| 13 | `meta <n> --title/--tags` | ✅ PASS | Updates metadata, prints updated item |
| 14 | `remove <n>` | ✅ PASS | Removes item from metadata |
| 15 | `config` (read all) | ✅ PASS | Shows full refboard.json |
| 16 | `config ai.provider openai` | ✅ PASS | Sets nested config value |
| 17 | `config ai.provider` (read) | ✅ PASS | Returns `"openai"` |
| 18 | `search "red"` | ✅ PASS | Finds matching item by tag/title |
| 19 | `search "blue" --json` | ✅ PASS | Returns JSON results |
| 20 | `search "nonexistent"` | ✅ PASS | "No matches found" |
| 21 | `agent export` | ✅ PASS | Outputs full metadata JSON |
| 22 | `agent layout` | ✅ PASS | Re-lays out 3 items |
| 23 | `agent` (no sub) | ✅ PASS | Correct usage error |
| 24 | `save-positions` (filename keys) | ✅ PASS | All positions saved correctly |
| 25 | `save-positions` (numeric keys) | ✅ PASS | Maps IDs to sorted filenames correctly |
| 26 | `home` | ⏭ SKIPPED | Opens browser; tested existence only |
| 27 | `watch` | ⏭ SKIPPED | Long-running; tested build path instead |
| 28 | `serve` | ❌ BLOCKED | BUG-003 prevents testing |
| 29 | `analyze` | ❌ BLOCKED | BUG-003 + needs AI provider |
| 30 | `auto-tag` | ❌ BLOCKED | BUG-003 + needs AI provider |
| 31 | `ask` | ❌ BLOCKED | BUG-003 + needs AI provider |

---

## AI Provider Dual-Path Testing

**Status:** ❌ BLOCKED by BUG-003

Planned tests (pending BUG-003 fix):

### Path 1: OpenClaw Gateway (localhost:18789)

| Test | Command | Status |
|------|---------|--------|
| analyze via openclaw | `refboard analyze <img> --provider openclaw` | ⬜ Pending |
| auto-tag via openclaw | `refboard auto-tag --all --provider openclaw` | ⬜ Pending |
| ask via openclaw | `refboard ask "question" --provider openclaw` | ⬜ Pending |

### Path 2: Direct API

| Test | Command | Status |
|------|---------|--------|
| analyze via openai | `refboard analyze <img> --provider openai` | ⬜ Pending |
| analyze via anthropic | `refboard analyze <img> --provider anthropic` | ⬜ Pending |
| error handling (no key) | `refboard analyze <img> --provider openai` (no API key) | ⬜ Pending |

**Prerequisites:**
1. BUG-003 must be fixed
2. OpenClaw Gateway must be running on localhost:18789 (Path 1)
3. API keys must be configured in env vars or refboard.json (Path 2)

---

## Module Health

| Module | Status | Notes |
|--------|--------|-------|
| `lib/generator.js` | ❌ BROKEN | Duplicate export of `renderBoard` (BUG-003) |
| `lib/dashboard.js` | ✅ OK | Loads fine |
| `lib/ai-provider.js` | ✅ OK | All 6 adapters defined |
| `lib/server.js` | ❌ BLOCKED | Depends on generator.js |
| `index.js` | ❌ BLOCKED | Re-exports from generator.js |
| `bin/refboard.js` | ❌ BLOCKED | Imports from generator.js |

---

## New Features Verified (via code review)

| Feature | Added By | Status |
|---------|----------|--------|
| `serve` command + livereload | @Generator | Code present, untested (BUG-003) |
| `renderBoard()` pure function | @Generator | Code present, untested (BUG-003) |
| `/api/metadata` endpoint | @Generator | Code present, untested (BUG-003) |
| SSE livereload injection | @Generator | Code present, untested (BUG-003) |
| `imageBaseUrl` option | @Generator | Code present, untested (BUG-003) |

---

## Recommendations

1. **@Generator:** Fix BUG-003 immediately — remove `renderBoard` from line 380 export list. One-line fix.
2. **@Generator:** Fix BUG-004 — suppress `log()` when `--json` flag is set in `buildBoard()`.
3. **@Tester:** After BUG-003 fix, run:
   - `serve` command test (with livereload)
   - AI dual-path tests (openclaw + direct API)
   - `home` command generation test
4. **@Generator:** ISSUE-001 (`console.warn` in library) still open.

---

*Report generated by @Tester (Round 2) — BUG-003 blocks final testing.*
