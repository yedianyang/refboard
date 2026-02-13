# Changelog

All notable changes to RefBoard will be documented in this file.

## [1.1.0] - 2026-02-14

### Added
- **AI Provider abstraction layer** (`lib/ai-provider.js`)
  - Multi-provider support: OpenClaw, OpenAI, Anthropic, MiniMax, Google, custom endpoints
  - Unified interface for vision, chat, and embedding features
  - Per-provider configuration via `refboard.json`
  - Cosine similarity utility for embedding comparison
- **`refboard analyze <image>`** — AI-powered image analysis (description + tags)
- **`refboard auto-tag --all`** — Batch auto-tagging via AI
- **`refboard search --similar <image>`** — Similar image search using embeddings
- **`refboard ask "..."`** — Ask questions about your board using AI
- **`refboard config`** — Manage AI provider and project configuration
- **`refboard agent`** — External agent interface for programmatic board operations
- **`refboard save-positions`** — Persist card positions from canvas to metadata
- **WebP / BMP image dimension parsing** — Native header parsing without external dependencies

### Changed
- CLI now imports and initializes AI Provider from project config
- `index.js` public API exports generator and dashboard modules

## [1.0.0] - 2026-02-13

### Added
- **Dashboard / Home page** — Project browser with `refboard home` command
  - Scans directories for RefBoard projects
  - Recent projects tracking (`~/.refboard/recent.json`)
  - Auto-open in browser
- **`refboard status`** — Show project summary (item count, tags, last build)
- **`--json` flag** — Machine-readable JSON output for `build`, `list`, `status`, `meta`
- **`--quiet` / `-q` flag** — Suppress decorative output for scripting
- **`index.js` public API** — Library exports for programmatic use

### Changed
- README updated with new commands and AI agent usage guide

## [0.3.0] - 2026-02-13

### Added
- **Major UI redesign** — Cleaner, more professional interface
- **Tag filtering** — Sidebar tag list with click-to-filter
- **Text search** — `/` to focus search, filter cards by title/artist/tags
- **Keyboard shortcuts** — `T` tile, `F` fit, `I` info, `0` reset, `+/-` zoom, `Del` remove, `Esc` close
- **Better CLI for AI agents** — Structured commands, parseable output

## [0.2.0] - 2026-02-12

### Added
- **Auto-tile button** — Spread items in a grid layout with one click
- **Canvas-style layout** — Pan, zoom, drag cards like Miro/Figma
- **Minimap** — Overview navigation panel
- **Sticky notes** — Quick annotation support

## [0.1.0] - 2026-02-12

### Added
- **Project structure** — `refboard init`, `add`, `build` commands
- **Image detection** — PNG, JPEG, GIF, WebP, BMP, SVG support
- **Base64 embedding** — `--embed` flag for self-contained HTML
- **Auto-layout** — Grid-based card arrangement
- **Rich metadata** — Title, artist, year, description, context, influences, tags
- **Legacy mode** — Direct `refboard -i <folder>` without project setup
- **`.gitignore`** — Standard ignores

## [0.0.1] - 2026-02-12

### Added
- Initial commit — RefBoard visual reference board generator
