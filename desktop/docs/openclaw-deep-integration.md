# OpenClaw Deep Integration — Technical Design Document

> Research document for expanding the Deco HTTP API to enable full programmatic control by OpenClaw agents.
>
> Date: 2026-02-16

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Gap Analysis — Missing APIs](#2-gap-analysis--missing-apis)
3. [Use Cases with curl Examples](#3-use-cases-with-curl-examples)
4. [Implementation Roadmap](#4-implementation-roadmap)
5. [Risks and Limitations](#5-risks-and-limitations)
6. [Future Extensions — Real-time Communication](#6-future-extensions--real-time-communication)

---

## 1. Current State Analysis

### Existing HTTP API Endpoints (11 total)

The HTTP API server runs on `127.0.0.1:7890` (configurable) alongside the Tauri app. All endpoints are implemented in `desktop/src-tauri/src/api.rs`.

| # | Method | Path | Purpose | Status |
|---|--------|------|---------|--------|
| 1 | `GET` | `/api/status` | Health check + version info | Stable |
| 2 | `GET` | `/api/projects` | List all projects (recent + scanned) | Stable |
| 3 | `POST` | `/api/import` | Import image (file upload or URL download) | Stable |
| 4 | `DELETE` | `/api/delete` | Delete image + thumbnails + DB records | Stable |
| 5 | `POST` | `/api/move` | Move item position on board (updates board.json) | Stable |
| 6 | `PATCH` | `/api/item` | Update image metadata (tags, description, styles, moods, era) | Stable |
| 7 | `POST` | `/api/embed` | Generate/retrieve CLIP embedding for one image | Stable |
| 8 | `POST` | `/api/embed-batch` | Batch CLIP embeddings (specific images or whole project) | Stable |
| 9 | `POST` | `/api/similar` | Find visually similar images (cosine similarity) | Stable |
| 10 | `POST` | `/api/search-semantic` | Text-to-image search via FTS5 | Stable |
| 11 | `POST` | `/api/cluster` | Auto-cluster images by visual similarity | Stable |

### Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│  OpenClaw Agent                                          │
│  (HTTP client — curl, Python requests, etc.)             │
└──────────────────┬───────────────────────────────────────┘
                   │ HTTP (localhost:7890)
                   ▼
┌──────────────────────────────────────────────────────────┐
│  Axum HTTP Server (api.rs)                               │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ CRUD routes  │  │ CLIP routes  │  │ Search routes  │  │
│  └──────┬──────┘  └──────┬───────┘  └───────┬────────┘  │
│         │                │                   │           │
│         ▼                ▼                   ▼           │
│  ┌──────────────────────────────────────────────────┐    │
│  │  Storage Trait  (storage/mod.rs)                  │    │
│  │  - LocalStorage (SQLite + JSON files)             │    │
│  └──────────────────────────────────────────────────┘    │
│         │                │                   │           │
│  ┌──────┴──┐   ┌────────┴────┐   ┌──────────┴───────┐   │
│  │ lib.rs  │   │ embed.rs    │   │ search.rs        │   │
│  │ (files) │   │ (CLIP ONNX) │   │ (SQLite FTS5)    │   │
│  └─────────┘   └─────────────┘   └──────────────────┘   │
│                                                          │
│  Tauri Events ──────► Frontend (PixiJS canvas)           │
└──────────────────────────────────────────────────────────┘
```

### Tauri Commands NOT Exposed via HTTP

Many capabilities already exist as Tauri commands (callable from the frontend) but have **no HTTP API counterpart**. These represent the lowest-cost integration opportunities.

| Tauri Command | Module | What It Does | HTTP Equivalent |
|---------------|--------|--------------|-----------------|
| `scan_images` | lib.rs | List all images in a project directory | None |
| `create_project` | lib.rs | Create a new project with initial structure | None |
| `rename_project` | lib.rs | Rename a project | None |
| `remove_from_recent` | lib.rs | Remove project from recents | None |
| `read_metadata` / `write_metadata` | lib.rs | Project-level metadata CRUD | None |
| `save_board_state` / `load_board_state` | lib.rs | Full board state read/write | None |
| `import_images` | lib.rs | Import multiple local files at once | Partial (`/api/import` is single-file) |
| `export_metadata` | lib.rs | Export all image metadata as JSON | None |
| `analyze_image` | ai.rs | AI vision analysis (single image) | Indirect (via import `analyze=true`) |
| `cmd_analyze_batch` | ai.rs | AI batch analysis | None |
| `cmd_generate_image` | ai.rs | AI image generation | None |
| `cmd_web_search` | web.rs | Brave Search web image search | None |
| `cmd_find_more_like` | web.rs | Find more images like a reference (web) | None |
| `cmd_download_web_image` | web.rs | Download image from web search result | None |
| `cmd_index_project` | search.rs | Index all images in project (metadata DB) | None |
| `cmd_get_all_tags` | search.rs | Get all tags with usage counts | None |
| `cmd_filter_by_tag` | search.rs | Filter images by tag | None |

---

## 2. Gap Analysis — Missing APIs

### Required Endpoints (from task brief)

| Endpoint | Status | Implementation Cost | Notes |
|----------|--------|---------------------|-------|
| `POST /api/import` | **Exists** | -- | Supports file upload + URL |
| `DELETE /api/delete` | **Exists** | -- | Full cleanup (file + thumb + DB) |
| `POST /api/move` | **Exists** | -- | Updates board.json |
| `POST /api/resize` | **Missing** | Medium | Needs new board.json field handling (width/height) |
| `POST /api/select` | **Missing** | High | Requires frontend coordination via Tauri events |
| `POST /api/group` | **Missing** | Medium | Create/update groups in board.json |
| `PATCH /api/item/:id` | **Exists** as `PATCH /api/item` | -- | Accepts filename in body |
| `POST /api/analyze-batch` | **Missing (HTTP)** | Low | `cmd_analyze_batch` already exists in ai.rs |
| `GET /api/board` | **Missing (HTTP)** | Low | `load_board_state` already exists in lib.rs |
| `GET /api/projects` | **Exists** | -- | Returns name, path, imageCount |

### Additional High-Value Missing Endpoints

| Endpoint | Implementation Cost | Value | Notes |
|----------|---------------------|-------|-------|
| `POST /api/projects` | Low | High | Create new project — wraps `create_project` |
| `GET /api/images` | Low | High | List all images in project — wraps `scan_images` |
| `POST /api/analyze` | Low | High | AI analyze single image — wraps `analyze_image` |
| `GET /api/tags` | Low | Medium | Get all tags — wraps `cmd_get_all_tags` |
| `GET /api/tags/:tag` | Low | Medium | Filter by tag — wraps `cmd_filter_by_tag` |
| `POST /api/board` | Low | Medium | Save board state — wraps `save_board_state` |
| `POST /api/export` | Low | Medium | Export metadata JSON — wraps `export_metadata` |
| `POST /api/web-search` | Medium | High | Web image search — wraps `cmd_web_search` |
| `POST /api/generate-image` | Medium | High | AI image generation — wraps `cmd_generate_image` |

---

## 3. Use Cases with curl Examples

### Use Case 1: Project Bootstrap (Create + Bulk Import)

An OpenClaw agent setting up a fresh moodboard from a list of URLs.

```bash
# 1. Create a new project
curl -X POST http://127.0.0.1:7890/api/projects \
  -H "Content-Type: application/json" \
  -d '{"name": "Brutalist Architecture", "path": "~/Documents/Deco/brutalist"}'

# 2. Bulk import from URLs with AI analysis
for url in \
  "https://example.com/brutalist-1.jpg" \
  "https://example.com/brutalist-2.jpg" \
  "https://example.com/brutalist-3.jpg"; do
  curl -X POST http://127.0.0.1:7890/api/import \
    -F "project_path=$HOME/Documents/Deco/brutalist" \
    -F "url=$url" \
    -F "analyze=true"
  sleep 0.1  # avoid overwhelming the server
done

# 3. Generate embeddings for the entire project
curl -X POST http://127.0.0.1:7890/api/embed-batch \
  -H "Content-Type: application/json" \
  -d '{"projectPath": "~/Documents/Deco/brutalist"}'
```

### Use Case 2: Intelligent Auto-Layout (Cluster + Arrange)

Agent automatically organizes a messy board by visual clusters.

```bash
PROJECT="$HOME/Documents/Deco/art-deco"

# 1. Read current board state
curl -s http://127.0.0.1:7890/api/board?projectPath=$PROJECT | jq .

# 2. Auto-cluster by visual similarity
CLUSTERS=$(curl -s -X POST http://127.0.0.1:7890/api/cluster \
  -H "Content-Type: application/json" \
  -d "{\"projectPath\": \"$PROJECT\", \"threshold\": 0.72}")

# 3. Arrange each cluster in a grid (pseudo-logic)
echo "$CLUSTERS" | jq -r '.clusters[].images[]' | while read img; do
  # Calculate grid position based on cluster membership
  curl -X POST http://127.0.0.1:7890/api/move \
    -H "Content-Type: application/json" \
    -d "{\"projectPath\": \"$PROJECT\", \"filename\": \"$(basename $img)\", \"x\": $X, \"y\": $Y}"
done

# 4. Create groups for each cluster
echo "$CLUSTERS" | jq -c '.clusters[]' | while read cluster; do
  MEMBERS=$(echo "$cluster" | jq '[.images[] | split("/") | last]')
  curl -X POST http://127.0.0.1:7890/api/group \
    -H "Content-Type: application/json" \
    -d "{\"projectPath\": \"$PROJECT\", \"name\": \"Cluster $(echo $cluster | jq .id)\", \"members\": $MEMBERS}"
done
```

### Use Case 3: AI-Powered Curation (Analyze + Tag + Search)

Agent analyzes all images and builds a tagged, searchable collection.

```bash
PROJECT="$HOME/Documents/Deco/mood-refs"

# 1. Batch AI analysis for all unanalyzed images
curl -X POST http://127.0.0.1:7890/api/analyze-batch \
  -H "Content-Type: application/json" \
  -d "{\"projectPath\": \"$PROJECT\"}"

# 2. Wait for analysis to complete, then search
sleep 10

# 3. Find all "warm" mood images
curl -X POST http://127.0.0.1:7890/api/search-semantic \
  -H "Content-Type: application/json" \
  -d "{\"projectPath\": \"$PROJECT\", \"query\": \"warm cozy atmosphere\", \"limit\": 20}"

# 4. Get all tags to understand the collection
curl -s "http://127.0.0.1:7890/api/tags?projectPath=$PROJECT" | jq .

# 5. Refine tags on specific images
curl -X PATCH http://127.0.0.1:7890/api/item \
  -H "Content-Type: application/json" \
  -d '{
    "projectPath": "'"$PROJECT"'",
    "filename": "cabin.jpg",
    "tags": ["cozy", "cabin", "fireplace", "hero-image"],
    "moods": ["warm", "inviting"]
  }'
```

### Use Case 4: Visual Deduplication

Agent finds and removes near-duplicate images.

```bash
PROJECT="$HOME/Documents/Deco/raw-collection"

# 1. Ensure all embeddings exist
curl -X POST http://127.0.0.1:7890/api/embed-batch \
  -H "Content-Type: application/json" \
  -d "{\"projectPath\": \"$PROJECT\"}"

# 2. Cluster with high threshold (near-duplicate detection)
DUPES=$(curl -s -X POST http://127.0.0.1:7890/api/cluster \
  -H "Content-Type: application/json" \
  -d "{\"projectPath\": \"$PROJECT\", \"threshold\": 0.95}")

# 3. For each cluster, keep first image, delete the rest
echo "$DUPES" | jq -r '.clusters[] | .images[1:][]' | while read dupe; do
  FILENAME=$(basename "$dupe")
  curl -X DELETE http://127.0.0.1:7890/api/delete \
    -H "Content-Type: application/json" \
    -d "{\"projectPath\": \"$PROJECT\", \"filename\": \"$FILENAME\"}"
done
```

### Use Case 5: Web Research Pipeline

Agent searches the web for reference images and imports the best matches.

```bash
PROJECT="$HOME/Documents/Deco/research-board"

# 1. Search the web for reference images
RESULTS=$(curl -s -X POST http://127.0.0.1:7890/api/web-search \
  -H "Content-Type: application/json" \
  -d '{"query": "japanese wabi-sabi interior design", "limit": 20}')

# 2. Import top results with AI analysis
echo "$RESULTS" | jq -r '.results[].url' | head -10 | while read url; do
  curl -X POST http://127.0.0.1:7890/api/import \
    -F "project_path=$PROJECT" \
    -F "url=$url" \
    -F "analyze=true"
  sleep 0.2
done

# 3. Find more images similar to the best one
curl -X POST http://127.0.0.1:7890/api/similar \
  -H "Content-Type: application/json" \
  -d "{
    \"projectPath\": \"$PROJECT\",
    \"imagePath\": \"$PROJECT/images/paste-1234567890.jpg\",
    \"limit\": 5
  }"
```

### Use Case 6: Board State Snapshot & Restore

Agent saves and restores board layouts for A/B comparison.

```bash
PROJECT="$HOME/Documents/Deco/ui-refs"

# 1. Save current layout as snapshot
BOARD=$(curl -s "http://127.0.0.1:7890/api/board?projectPath=$PROJECT")
echo "$BOARD" > /tmp/layout-v1.json

# 2. Rearrange the board (via multiple /api/move calls)
# ... agent rearranges ...

# 3. Save new layout
BOARD_V2=$(curl -s "http://127.0.0.1:7890/api/board?projectPath=$PROJECT")
echo "$BOARD_V2" > /tmp/layout-v2.json

# 4. Restore original layout
curl -X POST http://127.0.0.1:7890/api/board \
  -H "Content-Type: application/json" \
  -d @/tmp/layout-v1.json
```

### Use Case 7: Cross-Project Visual Search

Agent finds similar images across multiple projects.

```bash
QUERY_IMAGE="$HOME/Documents/Deco/inspiration/images/hero.jpg"

# 1. Get all projects
PROJECTS=$(curl -s http://127.0.0.1:7890/api/projects | jq -r '.[].path')

# 2. Search each project for visual matches
for project in $PROJECTS; do
  echo "=== $project ==="
  curl -s -X POST http://127.0.0.1:7890/api/similar \
    -H "Content-Type: application/json" \
    -d "{\"projectPath\": \"$project\", \"imagePath\": \"$QUERY_IMAGE\", \"limit\": 3}" \
    | jq '.results[] | {name, score}'
done
```

### Use Case 8: AI Image Generation + Board Placement

Agent generates images and places them at specific board positions.

```bash
PROJECT="$HOME/Documents/Deco/concepts"

# 1. Generate an image with AI
RESULT=$(curl -s -X POST http://127.0.0.1:7890/api/generate-image \
  -H "Content-Type: application/json" \
  -d '{
    "projectPath": "'"$PROJECT"'",
    "prompt": "minimalist zen garden, soft morning light, watercolor style",
    "style": "watercolor"
  }')

# 2. The generated image is auto-imported; move it to desired position
FILENAME=$(echo "$RESULT" | jq -r '.filename')
curl -X POST http://127.0.0.1:7890/api/move \
  -H "Content-Type: application/json" \
  -d "{\"projectPath\": \"$PROJECT\", \"filename\": \"$FILENAME\", \"x\": 800, \"y\": 400}"
```

---

## 4. Implementation Roadmap

### Priority Tiers

#### Tier 1 — Low-hanging fruit (thin wrappers over existing Tauri commands)

These can be implemented quickly since the core logic already exists. Each is essentially a new route handler that calls into existing functions.

| Endpoint | Wraps | Estimated Effort |
|----------|-------|------------------|
| `GET /api/board` | `load_board_state` | 1-2 hours |
| `POST /api/board` | `save_board_state` | 1-2 hours |
| `GET /api/images` | `scan_images` | 1-2 hours |
| `POST /api/analyze-batch` | `cmd_analyze_batch` | 2-3 hours |
| `POST /api/analyze` | `analyze_image` | 2-3 hours |
| `POST /api/projects` | `create_project` | 1-2 hours |
| `GET /api/tags` | `cmd_get_all_tags` | 1 hour |
| `GET /api/tags/:tag` | `cmd_filter_by_tag` | 1 hour |
| `POST /api/export` | `export_metadata` | 1-2 hours |

**Total: ~12-18 hours of work for 9 new endpoints.**

#### Tier 2 — New logic required

These need new handler logic that doesn't exist as Tauri commands yet.

| Endpoint | Description | Estimated Effort |
|----------|-------------|------------------|
| `POST /api/resize` | Update item width/height in board.json | 3-4 hours |
| `POST /api/group` | Create/modify groups in board.json | 4-5 hours |
| `DELETE /api/group/:id` | Remove a group | 2 hours |
| `POST /api/import-batch` | Import multiple files/URLs in one request | 4-5 hours |

**Total: ~13-16 hours.**

#### Tier 3 — Complex / Frontend coordination required

These require bidirectional communication with the frontend, which is architecturally harder.

| Endpoint | Description | Challenge |
|----------|-------------|-----------|
| `POST /api/select` | Select items on canvas | Frontend must react to backend events; no way to "read" current selection state |
| `POST /api/web-search` | Proxy to Brave Search | Needs web.rs config (API key); complex response mapping |
| `POST /api/generate-image` | AI image generation | Long-running; needs progress tracking |

**Total: ~20-30 hours.**

### Recommended Implementation Order

```
Phase 1 (Week 1):  GET /api/board, GET /api/images, POST /api/analyze-batch, POST /api/projects
Phase 2 (Week 2):  GET /api/tags, POST /api/board, POST /api/analyze, POST /api/export
Phase 3 (Week 3):  POST /api/resize, POST /api/group, POST /api/import-batch
Phase 4 (Week 4+): POST /api/select (if needed), POST /api/web-search, POST /api/generate-image
```

---

## 5. Risks and Limitations

### Architectural Constraints

| Constraint | Impact | Mitigation |
|------------|--------|------------|
| **localhost only** | Cannot be called from remote machines | SSH tunnel (`ssh -L 7890:127.0.0.1:7890`); or add optional auth token for non-localhost binding |
| **No authentication** | Any local process can call the API | Acceptable for single-user desktop app; add optional bearer token if needed |
| **Deco must be running** | API unavailable when app is closed | Consider a standalone headless server mode (`deco serve`) |
| **Single project per board.json** | Board state is per-project, not global | Agent must manage multiple project paths |
| **Synchronous board.json writes** | Concurrent moves may race | Add file locking or queue mutations |

### Data Consistency Risks

| Risk | Scenario | Impact |
|------|----------|--------|
| **Race condition on board.json** | Two rapid `/api/move` calls for different items | Last write wins; one move may be lost |
| **Stale frontend state** | API modifies board.json but frontend has cached old state | Frontend gets out of sync; Tauri events help but aren't guaranteed |
| **Orphaned DB records** | Image file deleted outside Deco (e.g., `rm` in shell) | Search DB still references the file; no auto-cleanup |
| **CLIP model not loaded** | First embedding call after cold start | 10-30 second delay while model downloads/loads |

### Performance Considerations

| Operation | Typical Latency | Bottleneck |
|-----------|-----------------|------------|
| `GET /api/status` | < 1ms | None |
| `GET /api/projects` | 10-50ms | Filesystem scan |
| `POST /api/import` (file) | 50-200ms | File I/O + thumbnail |
| `POST /api/import` (URL) | 500ms-5s | Network download |
| `POST /api/embed` | 100-500ms (cached), 2-5s (first time) | CLIP model inference |
| `POST /api/embed-batch` (full project) | 5-60s | Scales with image count |
| `POST /api/cluster` | 100ms-2s | Scales with embedding count |
| `POST /api/analyze` (AI) | 2-10s | External API call (OpenAI/Anthropic) |
| `POST /api/analyze-batch` | 10s-5min | Scales with images x provider latency |

### Known Limitations

1. **No WebSocket/SSE support** — Agent cannot subscribe to real-time canvas changes. Must poll `GET /api/board` to detect changes.
2. **No undo/redo** — API operations are irreversible. `DELETE /api/delete` permanently removes files.
3. **No batch move** — Must call `/api/move` individually for each item. High-item-count layouts require many sequential requests.
4. **FTS5 no CJK tokenization** — Chinese/Japanese/Korean text in tags/descriptions won't tokenize correctly for search. Requires ICU tokenizer extension.
5. **No pagination** — `GET /api/images` and `GET /api/projects` return all results. Large projects (1000+ images) may produce large responses.
6. **AI analysis is fire-and-forget** — No API to check analysis progress or retrieve results directly. Agent must poll `PATCH /api/item` read or `POST /api/search-semantic` to verify metadata was populated.

---

## 6. Future Extensions — Real-time Communication

### Current Limitation

The existing API is purely request-response (HTTP REST). OpenClaw agents cannot:
- Receive notifications when a user drags an image in the UI
- Know when AI analysis completes
- React to board changes made by the user

### Option A: Server-Sent Events (SSE)

**Recommended for Phase 1 real-time support.**

```
GET /api/events?stream=true
```

The server keeps the connection open and pushes events as they occur:

```
data: {"type": "image-imported", "filename": "ref.jpg", "project": "/path/to/project"}

data: {"type": "item-moved", "filename": "ref.jpg", "x": 500, "y": 300}

data: {"type": "analysis-complete", "filename": "ref.jpg", "tags": ["geometric", "gold"]}
```

**Pros:**
- Simple to implement (Axum supports SSE natively)
- Works over standard HTTP (no protocol upgrade)
- Easy to consume in any language (`curl`, Python `sseclient`, etc.)

**Cons:**
- Unidirectional (server → client only)
- No built-in reconnection protocol (client must handle)

**Implementation sketch (Rust/Axum):**

```rust
use axum::response::sse::{Event, Sse};
use tokio_stream::StreamExt;

async fn handle_events(
    State(state): State<Arc<ApiState>>,
) -> Sse<impl futures::Stream<Item = Result<Event, Infallible>>> {
    let rx = state.event_bus.subscribe();
    let stream = tokio_stream::wrappers::BroadcastStream::new(rx)
        .map(|msg| {
            let data = serde_json::to_string(&msg.unwrap()).unwrap();
            Ok(Event::default().data(data))
        });
    Sse::new(stream)
}
```

### Option B: WebSocket

**Recommended for Phase 2 if bidirectional control is needed.**

```
WS ws://127.0.0.1:7890/api/ws
```

Enables two-way communication:
- Server pushes events (same as SSE)
- Client sends commands (alternative to REST for rapid operations)

**Use case:** Real-time collaborative layout — agent moves items while user is editing, both see changes immediately.

**Pros:**
- Bidirectional
- Lower overhead for rapid messages (no HTTP headers per message)
- Better for interactive/streaming scenarios

**Cons:**
- More complex implementation
- Requires WebSocket client library
- State management for multiple connections

### Option C: Polling (Current Workaround)

Until SSE/WebSocket is implemented, agents can poll:

```bash
# Poll board state every 2 seconds
while true; do
  curl -s "http://127.0.0.1:7890/api/board?projectPath=$PROJECT" > /tmp/board.json
  # diff with previous state...
  sleep 2
done
```

**This is adequate for most OpenClaw use cases**, since agents typically drive changes rather than react to them.

### Recommendation

| Phase | Technology | Use Case |
|-------|------------|----------|
| Now | REST + Polling | Agent-driven workflows (import, organize, search) |
| Phase 2 | SSE (`GET /api/events`) | Agent receives completion notifications (analysis done, import done) |
| Phase 3 | WebSocket | Bidirectional real-time collaboration |

SSE is the highest-value addition because it eliminates the need for agents to poll or guess when async operations (AI analysis, embedding generation) complete.

---

## Appendix A: Full Endpoint Inventory (Current + Proposed)

### Legend
- **Exists** = implemented and working
- **Proposed T1** = Tier 1, thin wrapper
- **Proposed T2** = Tier 2, new logic
- **Proposed T3** = Tier 3, complex

| Method | Path | Status | Category |
|--------|------|--------|----------|
| `GET` | `/api/status` | Exists | System |
| `GET` | `/api/projects` | Exists | Projects |
| `POST` | `/api/projects` | Proposed T1 | Projects |
| `GET` | `/api/images` | Proposed T1 | Images |
| `POST` | `/api/import` | Exists | Images |
| `POST` | `/api/import-batch` | Proposed T2 | Images |
| `DELETE` | `/api/delete` | Exists | Images |
| `POST` | `/api/move` | Exists | Board |
| `POST` | `/api/resize` | Proposed T2 | Board |
| `PATCH` | `/api/item` | Exists | Metadata |
| `POST` | `/api/group` | Proposed T2 | Board |
| `DELETE` | `/api/group/:id` | Proposed T2 | Board |
| `GET` | `/api/board` | Proposed T1 | Board |
| `POST` | `/api/board` | Proposed T1 | Board |
| `POST` | `/api/analyze` | Proposed T1 | AI |
| `POST` | `/api/analyze-batch` | Proposed T1 | AI |
| `POST` | `/api/generate-image` | Proposed T3 | AI |
| `POST` | `/api/embed` | Exists | CLIP |
| `POST` | `/api/embed-batch` | Exists | CLIP |
| `POST` | `/api/similar` | Exists | Search |
| `POST` | `/api/search-semantic` | Exists | Search |
| `POST` | `/api/cluster` | Exists | Search |
| `GET` | `/api/tags` | Proposed T1 | Search |
| `GET` | `/api/tags/:tag` | Proposed T1 | Search |
| `POST` | `/api/export` | Proposed T1 | Data |
| `POST` | `/api/web-search` | Proposed T3 | Web |
| `GET` | `/api/events` | Proposed (SSE) | Real-time |
| `WS` | `/api/ws` | Proposed (future) | Real-time |

**Total: 11 existing + 17 proposed = 28 endpoints for full programmatic control.**

---

## Appendix B: Event Bus Design (for SSE/WebSocket)

All Tauri events currently emitted by the API handlers that would be exposed via SSE:

| Event Name | Trigger | Payload |
|------------|---------|---------|
| `api:image-imported` | Image imported via API | `{ image: ImageInfo, position: Position? }` |
| `api:image-deleted` | Image deleted via API | `{ filename, project }` |
| `api:item-moved` | Item moved via API | `{ filename, x, y }` |
| `api:item-updated` | Metadata updated via API | `{ filename, metadata }` |
| `api:analyze-request` | AI analysis triggered | image path string |
| `analysis-complete` | AI analysis finished (from ai.rs) | `{ filename, metadata }` |
| `clip:embedding-done` | CLIP embedding generated | `{ imagePath, dimensions }` |

These events are already being emitted via `state.app.emit()` in the Axum handlers. Bridging them to SSE requires a shared broadcast channel (`tokio::sync::broadcast`) between the Tauri event system and the SSE endpoint.
