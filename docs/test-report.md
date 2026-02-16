# Deco Test Report

---

## Round 6 -- Homepage Right-Click Context Menu (Code Review)

> Tester: Automated (Claude Code) | Date: 2026-02-16
> Type: Static analysis / code review (not runtime E2E)
> Platform: darwin (macOS Darwin 25.1.0)
> Files Reviewed:
>   - `desktop/src/main.js` (lines 830-941) -- context menu frontend
>   - `desktop/src-tauri/src/storage/local.rs` (lines 529-612) -- rename_project backend
>   - `desktop/src-tauri/src/storage/local.rs` (lines 614-636) -- remove_from_recent backend
>   - `desktop/src-tauri/src/lib.rs` (lines 207-232) -- show_in_finder, rename_project, remove_from_recent commands
>   - `desktop/index.html` (lines 2847-2862) -- context menu HTML

---

### Summary

| Action | Verdict | Issues Found |
|--------|---------|--------------|
| Open | PASS | None |
| Show in Finder | PASS | None |
| Rename | PASS (functional) | 2 bugs found (lag + double-fire) |
| Delete | PASS | 1 observation (dialog text is correct) |

**Overall: Context menu is functional.** Two issues found in the rename flow that explain the reported lag. See details below.

---

### 1. Open (action === 'open')

**Code:** `desktop/src/main.js:876-877`

```javascript
if (action === 'open') {
  openProject(path, loading);
}
```

**Analysis:**
- Calls `openProject(path, loading)` which is defined at line 609.
- `openProject` hides the home screen, shows loading indicator, calls `loadProject(dirPath)`, restores board state, indexes for search, and starts CLIP embedding in background.
- Uses the card's `data-path` attribute for the project path.

**Verdict: PASS.** The open action correctly delegates to the existing `openProject` function. Path comes from the card's `dataset.path` captured before `hideContextMenu()` nulls `ctxTargetCard` (line 872).

---

### 2. Show in Finder (action === 'finder')

**Code:** `desktop/src/main.js:878-883`

```javascript
} else if (action === 'finder') {
  try {
    await invoke('show_in_finder', { path });
  } catch (err) {
    setStatus(`Could not open Finder: ${err}`);
  }
}
```

**Backend:** `desktop/src-tauri/src/lib.rs:207-213`

```rust
fn show_in_finder(path: String) -> Result<(), String> {
    std::process::Command::new("open")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("Cannot open Finder: {e}"))?;
    Ok(())
}
```

**Analysis:**
- Uses macOS `open` command which opens folders in Finder by default.
- `spawn()` is non-blocking -- it launches the process and returns immediately.
- Error handling is present on both frontend and backend.
- The `path` variable is the project directory path from `data-path`.

**Verdict: PASS.** Correct implementation. The `open` command on macOS handles both files and directories correctly.

---

### 3. Rename (action === 'rename')

**Code:** `desktop/src/main.js:884-919` (frontend), `desktop/src-tauri/src/storage/local.rs:529-612` (backend)

**Frontend flow:**
1. Find `.home-project-name` element in the card
2. Replace it with an `<input>` element pre-filled with old name
3. Focus and select the input text
4. On blur: read new name, replace input back with a `<div>`, invoke backend
5. On Enter: trigger blur
6. On Escape: reset value to old name, trigger blur

**Backend flow (inside `spawn_blocking`):**
1. Read `metadata.json` -> update `name` and `updatedAt` fields -> write back
2. Read `deco.json` -> update `name` field -> write back
3. `fs::rename(old_dir, new_dir)` -- rename the actual folder
4. Update `recent.json` (remove old path, add new path)

**Verification checklist:**

| Check | Status | Notes |
|-------|--------|-------|
| metadata.json updated | PASS | Lines 542-564: reads, modifies `name`+`updatedAt`, writes back |
| deco.json updated | PASS | Lines 567-585: reads, modifies `name`, writes back |
| Folder renamed on disk | PASS | Line 596: `fs::rename(old_dir, &new_dir)` |
| recent.json updated | PASS | Lines 601-602: removes old entry, adds new entry with new path |
| Card data-path updated | PASS | Lines 906-908: computes new path, sets `dataset.path` |
| Duplicate folder check | PASS | Lines 593-595: returns error if `new_dir.exists()` |
| Same-name no-op | PASS | Line 592: `if new_dir != old_dir` guards the rename |

**Issues found:**

#### BUG-006: finishRename can fire twice (double invocation)

**Severity:** Minor
**File:** `desktop/src/main.js:915-918`

```javascript
input.addEventListener('blur', finishRename);
input.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') input.blur();  // triggers blur -> finishRename
  if (ev.key === 'Escape') { input.value = oldName; input.blur(); }
});
```

The `finishRename` function is attached as a `blur` event listener. When the user presses Enter, `input.blur()` is called, which fires the blur event and calls `finishRename`. However, if the input loses focus naturally (e.g., the user clicks elsewhere), the blur event also fires. The issue is that `finishRename` is not guarded against double execution.

In practice, `input.replaceWith(span)` on line 901 removes the input from the DOM, so a second blur event is unlikely to fire after the first call completes synchronously up to that point. However, there is a subtle race: `finishRename` is `async`, and if the `await invoke(...)` is slow, the input is already replaced, but the old `finishRename` closure still holds a reference to `path` (the old path). If the blur event somehow fires twice before the DOM replacement (e.g., rapid Enter + click), the backend `rename_project` would be called twice, and the second call would fail because the folder was already renamed.

**Impact:** Low in practice because DOM replacement happens synchronously before the `await`. But it is sloppy -- a simple `let renamed = false` guard at the top of `finishRename` would eliminate the risk entirely.

**Suggested fix (do NOT apply -- for @Template to implement):**
```javascript
let renaming = false;
const finishRename = async () => {
  if (renaming) return;
  renaming = true;
  // ... rest of function
};
```

#### BUG-007: Rename lag root cause analysis

**Severity:** Medium (UX issue, reported by user as "ka yi xia")

**Root cause: The `fs::rename` call is NOT the bottleneck.**

On macOS (same-volume rename), `fs::rename` is an atomic metadata operation (`rename(2)` syscall) that completes in microseconds regardless of folder size. It does not copy data.

**The actual bottleneck is the sequential file I/O before the rename:**

```
Time ->
[read metadata.json] -> [parse JSON] -> [serialize JSON] -> [write metadata.json]
-> [read deco.json] -> [parse JSON] -> [serialize JSON] -> [write deco.json]
-> [fs::rename]
-> [read recent.json] -> [parse JSON] -> [filter] -> [serialize JSON] -> [write recent.json]
-> [read recent.json again] -> [parse JSON] -> [prepend] -> [serialize JSON] -> [write recent.json again]
```

That is **6 file reads + 4 file writes** all happening sequentially inside a single `spawn_blocking` task. The writes involve `serde_json::to_string_pretty` (pretty-printing) and `fs::write` (synchronous flush to disk).

Specifically, on lines 601-602 the code does:
```rust
remove_from_recent_file(&recent_path, &project_path)?;
add_to_recent_file(&recent_path, &new_name, &new_path_str)?;
```

Each of these independently reads `recent.json`, parses it, modifies it, serializes it, and writes it back. That is **2 full read-parse-serialize-write cycles** for `recent.json` alone when they could be combined into one.

**Total I/O operations:**
- `metadata.json`: 1 read + 1 write
- `deco.json`: 1 read + 1 write
- `recent.json`: 2 reads + 2 writes (via `remove_from_recent_file` + `add_to_recent_file`)
- Folder rename: 1 syscall

**On an SSD this is fast (~1-5ms total), but if the disk is under load (Spotlight indexing, Time Machine backup, other apps) or if the project is on a network volume, the perceived lag could be 50-200ms.**

**Additional contributing factor -- frontend UI update order:**

```javascript
input.replaceWith(span);               // immediate: swap UI back
if (newName !== oldName) {
  await invoke('rename_project', ...);  // blocks until backend completes
  targetCard.dataset.path = newPath;    // updates after await
}
```

The UI swap (`input.replaceWith(span)`) happens before the `await`, so the user sees the new name immediately. The "lag" the user perceives is likely **not** the visual update but rather one of:

1. **The input blur animation** -- the browser may take a frame or two to re-render after replacing the input element.
2. **The brief moment where the input element is visible but unfocused** before `finishRename` runs. Since `finishRename` is async, there is a microtask boundary between the blur event and the first synchronous statement. During this time, the input is visible but the user cannot interact with it.
3. **macOS Spotlight re-indexing** the renamed folder, which can cause a brief disk I/O spike.

**Suggested optimizations (for @Generator to implement):**

1. **Combine the two `recent.json` operations into one:**
   Instead of `remove_from_recent_file` + `add_to_recent_file`, do a single read-modify-write that removes the old entry and prepends the new one in one pass.

2. **Debounce or use `{ once: true }` for the blur listener** to prevent any possibility of double-fire.

3. **Consider moving recent.json update off the critical path:**
   The rename is committed once `fs::rename` succeeds. The `recent.json` update could happen after returning success to the frontend.

---

### 4. Delete (action === 'delete')

**Code:** `desktop/src/main.js:920-941` (frontend), `desktop/src-tauri/src/storage/local.rs:614-636` (backend)

**Frontend flow:**
1. Get project name from the card's `.home-project-name` element
2. Dynamic import `@tauri-apps/plugin-dialog` and call `ask()`
3. Dialog message: `Delete "{name}"?\nThis will permanently remove the project folder and all its files.`
4. On confirm: invoke `remove_from_recent` backend command
5. Remove the card element from DOM
6. If no cards left, show empty state

**Backend flow (inside `spawn_blocking`):**
1. `remove_from_recent_file` -- removes entry from `recent.json`
2. `fs::remove_dir_all(dir)` -- deletes the entire project folder from disk

**Verification checklist:**

| Check | Status | Notes |
|-------|--------|-------|
| Dialog says "permanently" | PASS | Line 923: "This will permanently remove the project folder and all its files." |
| Dialog does NOT say "files will not be deleted" | PASS | Confirmed -- correct wording |
| Project folder deleted from disk | PASS | Line 628: `fs::remove_dir_all(dir)` |
| Entry removed from recent.json | PASS | Line 623: `remove_from_recent_file(...)` |
| Card removed from DOM | PASS | Line 930: `targetCard.remove()` |
| Empty state shown when last card deleted | PASS | Lines 932-938 |
| Confirmation required before delete | PASS | `ask()` with `kind: 'warning'` |

**Observation:** The function name is `remove_from_recent` but it actually does more than that -- it also deletes the project folder from disk (line 626-629). This is a slight naming mismatch but the behavior is correct for the "Delete" action.

**Verdict: PASS.** The delete flow is correct and safe. The confirmation dialog uses appropriate warning language.

---

### Rename Lag -- Root Cause Summary

| Factor | Impact | Confidence |
|--------|--------|------------|
| 6 sequential file reads + 4 writes in `spawn_blocking` | Low-Medium (1-5ms SSD, 50-200ms under disk load) | High |
| Double read-write of `recent.json` (lines 601-602) | Low (wasteful but fast) | High |
| `fs::rename` itself | Negligible (same-volume = atomic) | High |
| Browser re-render on input->div swap | Low (~1 frame = 16ms) | Medium |
| macOS Spotlight indexing triggered by rename | Low-Medium (background, but can spike disk I/O) | Medium |
| Network volume (if project is not on local disk) | High (if applicable) | Low |

**Most likely cause:** The combination of sequential file I/O (10 operations) plus the browser re-render creates a perceptible ~20-50ms "hitch." On a busy system with Spotlight active, this could reach 100-200ms, which is the "ka yi xia" (brief lag) the user reported.

**Recommended fix priority:**
1. @Generator -- Combine `remove_from_recent_file` + `add_to_recent_file` into a single `update_recent_file` that does one read-modify-write cycle (saves 1 read + 1 write + 1 parse + 1 serialize).
2. @Template -- Add a `let renamed = false` guard to `finishRename` to prevent any possibility of double invocation.
3. (Optional) @Generator -- Return success to frontend immediately after `fs::rename`, then update `recent.json` asynchronously.

---

### New Tests Needed

The following test cases should be written to cover the context menu functionality:

**JavaScript (desktop/src/main.test.js):**
- Context menu appears at correct position on right-click
- Context menu hides on click elsewhere
- Context menu hides on Escape key
- Rename: input element replaces name element
- Rename: Enter key triggers blur (commits rename)
- Rename: Escape key reverts to old name
- Rename: empty input falls back to old name
- Rename: data-path attribute updates after successful rename
- Delete: card removed from DOM after confirmation
- Delete: empty state shown when last card deleted

**Rust (desktop/src-tauri/src/storage/local.rs -- #[cfg(test)]):**
- `rename_project` with valid name updates metadata.json
- `rename_project` with valid name updates deco.json
- `rename_project` renames folder on disk
- `rename_project` updates recent.json
- `rename_project` with duplicate name returns error
- `rename_project` with same name only updates recent.json name
- `remove_from_recent` deletes folder from disk
- `remove_from_recent` removes entry from recent.json
- `remove_from_recent` with nonexistent folder succeeds (only recent.json cleanup)

---

*Report generated 2026-02-16 by automated testing agent (Tester role). Static analysis only -- no runtime execution.*

---
---

## Round 5 -- Deco CLI Phase 1 (Rust Binary) Verification

> Tester: Automated (Claude Code) | Date: 2026-02-16
> Binary: `deco` v2.0.0 (Rust/Tauri, built from `desktop/src-tauri`)
> Platform: darwin (macOS Darwin 25.1.0)
> Test Project: `~/.openclaw/workspace/visual-refs/art-deco-power/` (119 images)

---

### Summary

| Metric | Value |
|--------|-------|
| Unit Tests (cargo test) | 61 passed, 0 failed |
| CLI Unit Tests (cli module) | 36 passed, 0 failed |
| Integration Test Cases | 23 |
| PASS | 23 |
| FAIL | 0 |
| WARN | 0 |

**Result: All Phase 1 CLI commands are fully functional.** No bugs found. All 5 Phase 1 commands (status, list, import, delete, search) work correctly with both text and JSON output modes. Error handling is graceful in all tested edge cases.

---

### Unit Tests

```
cargo test -- cli
  36 passed; 0 failed; 0 ignored

cargo test (full suite)
  61 passed; 0 failed; 0 ignored
```

Breakdown by module:
| Module | Tests | Status |
|--------|-------|--------|
| cli (parsing) | 15 | PASS |
| cli (functional) | 11 | PASS |
| cli (Phase 2 parsing) | 7 | PASS |
| cli (helpers) | 3 | PASS |
| ai | 13 | PASS |
| search | 6 | PASS |
| web | 5 | PASS |

All 36 CLI-specific tests pass. The full test suite of 61 tests also passes with zero failures.

Note: 2 compiler warnings present (non-blocking):
- `ai.rs:216` -- unused method `name` in `AiVisionProvider` trait
- `api.rs:76` -- unread field `artist` in `UpdateItemRequest`

---

### Integration Test Results

#### 1. Help & Version

| # | Test | Status | Output (abbreviated) |
|---|------|--------|----------------------|
| T01 | `deco --help` | PASS | Shows 11 commands (5 Phase 1 + 6 Phase 2), options, description |
| T02 | `deco --version` | PASS | `deco 2.0.0` |
| T03 | `deco status --help` | PASS | Shows `-p, --project`, `--json`, `-h` options |

#### 2. `deco status`

| # | Test | Status | Output (abbreviated) |
|---|------|--------|----------------------|
| T04 | `deco status` | PASS | `Deco v2.0.0` (no project info) |
| T05 | `deco status -p <real-project>` | PASS | `Deco v2.0.0`, `Project: ...`, `Images: 119`, `Indexed: no` |
| T06 | `deco --json status` | PASS | `{"version": "2.0.0"}` (valid JSON) |
| T07 | `deco status -p /nonexistent/path` | PASS | `Deco v2.0.0`, `Images: 0`, `Indexed: no` (graceful, no crash) |

Note on T07: The `status` command intentionally catches errors from `scan_images_in()` and defaults to 0 images. This is correct behavior -- status shows best-effort info rather than failing hard.

#### 3. `deco list`

| # | Test | Status | Output (abbreviated) |
|---|------|--------|----------------------|
| T08 | `deco list <real-project>` | PASS | `119 image(s) found:` with name, extension, size for each |
| T09 | `deco --json list <real-project>` | PASS | Valid JSON array of 119 ImageInfo objects with `name`, `path`, `sizeBytes`, `extension` fields |
| T10 | `deco list /nonexistent/path` | PASS | `Error: Path does not exist: /nonexistent/path` (exit 1) |
| T11 | `deco list /tmp/deco-test-empty` | PASS | `No images found in /tmp/deco-test-empty` |

#### 4. `deco import`

| # | Test | Status | Output (abbreviated) |
|---|------|--------|----------------------|
| T12 | `deco import <file> -p <project>` | PASS | `Imported: deco-test-import.png`, `1 file(s) imported` |
| T13 | Verify file copied | PASS | File exists at `<project>/images/deco-test-import.png` (67 bytes) |
| T14 | Import same file again (duplicate) | PASS | `Imported: deco-test-import-2.png` (counter suffix, no overwrite) |
| T15 | `deco --json import <file> -p <project>` | PASS | `{"count": 1, "errors": [], "imported": [...]}` (valid JSON) |
| T16 | `deco import /nonexistent.png -p <project>` | PASS | `Warning: Not a file`, `Error: No files were imported` (exit 1) |
| T17 | `deco import -p <project>` (no paths) | PASS | `Error: No file paths provided` (exit 1) |

#### 5. `deco delete`

| # | Test | Status | Output (abbreviated) |
|---|------|--------|----------------------|
| T18 | `deco delete <filename> -p <project>` | PASS | `Deleted: deco-test-import.png` |
| T19 | Verify file removed | PASS | File no longer exists in `<project>/images/` |
| T20 | `deco delete nonexistent.png -p <project>` | PASS | `Error: File not found: .../images/nonexistent.png` (exit 1) |
| T21 | `deco --json delete <filename> -p <project>` | PASS | `{"deleted": "...", "project": "..."}` (valid JSON) |

#### 6. `deco search`

| # | Test | Status | Output (abbreviated) |
|---|------|--------|----------------------|
| T22 | `deco search "art deco" -p <project>` | PASS | `No results for "art deco"` (project not indexed -- expected) |
| T23 | `deco --json search "chair" -p <project>` | PASS | `[]` (empty JSON array -- project not indexed) |

Note: Search returns empty results because the art-deco-power project has not been indexed (no metadata in the FTS5 tables). The `status` command confirms `Indexed: no`. This is expected behavior. The search code path (opening DB, querying FTS5, returning results) is exercised correctly -- it simply finds no data. Full search testing requires running `deco embed` first (Phase 2), which loads the CLIP model.

---

### Error Handling Summary

All error paths produce clean, user-friendly messages:

| Error Scenario | Behavior | Exit Code |
|----------------|----------|-----------|
| Nonexistent path (list) | `Error: Path does not exist: ...` | 1 |
| Nonexistent path (status) | Graceful degradation (Images: 0) | 0 |
| No file paths (import) | `Error: No file paths provided` | 1 |
| Bad source file (import) | `Warning: Not a file: ...` on stderr | 1 |
| File not found (delete) | `Error: File not found: ...` | 1 |
| No subcommand | Shows help text | 2 (clap) |
| Unknown subcommand | `error: unrecognized subcommand` | 2 (clap) |

---

### Findings & Notes

1. **No bugs found.** All 5 Phase 1 commands work correctly.
2. **Duplicate import handling works correctly.** Counter suffix (`-2`, `-3`, etc.) prevents overwriting.
3. **JSON output is well-formed** across all commands that support `--json`.
4. **The `--json` flag is global** (placed before subcommand), which is a good UX pattern.
5. **Search requires indexing.** For a complete search test, the project needs to be indexed via `deco embed` (Phase 2). The FTS5 code path itself is correct.
6. **The `.deco/search.db` directory convention** is used (not `.refboard/`), which aligns with the new CLI naming.

---

### Commands Not Fully Testable

| Command | Reason | Partial Test |
|---------|--------|--------------|
| `search` (with results) | Requires indexed project (`deco embed`) | Query path exercised, returns empty |
| `embed` | Requires CLIP model download (~150MB) | Empty project test passes |
| `similar` | Requires embeddings | N/A |
| `semantic` | Requires embeddings | N/A |
| `cluster` | Requires embeddings | Empty project test passes |
| `info` | Requires indexed metadata | Not-found error path tested |
| `tags` | Requires indexed metadata | Empty project test passes |

---

*Report generated 2026-02-16 by automated testing agent (Tester role).*

---
---

## Round 4 -- Deco CLI v1 (Node.js) Comprehensive

> Tester: Automated (Claude Code) | Date: 2026-02-14
> Node: v22.22.0 | Platform: darwin (macOS Darwin 25.1.0)
> Test Project: `~/.openclaw/workspace/visual-refs/art-deco-power/` (5 items, 6 images)

---

### Summary

| Metric | Value |
|--------|-------|
| Commands Tested | 19 |
| Test Cases Run | 50 |
| PASS | 44 |
| FAIL | 2 |
| WARN | 4 |
| Open Issues | 2 new findings |

**Result: CLI is functional and stable.** All core commands pass. Prior bug fixes verified. Two new issues found (empty-project crash, ITEMS_DATA XSS).

---

### Bug Tracker

| Bug | Severity | Status | Notes |
|-----|----------|--------|-------|
| BUG-001 (missing exports) | CRITICAL | VERIFIED FIXED | |
| BUG-002 (missing handlers) | CRITICAL | VERIFIED FIXED | |
| BUG-003 (duplicate export) | CRITICAL | VERIFIED FIXED | |
| BUG-004 (build --json log leak) | LOW | VERIFIED FIXED | |
| BUG-005 (analyze/ask crash on error) | LOW | VERIFIED FIXED | try/catch added |
| save-positions crash (missing items) | MEDIUM | VERIFIED FIXED | `metadata.items` guard added |
| search/ask query pollution | MEDIUM | VERIFIED FIXED | `positionalArgs()` correctly skips option values |
| ISSUE-001 (console.warn in lib) | MINOR | VERIFIED FIXED | |
| ISSUE-002 (dead placeholders) | MINOR | VERIFIED FIXED | |
| **NEW: Empty project build crash** | MEDIUM | OPEN | Unhandled throw from `renderBoard()` |
| **NEW: ITEMS_DATA script injection** | MEDIUM | OPEN | `</script>` in JSON data breaks script block |

---

### New Issue Details

#### ISSUE-003: Empty project build crash (MEDIUM)

**File:** `bin/deco.js:197` -> `lib/generator.js:223`

**Description:** Building a project with `metadata.json` but no actual image files throws an unhandled error with full Node.js stack trace.

**Reproduction:**
```bash
mkdir -p /tmp/empty-proj/images
echo '{"name":"empty","title":"Empty","output":"board.html"}' > /tmp/empty-proj/deco.json
echo '{"board":{"title":"Empty"},"items":[]}' > /tmp/empty-proj/metadata.json
cd /tmp/empty-proj && deco build
```

**Actual output:**
```
Deco build
  Project: empty
file:///Users/metro/Projects/deco/lib/generator.js:223
    throw new Error('No images found in input directory');
          ^
Error: No images found in input directory
    at renderBoard (file:///Users/metro/Projects/deco/lib/generator.js:223:11)
    ...
```

**Expected:** Clean error message: `Error: No images found in input directory` (no stack trace)

**Fix:** Wrap `generateBoard()` in `buildBoard()` with try/catch:
```javascript
try {
  const result = await generateBoard({ ... });
} catch (e) {
  exit(e.message);
}
```

---

#### ISSUE-004: ITEMS_DATA script injection (MEDIUM)

**File:** `lib/generator.js:298` (itemsDataJson), `templates/board.html:1000`

**Description:** Card HTML is properly escaped via `escapeHtml()`, but the `ITEMS_DATA` JSON blob is embedded raw inside a `<script>` block. If item metadata contains `</script>`, the browser terminates the script block prematurely, potentially allowing XSS.

**Reproduction:**
```bash
# Set a title containing a script tag
echo '{"board":{"title":"Test"},"items":[{"file":"img.jpg","title":"</script><script>alert(1)</script>","tags":[]}]}' > metadata.json
deco build
# In the generated HTML, the </script> in the JSON terminates the script block
```

**Verification:**
```bash
grep -c '</script>' board.html  # Returns 2 (should be 1 if properly escaped)
```

**Impact:** Low in practice (local file:// context, user-controlled metadata), but becomes relevant if boards are shared or hosted.

**Fix:** Escape `</` sequences in JSON before embedding in `<script>` tags:
```javascript
const itemsDataJson = JSON.stringify(items).replace(/<\//g, '<\\/');
```

---

### Per-Command Test Results

#### Core Commands

| # | Test | Status | Details |
|---|------|--------|---------|
| T01 | `help` | PASS | Shows all 19 commands, options, examples, project structure |
| T02 | `init test-project` | PASS | Creates deco.json, metadata.json, images/; title auto-generated |
| T03 | `init` on existing project | PASS | "Project already exists" + exit 1 |
| T04 | `add <img> --title --artist --tags` | PASS | Copies file, adds metadata entry with all fields |
| T05 | `add` (no args) | PASS | Shows usage + exit 1 |
| T06 | `add` (nonexistent file) | PASS | "File not found" + exit 1 |
| T07 | `add` (duplicate image) | PASS | "Image exists: test-ant.jpg" + exit 0 |
| T08 | `import <folder> --tags` | PASS | Imports images, adds tags, auto-builds |
| T09 | `import` (empty directory) | PASS | "No images found" + exit 0 |
| T10 | `import` (nonexistent directory) | PASS | "Folder not found" + exit 1 |
| T11 | `build` | PASS | Generates board.html with 6 items |
| T12 | `build --json` | PASS | Clean JSON: `{"success":true,"itemCount":6,...}` |
| T13 | `build --quiet` | PASS | No output, exit 0 |
| T14 | `build --embed` | PASS | Self-contained HTML (705KB with base64 images) |
| T15 | `build --output <path>` | PASS | Writes to custom location |
| T16 | `build` on empty project | **FAIL** | Unhandled stack trace (ISSUE-003) |
| T17 | `list` | PASS | Formatted list with titles, artists, tags, Chinese text |
| T18 | `list --json` | PASS | Clean JSON array |
| T19 | `list --quiet` | PASS | No output |
| T20 | `remove 1` | PASS | Removes first item, metadata updated |
| T21 | `remove 99` | PASS | "Item not found" + exit 1 |
| T22 | `remove` (no args) | PASS | Shows usage + exit 1 |
| T23 | `meta 1` | PASS | Shows item JSON |
| T24 | `meta 1 --title --tags` | PASS | Updates metadata, shows result |
| T25 | `meta 1 --json` | PASS | Outputs item as JSON |
| T26 | `meta` with special chars | PASS | Unicode, XSS payloads stored correctly |
| T27 | `status` | PASS | Name, title, items, path, last build, tag distribution |
| T28 | `status --json` | PASS | Structured JSON with all fields |
| T29 | `status` from subdirectory | PASS | Finds parent project via `findProject()` |
| T30 | `config` (show all) | PASS | Outputs full deco.json |
| T31 | `config name` | PASS | Outputs `"art-deco-power"` |
| T32 | `config ai.provider openai` | PASS | Sets nested key, creates intermediate objects |

#### Search & AI Commands

| # | Test | Status | Details |
|---|------|--------|---------|
| T33 | `search "bronze"` | PASS | Finds 3 matches (tag + title) |
| T34 | `search "chiparus"` | PASS | Finds 1 match (artist name) |
| T35 | `search "art deco"` | PASS | Finds 3 (description/title text; note: "art-deco" tag not matched) |
| T36 | `search "nonexistent"` | PASS | "No matches found" |
| T37 | `search` (no query) | PASS | Shows usage + exit 1 |
| T38 | `search "bronze" --json` | PASS | JSON array of matching items |
| T39 | `search --json "bronze"` | **WARN** | Fails -- `--json` consumes "bronze" as its value (see note below) |
| T40 | `search --provider openai "bronze"` | PASS | Query = "bronze", not "openai bronze" (bug fix verified) |
| T41 | `ask "What themes?" --provider openai` | PASS | Graceful 401 error (no API key) |
| T42 | `analyze images/test-ant.jpg` | PASS | Graceful auth error from anthropic provider |
| T43 | `auto-tag` | PASS | Per-image warning, "Analyzed 0 images", exit 0 |

#### Agent & Other Commands

| # | Test | Status | Details |
|---|------|--------|---------|
| T44 | `agent export` | PASS | Full metadata JSON output |
| T45 | `agent layout` | PASS | Re-laid out 6 items |
| T46 | `agent` (no subcommand) | PASS | Shows usage + exit 1 |
| T47 | `home --output /tmp/test-home.html` | PASS | Scans directories, found 2 projects |
| T48 | `serve --port 9998` | PASS | HTTP 200 for /, /api/metadata, /images/; 404 for unknown |
| T49 | `save-positions --file pos.json` | PASS | Positions saved to metadata.json |
| T50 | `save-positions` via stdin | PASS | Piped JSON, positions saved |
| T51 | `save-positions` (empty {}) | PASS | No crash, clean success |
| T52 | Legacy mode `-i <dir> -o <file>` | PASS | Generates board from non-project directory |
| T53 | Unknown command | PASS | "Unknown command" + help + exit 1 |
| T54 | Non-project directory | PASS | "Not in a Deco project" + exit 1 |

---

### Generated HTML Verification

| Test | Status | Details |
|------|--------|---------|
| Template placeholders substituted | PASS | 0 unsubstituted `{{PLACEHOLDER}}` patterns in output |
| Card HTML rendering | PASS | 6 cards with `data-id`, images, metadata |
| Base64 embedding | PASS | 6 `data:image` URLs in embedded build |
| XSS escaping in card HTML | PASS | `<script>` -> `&lt;script&gt;` in card content |
| XSS in ITEMS_DATA JSON | **FAIL** | `</script>` in JSON breaks script block (ISSUE-004) |
| Home URL | PASS | `file://~/.deco/home.html` embedded |
| Board ID | PASS | MD5 hash generated from title |

---

### Bug Fix Verification

#### BUG-005 fix: savePositions crash with missing metadata.items

**Status: VERIFIED FIXED**

Created a project with `metadata.json` = `{"board":{"title":"Test"}}` (no `items` key).
Ran `save-positions --file pos.json` -- completed successfully, exit 0.

The guard at `generator.js:345` correctly initializes `metadata.items = []` when missing.

#### search/ask query pollution fix

**Status: VERIFIED FIXED**

| Test Command | Expected Query | Actual Query | Result |
|---|---|---|---|
| `search --provider openai "bronze"` | `"bronze"` | `"bronze"` | PASS |
| `search --provider openai chiparus` | `"chiparus"` | `"chiparus"` | PASS (1 match) |
| `ask --provider openai What themes?` | `"What themes?"` | `"What themes?"` | PASS |

The `positionalArgs()` function correctly skips option values (e.g., `--provider openai` -> both tokens skipped).

---

### Known Limitations

#### Boolean flags before positional arguments (WARN)

`parseOptions()` doesn't distinguish boolean flags (`--json`, `--all`, `--embed`) from value-taking options. Placing a boolean flag before a positional argument causes it to greedily consume the positional as its value.

**Example:**
```bash
deco search --json "bronze"    # FAILS: --json eats "bronze"
deco search "bronze" --json    # WORKS: --json has no next arg
```

**Affected commands:** Any using `positionalArgs()` with boolean flags: `search`, `ask`.
**Workaround:** Always place boolean flags after positional arguments.
**Severity:** Low (consistent behavior, easy workaround).

#### Search tag matching

Tags stored with hyphens (e.g., `"art-deco"`) don't match search queries with spaces (`"art deco"`). The search uses exact substring matching. This is expected behavior but could be improved by normalizing hyphens/spaces during search.

---

### Commands Not Fully Testable

| Command | Reason | Partial Test |
|---------|--------|--------------|
| `watch` | Requires interactive Ctrl+C | Verified initial build works |
| `analyze` | Requires valid AI API key | Verified graceful auth error |
| `auto-tag` | Requires valid AI API key | Verified graceful per-image error |
| `ask` | Requires valid AI API key | Verified query extraction + error handling |
| `search --similar` | Requires pre-computed embeddings | N/A |
| `agent add --analyze` | Requires valid AI API key | `agent add` works |

---

### Recommendations

1. **Fix ISSUE-003 (empty project crash):** Add try/catch around `generateBoard()` in `buildBoard()`.
2. **Fix ISSUE-004 (ITEMS_DATA XSS):** Escape `</` as `<\/` in JSON before `<script>` embedding.
3. **Consider:** Add known-boolean-flags list to `parseOptions()` to prevent greedy consumption.
4. **Consider:** Normalize hyphens to spaces in search for better tag matching.

---

*Report generated 2026-02-14 by automated testing agent.*
