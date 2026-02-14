# Changelog

All notable changes to RefBoard will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [2.0.0-beta.0] - 2026-02-14

RefBoard 2.0 Desktop App -- a native macOS application built with Tauri 2.0 and PixiJS 8.

### M5: Polish & Ship

#### Added
- **Auto-save** -- board state (card positions, groups, viewport) saved to `.refboard/board.json` every 30 seconds when changes are detected
- **Board state restore** -- reopening a project restores exact card positions, sizes, groups, and viewport
- **Manual save** with `Cmd+S` keyboard shortcut
- **Metadata export** -- Export button exports all image metadata with AI analysis data to a JSON file
- `Cmd+Shift+A` shortcut to analyze selected image with AI
- `Cmd+Shift+F` shortcut to find more images online like selected
- macOS native overlay title bar with traffic light integration
- Minimum window size enforced (800x600)
- DMG packaging with proper app category (Graphics & Design), macOS 12+ minimum
- Rust commands: `save_board_state`, `load_board_state`, `export_metadata`

### M4: Web Collection

#### Added
- **Web Collection panel** -- search the web for reference images using Brave Search API
- **"Find More Online"** action on any analyzed card -- generates AI-powered search queries from image metadata (description, tags, style, mood, era)
- **Image download manager** -- download web images directly into the project with filename deduplication
- **Brave Search API integration** -- image search with safe search settings and configurable result count
- **Web collection settings** -- Brave API key management in Settings dialog
- Frontend `collection.js` module: web search panel, thumbnail grid with download overlay, bulk download, sidebar toggle
- "Find Online" button in metadata panel footer
- Rust module `web.rs` with 5 Tauri commands and 5 unit tests

### M3: Organization

#### Added
- **Multi-select** with drag-select rectangle on empty canvas area
- **Multi-card drag** for moving groups of selected cards together
- **Card resize** with corner drag handles and aspect-ratio lock
- **Undo/redo** stack (`Cmd+Z` / `Cmd+Shift+Z`) for move, resize, and delete operations (100-step history)
- **Named groups** (`Cmd+G`) with colored borders and text labels
- **Ungroup** (`Cmd+Shift+G`)
- **Auto-layout tidy up** (`Cmd+Shift+T`) -- arrange selected or all cards in an even grid
- **Minimap** navigation overlay (`M` to toggle) showing all cards and viewport indicator
- **Grid toggle** (`G` to toggle) with adaptive grid density
- **Duplicate** (`Cmd+D`) with offset positioning
- **Z-order** -- `Cmd+]` bring forward, `Cmd+[` send backward
- Full keyboard shortcuts matching Figma/Miro conventions (PRD Section 4.5)

### M2: Search & Similarity

#### Added
- **SQLite FTS5 full-text search** across image names, descriptions, tags, style, mood, and era
- **Tag filter sidebar** with tag list, counts, and click-to-filter; supports multi-tag intersection
- **Find Similar** action on any card -- embedding-based cosine similarity with tag-based Jaccard fallback
- **Search results panel** with ranked thumbnails, click-to-navigate on canvas
- **Canvas filtering** -- non-matching cards dim to 15% opacity when a search or tag filter is active
- Per-project SQLite database at `{project}/.refboard/search.db`
- Rust module `search.rs` with 6 Tauri commands and 6 unit tests
- Frontend `search.js` module: debounced search bar (`Cmd+F`), tag sidebar toggle

### M1: AI Integration

#### Added
- **AI vision provider abstraction** supporting Anthropic Claude, OpenAI GPT-4o, and Ollama (local LLaVA)
- **Analysis pipeline** -- select an image, click "Analyze with AI", receive description, tags, style, mood, colors, and era
- **Suggestion panel** -- review, edit, accept, or reject AI-generated metadata with chip editor
- **Metadata panel** -- view and edit all image fields (filename, description, tags, style, colors, era)
- **Settings dialog** -- choose AI provider, enter API key, select model, test connection
- Tauri IPC events for streaming analysis progress (`ai:analysis:start`, `ai:analysis:complete`, `ai:analysis:error`)
- Rust module `ai.rs` with 4 Tauri commands and 8 unit tests

### M0: Foundation

#### Added
- **Tauri 2.0 desktop app** scaffold with Rust backend and WebView frontend
- **PixiJS 8 infinite canvas** with WebGL2 rendering, cursor-centered zoom, and 60fps pan/zoom
- **Image cards** with aspect-ratio-correct display, drag to reposition, click to select
- **Viewport culling** -- off-screen cards are hidden from rendering for performance
- **Grid background** that scales with zoom level (minor + major grid lines)
- Rust backend: `scan_images`, `read_metadata`, `write_metadata`, `create_project`, `list_projects`
- Tauri asset protocol for loading local images into the WebView
- Vite dev server with hot-reload for frontend development
- macOS `.app` and `.dmg` bundle targets (macOS 12+)

---

## [1.1.0] - 2026-02-14

### Added
- **`refboard serve [--port]`** -- local dev server with SSE livereload, dynamic board rendering, and image proxy
- **AI Provider abstraction layer** (`lib/ai-provider.js`) with multi-provider support
- **`refboard analyze <image>`** -- AI-powered image analysis (description + tags)
- **`refboard auto-tag --all`** -- batch auto-tagging via AI
- **`refboard search --similar <image>`** -- similar image search using embeddings
- **`refboard ask "..."`** -- ask questions about your board using AI
- **`refboard config`** -- manage AI provider and project configuration
- **`refboard agent`** -- external agent interface for programmatic board operations
- **`refboard save-positions`** -- persist card positions from canvas to metadata

### Fixed
- `build --json` output no longer includes log messages
- `save-positions` handles both filename keys and numeric ID keys
- AI provider connection errors display a user-friendly message
- Removed `console.warn` from library code
- Template placeholders `{{DESCRIPTION}}` and `{{GENERATED_AT}}` now exist in templates

## [1.0.0] - 2026-02-13

### Added
- **Dashboard / Home page** -- project browser with `refboard home` command
- Scans directories for RefBoard projects
- Recent projects tracking (`~/.refboard/recent.json`)
- **`refboard status`** -- show project summary (item count, tags, last build)
- **`--json` flag** -- machine-readable JSON output for `build`, `list`, `status`, `meta`
- **`--quiet` / `-q` flag** -- suppress decorative output for scripting
- **`index.js` public API** -- library exports for programmatic use

## [0.3.0] - 2026-02-13

### Added
- Major UI redesign -- cleaner, more professional interface
- Tag filtering -- sidebar tag list with click-to-filter
- Text search -- `/` to focus search, filter cards by title/artist/tags
- Keyboard shortcuts -- `T` tile, `F` fit, `I` info, `0` reset, `+/-` zoom, `Del` remove, `Esc` close

## [0.2.0] - 2026-02-12

### Added
- Auto-tile button -- spread items in a grid layout with one click
- Canvas-style layout -- pan, zoom, drag cards like Miro/Figma
- Minimap -- overview navigation panel
- Sticky notes -- quick annotation support

## [0.1.0] - 2026-02-12

### Added
- Project structure -- `refboard init`, `add`, `build` commands
- Image detection -- PNG, JPEG, GIF, WebP, BMP, SVG support
- Base64 embedding -- `--embed` flag for self-contained HTML
- Auto-layout -- grid-based card arrangement
- Rich metadata -- title, artist, year, description, context, influences, tags

## [0.0.1] - 2026-02-12

### Added
- Initial commit -- RefBoard visual reference board generator
