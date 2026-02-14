# RefBoard 2.0 — Product Requirements Document

> **AI-driven visual reference collector + human-organizable moodboard**

**Author**: Jingxi Guo
**Date**: 2026-02-14
**Status**: Draft

---

## 1. Vision

RefBoard is the reference collection tool that sits upstream of the design process. Designers, artists, and creative professionals collect visual references before creating — RefBoard makes that process intelligent.

**RefBoard collects and organizes references. Figma creates designs.**

The core loop:

```
   ┌─────────────────────────────────────────────────┐
   │                                                  │
   │   AI Agent                      Human            │
   │   ─────────                     ─────            │
   │   Analyze images                Browse & curate  │
   │   Extract style/tags            Drag to organize │
   │   Find associations             Annotate          │
   │   Search & collect from web     Give feedback     │
   │                                  "find more       │
   │         ◄──── feedback loop ────► like this"      │
   │                                                   │
   └───────────────────────────────────────────────────┘
```

RefBoard 1.x proved the concept as a CLI tool generating static HTML boards. RefBoard 2.0 becomes a native desktop app with real-time AI integration, WebGL canvas performance, and an active collection workflow — not just organizing what you already have, but helping you discover what you don't yet know you need.

---

## 2. Target Users

### Primary: Visual Designers & Art Directors
- Collect references for projects (branding, UI, illustration, architecture)
- Need to organize 50-500 images per project
- Currently use PureRef, Pinterest, Eagle, or folder-of-screenshots
- Pain: manual tagging, no search, no "find similar"

### Secondary: Researchers & Educators
- Art history research, visual culture studies
- Need rich metadata (artist, date, context, influences)
- Want to discover connections between works

### Tertiary: AI/Creative Tool Builders
- Use RefBoard as a visual context provider for AI workflows
- Programmatic access via CLI and API

---

## 3. User Stories

### Import & Ingest

| # | Story | Priority |
|---|-------|----------|
| U1 | As a designer, I can drag images from Finder/browser onto the canvas so I can quickly add references | P0 |
| U2 | As a designer, I can paste an image URL and RefBoard downloads it automatically | P0 |
| U3 | As a designer, I can drag a folder to import all images at once | P0 |
| U4 | As a designer, I can paste from clipboard (Cmd+V) to add screenshots | P1 |
| U5 | As a designer, I can import from a URL and RefBoard extracts all images from the page | P2 |

### AI Analysis

| # | Story | Priority |
|---|-------|----------|
| U6 | As a designer, when I add an image, AI automatically analyzes it and suggests tags, style, colors, and a description | P0 |
| U7 | As a designer, I can accept, edit, or reject AI suggestions with one click | P0 |
| U8 | As a designer, AI tag suggestions are context-aware — they reference tags already on my board | P1 |
| U9 | As a researcher, I can ask AI to identify the artist, period, or movement of an artwork | P1 |
| U10 | As a designer, I can configure which AI provider to use (cloud or local) | P0 |

### Search & Discovery

| # | Story | Priority |
|---|-------|----------|
| U11 | As a designer, I can search my board by text (title, tags, description) | P0 |
| U12 | As a designer, I can search by visual similarity — "find images that look like this one" | P0 |
| U13 | As a designer, I can click "find more like this" on any image and RefBoard searches the web for similar references | P1 |
| U14 | As a designer, web search results appear in a panel and I can drag them onto my board | P1 |
| U15 | As a designer, I can search across multiple boards | P2 |

### Organization

| # | Story | Priority |
|---|-------|----------|
| U16 | As a designer, I can freely drag images on an infinite canvas | P0 |
| U17 | As a designer, I can zoom and pan smoothly even with 500+ images | P0 |
| U18 | As a designer, I can group images by dragging them into named regions | P0 |
| U19 | As a designer, I can filter the canvas by tags (show/hide) | P0 |
| U20 | As a designer, I can auto-layout images (grid, cluster by tag, pack) | P1 |
| U21 | As a designer, I can resize images while maintaining aspect ratio | P1 |
| U22 | As a designer, I can add text notes and annotations to the canvas | P1 |
| U23 | As a designer, I can draw arrows and shapes to show relationships | P2 |

### Feedback Loop (Human → AI)

| # | Story | Priority |
|---|-------|----------|
| U24 | As a designer, I can select an image and say "find more like this" to trigger AI-powered web collection | P1 |
| U25 | As a designer, I can refine AI search by saying "more geometric" or "less colorful" | P2 |
| U26 | As a designer, I can approve/reject AI-collected images, and AI learns my preferences within the session | P2 |

---

## 4. Feature Specification

### 4.1 Import System

**Drag & Drop**
- Accept image files (PNG, JPEG, WebP, GIF, SVG, BMP, AVIF, TIFF)
- Accept folders (recursive scan for images)
- Accept URLs (download image, extract page images)
- Drop zone visual feedback (highlight border, drop indicator)

**Clipboard**
- Cmd+V pastes clipboard images directly onto canvas
- URL detection: if clipboard contains a URL, offer to download

**Triggers on import:**
1. Image appears on canvas at drop position (or auto-positioned)
2. AI analysis starts in background (non-blocking)
3. Thumbnail generated for minimap/list view
4. Vector embedding computed for similarity search

### 4.2 AI Analysis Pipeline

```
Image Added
    │
    ▼
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│ Vision Model │────▶│ Tag Extractor │────▶│ Embedding   │
│ (describe)   │     │ (classify)    │     │ (vectorize) │
└─────────────┘     └──────────────┘     └─────────────┘
    │                     │                     │
    ▼                     ▼                     ▼
 Description          Tags + Style          Vector (768d)
 Colors               Mood/Era              → Vector Store
    │                     │
    └─────────┬───────────┘
              ▼
     ┌─────────────────┐
     │ Suggestion Panel │
     │ [Accept] [Edit]  │
     └─────────────────┘
```

**AI Providers (pluggable):**

| Provider | Type | Features | Use Case |
|----------|------|----------|----------|
| Claude Vision | Cloud API | Vision + Chat | Best analysis quality |
| GPT-4V | Cloud API | Vision + Chat + Embeddings | Broad compatibility |
| Ollama (LLaVA) | Local | Vision + Chat | Privacy, offline |
| MLX (LLaVA) | Local (Apple Silicon) | Vision + Chat | Fast on Mac, offline |
| CLIP | Local | Embeddings only | Fast similarity search |

**Analysis output per image:**
```json
{
  "description": "A bronze Art Deco sculpture of a dancer...",
  "tags": ["art-deco", "sculpture", "bronze", "dancer", "1920s"],
  "style": ["geometric", "streamlined", "metallic"],
  "mood": ["elegant", "dynamic"],
  "colors": ["#8B7355", "#2C2C2C", "#D4AF37"],
  "era": "1920s-1930s",
  "embedding": [0.023, -0.158, ...]
}
```

### 4.3 Search & Collection

**Text Search**
- Full-text across title, description, tags, artist, notes
- Fuzzy matching (typo-tolerant)
- Tag autocomplete

**Visual Similarity Search**
- Select an image → "Find similar" → ranked results from board
- Uses cosine similarity on vector embeddings
- Threshold slider (strict ↔ loose)

**Web Collection (Associative Search)**
- User selects image + clicks "Find more like this"
- RefBoard generates search queries from image analysis
- Searches via Brave Search API (image search + web search)
- Optional: browser automation (Playwright) for Pinterest, Dribbble, Behance
- Results displayed in a side panel with preview thumbnails
- Drag from results panel → board to add

**Search flow:**
```
User: "Find more like this" on an Art Deco sculpture
    │
    ▼
AI generates queries:
  - "Art Deco bronze sculpture 1920s"
  - "Demetre Chiparus dancer sculpture"
  - "Art Deco geometric figurine"
    │
    ▼
Brave Search API → image results
    │
    ▼
Results panel: thumbnails + source URLs
    │
    ▼
User drags selected results → board
    │
    ▼
Imported images go through AI analysis pipeline
```

### 4.4 Canvas & Organization

**Canvas (PixiJS WebGL)**
- Infinite pan/zoom with 60fps performance
- Hardware-accelerated rendering via WebGL
- Smooth inertial scrolling
- Zoom range: 5% – 800%
- Grid background that scales with zoom

**Card Rendering**
- Image displayed at original aspect ratio
- Metadata overlay on hover (title, tags, description)
- Selection state (border highlight)
- Multi-select (Shift+click, drag-select)
- Resize handles (corner drag, maintain aspect ratio)

**Groups & Regions**
- Draw a named region → images inside belong to group
- Group background color customizable
- Collapse/expand groups
- Move group = move all contents

**Layout Algorithms**
- Grid: uniform spacing, row-based
- Pack: optimal space-filling (like PureRef Ctrl+P)
- Cluster: group by tag similarity (force-directed)
- Manual: free placement with snap-to-grid

**Annotations**
- Text notes (title, body, lists)
- Arrows and connection lines between cards
- Shape overlays (rectangles for grouping)

### 4.5 Keyboard Shortcuts

Following the conventions from Figma, Miro, and PureRef (see `docs/research.md`):

```
Navigation:
  Space+drag       Pan
  Scroll wheel     Zoom (cursor-centered)
  Shift+1          Fit all
  Shift+2          Fit selection
  Cmd+0            100% zoom

Tools:
  V                Select
  H                Hand (pan)
  T                Text
  G                Toggle grid
  M                Toggle minimap
  /                Focus search

Edit:
  Cmd+Z            Undo
  Shift+Cmd+Z      Redo
  Cmd+G            Group
  Shift+Cmd+G      Ungroup
  Delete           Remove selected
  Cmd+D            Duplicate
  Cmd+]            Bring forward
  Cmd+[            Send backward

Layout:
  Cmd+Shift+T      Tidy up (auto-arrange)

AI:
  Cmd+Shift+A      Analyze selected image
  Cmd+Shift+F      Find more like selected
```

---

## 5. Technical Architecture

### 5.1 Stack

```
┌─────────────────────────────────────────────────────┐
│                    Tauri 2.0 Shell                   │
│                                                      │
│  ┌───────────────────────────────────────────────┐  │
│  │              Frontend (WebView)                │  │
│  │                                                │  │
│  │  ┌──────────┐  ┌──────────┐  ┌─────────────┐ │  │
│  │  │  PixiJS  │  │ UI Layer │  │ State Mgmt  │ │  │
│  │  │  Canvas  │  │  (HTML)  │  │  (Vanilla)  │ │  │
│  │  └──────────┘  └──────────┘  └─────────────┘ │  │
│  │                                                │  │
│  └──────────────────┬────────────────────────────┘  │
│                     │ IPC (invoke / events)          │
│  ┌──────────────────┴────────────────────────────┐  │
│  │              Backend (Rust)                     │  │
│  │                                                │  │
│  │  ┌──────────┐  ┌──────────┐  ┌─────────────┐ │  │
│  │  │ File I/O │  │ AI Client│  │ Vector Store│ │  │
│  │  │ (images, │  │ (HTTP to │  │ (SQLite +   │ │  │
│  │  │  metadata)│  │  APIs)   │  │  embeddings)│ │  │
│  │  └──────────┘  └──────────┘  └─────────────┘ │  │
│  │                                                │  │
│  │  ┌──────────┐  ┌──────────┐                   │  │
│  │  │ Web      │  │ Thumbnail│                   │  │
│  │  │ Scraper  │  │ Generator│                   │  │
│  │  └──────────┘  └──────────┘                   │  │
│  │                                                │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### 5.2 Frontend

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Canvas | PixiJS 8 (WebGL2) | 60fps pan/zoom with 500+ sprites; battle-tested in game/creative tooling |
| UI Chrome | Vanilla HTML/CSS | Panels, sidebars, dialogs — minimal framework overhead |
| State | Custom store (EventTarget) | Simple reactive state; no framework needed for this scale |
| Styling | CSS custom properties | Dark/light theme, consistent design tokens |

**Why PixiJS over raw Canvas2D:**
- WebGL hardware acceleration for large boards
- Built-in sprite batching (one draw call for hundreds of images)
- Interaction system (hit testing, drag, events) out of the box
- Viewport/camera management (pan, zoom, culling off-screen objects)
- Active community and extensive docs

**Why not React/Vue/Svelte:**
- The canvas is the app — 90% of UI is PixiJS sprites, not DOM elements
- DOM UI is minimal (sidebar panel, search bar, dialogs)
- No need for virtual DOM overhead when most elements are WebGL
- Smaller bundle, faster startup

### 5.3 Backend (Rust)

| Module | Responsibility |
|--------|---------------|
| `commands/fs.rs` | File scanning, image detection, metadata read/write |
| `commands/ai.rs` | AI provider abstraction, analysis pipeline, embeddings |
| `commands/search.rs` | Web search (Brave API), image download |
| `commands/scraper.rs` | URL image extraction, page scraping |
| `store/projects.rs` | Project CRUD, recent projects |
| `store/vectors.rs` | Vector storage, similarity queries (SQLite + custom) |
| `thumbnails.rs` | Thumbnail generation (resize via `image` crate) |

**Rust commands (IPC):**

```rust
// Core
scan_images(dir_path) -> Vec<ImageInfo>
read_metadata(project_path) -> ProjectMetadata
write_metadata(project_path, metadata) -> ()
create_project(name, path) -> ProjectInfo

// AI
analyze_image(image_path, provider) -> AnalysisResult
compute_embedding(image_path, provider) -> Vec<f32>
find_similar(embedding, threshold) -> Vec<SimilarResult>

// Search & Collection
web_search(query, provider) -> Vec<SearchResult>
download_image(url, dest_path) -> ImageInfo
extract_page_images(url) -> Vec<ImageUrl>

// Thumbnails
generate_thumbnail(image_path, size) -> ThumbnailPath
```

### 5.4 AI Architecture

```
                    ┌─────────────────┐
                    │  AI Provider    │
                    │  Abstraction    │
                    └────────┬────────┘
                             │
            ┌────────────────┼────────────────┐
            │                │                │
    ┌───────┴──────┐  ┌─────┴──────┐  ┌──────┴──────┐
    │ Cloud APIs   │  │ Local      │  │ Embeddings  │
    │              │  │ Models     │  │             │
    │ - Claude     │  │ - Ollama   │  │ - CLIP      │
    │ - GPT-4V     │  │ - MLX      │  │ - OpenAI    │
    │ - Gemini     │  │            │  │ - Local     │
    └──────────────┘  └────────────┘  └─────────────┘
```

**Provider selection logic:**
1. If user has configured a cloud API key → use cloud
2. If Ollama is running locally → use local (privacy mode)
3. If neither → prompt setup, offer local-only option
4. Embeddings always prefer local CLIP for speed

### 5.5 Vector Storage

**SQLite + manual vector search** (no external vector DB dependency):

```sql
CREATE TABLE embeddings (
    image_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    vector BLOB NOT NULL,         -- float32 array as bytes
    model TEXT NOT NULL,           -- "clip-vit-base-patch32"
    created_at INTEGER NOT NULL
);

CREATE INDEX idx_embeddings_project ON embeddings(project_id);
```

Similarity search via brute-force cosine similarity in Rust — sufficient for per-project scale (< 10K vectors). If cross-project search demands it later, migrate to `usearch` or `hnswlib` crate.

### 5.6 Web Collection Pipeline

```
User clicks "Find more like this"
    │
    ▼
Rust: generate_search_queries(image_analysis) -> Vec<String>
    │
    ▼
Rust: brave_image_search(queries) -> Vec<SearchResult>
    │  (Brave Search API — image results with thumbnails)
    │
    ▼
Frontend: display results in side panel
    │
    ▼
User drags result to canvas
    │
    ▼
Rust: download_image(url) -> local path
    │
    ▼
AI analysis pipeline (same as local import)
```

**Brave Search API** chosen over alternatives:
- Privacy-focused (no tracking)
- Affordable (free tier: 2K queries/month, paid: $5/1K)
- Image search with thumbnails included
- No Google/Bing TOS issues for automated queries

**Optional browser automation** (Playwright, Phase 2):
- For sites requiring JS rendering (Pinterest, Dribbble)
- Runs headless Chromium via Tauri sidecar
- Only activated when user explicitly requests "deep search"

---

## 6. Data Model

### Project Structure

```
~/.refboard/
├── config.json              # Global settings (AI keys, defaults)
├── recent.json              # Recent projects list
└── projects/
    └── {project-id}/
        ├── project.json     # Project metadata
        ├── images/          # Original images
        ├── thumbnails/      # Generated thumbnails
        ├── embeddings.db    # SQLite vector store
        └── board.json       # Canvas state (positions, groups, annotations)
```

### board.json (Canvas State)

```json
{
  "version": 2,
  "viewport": { "x": 0, "y": 0, "zoom": 1.0 },
  "items": [
    {
      "id": "img-001",
      "type": "image",
      "file": "reference-01.jpg",
      "position": { "x": 150, "y": 300 },
      "size": { "width": 200, "height": 150 },
      "metadata": {
        "title": "Art Deco Dancer",
        "artist": "Demetre Chiparus",
        "description": "Bronze and ivory sculpture...",
        "tags": ["art-deco", "sculpture", "bronze"],
        "style": ["geometric", "streamlined"],
        "colors": ["#8B7355", "#D4AF37"],
        "source": "https://example.com/chiparus"
      },
      "analysis": {
        "provider": "claude-vision",
        "timestamp": "2026-02-14T10:00:00Z",
        "accepted": true
      }
    }
  ],
  "groups": [
    {
      "id": "grp-001",
      "name": "Bronze Sculptures",
      "position": { "x": 100, "y": 200 },
      "size": { "width": 600, "height": 400 },
      "color": "#f5c518",
      "collapsed": false
    }
  ],
  "annotations": [
    {
      "id": "ann-001",
      "type": "text",
      "content": "Strong geometric influence",
      "position": { "x": 500, "y": 100 },
      "style": { "fontSize": 14, "color": "#f0f0f0" }
    },
    {
      "id": "ann-002",
      "type": "arrow",
      "from": "img-001",
      "to": "img-003",
      "label": "influenced by"
    }
  ]
}
```

---

## 7. Milestones

### M0: Foundation (4 weeks)

**Goal**: Tauri app shell with PixiJS canvas, basic image display

- [ ] Scaffold Tauri 2.0 project (Vanilla JS + PixiJS)
- [ ] Rust backend: file scanning, image detection, metadata CRUD
- [ ] PixiJS canvas: render image sprites, pan, zoom (60fps)
- [ ] Drag & drop import (files and folders)
- [ ] Asset protocol for local image display
- [ ] Card rendering with aspect-ratio-correct thumbnails
- [ ] Basic project create/open/save
- [ ] Dark theme UI shell (sidebar, toolbar, canvas)

**Exit criteria**: Open app → create project → drag images → see them on canvas → pan/zoom smoothly

### M1: AI Integration (3 weeks)

**Goal**: Automatic image analysis and tagging

- [ ] AI provider abstraction (Rust HTTP client)
- [ ] Claude Vision integration (analyze image → description + tags)
- [ ] Ollama/MLX local model support
- [ ] Analysis pipeline: import triggers background analysis
- [ ] Suggestion panel UI (accept/edit/reject tags)
- [ ] Metadata panel (view/edit all fields)
- [ ] Provider selection in settings

**Exit criteria**: Add an image → AI suggests tags within 3 seconds → accept → tags visible on card

### M2: Search & Similarity (3 weeks)

**Goal**: Find images by text and visual similarity

- [ ] Text search across all metadata fields
- [ ] CLIP embedding computation (local, via Rust or Python sidecar)
- [ ] SQLite vector storage
- [ ] Visual similarity search ("find similar" on any card)
- [ ] Search results panel with ranked thumbnails
- [ ] Tag filter sidebar (click to filter canvas)

**Exit criteria**: "Find similar" on a sculpture → top 5 results are visually similar images from the board

### M3: Organization (3 weeks)

**Goal**: Canvas tools for arranging and annotating

- [ ] Multi-select (Shift+click, drag-select rectangle)
- [ ] Card resize (corner handles, maintain aspect ratio)
- [ ] Named groups/regions (draw region → name it)
- [ ] Auto-layout algorithms (grid, pack, cluster-by-tag)
- [ ] Text annotation tool
- [ ] Arrow/connector tool
- [ ] Undo/redo stack
- [ ] Keyboard shortcuts (full set from Section 4.5)
- [ ] Minimap navigation

**Exit criteria**: Select 20 images → "Tidy Up" → clean grid → drag into named groups → add text notes

### M4: Web Collection (3 weeks)

**Goal**: AI-powered "find more like this" from the web

- [ ] Brave Search API integration (Rust)
- [ ] AI-generated search queries from image analysis
- [ ] Search results panel (thumbnails, source URLs)
- [ ] Drag from results panel → canvas (download + import)
- [ ] "Find more like this" button on image context menu
- [ ] Search refinement ("more geometric", "less colorful")
- [ ] Download manager (queue, progress, dedup)

**Exit criteria**: Select image → "Find more" → see 20 web results → drag 3 onto board → AI-analyzed automatically

### M5: Polish & Ship (2 weeks)

**Goal**: Production-ready macOS release

- [ ] Performance optimization (500+ images target)
- [ ] macOS native feel (title bar, menus, Cmd shortcuts)
- [ ] Auto-save and crash recovery
- [ ] Export (board as PNG, metadata as JSON, images as ZIP)
- [ ] Onboarding flow (first launch experience)
- [ ] DMG packaging and distribution
- [ ] CLI compatibility (refboard v1 projects importable)
- [ ] Documentation site

**Exit criteria**: Ship .dmg to 10 beta users → no critical bugs for 1 week

### Future: M6+ (Post-launch)

- iOS companion app (Tauri mobile)
- Multi-board search
- Collaborative boards (shared state via CRDT)
- Plugin system (custom AI providers, import sources)
- Pinterest/Dribbble deep integration (browser automation)
- AI style transfer suggestions ("what if this was more minimal?")

---

## 8. Non-Functional Requirements

### Performance

| Metric | Target |
|--------|--------|
| Canvas FPS (500 images) | 60fps sustained |
| Image import (drag 50 files) | < 2s to display on canvas |
| AI analysis latency | < 5s per image (cloud), < 10s (local) |
| Text search | < 100ms for 10K items |
| Similarity search | < 500ms for 10K vectors |
| App startup | < 2s to interactive canvas |
| Memory (500 images) | < 500MB RSS |

### Platform

| Requirement | Detail |
|-------------|--------|
| Primary | macOS 13+ (Apple Silicon optimized) |
| Secondary | macOS 12+ (Intel) |
| Future | iOS (Tauri mobile), then Windows/Linux |
| Runtime | Tauri 2.0 (WebKit on macOS) |

### Privacy & Security

- Local-first: all data stored on disk, no cloud sync by default
- AI API keys stored in system keychain (not plaintext config)
- Local model option for fully offline operation
- No telemetry or analytics without explicit opt-in
- File access scoped to project directories

---

## 9. Success Metrics

### Adoption (3 months post-launch)

| Metric | Target |
|--------|--------|
| Downloads | 1,000 |
| Weekly active users | 200 |
| Projects created per user | 3+ |
| Images per project (avg) | 50+ |

### Engagement

| Metric | Target |
|--------|--------|
| AI analysis acceptance rate | > 70% of suggestions accepted |
| "Find more like this" usage | > 30% of sessions use web collection |
| Session duration | > 10 min average |
| Return rate (weekly) | > 40% of users return |

### Quality

| Metric | Target |
|--------|--------|
| Crash-free sessions | > 99% |
| AI tag accuracy (user-judged) | > 80% useful tags |
| Canvas performance | 60fps at P95 with 200+ images |
| NPS | > 40 |

---

## 10. Competitive Landscape

| Tool | Strengths | Weakness vs RefBoard 2.0 |
|------|-----------|--------------------------|
| **PureRef** | Lightweight, fast, desktop-native | No AI, no search, no web collection, no metadata |
| **Eagle** | File management, tagging, browser extension | Manual tagging, no AI analysis, no canvas layout |
| **Pinterest** | Massive image library, discovery | Web-only, no local files, no custom organization |
| **Milanote** | Beautiful moodboards, collaboration | Cloud-only, limited AI, no local processing |
| **Figma** | Industry standard for design | Not a reference tool — overkill for collection |
| **Miro** | Great canvas, collaboration | Not image-focused, no AI vision, no similarity search |

**RefBoard's moat**: AI-first reference collection. No competitor combines vision AI analysis, similarity search, web collection, and a performant infinite canvas in a local-first desktop app.

---

## 11. Open Questions

| # | Question | Options | Decision |
|---|----------|---------|----------|
| Q1 | Frontend framework? | Vanilla JS vs Svelte vs Solid | **Vanilla JS** (90% is PixiJS canvas, minimal DOM) |
| Q2 | PixiJS version? | v7 (stable) vs v8 (WebGPU) | v8 (WebGL2 fallback, future-proof) |
| Q3 | Vector search library? | Brute-force vs usearch vs hnswlib | Brute-force first, upgrade if needed |
| Q4 | CLIP inference? | Rust (candle) vs Python sidecar vs WASM vs ort+CoreML | **`ort` + `fastembed-rs`** (CoreML/ANE, ~15-40ms/img, ~50 LOC) |
| Q5 | Board file format? | JSON vs SQLite vs custom binary | **JSON** (human-readable, git-friendly) |
| Q6 | Pricing model? | Free + paid pro vs one-time purchase vs open-source | **Open source (MIT)** |
| Q7 | Web search provider? | Brave vs SerpAPI vs Google Custom Search | Brave (privacy, cost) |

---

*Last updated: 2026-02-14*
