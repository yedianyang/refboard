# Figma Homepage / File Browser UX Research

> For Deco desktop app home page design reference
> 2026-02-14

---

## 1. Project Card Design

### Card Layout
- **Aspect ratio**: 16:9 thumbnail area (landscape)
- **Typical width**: 240-280px (responsive grid, auto-fill)
- **Structure**: Thumbnail (160-180px) + metadata footer (~60px)
- **Gap**: 16-24px between cards
- **Columns**: 3-5 columns depending on viewport width

### Card Content
```
+---------------------------+
|                           |
|    Canvas Preview         |  <- 16:9, 2x rendered
|    (160-180px tall)       |
|                           |
+---------------------------+
| File Name                 |  <- 13-14px, weight 500
| Edited 2h ago  by User    |  <- 12px, gray
| [avatar] [avatar] [star]  |
+---------------------------+
```

### Metadata
- **Name**: 13-14px, weight 500, single-line truncation with ellipsis
- **Time**: "Edited X hours ago" or "Jan 14", 12px, `#6B6B6B`
- **Collaborators**: 24px circular avatars, stacked with -8px overlap, max 3 + counter
- **Star/Favorite**: 16px icon, top-right absolute, yellow `#FFD700` when active

### Hover State
- Shadow: `0 4px 12px rgba(0, 0, 0, 0.15)`
- Transform: `translateY(-2px)`
- Border: subtle blue outline `#0D99FF`, 1px
- Three-dot menu appears top-right
- Transition: `all 0.2s ease`

---

## 2. New File/Project Flow

### Key Insight: Instant Creation, No Modal

1. Click "New design file" button (blue, `#0D99FF`)
2. File created **instantly** with name "Untitled"
3. Opens directly in editor
4. Name is editable inline (click to rename later)
5. Auto-saved to "Drafts" or last-used project

**No modal dialog** - creation is immediate and frictionless. This is the single most important UX decision.

### Keyboard Shortcut
- `Cmd+N` works globally to create new file

### Templates
- Accessed via dropdown next to "New file" button
- Grid of template cards (3-4 columns)
- Each shows: preview + name + author
- Click creates a copy: "{Template name} copy"

---

## 3. Recent Files List

### Default View
- Shows last 20-50 files
- Sorted by "Last opened" (default)
- Grid layout matching project cards

### Sort Options (dropdown)
- Last opened (default)
- Last modified
- Name (A-Z)
- Created (newest first)

### Time Grouping
- Today
- Yesterday
- Last 7 days
- Last 30 days
- Older

### Grid vs List Toggle
- **Grid**: Large 16:9 thumbnails, 3-5 columns
- **List**: Compact 48px rows with columns:
  - Thumbnail (48x48 square)
  - Name (left-aligned)
  - Last modified (relative time)
  - Owner (avatar + name)
  - Actions (three-dot menu)
- Toggle via icon buttons in top-right: grid (3x3) / list (horizontal lines)

---

## 4. Search & Sort

### Global Search Bar
- **Position**: Top-center of header, always visible
- **Width**: Expands to 400-600px on focus
- **Placeholder**: "Search files, projects..."
- **Keyboard**: `Cmd+/` or `Cmd+K` to focus
- **Behavior**: Real-time filtering, debounced 300ms

### Search Results
- Instant panel below search bar
- Each result: thumbnail (small) + file name + project name
- Click to open

### Filters (pill buttons below search)
- Type: Design files / FigJam / Prototypes
- Date: Anytime / Today / This week / Custom
- Owner: Anyone / Me
- Active filter = blue pill with "X" to remove

---

## 5. Navigation Structure

### Left Sidebar (240px, collapsible)
```
Recents              <- Auto-populated
Drafts               <- Auto-populated
---
Starred              <- User-curated
Deleted              <- 30-day retention
---
Your teams >
  Team 1
    Project A        <- Max depth: 2
    Project B
  Team 2
---
Community
Plugins
```

### Hierarchy
- Max 3 levels: Team > Project > Files
- Files shown in main area grid (not in sidebar)
- Breadcrumbs above grid: "Team / Project"

---

## 6. Right-Click Context Menu

### File Actions
- Open in new tab (`Cmd+Click`)
- Rename (`Enter`)
- Duplicate (`Cmd+D`)
- Move to... (project picker)
- Add to starred
- Copy link
- ---
- Delete (`Del`) — in red

### Menu Design
- Width: 200-240px
- Background: white, shadow `0 2px 8px rgba(0,0,0,0.15)`
- Border radius: 4px
- Item height: 32px
- Hover: `#F5F5F5`
- Icons: 16px, gray
- Destructive = red text, after divider

---

## 7. Empty States

### No Recent Files
```
         [folder icon 64px, gray]
         No recent files

    Files you open will appear here.

         [+ New design file]
```

### No Search Results
```
         [search icon 64px]
         No files found

    Try different keywords or check filters.

         [Clear filters]
```

Design: center-aligned, 16px heading, 13px body, primary action button.

---

## 8. Visual Design

### Colors (Dark Mode)
- Main background: `#1E1E1E`
- Sidebar: `#2C2C2C`
- Card background: `#2C2C2C`
- Hover: `#3A3A3A`
- Text primary: `#FFFFFF`
- Text secondary: `#B0B0B0`
- Text muted: `#808080`
- Accent blue: `#0D99FF`
- Border: `#3A3A3A`

### Typography
- Font: `Inter, -apple-system, sans-serif`
- Card title: 13-14px / 500
- Body: 12px / 400
- Small: 11px / 400
- Headings: 16-20px / 600

### Spacing
- Base grid: 4px (all spacing = multiples of 4)
- Card padding: 12px
- Section gaps: 16-24px
- Button height: 32px (small), 40px (medium)

### Rounded Corners
- Cards: 4-6px
- Buttons: 6px
- Modals: 8px
- Avatars: 50% (circle)

### Shadows
- Card default: `0 1px 3px rgba(0, 0, 0, 0.08)`
- Card hover: `0 4px 12px rgba(0, 0, 0, 0.15)`
- Menu: `0 2px 8px rgba(0, 0, 0, 0.15)`

---

## 9. Recommendations for Deco

### Adopt from Figma

1. **Card-first grid layout** with 16:9 thumbnails
2. **Instant project creation** — no modal, default name "Untitled", open immediately
3. **Search-first** — prominent search bar, `Cmd+K` shortcut
4. **Grid + List toggle** — default grid, list for power users
5. **Clean hover states** — shadow + translateY + border color
6. **Empty states** — centered icon + message + action button

### Simplify for Desktop

1. **No collaboration** — single-user, no avatars or share indicators
2. **No cloud sync UI** — auto-save is silent
3. **Flat hierarchy** — just Recents + All Projects (no teams/orgs)
4. **Simpler modals** — name + location picker only, no templates (v2.0)
5. **macOS-native feel**:
   - System font `-apple-system`
   - Larger corners: 8-12px (vs Figma's 4-6px)
   - Larger touch targets: 40-44px buttons
   - Native context menus via Tauri API

### Recommended Card CSS

```css
.home-project-card {
  border-radius: 12px;
  background: rgba(22, 33, 62, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(12px);
  transition: all 0.2s ease;
}
.home-project-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  border-color: rgba(74, 158, 255, 0.25);
}
.home-project-thumb {
  height: 140px;
  border-radius: 12px 12px 0 0;
  background: #0f1a30;
}
.home-project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}
```

---

## Comparison: Figma vs Deco

| Feature | Figma | Deco |
|---------|-------|----------|
| Hierarchy | Teams > Projects > Files | Recents > All Projects (flat) |
| Card size | 240x180 thumbnail | 220x140 thumbnail |
| Grid columns | 3-5 responsive | 3-4 fixed max-width |
| New file | Instant, no modal | Instant (recommended) |
| Search | Global FTS + AI | FTS5 + CLIP embeddings |
| Collaboration | Full team features | None (single-user) |
| Dark mode | Full | Full |

---

## Implementation Checklist

- [x] Card grid layout (3-4 columns)
- [x] Project cards with thumbnails
- [x] New Project dialog with name input
- [x] Hover states with shadow transitions
- [ ] Grid/list view toggle
- [ ] Search bar with FTS results
- [ ] "Last opened" timestamps on cards
- [ ] Right-click context menu (Rename, Delete, Open in Finder)
- [ ] Generate project thumbnails (first 4 images in 2x2 grid)
- [ ] Instant creation mode (no modal, create + open immediately)
