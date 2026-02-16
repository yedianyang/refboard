# Deco

AI-powered visual reference board for designers, artists, and creative professionals.

---

## Deco 2.0 Desktop App

A native macOS desktop application built with **Tauri 2.0** and **PixiJS 8** for collecting, analyzing, and organizing visual references on an infinite canvas.

### Features

- **Infinite canvas** -- WebGL2 rendering at 60fps with pan, zoom, drag, multi-select, resize, and groups
- **AI vision analysis** -- Anthropic Claude, OpenAI GPT-4o, and Ollama (local LLaVA) for automatic tagging
- **Full-text search** -- SQLite FTS5 index across all metadata fields with instant results
- **Tag filtering** -- sidebar with tag counts and click-to-filter canvas
- **Find Similar** -- embedding-based and tag-based similarity search
- **Web Collection** -- search the web for reference images via Brave Search API, download directly to project
- **Auto-save** -- board state persisted every 30 seconds and restored on reopen
- **Export** -- metadata export as JSON with all AI analysis data
- **Local-first** -- all data stays on your machine; cloud AI is optional

### Installation

#### Prerequisites

1. **Rust** -- install via [rustup.rs](https://rustup.rs/)
2. **Node.js 18+** -- install from [nodejs.org](https://nodejs.org/)
3. **Xcode Command Line Tools** -- `xcode-select --install`

#### Build from Source

```bash
cd desktop
npm install
npm run tauri dev       # Development mode with hot-reload
npm run tauri build     # Build release .app and .dmg
```

The release build outputs to `desktop/src-tauri/target/release/bundle/`.

#### System Requirements

- macOS 12.0+ (Intel or Apple Silicon)
- 4 GB RAM minimum, 8 GB recommended
- GPU with WebGL2 support

### Quick Start

1. Open Deco
2. Enter a folder path containing images in the toolbar, click **Open**
3. Your images appear as cards on the canvas
4. Click a card to select it, then click **Analyze with AI** in the metadata panel
5. Accept the AI-generated tags, description, and style
6. Use **Cmd+F** to search, the tag sidebar to filter, or **Find Similar** to explore

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space+drag` | Pan canvas |
| `Scroll wheel` | Zoom (cursor-centered) |
| `Shift+1` | Fit all images in view |
| `Shift+2` | Fit selection |
| `Cmd+0` | Zoom to 100% |
| `Cmd+F` | Focus search bar |
| `Cmd+S` | Save board state |
| `Cmd+Z` | Undo |
| `Cmd+Shift+Z` | Redo |
| `Cmd+D` | Duplicate selected |
| `Cmd+G` | Group selected |
| `Cmd+Shift+G` | Ungroup |
| `Cmd+]` / `Cmd+[` | Bring forward / Send backward |
| `Cmd+Shift+T` | Tidy up (auto-layout) |
| `Cmd+Shift+A` | Analyze selected with AI |
| `Cmd+Shift+F` | Find more like selected online |
| `Delete` / `Backspace` | Delete selected |
| `V` | Select tool |
| `H` | Hand (pan) tool |
| `G` | Toggle grid |
| `M` | Toggle minimap |
| `Escape` | Deselect / close panel |

### Project Structure

```
desktop/
├── src/                      # Frontend (Vanilla JS + PixiJS 8)
│   ├── main.js               # App entry, wiring, keyboard shortcuts
│   ├── canvas.js             # Infinite canvas engine (1400+ lines)
│   ├── panels.js             # AI suggestion, metadata, settings panels
│   ├── search.js             # Search bar, tag sidebar, results panel
│   └── collection.js         # Web collection, Brave Search, downloads
├── index.html                # App shell with all CSS
├── src-tauri/                # Rust backend (Tauri 2.0)
│   ├── src/lib.rs            # File scanning, metadata, board state, export
│   ├── src/ai.rs             # AI vision provider abstraction
│   ├── src/search.rs         # SQLite FTS5 search, embeddings, similarity
│   └── src/web.rs            # Brave Search API, web image download
├── package.json
├── vite.config.js
└── src-tauri/tauri.conf.json # App config, bundling, permissions
```

### Configuration

#### AI Provider

Open **Settings** (gear icon) to configure:

| Provider | API Key | Models |
|----------|---------|--------|
| Anthropic | `sk-ant-...` | claude-sonnet-4-5, claude-haiku-4-5 |
| OpenAI | `sk-...` | gpt-4o, gpt-4o-mini |
| Ollama | (none -- local) | llava, llava:13b, bakllava |

#### Web Collection

In Settings, add a **Brave Search API Key** (`BSA...`). Get a free key at [brave.com/search/api](https://brave.com/search/api).

#### Data Storage

```
~/.deco/
├── config.json          # AI + web collection settings
└── recent.json          # Recent projects list

your-project/
├── images/              # Image files
└── .deco/
    ├── search.db        # SQLite FTS5 index + metadata + embeddings
    └── board.json       # Saved board state (positions, groups, viewport)
```

---

## Deco v1 (CLI)

The original command-line tool for generating self-contained HTML reference boards.

### Installation

```bash
npm install -g deco
```

### Quick Start

```bash
# Create project
deco init my-refs

# Import images
deco import ~/Downloads/references --tags "inspiration"

# Build
deco build

# Open board.html in browser
```

### Commands

| Command | Description |
|---------|-------------|
| `deco init [dir]` | Create new project |
| `deco add <image>` | Add single image |
| `deco import <folder>` | Import all images from folder |
| `deco build` | Generate HTML board |
| `deco watch` | Watch and auto-rebuild |
| `deco list` | List all items |
| `deco remove <n>` | Remove item by index |
| `deco meta <n> [opts]` | Edit item metadata |
| `deco status` | Show project summary |
| `deco home` | Open project dashboard |
| `deco analyze <image>` | AI-powered image analysis |
| `deco auto-tag --all` | Batch auto-tag via AI |
| `deco search --similar <img>` | Find similar images |
| `deco ask "question"` | Ask AI about your board |
| `deco config <key> <val>` | Manage configuration |
| `deco serve` | Start local dev server with livereload |
| `deco save-positions` | Persist card positions |

### CLI Options

```bash
--title "..."       Item title
--artist "..."      Artist name
--year "..."        Year
--desc "..."        Description
--tags "a,b,c"      Tags (comma-separated)
--embed            Embed images as base64
-o, --output       Output file
--json             Machine-readable JSON output
-q, --quiet        Suppress decorative output
```

### Programmatic API

```js
import { generateBoard, findImages, autoLayout, loadMetadata } from 'deco';

await generateBoard({
  inputDir: './my-project',
  outputFile: './board.html',
  title: 'My Board',
  embedImages: false,
});
```

---

## Documentation

- [User Guide](docs/user-guide.md) -- detailed usage instructions
- [API Reference](docs/api.md) -- Rust commands and IPC interface
- [Changelog](CHANGELOG.md) -- version history

## License

MIT
