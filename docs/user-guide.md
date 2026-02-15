# RefBoard 2.0 User Guide

A native macOS desktop app for collecting, analyzing, and organizing visual references on an infinite canvas.

---

## Table of Contents

1. [Installation](#installation)
2. [Opening a Project](#opening-a-project)
3. [Creating a New Project](#creating-a-new-project)
4. [Importing Images](#importing-images)
5. [Canvas Navigation](#canvas-navigation)
6. [Selecting and Moving Cards](#selecting-and-moving-cards)
7. [Resizing Cards](#resizing-cards)
8. [Groups](#groups)
9. [Auto-Layout](#auto-layout)
10. [AI Analysis](#ai-analysis)
11. [Search](#search)
12. [Tag Filtering](#tag-filtering)
13. [Find Similar](#find-similar)
14. [Web Collection](#web-collection)
15. [Saving and Restoring](#saving-and-restoring)
16. [Exporting](#exporting)
17. [Settings](#settings)
18. [Keyboard Shortcuts](#keyboard-shortcuts)
19. [Data Storage](#data-storage)
20. [Troubleshooting](#troubleshooting)

---

## Installation

### Prerequisites

1. **Rust** -- install via [rustup.rs](https://rustup.rs/)
2. **Node.js 18+** -- install from [nodejs.org](https://nodejs.org/)
3. **Xcode Command Line Tools** -- run `xcode-select --install`

### Build and Run

```bash
cd desktop
npm install
npm run tauri dev       # Development mode (hot-reload)
npm run tauri build     # Build release .app and .dmg
```

The release build outputs to `desktop/src-tauri/target/release/bundle/`. The `.dmg` file can be distributed directly.

### System Requirements

- macOS 12.0 or later (Intel or Apple Silicon)
- 4 GB RAM minimum, 8 GB recommended for large boards
- GPU with WebGL2 support (all Macs since 2012)

---

## Opening a Project

1. Enter the full path to a folder containing images in the path field at the top of the window.
2. Click **Open**.
3. RefBoard scans the folder recursively for image files (PNG, JPEG, WebP, GIF, SVG, BMP, AVIF, TIFF) and displays them as cards on the canvas.

If a saved board state exists (from a previous session), card positions, groups, and the viewport are automatically restored.

Supported image formats: PNG, JPEG, GIF, WebP, SVG, BMP, AVIF, TIFF.

---

## Creating a New Project

Create a new project from the Home screen:

1. Click **+ New Project** (or press **Cmd+N** while on the Home screen).
2. A dialog appears with a **Project Name** field and a path preview.
3. Enter a name (e.g., "Art Deco Power").
4. The path preview updates in real time: `~/Documents/RefBoard/Art Deco Power/`.
5. Click **Create** (or press **Enter**).

RefBoard creates the project directory structure:

```
~/Documents/RefBoard/Art Deco Power/
├── refboard.json         # Project config (version, name, created)
├── metadata.json         # Image metadata
├── board.json            # Canvas state (viewport, items, groups)
├── images/               # Image files
└── thumbnails/           # Thumbnail cache
```

After creation, the app switches to the canvas view with a friendly message: **"Empty project -- drag images here or use Find Online (Cmd+Shift+F)"**.

The new project is automatically added to the Home screen's recent projects list.

For a detailed flow diagram, see [docs/create-project-flow.md](create-project-flow.md).

---

## Importing Images

### Drag and Drop

Drag image files from Finder directly onto the canvas. A drop overlay appears when files are hovering. Images are automatically:
- Copied to the project's `images/` directory
- Compressed if above 200KB (configurable via Settings)
- Placed at the drop position on the canvas
- Embedded with CLIP for similarity search

### Paste from Clipboard

Press **Cmd+V** to paste an image from the clipboard (e.g., a screenshot). The image is:
- Saved as `paste-{timestamp}.png` in the project's `images/` directory
- Compressed if applicable (preserves alpha for PNG/WebP)
- Placed at the center of the current viewport

If the CLIP model is still initializing (first launch), a "Setting up CLIP model" dialog appears briefly while the embedding is generated.

### Image Compression

Imported and pasted images are automatically compressed to save disk space:
- **Format:** WebP for images with transparency (PNG/WebP sources), JPEG for others
- **Max dimension:** 2048px (downscaled if larger, preserving aspect ratio)
- **Quality:** 82% (configurable)
- **Skip:** Files under 200KB, SVG, and GIF are never compressed
- **Safety:** Compression is only used if the result is at least 5% smaller than the original

Compression settings can be adjusted in the app (stored in localStorage).

---

## Canvas Navigation

RefBoard uses an infinite canvas similar to Figma, Miro, and PureRef.

### Pan

- Hold **Space** and drag to pan the canvas
- Or switch to the **Hand tool** (`H`) and drag directly

### Zoom

- **Scroll wheel** to zoom in and out (cursor-centered)
- **Cmd+0** to reset to 100% zoom
- The current zoom level is displayed in the bottom-right corner

### Fit to View

- **Shift+1** or click **Fit All** to zoom and pan so all images are visible
- **Shift+2** to fit the current selection

### Grid

Press **G** to toggle the background grid. The grid adapts its density to the current zoom level.

### Minimap

Press **M** to toggle the minimap in the bottom-right corner. The minimap shows all cards as colored dots and a viewport rectangle showing your current view area.

---

## Selecting and Moving Cards

### Select

- **Click** a card to select it. A blue border appears and the metadata panel opens on the right.
- **Shift+click** to add/remove cards from the selection.
- **Drag on empty canvas** to draw a selection rectangle. All cards within the rectangle are selected.
- **Shift+drag** on empty canvas to add to existing selection.
- **Escape** to deselect all.

### Move

- **Click and drag** a card to reposition it.
- If multiple cards are selected, dragging any selected card moves them all together.

### Delete

- Press **Delete** or **Backspace** to remove selected cards from the canvas.

### Duplicate

- Press **Cmd+D** to duplicate selected cards with a slight offset.

### Z-Order

- **Cmd+]** to bring selected cards forward (on top of others).
- **Cmd+[** to send selected cards backward.

---

## Resizing Cards

1. Select a single card.
2. Small square handles appear at the four corners.
3. Drag any corner handle to resize. **Aspect ratio is locked** automatically.
4. Release to confirm the new size.

---

## Groups

Group related cards together for easier organization.

### Create a Group

1. Select 2 or more cards.
2. Press **Cmd+G**.
3. A colored border and label appear around the group.

### Ungroup

1. Select any card in a group.
2. Press **Cmd+Shift+G** to dissolve the group.

Groups are saved as part of the board state and restored on project reopen.

---

## Auto-Layout

Press **Cmd+Shift+T** to tidy up cards into an even grid layout.

- If cards are selected, only the selected cards are rearranged.
- If nothing is selected, all cards are rearranged.

---

## AI Analysis

RefBoard can analyze images using AI vision models to generate:
- **Description** -- a natural language description of the image
- **Tags** -- categorization labels (e.g., "art-deco", "sculpture", "bronze")
- **Style** -- visual style keywords (e.g., "geometric", "minimalist")
- **Mood** -- emotional qualities (e.g., "elegant", "dynamic")
- **Colors** -- dominant hex colors
- **Era** -- historical period (e.g., "1920s")

### Configure a Provider

1. Click the **Settings** button (gear icon) in the toolbar.
2. Choose a provider:
   - **Claude (Anthropic)** -- cloud, default model `claude-sonnet-4-5-20250929`, requires `ANTHROPIC_API_KEY`
   - **GPT-4o (OpenAI)** -- cloud, default model `gpt-4o`, requires `OPENAI_API_KEY`
   - **Ollama (Local)** -- runs locally, default model `llava`, requires [Ollama](https://ollama.com/) running at `localhost:11434`
3. Enter your API key (for cloud providers) or verify the Ollama endpoint.
4. Optionally select a different model.
5. Click **Save**.

API keys can also be set via environment variables (`ANTHROPIC_API_KEY` or `OPENAI_API_KEY`) instead of entering them in Settings.

For detailed provider comparison and configuration, see [docs/FEATURES.md](FEATURES.md#ai-vision-providers).

### Analyze an Image

1. Select an image card on the canvas.
2. In the metadata panel on the right, click **Analyze with AI** (or press **Cmd+Shift+A**).
3. The AI processes the image and returns suggestions in the suggestion panel.
4. Review the suggested tags, description, style, and mood. You can remove tags by clicking the X, or add new ones by clicking "+ Add".
5. Click **Accept All** to apply all suggestions, or **Dismiss** to discard.

Accepted metadata is saved to the search index and becomes searchable immediately.

---

## Search

Press **Cmd+F** (or click the search bar in the toolbar) to focus the search input.

Type a query to search across image names, descriptions, tags, style, mood, and era. Results appear in a panel on the left. Click a result to navigate to that card on the canvas.

Search uses SQLite FTS5 (full-text search) with prefix matching. For example, typing "sculpt" matches "sculpture". The project is indexed automatically when opened.

Press **Escape** or clear the search field to remove the filter.

---

## Tag Filtering

1. Click the **Tags** button (hamburger icon) in the bottom of the left sidebar to open the tag panel.
2. The sidebar lists all tags in the project with their counts, sorted by frequency.
3. Click a tag to filter the canvas -- cards without that tag dim to 15% opacity.
4. Click multiple tags to narrow the filter (intersection -- cards must have ALL selected tags).
5. Click an active tag again to deselect it.
6. Click **Clear filters** at the top of the tag list to remove all filters.

---

## Find Similar

1. Select an image card on the canvas.
2. In the metadata panel, click **Find Similar**.
3. RefBoard searches the project for images with similar metadata.
4. Results appear ranked by similarity score. Click a result to navigate to it on the canvas.

Similarity is computed using:
- **Cosine similarity** on CLIP embeddings (when available)
- **Jaccard similarity** on tags + style + mood fields (fallback)

For best results, analyze images with AI first so they have rich metadata to compare.

---

## Web Collection

Search the web for reference images and download them directly into your project.

### Setup

1. Open **Settings** (gear icon).
2. Under **Web Collection**, enter your Brave Search API key.
3. Get a free key at [brave.com/search/api](https://brave.com/search/api).

### Search the Web

1. Click the **globe icon** in the left sidebar to open the Web Collection panel.
2. Type a search query and press Enter (or click **Search**).
3. Results appear as a thumbnail grid.
4. Click the **+** button on any result to download it to your project.
5. Click **Download All** to download all results at once.

Downloaded images are saved to the project's `images/` directory with deduplication.

### Find More Like

1. Select an analyzed image card (one that has been through AI analysis).
2. Click **Find Online** in the metadata panel (or press **Cmd+Shift+F**).
3. RefBoard generates search queries from the image's description, tags, style, and mood.
4. Web results appear in the collection panel.

---

## Saving and Restoring

### Auto-Save

RefBoard automatically saves the board state every 30 seconds when changes are detected. The state includes:
- Card positions and sizes
- Groups (names and members)
- Viewport position and zoom level

The state is saved to `{project}/.refboard/board.json`.

### Manual Save

Press **Cmd+S** to save immediately. A "Board saved" message appears in the status bar.

### Restore

When you reopen a project, the saved board state is automatically restored. If no saved state exists, cards are arranged in a default grid layout.

---

## Exporting

Click the **Export** button in the toolbar to export all image metadata as a JSON file.

The export includes:
- Image paths, names, file sizes
- AI analysis results (description, tags, style, mood, colors, era)
- Per-image data from the search database

The file is saved as `export.json` in the project root directory.

---

## Settings

Open Settings via the gear icon in the toolbar. Settings are organized in two sections:

### AI Provider

| Field | Description |
|-------|-------------|
| Provider | Anthropic (Claude), OpenAI (GPT-4o), or Ollama (local) |
| API Key | Your provider API key (not needed for Ollama) |
| Endpoint | Custom endpoint URL (Ollama only, default: localhost:11434) |
| Model | The specific model to use for analysis |
| Test Connection | Verify the provider is reachable |

### Web Collection

| Field | Description |
|-------|-------------|
| Brave Search API Key | Your Brave Search subscription token |

Settings are stored in `~/.refboard/config.json`.

---

## Keyboard Shortcuts

### Navigation

| Key | Action |
|-----|--------|
| `Space+drag` | Pan canvas |
| `Scroll wheel` | Zoom (cursor-centered) |
| `Shift+1` | Fit all images in view |
| `Shift+2` | Fit selection |
| `Cmd+0` | Zoom to 100% |

### Tools

| Key | Action |
|-----|--------|
| `V` | Select tool |
| `H` | Hand (pan) tool |
| `G` | Toggle grid |
| `M` | Toggle minimap |

### Edit

| Key | Action |
|-----|--------|
| `Cmd+Z` | Undo |
| `Cmd+Shift+Z` | Redo |
| `Cmd+D` | Duplicate selected |
| `Delete` / `Backspace` | Delete selected |
| `Cmd+G` | Group selected |
| `Cmd+Shift+G` | Ungroup |
| `Cmd+]` | Bring forward |
| `Cmd+[` | Send backward |
| `Cmd+Shift+T` | Tidy up (auto-layout) |

### AI & Search

| Key | Action |
|-----|--------|
| `Cmd+F` | Focus search bar |
| `Cmd+S` | Save board state |
| `Cmd+Shift+A` | Analyze selected image with AI |
| `Cmd+Shift+F` | Find more like selected online |

### General

| Key | Action |
|-----|--------|
| `Cmd+N` | New project (Home screen) |
| `Escape` | Deselect / close panel / clear filter |

---

## Data Storage

### Default Storage Location

New projects are created under `~/Documents/RefBoard/` by default.

### Project Data

Each project stores its data in the project directory and a `.refboard/` subdirectory:

```
~/Documents/RefBoard/My Project/
├── refboard.json           # Project config (version, name, created date)
├── metadata.json           # Image metadata (descriptions, tags, etc.)
├── board.json              # Canvas state (viewport, items, groups, annotations)
├── images/                 # Image files (originals + imported)
├── thumbnails/             # Generated thumbnails (WebP, 256px)
├── .refboard/
│   ├── search.db           # SQLite database (FTS5 index, metadata, CLIP embeddings)
│   └── board.json          # Saved board state (positions, groups, viewport)
├── export.json             # Metadata export (when exported)
└── ...
```

### Global Settings

```
~/.refboard/
├── config.json             # AI provider + web collection settings
└── recent.json             # Recent projects list (max 20)
```

### Database Schema

The SQLite database (`search.db`) contains:

- **`images`** table -- path, name, description, tags, style, mood, colors, era
- **`images_fts`** -- FTS5 virtual table for full-text search (synced via triggers)
- **`embeddings`** table -- CLIP embedding vectors (BLOB) for similarity search

---

## Troubleshooting

**Canvas is blank after opening a project**
- Verify the path contains image files in a supported format
- Check the developer console (`Cmd+Option+I`) for errors
- Ensure the path does not start with `~` (use the full absolute path)

**AI analysis fails**
- Confirm your API key is correct in Settings
- For Anthropic/OpenAI: check your account has available credits
- For Ollama: ensure the server is running (`ollama serve`) and a vision model is pulled (`ollama pull llava`)

**Search returns no results**
- The project is indexed when opened. If you added images after opening, re-open the project to re-index
- Analyze images with AI first to populate searchable metadata
- Check that your search terms match content in image descriptions or tags

**Web collection shows "No Brave Search API key"**
- Open Settings and add your Brave Search API key under Web Collection
- Get a free key at [brave.com/search/api](https://brave.com/search/api)

**Board layout not restored**
- The board state is only saved when changes are detected. A fresh project with no interactions has no saved state
- Check that `{project}/.refboard/board.json` exists

**App window is slow or laggy**
- Close other GPU-intensive applications
- With 500+ images, consider using tag filters to reduce visible cards
- Viewport culling automatically hides off-screen cards from rendering
