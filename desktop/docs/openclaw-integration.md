# OpenClaw Integration with Deco

This guide explains how OpenClaw and other external tools can send images to Deco projects via the HTTP API.

## Overview

Deco runs a local HTTP API server that allows external applications to import images directly into specific project boards. This enables seamless workflows where you can discover reference images in OpenClaw and send them to any Deco project without manual file management.

The API is accessible at `http://127.0.0.1:7890` by default and only accepts connections from localhost for security.

## API Endpoints

### GET /api/status

Check if the Deco API server is running.

**Request:**
```bash
curl http://127.0.0.1:7890/api/status
```

**Response:**
```json
{
  "status": "ok",
  "version": "2.0.0",
  "port": 7890
}
```

### POST /api/import

Import an image into a Deco project board.

**Request Format:**

Multipart form data with the following fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `project_path` | string | yes | Absolute path to the target project directory |
| `file` | binary | no* | Image file upload (multipart) |
| `url` | string | no* | URL to download image from |
| `analyze` | boolean | no | If `true`, trigger AI analysis after import (default: `false`) |
| `position` | JSON | no | Canvas placement as `{"x": 100, "y": 200}` |

*Either `file` or `url` is required, but not both.

**Response:**
```json
{
  "id": "sunset.jpg",
  "filename": "sunset.jpg",
  "path": "/Users/you/Deco/art-deco/images/sunset.jpg",
  "position": {"x": 100, "y": 200},
  "analysis": null
}
```

### DELETE /api/delete

Delete an image from a Deco project board.

**Request Format:**

JSON body with the following fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectPath` | string | yes | Absolute path to the target project directory |
| `filename` | string | yes | Image filename to delete (in the project's `images/` folder) |

**Response:**
```json
{
  "status": "deleted",
  "filename": "image.jpg",
  "projectPath": "/path/to/project"
}
```

**Error Responses:**

| Status | Meaning |
|--------|---------|
| 400 | Invalid path (missing required fields or malformed request) |
| 403 | Path traversal detected (filename contains `..` or is absolute) |
| 404 | File not found in project's `images/` folder |
| 500 | Deletion failed (permissions, disk error, etc.) |

**curl example:**

```bash
curl -X DELETE http://localhost:7890/api/delete \
  -H "Content-Type: application/json" \
  -d '{"projectPath": "/Users/you/Documents/Deco/art-deco", "filename": "image.jpg"}'
```

**Frontend Events:**

This endpoint also emits an `api:image-deleted` event to the frontend for real-time canvas updates. The deleted image is immediately removed from the canvas view without requiring a page refresh.

### POST /api/move — Move Item Position

Moves an item's position on the canvas.

**Request:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectPath` | string | yes | Target project directory |
| `filename` | string | yes | Image filename |
| `x` | number | yes | New X position on canvas |
| `y` | number | yes | New Y position on canvas |

**Response:**
```json
{
  "status": "moved",
  "filename": "image.jpg",
  "x": 100.0,
  "y": 200.0
}
```

**Example:**
```bash
curl -X POST http://localhost:7890/api/move \
  -H "Content-Type: application/json" \
  -d '{"projectPath": "/path/to/project", "filename": "image.jpg", "x": 100, "y": 200}'
```

Emits `api:item-moved` event to frontend.

### PATCH /api/item — Update Item Metadata

Updates metadata fields for an image. Only provided fields are updated.

**Request:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectPath` | string | yes | Target project directory |
| `filename` | string | yes | Image filename |
| `title` | string | no | Display title |
| `description` | string | no | Description text |
| `tags` | string[] | no | Tags array |
| `styles` | string[] | no | Style descriptors |
| `moods` | string[] | no | Mood descriptors |
| `era` | string | no | Time period |
| `artist` | string | no | Artist name |

**Response:**
```json
{
  "status": "updated",
  "filename": "image.jpg",
  "metadata": { ... }
}
```

**Example:**
```bash
curl -X PATCH http://localhost:7890/api/item \
  -H "Content-Type: application/json" \
  -d '{"projectPath": "/path/to/project", "filename": "image.jpg", "tags": ["art-deco", "gold"], "description": "Art deco pattern"}'
```

Emits `api:item-updated` event to frontend.

## Targeting Different Project Boards

Each Deco project is a directory on disk containing an `images/` subdirectory and a `.deco/` metadata folder.

### Project Directory Structure

```
~/Documents/Deco/
├── art-deco/
│   ├── images/              # Images stored here
│   └── .deco/
│       ├── search.db        # FTS5 index + metadata
│       └── board.json       # Canvas state
├── cyberpunk/
│   ├── images/
│   └── .deco/
└── minimalism/
    ├── images/
    └── .deco/
```

### How to Send Images to a Specific Board

To import an image into a particular project, set the `project_path` field to that project's directory path. For example:

- To import to the `art-deco` project: `project_path=/Users/you/Documents/Deco/art-deco`
- To import to the `cyberpunk` project: `project_path=/Users/you/Documents/Deco/cyberpunk`

The image will be saved to `{project_path}/images/` and automatically added to that project's canvas.

## Usage Examples

### Upload a File to a Project

Import a local image file to the art-deco project:

```bash
curl -X POST http://127.0.0.1:7890/api/import \
  -F "project_path=/Users/you/Documents/Deco/art-deco" \
  -F "file=@/path/to/image.jpg"
```

### Import from URL

Download an image from a URL and add it to the cyberpunk project:

```bash
curl -X POST http://127.0.0.1:7890/api/import \
  -F "project_path=/Users/you/Documents/Deco/cyberpunk" \
  -F "url=https://example.com/reference/building.jpg"
```

### Import with Specific Canvas Position

Add an image to a particular location on the canvas:

```bash
curl -X POST http://127.0.0.1:7890/api/import \
  -F "project_path=/Users/you/Documents/Deco/art-deco" \
  -F "file=@image.jpg" \
  -F 'position={"x": 500, "y": 300}'
```

### Import with AI Analysis

Upload an image and automatically trigger AI vision analysis to generate tags and descriptions:

```bash
curl -X POST http://127.0.0.1:7890/api/import \
  -F "project_path=/Users/you/Documents/Deco/art-deco" \
  -F "file=@image.jpg" \
  -F "analyze=true"
```

### Combine Options

Download from URL, place at coordinates, and analyze:

```bash
curl -X POST http://127.0.0.1:7890/api/import \
  -F "project_path=/Users/you/Documents/Deco/art-deco" \
  -F "url=https://example.com/ref.png" \
  -F 'position={"x": 200, "y": 150}' \
  -F "analyze=true"
```

## Configuration

### API Port

By default, the API runs on port `7890`. To use a different port, edit `~/.deco/config.json`:

```json
{
  "apiPort": 8080,
  "anthropicKey": "sk-ant-...",
  "braveSearchKey": "BSA..."
}
```

After changing the port, restart Deco for the change to take effect.

### Security

The HTTP API only binds to `127.0.0.1` (localhost) and does not accept remote connections. If you need to send images from another machine, you can:

1. Use SSH tunneling: `ssh user@machine -L 7890:127.0.0.1:7890`
2. Share the project directory via network mount and access it locally

## OpenClaw Workflow

Here's a typical workflow for using Deco with OpenClaw:

1. **Browse and Discover**: Open OpenClaw and browse for reference images from various sources (web, design libraries, etc.)

2. **Select Target Board**: When you find a reference image you want to save, choose which Deco project it belongs to from a dropdown or button menu

3. **Send to Deco**: OpenClaw calls the `/api/import` endpoint with:
   - `project_path` set to the chosen project directory
   - `url` or `file` with the image source
   - Optionally `analyze=true` to auto-tag the image

4. **View in Deco**: The image appears on the canvas in real-time:
   - If you specified `position`, it's placed at those coordinates
   - If `analyze=true`, Deco's AI generates tags, color palette, and style classification
   - The image is indexed in the FTS5 search database

5. **Organize**: Use Deco's tools to:
   - Group related images
   - Filter by AI-generated tags
   - Search across all imported images
   - Export metadata with AI analysis

## Integration Tips

### Discovering Project Paths

If you're building a tool like OpenClaw that needs to let users select projects, you can:

1. Read the `~/.deco/recent.json` file to list recently opened projects
2. Let users browse `~/Documents/Deco/` (common default location)
3. Allow manual path entry with validation via `GET /api/status`

### Error Handling

The API returns standard HTTP status codes:

| Status | Meaning |
|--------|---------|
| 200 | Success |
| 400 | Invalid request (missing field, invalid JSON, file too large) |
| 500 | Server error (project path invalid, disk full, etc.) |

Error responses include a JSON body with details:

```json
{
  "error": "Missing required field: project_path"
}
```

### Large File Handling

The HTTP server can handle large images (tested up to several hundred MB), but Deco's UI may perform better with images under 10 MB per image. For batch imports of many large files, consider:

1. Compressing images before uploading
2. Importing sequentially rather than in parallel
3. Using lower resolution versions for web-sourced images

### Async Analysis

When `analyze=true`, the AI analysis runs asynchronously. The import response returns immediately with `"analysis": null`. The frontend is notified via Tauri events when analysis completes, so the UI updates without requiring polling.

If you need to wait for analysis results, you can:
1. Poll the project's search database via the SQLite file
2. Connect to Deco's Tauri event stream (if building a native app)
3. Check the board state JSON after a brief delay

## Supported Image Formats

The following image formats are supported:

- PNG (`.png`)
- JPEG (`.jpg`, `.jpeg`)
- GIF (`.gif`)
- WebP (`.webp`)
- SVG (`.svg`)
- BMP (`.bmp`)
- AVIF (`.avif`)
- TIFF (`.tiff`)

For URL downloads, the format is determined from:
1. The `Content-Type` header
2. The file extension in the URL path
3. Default to JPEG if detection fails

For file uploads, the format is determined from:
1. The filename extension
2. The `Content-Type` header
3. Default to PNG if detection fails

## Troubleshooting

**"Cannot connect to http://127.0.0.1:7890"**
- Deco is not running. Start the desktop app first.
- Check if the port is in use: `lsof -i :7890`
- Verify the port setting in `~/.deco/config.json`

**"Missing required field: project_path"**
- Ensure the `project_path` field is included in the multipart request
- The path must be an absolute path (not relative)

**"Import failed: No such file or directory"**
- The `project_path` does not exist
- The project directory must have been created in Deco at least once
- Check that the path is correct and you have read/write permissions

**"Download failed: HTTP 404"**
- The URL is invalid or the resource no longer exists
- Verify the URL is publicly accessible

**AI analysis not triggered**
- Verify `analyze=true` was included in the request
- Check that an AI provider is configured in Deco Settings
- Review the Deco logs for API errors

## API Rate Limits

The HTTP API does not implement rate limiting, but it's designed for integration with other tools on the same machine. For batch operations:

- Process imports sequentially for stability
- Allow a brief delay between requests (e.g., 100ms)
- Monitor disk space for large image collections

## See Also

- [Deco User Guide](../docs/user-guide.md)
- [Deco API Reference](../docs/api.md)
- [Deco Configuration](../README.md#configuration)
