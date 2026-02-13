# RefBoard

Visual reference board generator for artists and designers. Create beautiful, portable mood boards from your image collection.

## Features

- **Simple CLI** — `init`, `add`, `build` workflow
- **Portable output** — Single HTML file, no server needed
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
npx refboard init my-project
```

## Quick Start

```bash
# Create a new project
refboard init my-references

# Add images
cd my-references
refboard add ~/Downloads/sculpture.jpg --title "Bronze Figure" --artist "Unknown"
refboard add ~/Downloads/building.jpg --tags "architecture,art-deco"

# Edit metadata.json to add descriptions, context, etc.

# Build the board
refboard build

# Open board.html in your browser
```

## Commands

### `refboard init [directory]`

Initialize a new project with the standard structure:

```
my-project/
  refboard.json     # Project configuration
  metadata.json     # Image metadata
  images/           # Image files
```

### `refboard add <image> [options]`

Add an image to the project.

Options:
- `--title "Title"` — Set artwork title
- `--artist "Name"` — Set artist name
- `--tags "tag1,tag2"` — Add tags (comma-separated)

### `refboard build [options]`

Generate the HTML reference board.

Options:
- `-o, --output <file>` — Output file (default: board.html)
- `-e, --embed` — Embed images as base64 (larger file, fully portable)

## Project Configuration

### refboard.json

```json
{
  "name": "art-deco-references",
  "title": "Art Deco Sculpture References",
  "description": "Visual references for 3D metal sculpture",
  "output": "board.html"
}
```

### metadata.json

```json
{
  "board": {
    "title": "Art Deco Sculpture References",
    "description": "1920-1950s aesthetic, heroism, machine age"
  },
  "items": [
    {
      "file": "chiparus-dancer.jpg",
      "title": "Dancer with Thyrsus",
      "artist": "Demetre Chiparus",
      "year": "1925",
      "description": "Chryselephantine sculpture combining bronze and ivory",
      "context": "Part of the Art Deco movement's fascination with exotic dancers",
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
| `context` | Historical context (collapsible in UI) |
| `influences` | Artistic influences (collapsible in UI) |
| `tags` | Array of tags for filtering |

## Legacy Mode

You can also use RefBoard without a project structure:

```bash
# Point to any folder with images
refboard -i ./my-images -o board.html

# With custom title
refboard -i ./refs -t "My Mood Board" -o output.html

# Embedded images
refboard -i ./project --embed
```

## Use Cases

- **Concept art** — Collect visual references for character/environment design
- **3D modeling** — Gather material and form references
- **Interior design** — Create mood boards for client presentations
- **Research** — Document artistic movements with context
- **Collaboration** — Share curated references with your team

## Tips

1. **Use descriptive filenames** — RefBoard shows filenames when titles aren't set
2. **Add context** — The collapsible "Historical Context" and "Influences" fields are great for research boards
3. **Tag consistently** — Use lowercase, hyphenated tags for easy filtering
4. **Embed for sharing** — Use `--embed` when sharing the board (all images included in HTML)

## License

MIT

## Author

Jingxi Guo (@yedianyang)
