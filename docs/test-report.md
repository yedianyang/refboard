# RefBoard CLI Test Report

> Tester: @Tester | Date: 2026-02-14
> Node: v22.22.0 | Platform: darwin

---

## Summary

| Metric | Value |
|--------|-------|
| Commands Tested | 17 |
| PASS | 0 |
| FAIL | 17 |
| Critical Bugs | 2 |
| Minor Issues | 2 |

**Result: ALL COMMANDS FAIL.** CLI is completely non-functional due to a broken import.

---

## BUG-001 (CRITICAL) - CLI cannot start: missing exports

**File:** `bin/refboard.js:7`
**Assigned to:** @Generator

### Description

The CLI imports `savePositions` and `loadPositions` from `lib/generator.js`, but these functions do not exist and are not exported.

```js
// bin/refboard.js:7
import { generateBoard, findImages, autoLayout, loadMetadata, savePositions, loadPositions } from '../lib/generator.js';
```

`lib/generator.js:317` only exports:
```js
export { findImages, loadMetadata, autoLayout };
// + generateBoard (named export at line 206)
```

### Reproduction

```bash
$ node bin/refboard.js help
SyntaxError: The requested module '../lib/generator.js' does not provide an export named 'loadPositions'
```

### Impact

**ALL 17 commands are blocked.** No CLI command can execute because Node.js refuses to load the module.

### Fix

Either:
1. Remove unused imports `savePositions, loadPositions` from `bin/refboard.js`
2. Or implement and export these functions in `lib/generator.js`

---

## BUG-002 (CRITICAL) - 7 command handlers referenced but never defined

**File:** `bin/refboard.js:31-37`
**Assigned to:** @Generator

### Description

The commands map references 7 handler functions that are never defined in the file:

| Command | Handler Function | Line |
|---------|-----------------|------|
| `analyze` | `analyzeCommand` | 31 |
| `auto-tag` | `autoTagCommand` | 32 |
| `search` | `searchCommand` | 33 |
| `ask` | `askCommand` | 34 |
| `config` | `configCommand` | 35 |
| `agent` | `agentCommand` | 36 |
| `save-positions` | `savePositionsCommand` | 37 |

### Reproduction

Even if BUG-001 were fixed, running any of these commands would cause:
```bash
$ refboard analyze test.jpg
ReferenceError: analyzeCommand is not defined
```

### Impact

7 out of 17 commands would crash at runtime. These include all AI/agent functionality and the config/save-positions utilities.

### Fix

Implement the 7 missing functions, or remove them from the commands map and `help` output until they are ready.

---

## ISSUE-001 (Minor) - console.warn in library code

**File:** `lib/generator.js:159`
**Assigned to:** @Generator

### Description

`loadMetadata()` uses `console.warn()` directly, violating the project convention that library functions should not produce console output (only the CLI layer should).

```js
console.warn(`Warning: Could not parse metadata.json: ${e.message}`);
```

### Fix

Either throw the error or return it in the result for the CLI layer to handle.

---

## ISSUE-002 (Minor) - Unused template placeholder replacements

**File:** `lib/generator.js:302,310`
**Assigned to:** @Generator / @Template

### Description

The generator replaces `{{DESCRIPTION}}` and `{{GENERATED_AT}}` in the board template, but these placeholders do not exist in `templates/board.html`. The replacements are silent no-ops.

```js
.replaceAll('{{DESCRIPTION}}', escapeHtml(boardDescription))  // no match in template
.replaceAll('{{GENERATED_AT}}', new Date().toISOString())      // no match in template
```

`{{GENERATED_AT}}` is also replaced in `lib/dashboard.js:141` but does not exist in `templates/dashboard.html`.

### Fix

Either add the placeholders to the templates, or remove the dead replacement code.

---

## Per-Command Test Results

Since BUG-001 blocks all execution, results below are based on **static code analysis**.

| # | Command | Status | Notes |
|---|---------|--------|-------|
| 1 | `help` | FAIL | Blocked by BUG-001 |
| 2 | `init` | FAIL | Blocked by BUG-001; code looks correct |
| 3 | `add` | FAIL | Blocked by BUG-001; code looks correct |
| 4 | `import` | FAIL | Blocked by BUG-001; code looks correct |
| 5 | `build` | FAIL | Blocked by BUG-001; code looks correct |
| 6 | `watch` | FAIL | Blocked by BUG-001; code looks correct |
| 7 | `list` | FAIL | Blocked by BUG-001; code looks correct |
| 8 | `remove` | FAIL | Blocked by BUG-001; code looks correct |
| 9 | `meta` | FAIL | Blocked by BUG-001; code looks correct |
| 10 | `status` | FAIL | Blocked by BUG-001; code looks correct |
| 11 | `home` | FAIL | Blocked by BUG-001; code looks correct |
| 12 | `analyze` | FAIL | BUG-001 + BUG-002 (handler missing) |
| 13 | `auto-tag` | FAIL | BUG-001 + BUG-002 (handler missing) |
| 14 | `search` | FAIL | BUG-001 + BUG-002 (handler missing) |
| 15 | `ask` | FAIL | BUG-001 + BUG-002 (handler missing) |
| 16 | `config` | FAIL | BUG-001 + BUG-002 (handler missing) |
| 17 | `agent` | FAIL | BUG-001 + BUG-002 (handler missing) |
| 18 | `save-positions` | FAIL | BUG-001 + BUG-002 (handler missing) |
| -- | Legacy mode | FAIL | Blocked by BUG-001 |

---

## Module Health

| Module | Status | Notes |
|--------|--------|-------|
| `lib/generator.js` | OK | Loads fine, exports work |
| `lib/dashboard.js` | OK | Loads fine, exports work |
| `lib/ai-provider.js` | OK | Loads fine, all adapters defined |
| `index.js` | OK | Re-exports work correctly |
| `bin/refboard.js` | BROKEN | Cannot load (BUG-001) |

---

## Recommendations

1. **@Generator**: Fix BUG-001 immediately — remove or implement the missing exports. This unblocks all other testing.
2. **@Generator**: For BUG-002, either implement the 7 missing command handlers, or register them as stubs that print "not yet implemented" so other commands work.
3. After BUG-001 is fixed, @Tester will re-run full functional testing (init -> add -> build -> list -> status -> remove -> meta -> home cycle).

---

*Report generated by @Tester — waiting for @Generator to fix blockers before re-test.*
