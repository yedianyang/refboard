# RefBoard

Visual reference board generator. Canvas-style mood boards with metadata, filtering, and AI-friendly CLI.

## Features

- **Canvas layout** — Drag, pan, zoom like Miro/Figma
- **Rich metadata** — Artist, year, context, influences, tags
- **Filter & search** — Quick filtering by tags or text search
- **Keyboard shortcuts** — Fast navigation (T=tile, F=fit, /=search)
- **Portable output** — Single HTML file, no server needed
- **AI-optimized CLI** — Batch import, watch mode, scriptable

## Installation

```bash
npm install -g refboard
```

## Quick Start

```bash
# Create project
refboard init my-refs

# Import images
refboard import ~/Downloads/references --tags "inspiration"

# Build
refboard build

# Open board.html in browser
```

## Commands

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

## Keyboard Shortcuts

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

## Project Structure

```
my-project/
├── refboard.json     # Project config
├── metadata.json     # Item metadata
├── images/           # Image files
└── board.html        # Generated output
```

## Metadata Format

```json
{
  "board": {
    "title": "Art Deco References",
    "description": "1920s sculpture and architecture"
  },
  "items": [
    {
      "file": "chiparus.jpg",
      "title": "Dancer",
      "artist": "Demetre Chiparus",
      "year": "1925",
      "description": "Bronze and ivory sculpture",
      "context": "Art Deco movement...",
      "influences": "Ballet Russes, Egyptian revival",
      "tags": ["art-deco", "sculpture", "bronze"]
    }
  ]
}
```

## AI Provider

RefBoard supports multiple AI providers for image analysis, auto-tagging, and similarity search.

### Configuration

Add an `ai` section to your `refboard.json`:

```json
{
  "ai": {
    "defaultProvider": "openclaw",
    "providers": {
      "openclaw": { "endpoint": "http://localhost:18789" },
      "openai": { "apiKey": "sk-..." },
      "anthropic": { "apiKey": "sk-ant-..." }
    }
  }
}
```

Or configure via CLI:

```bash
refboard config ai.provider openclaw
refboard config ai.endpoint http://localhost:18789
```

### Supported Providers

| Provider | Models | Features |
|----------|--------|----------|
| OpenClaw | Any (proxy) | Vision, Chat, Embedding |
| OpenAI | gpt-4o | Vision, Chat, Embedding |
| Anthropic | claude-sonnet-4 | Vision, Chat |
| MiniMax | abab6.5-chat | Vision, Chat |
| Google | gemini-pro-vision | Vision, Chat |
| Custom | Any OpenAI-compatible | Configurable |

### AI Commands

```bash
# Analyze a single image
refboard analyze photo.jpg

# Auto-tag all images in the project
refboard auto-tag --all

# Find similar images by embedding
refboard search --similar photo.jpg

# Ask a question about the board
refboard ask "What styles are most common?"
```

Environment variables are also supported: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_AI_API_KEY`, `MINIMAX_API_KEY`.

## For AI Agents

RefBoard is designed for efficient use by AI agents:

```bash
# Batch import with auto-build
refboard import ./refs --tags "reference" && refboard build

# Update metadata programmatically
refboard meta 1 --title "New Title" --artist "Artist Name"

# JSON output for parsing
refboard list --json
refboard status --json
refboard build --json

# Quiet mode — only machine output
refboard build -q

# Watch mode for continuous updates
refboard watch &
```

CLI output is minimal and parseable. Use `--json` for structured output and `-q` to suppress decorative messages. Exit codes indicate success/failure.

### Agent Interface

External agents (e.g. OpenClaw) can operate boards programmatically:

```bash
refboard agent add <image> --analyze    # Add + AI analysis
refboard agent layout --cluster-by tags # Re-layout by tags
refboard agent export --format json     # Export board data
```

## Programmatic API

```js
import { generateBoard, findImages, autoLayout, loadMetadata } from 'refboard';
import { generateDashboard, scanProjects } from 'refboard';

// Generate a board
await generateBoard({
  inputDir: './my-project',
  outputFile: './board.html',
  title: 'My Board',
  embedImages: false,
});

// Find images in a directory
const images = findImages('./my-project');

// Scan for RefBoard projects
const projects = scanProjects('~/Projects');
```

## Legacy Mode

Use without project structure:

```bash
refboard -i ./images -o board.html -t "My Board"
refboard -i ./refs --embed  # Embedded images
```

## License

MIT
