# RefBoard 2.0 API Reference

This document covers the Rust backend IPC commands and Tauri events used by the RefBoard 2.0 desktop app.

All commands are invoked from the frontend via `invoke()` from `@tauri-apps/api/core`.

---

## Table of Contents

1. [Core Commands](#core-commands) -- File scanning, metadata, project management
2. [AI Commands](#ai-commands) -- Image analysis, provider configuration
3. [Search Commands](#search-commands) -- Full-text search, tags, similarity
4. [Web Commands](#web-commands) -- Web search, image download, config
5. [Board State Commands](#board-state-commands) -- Save, load, export
6. [Events](#events) -- Tauri IPC events emitted by the backend
7. [Data Types](#data-types) -- Shared TypeScript/JSON types

---

## Core Commands

### `scan_images`

Recursively scan a directory for image files.

```js
const images = await invoke('scan_images', { dirPath: '/path/to/project' });
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `dirPath` | `string` | Absolute path to directory to scan |

**Returns:** `ImageInfo[]`

**Supported formats:** PNG, JPG, JPEG, GIF, WebP, SVG, BMP, AVIF, TIFF

Skips hidden directories (prefixed with `.`).

---

### `read_metadata`

Read project metadata from `metadata.json`.

```js
const meta = await invoke('read_metadata', { projectPath: '/path/to/project' });
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `projectPath` | `string` | Absolute path to project directory |

**Returns:** `ProjectMetadata`

**Errors:** If `metadata.json` does not exist or is invalid JSON.

---

### `write_metadata`

Write project metadata to `metadata.json`.

```js
await invoke('write_metadata', {
  projectPath: '/path/to/project',
  metadata: { name: 'My Project', path: '/path/to/project', tags: ['art'] }
});
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `projectPath` | `string` | Absolute path to project directory |
| `metadata` | `ProjectMetadata` | Metadata object to write |

**Returns:** `void`

---

### `create_project`

Create a new project with directory structure.

```js
const info = await invoke('create_project', { name: 'My Project', path: '/path/to/new' });
```

Creates: `images/`, `thumbnails/`, `refboard.json`, `metadata.json`, `board.json`. Adds to recent projects list.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` | Project name |
| `path` | `string` | Absolute path for the project directory |

**Returns:** `ProjectInfo`

---

### `list_projects`

List recent projects from `~/.refboard/recent.json`.

```js
const projects = await invoke('list_projects');
```

**Returns:** `ProjectInfo[]` -- Only projects whose directories still exist on disk.

---

## AI Commands

Source: `desktop/src-tauri/src/ai.rs`

### `analyze_image`

Analyze an image using the configured AI vision provider.

```js
const result = await invoke('analyze_image', {
  imagePath: '/path/to/image.jpg',
  providerConfig: { provider: 'anthropic', apiKey: 'sk-ant-...', model: 'claude-sonnet-4-5-20250929' },
  existingTags: ['art-deco', 'sculpture']
});
```

The AI returns a structured analysis with description, tags, style, mood, colors, and era. Existing tags are provided as context for consistent tagging across the project.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `imagePath` | `string` | Absolute path to the image file |
| `providerConfig` | `AiProviderConfig` | Provider settings |
| `existingTags` | `string[]` | Tags already used in the project (for consistency) |

**Returns:** `AnalysisResult`

**Events emitted:**
- `ai:analysis:start` -- payload: image path (string)
- `ai:analysis:complete` -- payload: image path (string)
- `ai:analysis:error` -- payload: error message (string)

---

### `get_ai_config`

Get the current AI provider configuration.

```js
const config = await invoke('get_ai_config');
```

**Returns:** `AiProviderConfig`

Reads from `~/.refboard/config.json`.

---

### `set_ai_config`

Save AI provider configuration.

```js
await invoke('set_ai_config', {
  config: {
    provider: 'anthropic',
    apiKey: 'sk-ant-...',
    endpoint: 'https://api.anthropic.com/v1',
    model: 'claude-sonnet-4-5-20250929'
  }
});
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `config` | `AiProviderConfig` | Provider configuration |

**Returns:** `void`

---

### `check_ollama`

Check if Ollama is available at localhost:11434.

```js
const available = await invoke('check_ollama');
```

**Returns:** `boolean`

---

## Search Commands

Source: `desktop/src-tauri/src/search.rs`

Per-project SQLite database stored at `{project}/.refboard/search.db`.

### `cmd_index_project`

Index all images in a project directory for search. Scans for image files and inserts basic metadata (path, name). Does not overwrite existing metadata -- AI-generated fields are preserved.

```js
const indexedCount = await invoke('cmd_index_project', { projectPath: '/path/to/project' });
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `projectPath` | `string` | Absolute path to project directory |

**Returns:** `number` -- Count of newly indexed images (existing entries are skipped).

---

### `cmd_search_text`

Full-text search across all metadata fields using FTS5.

```js
const results = await invoke('cmd_search_text', {
  projectPath: '/path/to/project',
  query: 'bronze sculpture',
  limit: 50
});
```

Supports FTS5 syntax: simple words, `"quoted phrases"`, `AND`, `OR`, `NOT`. Words are automatically prefix-matched (e.g., "sculpt" matches "sculpture").

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `projectPath` | `string` | Project path |
| `query` | `string` | Search query |
| `limit` | `number?` | Max results (default: 50) |

**Returns:** `SearchResult[]` -- Ranked by BM25 relevance score.

---

### `cmd_get_all_tags`

Get all unique tags across all images in a project, with counts.

```js
const tags = await invoke('cmd_get_all_tags', { projectPath: '/path/to/project' });
// [{ tag: "art-deco", count: 12 }, { tag: "sculpture", count: 8 }, ...]
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `projectPath` | `string` | Project path |

**Returns:** `TagCount[]` -- Sorted by count (descending), then alphabetically.

---

### `cmd_filter_by_tag`

Get image paths that have a specific tag.

```js
const paths = await invoke('cmd_filter_by_tag', {
  projectPath: '/path/to/project',
  tag: 'art-deco'
});
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `projectPath` | `string` | Project path |
| `tag` | `string` | Tag to filter by (case-insensitive) |

**Returns:** `string[]` -- Array of matching image paths.

---

### `cmd_find_similar`

Find images similar to a given image. Uses CLIP embedding cosine similarity if available, falls back to tag-based Jaccard similarity.

```js
const similar = await invoke('cmd_find_similar', {
  projectPath: '/path/to/project',
  imagePath: '/path/to/project/images/photo.jpg',
  limit: 10
});
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `projectPath` | `string` | Project path |
| `imagePath` | `string` | Path of the query image |
| `limit` | `number?` | Max results (default: 10) |

**Returns:** `SearchResult[]` -- Sorted by similarity score (highest first).

---

### `cmd_update_search_metadata`

Update metadata for a single image in the search index. Called after AI analysis or manual edits.

```js
await invoke('cmd_update_search_metadata', {
  projectPath: '/path/to/project',
  metadata: {
    imagePath: '/path/to/image.jpg',
    name: 'image.jpg',
    description: 'A bronze art-deco dancer sculpture',
    tags: ['art-deco', 'sculpture', 'bronze'],
    style: ['geometric'],
    mood: ['elegant'],
    colors: ['#D4AF37'],
    era: '1920s'
  }
});
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `projectPath` | `string` | Project path |
| `metadata` | `ImageMetadataRow` | Image metadata to upsert |

**Returns:** `void`

---

## Web Commands

Source: `desktop/src-tauri/src/web.rs`

### `cmd_web_search`

Search for images on the web using Brave Search API.

```js
const results = await invoke('cmd_web_search', {
  query: 'art deco sculpture bronze',
  refinement: 'high resolution'  // optional
});
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `query` | `string` | Search query |
| `refinement` | `string?` | Optional refinement appended to query |

**Returns:** `WebSearchResult[]`

**Events emitted:**
- `web:search:start` -- payload: full query (string)
- `web:search:complete` -- payload: result count (number)

**Errors:** If no Brave API key is configured.

---

### `cmd_find_more_like`

Generate AI-powered search queries from an image's analysis, then search the web.

```js
const results = await invoke('cmd_find_more_like', {
  imagePath: '/path/to/image.jpg',
  refinement: 'more colorful'  // optional
});
```

Reads the image's metadata from the search database, generates up to 3 search queries from description/tags/style/mood/era, and merges deduplicated results.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `imagePath` | `string` | Path of the source image |
| `refinement` | `string?` | Optional refinement text |

**Returns:** `WebSearchResult[]`

**Errors:** If the image has no analysis data.

---

### `cmd_download_web_image`

Download an image from the web and save it to the project.

```js
const result = await invoke('cmd_download_web_image', {
  imageUrl: 'https://example.com/photo.jpg',
  projectPath: '/path/to/project',
  sourceUrl: 'https://example.com/gallery'
});
```

Images are saved to `{project}/images/`. Filenames are extracted from the URL and deduplicated with timestamps if needed.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `imageUrl` | `string` | Direct URL to the image file |
| `projectPath` | `string` | Project directory path |
| `sourceUrl` | `string` | Original web page URL (for attribution) |

**Returns:** `DownloadResult`

**Events emitted:**
- `web:download:start` -- payload: image URL (string)
- `web:download:complete` -- payload: local file path (string)

---

### `cmd_get_web_config`

Get web collection configuration.

```js
const config = await invoke('cmd_get_web_config');
```

**Returns:** `WebCollectionConfig`

---

### `cmd_set_web_config`

Save web collection configuration.

```js
await invoke('cmd_set_web_config', {
  config: { braveApiKey: 'BSA...', safeSearch: 'moderate', resultsCount: 20 }
});
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `config` | `WebCollectionConfig` | Configuration object |

**Returns:** `void`

---

## Board State Commands

Source: `desktop/src-tauri/src/lib.rs`

### `save_board_state`

Save board state (card positions, groups, viewport) to `.refboard/board.json`.

```js
await invoke('save_board_state', {
  projectPath: '/path/to/project',
  state: {
    version: 2,
    viewport: { x: 0, y: 0, zoom: 1.0 },
    items: [
      { path: '/path/to/image.jpg', name: 'image.jpg', x: 100, y: 200, width: 232, height: 180 }
    ],
    groups: [
      { name: 'Group 1', cardPaths: ['/path/to/a.jpg', '/path/to/b.jpg'] }
    ]
  }
});
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `projectPath` | `string` | Project directory path |
| `state` | `object` | Board state JSON (see schema below) |

**Returns:** `void`

---

### `load_board_state`

Load saved board state from `.refboard/board.json`.

```js
const state = await invoke('load_board_state', { projectPath: '/path/to/project' });
if (state) {
  // Restore positions, groups, viewport
}
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `projectPath` | `string` | Project directory path |

**Returns:** `object | null` -- The saved board state, or `null` if no saved state exists.

---

### `export_metadata`

Export all image metadata as a JSON file, merging file info with search database metadata.

```js
const count = await invoke('export_metadata', {
  projectPath: '/path/to/project',
  outputPath: '/path/to/project/export.json'
});
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `projectPath` | `string` | Project directory path |
| `outputPath` | `string` | Absolute path for the output JSON file |

**Returns:** `number` -- Count of exported images.

---

## Events

Tauri events emitted by the Rust backend. Listen with `listen()` from `@tauri-apps/api/event`.

```js
import { listen } from '@tauri-apps/api/event';

await listen('ai:analysis:start', (event) => {
  console.log('Analyzing:', event.payload);
});
```

### AI Events

| Event | Payload | Description |
|-------|---------|-------------|
| `ai:analysis:start` | `string` (image path) | Analysis started for an image |
| `ai:analysis:complete` | `string` (image path) | Analysis completed successfully |
| `ai:analysis:error` | `string` (error message) | Analysis failed |

### Web Events

| Event | Payload | Description |
|-------|---------|-------------|
| `web:search:start` | `string` (query) | Web search started |
| `web:search:complete` | `number` (count) | Web search completed with N results |
| `web:search:error` | `string` (error message) | Search query failed |
| `web:download:start` | `string` (image URL) | Image download started |
| `web:download:complete` | `string` (local path) | Image downloaded and saved |

---

## Data Types

### ImageInfo

```typescript
interface ImageInfo {
  name: string;        // Filename (e.g., "photo.jpg")
  path: string;        // Absolute file path
  sizeBytes: number;   // File size in bytes
  extension: string;   // Lowercase extension (e.g., "jpg")
}
```

### ProjectMetadata

```typescript
interface ProjectMetadata {
  name: string;
  path: string;
  description?: string;
  tags: string[];
  imageCount: number;
  createdAt?: string;
  updatedAt?: string;
}
```

### ProjectInfo

```typescript
interface ProjectInfo {
  name: string;
  path: string;
  imageCount: number;
}
```

### AiProviderConfig

```typescript
interface AiProviderConfig {
  provider: 'anthropic' | 'openai' | 'ollama';
  apiKey?: string;
  endpoint?: string;    // Custom endpoint URL
  model?: string;       // Model identifier
}
```

### AnalysisResult

```typescript
interface AnalysisResult {
  description: string;
  tags: string[];
  style: string[];
  mood: string[];
  colors: string[];     // Hex color strings (e.g., "#D4AF37")
  era?: string;
}
```

### SearchResult

```typescript
interface SearchResult {
  imagePath: string;
  name: string;
  score: number;         // Relevance score (higher = better match)
  description?: string;
  tags: string[];
}
```

### TagCount

```typescript
interface TagCount {
  tag: string;
  count: number;
}
```

### ImageMetadataRow

```typescript
interface ImageMetadataRow {
  imagePath: string;
  name: string;
  description?: string;
  tags: string[];
  style: string[];
  mood: string[];
  colors: string[];
  era?: string;
}
```

### WebSearchResult

```typescript
interface WebSearchResult {
  title: string;
  sourceUrl: string;      // Original web page URL
  imageUrl: string;       // Direct image URL
  thumbnailUrl: string;   // Thumbnail URL
  sourceDomain: string;   // Domain name (e.g., "example.com")
  width?: number;
  height?: number;
}
```

### DownloadResult

```typescript
interface DownloadResult {
  localPath: string;      // Saved file path
  name: string;           // Filename
  sizeBytes: number;
  sourceUrl: string;      // Original web page URL
}
```

### WebCollectionConfig

```typescript
interface WebCollectionConfig {
  braveApiKey?: string;
  safeSearch: string;     // "off" | "moderate" | "strict" (default: "moderate")
  resultsCount: number;   // Max results per search (default: 20)
}
```

### Board State

```typescript
interface BoardState {
  version: 2;
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
  items: Array<{
    path: string;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  groups: Array<{
    name: string;
    cardPaths: string[];
  }>;
}
```

---

## Frontend Modules

The frontend is organized as ES modules imported by `main.js`:

| Module | File | Exports |
|--------|------|---------|
| Canvas | `src/canvas.js` | `initCanvas`, `loadProject`, `fitAll`, `setUIElements`, `onCardSelect`, `applyFilter`, `scrollToCard`, `getSelection`, `getAllCards`, `tidyUp`, `getBoardState`, `restoreBoardState`, `startAutoSave`, `getViewport`, `getCardCount`, `getApp` |
| Panels | `src/panels.js` | `initPanels`, `showMetadata`, `showSuggestions`, `closePanel`, `openSettings`, `closeSettings`, `analyzeCard` |
| Search | `src/search.js` | `initSearch`, `setProject`, `updateSearchMetadata`, `findSimilar`, `showTagSidebar`, `getActiveFilters`, `getAllTags`, `getSearchResults` |
| Collection | `src/collection.js` | `initCollection`, `setCollectionProject`, `findMoreLike`, `toggleWebPanel`, `loadWebConfig`, `saveWebConfig` |
