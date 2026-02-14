# RefBoard

AI-powered visual reference board for designers, artists, and creative professionals.

---

## RefBoard 2.0 (Desktop App)

A native macOS desktop app built with Tauri 2.0 and PixiJS 8 for collecting, analyzing, and organizing visual references on an infinite canvas.

### Highlights

- **Infinite canvas** -- PixiJS 8 WebGL rendering with pan, zoom, drag, and multi-select at 60fps
- **AI vision analysis** -- Anthropic Claude, OpenAI GPT-4o, and Ollama (local) providers for automatic image description and tagging
- **Full-text search** -- SQLite FTS5 index across titles, descriptions, tags, and all metadata fields
- **Tag filtering** -- Sidebar with tag list, counts, and click-to-filter canvas
- **Find Similar** -- Embedding-based and tag-based similarity search across your board
- **Local-first** -- All data stays on your machine; cloud AI is optional

### Development Setup

Prerequisites: [Rust](https://rustup.rs/), [Node.js 18+](https://nodejs.org/), and [Tauri 2.0 prerequisites](https://v2.tauri.app/start/prerequisites/).

```bash
cd desktop
npm install
npm run tauri dev
```

To build a release `.app` / `.dmg`:

```bash
cd desktop
npm run tauri build
```

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space+drag` | Pan canvas |
| `Scroll wheel` | Zoom (cursor-centered) |
| `Shift+1` | Fit all images in view |
| `Cmd+F` | Focus search bar |
| `Escape` | Close panels / clear filters |
| Click card | Select and open metadata panel |

### Project Structure

```
desktop/
├── src/                  # Frontend (Vanilla JS + PixiJS 8)
│   ├── main.js           # App entry point
│   ├── canvas.js         # Infinite canvas engine
│   ├── panels.js         # AI suggestion, metadata, settings panels
│   └── search.js         # Search bar, tag sidebar, results panel
├── src-tauri/            # Rust backend
│   ├── src/lib.rs        # File scanning, metadata, image commands
│   ├── src/ai.rs         # AI vision provider abstraction
│   └── src/search.rs     # SQLite FTS5 search + similarity
├── index.html            # App shell
├── package.json
├── vite.config.js
└── src-tauri/tauri.conf.json
```

---

## RefBoard v1 (CLI)

The original command-line tool for generating self-contained HTML reference boards.

### Installation

```bash
npm install -g refboard
```

### Quick Start

```bash
# Create project
refboard init my-refs

# Import images
refboard import ~/Downloads/references --tags "inspiration"

# Build
refboard build

# Open board.html in browser
```

### Commands

| Command | Description |
|---------|-------------|
| `refboard init [dir]` | Create new project |
| `refboard add <image>` | Add single image |
| `refboard import <folder>` | Import all images from folder |
| `refboard build` | Generate HTML board |
| `refboard watch` | Watch and auto-rebuild |
| `refboard list` | List all items |
| `refboard remove <n>` | Remove item by index |
| `refboard meta <n> [opts]` | Edit item metadata |
| `refboard status` | Show project summary |
| `refboard home` | Open project dashboard |
| `refboard analyze <image>` | AI-powered image analysis |
| `refboard auto-tag --all` | Batch auto-tag via AI |
| `refboard search --similar <img>` | Find similar images |
| `refboard ask "question"` | Ask AI about your board |
| `refboard config <key> <val>` | Manage configuration |
| `refboard agent <action>` | External agent interface |
| `refboard serve` | Start local dev server with livereload |
| `refboard save-positions` | Persist card positions |

### Options

```bash
--title "..."       Item title
--artist "..."      Artist name
--year "..."        Year
--desc "..."        Description
--tags "a,b,c"      Tags (comma-separated)
--context "..."     Historical context
--influences "..."  Artistic influences
--embed            Embed images as base64
-o, --output       Output file
--json             Machine-readable JSON output
-q, --quiet        Suppress decorative output
```

### Keyboard Shortcuts (HTML Board)

| Key | Action |
|-----|--------|
| `T` | Auto-tile layout |
| `F` | Fit view |
| `I` | Toggle info panel |
| `/` | Focus search |
| `0` | Reset zoom |
| `+/-` | Zoom in/out |
| `Space+drag` | Pan |
| `Del` | Remove selected |
| `Esc` | Close panels |

### CLI Project Structure

```
my-project/
├── refboard.json     # Project config
├── metadata.json     # Item metadata
├── images/           # Image files
└── board.html        # Generated output
```

### AI Provider Configuration

Add an `ai` section to your `refboard.json`:

```json
{
  "ai": {
    "defaultProvider": "openai",
    "providers": {
      "openai": { "apiKey": "sk-..." },
      "anthropic": { "apiKey": "sk-ant-..." }
    }
  }
}
```

Or configure via CLI:

```bash
refboard config ai.provider openai
refboard config ai.apiKey sk-...
```

Environment variables are also supported: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`.

### For AI Agents

```bash
# Batch import with auto-build
refboard import ./refs --tags "reference" && refboard build

# JSON output for parsing
refboard list --json
refboard status --json

# Quiet mode
refboard build -q

# Agent interface
refboard agent add <image> --analyze
refboard agent export --format json
```

### Programmatic API

```js
import { generateBoard, findImages, autoLayout, loadMetadata } from 'refboard';
import { generateDashboard, scanProjects } from 'refboard';

await generateBoard({
  inputDir: './my-project',
  outputFile: './board.html',
  title: 'My Board',
  embedImages: false,
});
```

---

## License

MIT
