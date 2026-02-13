# RefBoard

Visual reference board generator for artists and designers. Create beautiful, portable mood boards from your image collection.

![RefBoard Screenshot](examples/screenshot.png)

## Features

- **Simple** — Point to a folder, get an HTML mood board
- **Portable** — Single HTML file, no server needed
- **Rich metadata** — Artist info, historical context, tags
- **Filterable** — Filter references by tags
- **Lightbox** — Click to view full-size images
- **Embed mode** — Base64 images for fully self-contained boards

## Installation

```bash
npm install -g refboard
```

Or use directly with npx:

```bash
npx refboard -i ./my-refs -o board.html
```

## Quick Start

1. Create a folder with your reference images:

```
my-project/
  images/
    image1.jpg
    image2.png
  metadata.json
```

2. Generate the board:

```bash
refboard -i ./my-project -o mood-board.html
```

3. Open `mood-board.html` in your browser

## Metadata Format

Create a `metadata.json` in your input folder:

```json
{
  "board": {
    "title": "Art Deco Sculpture References",
    "description": "Visual references for 3D metal printed sculpture, 1920-1950s aesthetic"
  },
  "items": [
    {
      "file": "chiparus-dancer.jpg",
      "title": "Dancer with Thyrsus",
      "artist": "Demetre Chiparus",
      "year": "1925",
      "description": "Chryselephantine sculpture combining bronze and ivory",
      "context": "Part of the Art Deco movement's fascination with exotic dancers and theatrical performers",
      "influences": "Ballet Russes, Egyptian revival, Cubism",
      "tags": ["art-deco", "sculpture", "bronze", "1920s"]
    }
  ]
}
```

### Metadata Fields

| Field | Description |
|-------|-------------|
| `file` | Image filename (must match exactly) |
| `title` | Artwork title |
| `artist` | Artist/creator name |
| `year` | Year of creation |
| `description` | Brief description |
| `context` | Historical context (collapsible) |
| `influences` | Artistic influences (collapsible) |
| `tags` | Array of tags for filtering |

## CLI Options

```
Usage:
  refboard [options]

Options:
  -i, --input <dir>    Input directory (default: .)
  -o, --output <file>  Output HTML file (default: board.html)
  -t, --title <title>  Board title (default: "Reference Board")
  -e, --embed          Embed images as base64
  -h, --help           Show help
```

## Directory Structure

RefBoard looks for images in these locations (in order):
- `<input>/images/`
- `<input>/raw/`
- `<input>/` (root)

## Examples

**Basic usage:**
```bash
refboard -i ./references
```

**With custom title:**
```bash
refboard -i ./art-deco -t "Art Deco Mood Board" -o art-deco.html
```

**Embedded images (fully portable):**
```bash
refboard -i ./project --embed -o portable-board.html
```

## Use Cases

- **Concept art** — Collect visual references for character/environment design
- **3D modeling** — Gather material and form references
- **Interior design** — Create mood boards for client presentations
- **Research** — Document artistic movements with context
- **Collaboration** — Share curated references with your team

## License

MIT

## Author

Jingxi Guo (@yedianyang)
