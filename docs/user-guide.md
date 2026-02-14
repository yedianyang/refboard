# RefBoard 2.0 User Guide

A native macOS desktop app for collecting, analyzing, and organizing visual references on an infinite canvas.

---

## Installation

RefBoard 2.0 is built from source using Tauri 2.0.

### Prerequisites

1. **Rust** -- install via [rustup](https://rustup.rs/)
2. **Node.js 18+** -- install from [nodejs.org](https://nodejs.org/)
3. **Xcode Command Line Tools** -- `xcode-select --install`
4. **Tauri system dependencies** -- see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for macOS

### Build and Run

```bash
cd desktop
npm install
npm run tauri dev       # Development mode (hot-reload)
npm run tauri build     # Build release .app and .dmg
```

The release build outputs to `desktop/src-tauri/target/release/bundle/`.

---

## Opening a Project

1. Enter the full path to a folder containing images in the path field at the top of the window.
2. Click **Open**.
3. RefBoard scans the folder for image files (PNG, JPEG, WebP, GIF, SVG, BMP, AVIF, TIFF) and displays them as cards on the canvas.

The project path is shown in the toolbar. Image metadata is stored alongside your images in a `.refboard/` subdirectory.

---

## Canvas Navigation

RefBoard uses an infinite canvas similar to Figma, Miro, and PureRef.

### Pan

Hold **Space** and drag the mouse to pan the canvas.

### Zoom

Scroll the mouse wheel to zoom in and out. Zoom is centered on the cursor position. The current zoom level is displayed in the toolbar.

### Fit All

Press **Shift+1** or click the **Fit** button in the toolbar to zoom and pan so all images are visible.

### Select

Click a card to select it. The selected card is highlighted and its metadata panel opens on the right.

### Drag

Click and drag a card to reposition it on the canvas.

---

## AI Analysis

RefBoard can analyze images using AI vision models to generate descriptions, tags, style labels, mood, dominant colors, and era.

### Configure a Provider

1. Click the **Settings** button (gear icon) in the toolbar.
2. Choose a provider:
   - **Claude (Anthropic)** -- requires an Anthropic API key
   - **GPT-4o (OpenAI)** -- requires an OpenAI API key
   - **Ollama (Local)** -- requires a running Ollama instance with a vision model (e.g., `llava`)
3. Enter your API key (for cloud providers) or verify the Ollama endpoint.
4. Select a model from the dropdown.
5. Click **Save**.

### Analyze an Image

1. Select an image card on the canvas.
2. In the metadata panel on the right, click **Analyze with AI**.
3. The AI processes the image and returns suggestions in the suggestion panel.
4. Review the suggested tags, description, style, and mood.
5. Click **Accept** to apply all suggestions, or edit individual fields before accepting. Click **Reject** to discard.

Accepted tags and metadata are saved to the project and indexed for search.

---

## Search

Press **Cmd+F** (or click the search bar) to focus the search input.

Type a query to search across image titles, descriptions, tags, artists, and all metadata fields. Results appear in a panel below the search bar. Click a result to navigate to that card on the canvas.

Search is powered by SQLite FTS5 (full-text search) and is indexed automatically when you open a project.

Clear the search field or press **Escape** to remove the search filter.

---

## Tag Filtering

1. Click the **tag sidebar** toggle in the toolbar to open the tag panel on the left.
2. The sidebar lists all tags in the project with their counts.
3. Click a tag to filter the canvas -- only cards with that tag remain fully visible; other cards dim.
4. Click multiple tags to narrow the filter further.
5. Click an active tag again to remove it from the filter.
6. Click **Clear** in the active filter bar at the bottom to remove all tag filters.
7. Press **Escape** to close the tag sidebar.

---

## Find Similar

1. Select an image card on the canvas.
2. In the metadata panel, click **Find Similar**.
3. RefBoard searches the project for images with similar tags and embeddings.
4. Results appear ranked by similarity score. Click a result to navigate to it on the canvas.

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space+drag` | Pan canvas |
| `Scroll wheel` | Zoom (cursor-centered) |
| `Shift+1` | Fit all images in view |
| `Cmd+F` | Focus search bar |
| `Escape` | Close panel, sidebar, or clear filter |
| `Delete` | Remove selected card |
| Click card | Select and open metadata panel |

---

## Data Storage

Each project stores its data in a `.refboard/` subdirectory inside the project folder:

```
your-project/
├── images/                 # Your image files
├── .refboard/
│   └── search.db           # SQLite database (FTS5 index, metadata, embeddings)
└── ...
```

Global settings (AI provider configuration) are stored in `~/.refboard/config.json`.

---

## Troubleshooting

**Canvas is blank after opening a project** -- Verify the path contains image files. Check the developer console (Cmd+Option+I) for errors.

**AI analysis fails** -- Confirm your API key is correct in Settings. For Ollama, ensure the server is running (`ollama serve`) and a vision model is pulled (`ollama pull llava`).

**Search returns no results** -- The project is indexed when opened. If you added images after opening, re-open the project to re-index.
