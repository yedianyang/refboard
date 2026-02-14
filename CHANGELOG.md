# Changelog

All notable changes to RefBoard will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [2.0.0-beta.0] - 2026-02-14

### Added
- **Auto-save** -- board state (card positions, groups, viewport) saved to `.refboard/board.json` every 30s
- **Board state restore** -- reopening a project restores exact layout and viewport
- **Manual save** with Cmd+S keyboard shortcut
- **Metadata export** -- Export button exports all image metadata with AI analysis to JSON
- **Cmd+Shift+A** shortcut to analyze selected image with AI
- **Cmd+Shift+F** shortcut to find more images online like selected
- **macOS native title bar** -- overlay title bar with traffic light integration
- **Min window size** enforced (800x600)
- **DMG packaging** -- proper app category (Graphics & Design), macOS 12+ minimum
- Board save/load Rust commands: `save_board_state`, `load_board_state`, `export_metadata`

## [2.0.0-alpha.4] - 2026-02-14

### Added
- **Web Collection panel** -- search the web for reference images using Brave Search API
- **"Find More Online"** action on any analyzed card -- AI-generated search queries from image metadata
- **Image download manager** -- download web images directly into the project with deduplication
- **Brave Search API integration** (`web.rs`) -- image search, safe search settings, result count config
- **Web collection settings** -- Brave API key management in Settings dialog
- Frontend `collection.js` module: web search panel, thumbnail grid, download progress, sidebar toggle
- "Find Online" button in metadata panel footer for quick web search from any card

## [2.0.0-alpha.3] - 2026-02-14

### Added
- **Multi-select** with drag-select rectangle
- **Multi-card drag** for moving groups of cards together
- **Card resize** with corner handles and aspect-ratio lock
- **Undo/redo** stack (Cmd+Z / Cmd+Shift+Z) for move, resize, delete operations
- **Named groups** (Cmd+G) with colored borders and labels
- **Auto-layout tidy up** (Cmd+Shift+T) -- arrange cards in an even grid
- **Minimap** navigation overlay (M to toggle)
- **Grid toggle** (G to toggle) with configurable snap
- Full keyboard shortcuts per PRD Section 4.5 (delete, duplicate, z-order, fit, etc.)

## [2.0.0-alpha.2] - 2026-02-14

### Added
- **SQLite FTS5 full-text search** across image titles, descriptions, tags, and all metadata fields
- **Tag filter sidebar** with tag list, counts, and click-to-filter canvas; active filter bar with clear button
- **Find Similar** action on any card -- embedding-based and tag-based similarity ranking
- **Search results panel** with ranked thumbnails and click-to-navigate
- **Canvas filtering** -- non-matching cards dim when a search or tag filter is active
- Rust `search.rs` module: per-project SQLite database at `{project}/.refboard/search.db`
- Frontend `search.js` module: search bar (Cmd+F), tag sidebar toggle, debounced queries

## [2.0.0-alpha.1] - 2026-02-14

### Added
- **AI vision provider abstraction** (`ai.rs`) supporting Anthropic Claude, OpenAI GPT-4o, and Ollama (local LLaVA)
- **Analysis pipeline** -- select an image, click "Analyze with AI", receive description, tags, style, mood, colors, and era
- **Suggestion panel** -- accept, edit, or reject AI-generated tags with one click
- **Metadata panel** -- view and edit all image fields (title, description, tags, style, source)
- **Settings dialog** -- choose AI provider, set API key, select model
- Tauri IPC events for streaming analysis progress to the frontend

## [2.0.0-alpha.0] - 2026-02-14

### Added
- **Tauri 2.0 desktop app** scaffold (`desktop/` directory)
- **PixiJS 8 infinite canvas** with WebGL2 rendering, dot-grid background, and 60fps pan/zoom
- **Image cards** with aspect-ratio-correct display, drag to reposition, click to select
- **Viewport culling** -- off-screen cards are skipped for rendering performance
- **Grid background** that scales with zoom level
- Rust backend: `scan_images`, `read_metadata`, `write_metadata` IPC commands
- Tauri asset protocol for loading local images into the WebView
- Vite dev server with hot-reload for frontend development
- macOS `.app` and `.dmg` bundle targets (macOS 12+)

## [1.1.0] - 2026-02-14

### Added
- **`refboard serve [--port]`** -- local dev server with SSE livereload, dynamic board rendering, and image proxy
- **AI Provider abstraction layer** (`lib/ai-provider.js`) with multi-provider support (OpenClaw, OpenAI, Anthropic, MiniMax, Google, custom endpoints)
- **`refboard analyze <image>`** -- AI-powered image analysis (description + tags)
- **`refboard auto-tag --all`** -- batch auto-tagging via AI
- **`refboard search --similar <image>`** -- similar image search using embeddings
- **`refboard ask "..."`** -- ask questions about your board using AI
- **`refboard config`** -- manage AI provider and project configuration
- **`refboard agent`** -- external agent interface for programmatic board operations
- **`refboard save-positions`** -- persist card positions from canvas to metadata
- WebP / BMP image dimension parsing without external dependencies

### Fixed
- `build --json` output no longer includes log messages (BUG-004)
- `save-positions` handles both filename keys and numeric ID keys
- AI provider connection errors display a user-friendly message
- Removed `console.warn` from library code (ISSUE-001)
- Template placeholders `{{DESCRIPTION}}` and `{{GENERATED_AT}}` now exist in templates (ISSUE-002)

## [1.0.0] - 2026-02-13

### Added
- **Dashboard / Home page** -- project browser with `refboard home` command
- Scans directories for RefBoard projects
- Recent projects tracking (`~/.refboard/recent.json`)
- **`refboard status`** -- show project summary (item count, tags, last build)
- **`--json` flag** -- machine-readable JSON output for `build`, `list`, `status`, `meta`
- **`--quiet` / `-q` flag** -- suppress decorative output for scripting
- **`index.js` public API** -- library exports for programmatic use

### Changed
- README updated with new commands and AI agent usage guide

## [0.3.0] - 2026-02-13

### Added
- Major UI redesign -- cleaner, more professional interface
- Tag filtering -- sidebar tag list with click-to-filter
- Text search -- `/` to focus search, filter cards by title/artist/tags
- Keyboard shortcuts -- `T` tile, `F` fit, `I` info, `0` reset, `+/-` zoom, `Del` remove, `Esc` close
- Better CLI output for AI agents -- structured commands, parseable output

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
- Legacy mode -- direct `refboard -i <folder>` without project setup

## [0.0.1] - 2026-02-12

### Added
- Initial commit -- RefBoard visual reference board generator
