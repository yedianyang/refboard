# Apple macOS Design Resources — Comprehensive Report

> Date: 2026-02-15
> Researcher: Deco Research Agent
> Source: https://developer.apple.com/design/resources/#macos-apps

---

## 1. Summary

Apple provides extensive design resources for macOS app development: Figma/Sketch UI kits, SF Symbols (6,900+ icons), SF Pro font family, Icon Composer for Liquid Glass icons, and comprehensive Human Interface Guidelines. For Deco (a document-based canvas app), the most relevant resources are the **macOS 26 Figma UI Kit**, **SF Symbols 7**, **SF Pro font**, and the HIG sections on **toolbars**, **sidebars**, and **windows**. Apple's latest design language, **Liquid Glass** (WWDC 2025), introduces translucent materials with dynamic light refraction — relevant for Deco's sidebar and toolbar styling.

---

## 2. Available Design Resources

### 2.1 macOS UI Kits

| Resource | Formats | Description |
|----------|---------|-------------|
| **macOS 26 UI Kit** | Figma, Sketch | Latest Liquid Glass design system components |
| **macOS Sequoia UI Kit** | Sketch (RSS), Figma | Pre-Liquid Glass macOS components |
| **macOS Sequoia Templates** | Sketch | App icon templates and production assets |
| **macOS Production Templates** | Sketch, Photoshop | Print/marketing-ready assets |

**Download:** https://developer.apple.com/design/resources/#macos-apps

### 2.2 Fonts

| Font | Usage | Notes |
|------|-------|-------|
| **SF Pro** | System font for macOS, iOS, iPadOS, tvOS | Primary for all UI text |
| **SF Mono** | Code, terminal, monospace | Used in Xcode |
| **SF Compact** | watchOS | Condensed variant |
| **New York** | Serif, reading contexts | Editorial/body text |
| **SF Arabic/Armenian/Georgian/Hebrew** | Localization | Multilingual support |

**CSS usage for Deco (web-rendered in Tauri WebView):**
```css
font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', 'Helvetica Neue', sans-serif;
```

### 2.3 SF Symbols

| Version | Symbols | Requirement |
|---------|---------|-------------|
| **SF Symbols 7** | 6,900+ | macOS Sonoma or later |
| **SF Symbols 6** | 6,000+ | macOS Ventura or later |

**Features:**
- 9 weights (Ultralight → Black)
- 3 scales (Small, Medium, Large)
- 4 rendering modes: Monochrome, Hierarchical, Palette, Multicolor
- Draw animations, variable rendering, gradients
- Automatic scale selection in toolbars

**Categories relevant to Deco:**
- Editing: crop, rotate, slider, paintbrush
- Media: photo, rectangle.stack, square.grid.2x2
- Objects: folder, doc, tray
- Navigation: sidebar.left, sidebar.right, arrow.up.arrow.down
- General: magnifyingglass, gearshape, plus, trash, square.and.arrow.up

### 2.4 Tools

| Tool | Purpose | Requirement |
|------|---------|-------------|
| **SF Symbols app** | Browse, search, export symbols | macOS Sonoma+ |
| **Icon Composer** | Create layered Liquid Glass icons | macOS Sequoia+ |
| **Parallax Previewer** | Preview layered images for tvOS | macOS 13.5+ |

### 2.5 Product Bezels

Marketing assets for all Apple devices including iMac, MacBook Air M3, MacBook Pro M4. Available in Sketch, Photoshop, and PNG formats. Useful for Deco screenshots and marketing materials.

---

## 3. macOS HIG — Core Design Principles

### 3.1 Foundational Principles

| Principle | Description | Deco Application |
|-----------|-------------|---------------------|
| **Clarity** | Every element serves a purpose; avoid unnecessary complexity | Clean toolbar with only essential tools |
| **Deference** | UI helps users focus on content, minimize chrome | Canvas takes maximum space; panels collapse |
| **Depth** | Visual layers convey hierarchy via motion and materials | Sidebar floats over canvas; modals have backdrop |
| **Consistency** | Follow standard patterns users already know | Use standard macOS toolbar layout, shortcuts |
| **Direct Manipulation** | Enable gestures — drag, pinch, swipe | Native for canvas: drag cards, pinch zoom |
| **Feedback** | Respond to every action with animation or state change | Hover states, selection highlight, save confirmation |
| **Minimalism** | Content-first; reduce visual clutter with whitespace | Reference images are the focus, not UI |

### 3.2 Liquid Glass (WWDC 2025 / macOS 26 Tahoe)

Apple's new unified design language replaces the frosted glass / vibrancy system:

**Material Properties:**
- Translucent material that reflects and refracts surroundings
- Real-time rendering with specular highlights
- Dynamic light bending ("Lensing") — transparent, lightweight appearance
- Color informed by surrounding content — adapts between light/dark
- Light from content spills onto surface (ambient reflection)
- Light reflects, scatters, and bleeds into shadows

**macOS Specific:**
- Sidebars, menus, and Dock use Liquid Glass
- "Subtle floating layers" for panels
- Completely transparent menu bar
- Adaptive tinting from content beneath

**For Tauri WebView (Deco):**
- Use `backdrop-filter: blur()` + semi-transparent backgrounds to approximate
- CSS: `-webkit-backdrop-filter: blur(20px); background: rgba(30,30,30,0.7);`
- Respect `prefers-reduced-transparency` media query
- Cannot achieve true Liquid Glass in WebView — approximate the aesthetic

**Accessibility Requirements:**
- Respect "Reduce Transparency" system toggle → provide opaque fallback
- Respect "Increase Contrast" toggle → sharper borders, higher contrast
- Respect "Reduce Motion" → disable animations
- Maintain WCAG text legibility over translucent surfaces

---

## 4. Standard UI Patterns for Document-Based Apps

### 4.1 Window Architecture

Deco is a **document-based canvas app** (like Figma, Sketch, Photoshop). The standard macOS pattern:

```
┌──────────────────────────────────────────────────┐
│  ● ● ●  │ Sidebar Toggle │  Document Title  │ ⚙ │  ← Title Bar / Toolbar (combined)
├──────────┼───────────────────────────────────┼────┤
│          │                                   │    │
│ Sidebar  │        Main Content Area          │ In │
│ (Source  │        (Canvas / Editor)           │ sp │
│  List)   │                                   │ ec │
│          │                                   │ tor│
│ 200-     │                                   │    │
│ 300px    │                                   │    │
├──────────┼───────────────────────────────────┼────┤
│ Bottom   │              Status Bar           │    │
│ Bar      │                                   │    │
└──────────┴───────────────────────────────────┴────┘
```

**Window Types:**
- **Document window** — one per open project/file (Deco: one per board)
- **Panel / Inspector** — floating or attached auxiliary window
- **Sheet** — modal attached to parent window (for save dialogs, settings)
- **Popover** — contextual UI anchored to a control

### 4.2 Toolbar Conventions

**Anatomy (left → right):**

| Section | Content | Behavior |
|---------|---------|----------|
| **Leading** | Traffic lights (●●●), Sidebar toggle | Anchored, never moves |
| **Leading+** | Document title, document menu | After sidebar toggle |
| **Center** | Frequently used tools | User-customizable; collapses to overflow |
| **Trailing** | Search, Share, Inspector toggle | Anchored, never moves |
| **Overflow** | Hidden items when window shrinks | System-managed "..." menu |

**Toolbar Styles:**

| Style | Height | Use Case | Deco Recommendation |
|-------|--------|----------|------------------------|
| **Unified** | ~52pt | Standard apps | Default for Deco |
| **Unified Compact** | ~38pt | Compact UI | Good for maximizing canvas |
| **Expanded** | ~72pt | Document apps with prominent toolbar | If adding drawing tools |
| **Preference** | Varies | Settings windows | For Deco Settings |

**Best Practices:**
- Most-used items toward the left
- Group related items logically
- Inspector toggle must be the **rightmost** item
- Share button next to inspector toggle
- Search field in trailing section
- Use `NSTrackingSeparatorToolbarItem` for column dividers
- Bottom bar for secondary sidebar actions (add/remove/info)

**Deco Toolbar Recommendation:**
```
│ ●●● │ ☰ │ "Art Deco Power" ▾ │  [V] [H] [T] [R] [O] │  🔍  ⚙  ◧ │
│      │ Sidebar│  Doc Title     │  Select Hand Text     │ Search  Inspector
│      │ Toggle │  + Doc Menu    │  Rect Oval (tools)    │ Settings Toggle
```

### 4.3 Sidebar Conventions

**Usage:**
- Sidebars are for **navigation** and **object selection**
- Typically used in "shoebox" apps (Photos, Music) — less common in document-based apps
- Deco use: project file list, layer list, tag filters

**Specifications:**

| Property | Value | Notes |
|----------|-------|-------|
| Default width | 200px | Sensible minimum |
| Max width | ~300px | Don't let it grow too wide |
| Min width | 150px | Usable minimum |
| Resize | User-draggable splitter | Remember width in preferences |
| Hierarchy | Max 2 levels | Avoid deep nesting |
| Actions | Bottom bar, not toolbar | Prevents overflow issues |

**Visual Styling (macOS Tahoe/Liquid Glass):**
- Translucent glass background
- Icon tint: black (light mode) / white (dark mode)
- Avoid accent-colored icons on glass backgrounds
- Section headers to group logical categories
- Enable `allowsExpansionToolTips` for truncated text
- Add search bar if many items

**Bottom Bar (below sidebar):**

| Size | Height | Button Size | Edge Spacing | Button Gap |
|------|--------|-------------|-------------|------------|
| Large | 32pt | 31×18pt | 8pt | 1pt |
| Small | 22pt | 25×14pt | 6pt | 1pt |

### 4.4 Inspector Panel

The trailing panel for viewing/editing properties of the selected item:

- **Toggle:** Rightmost toolbar button
- **Width:** 200-260px typical
- **Content:** Properties, metadata, attributes of selected object
- **Behavior:** Push content inward (don't overlay)

**For Deco:** Image info panel (filename, dimensions, tags, AI description, similar images button).

---

## 5. Layout Specifications

### 5.1 Spacing System

| Context | Measurement | Notes |
|---------|-------------|-------|
| Window edge margin | 20pt | Left, right, bottom |
| Top spacing (from toolbar) | 14pt | Controls not in group box |
| Group box internal margin | 16pt | All edges |
| Tab view internal margin | 16pt | All edges |
| Control-to-control (stacked) | 6pt minimum | Vertical spacing |
| Above/below separator | 12pt | Additional to base spacing |
| Between groups (whitespace) | 12-24pt | Visual breathing room |
| Label-to-control gap | 6pt | After colon |
| Description below control | 4pt | Explanatory text |

### 5.2 Control Sizes

| Size | Usage | Margins |
|------|-------|---------|
| **Regular** | Default for all UI | 20pt edges |
| **Small** | Space-constrained areas, sidebars | 10pt edges |
| **Mini** | Palettes, inspectors, dense UI | 10pt top/sides, 14pt bottom |

### 5.3 Typography Scale (SF Pro)

| Role | Size | Weight | Usage |
|------|------|--------|-------|
| Large Title | 26pt | Bold | Window/section headers |
| Title 1 | 22pt | Regular | Major sections |
| Title 2 | 17pt | Regular | Subsections |
| Title 3 | 15pt | Regular | Group headers |
| Headline | 13pt | Bold | Sidebar section titles |
| Body | 13pt | Regular | Default content text |
| Callout | 12pt | Regular | Secondary info |
| Subheadline | 11pt | Regular | Metadata, timestamps |
| Footnote | 10pt | Regular | Fine print, status bar |
| Caption 1 | 10pt | Regular | Labels, counts |
| Caption 2 | 10pt | Medium | Emphasized captions |

---

## 6. Interaction Standards

### 6.1 Keyboard Navigation

| Shortcut | Action | Standard |
|----------|--------|----------|
| Tab / Shift+Tab | Move focus between controls | Required |
| Space | Activate focused button | Required |
| Return | Confirm / default action | Required |
| Escape | Cancel / dismiss | Required |
| Cmd+W | Close window | Standard |
| Cmd+Q | Quit app | Standard |
| Cmd+, | Open Preferences | Standard |
| Cmd+Z / Cmd+Shift+Z | Undo / Redo | Standard |
| Cmd+S | Save | Standard |
| Cmd+F | Find | Standard |

**Focus Ring:**
- Blue ring around focused element (system default)
- 3pt outside the control bounds
- Respects "Increase Contrast" system setting

### 6.2 Mouse & Trackpad

| Gesture | Action | Notes |
|---------|--------|-------|
| Click | Select / activate | Primary action |
| Double-click | Open / edit | Standard for document items |
| Right-click | Context menu | Required for all interactive elements |
| Scroll (2 finger) | Scroll content | Vertical and horizontal |
| Pinch | Zoom | Canvas zoom for Deco |
| Drag | Move / rearrange | With visual feedback |
| Option+drag | Duplicate | Standard macOS pattern |
| Cmd+drag | Multi-select or special drag | App-specific |

### 6.3 Accessibility Requirements

| Requirement | Implementation |
|-------------|---------------|
| **VoiceOver** | All controls labeled; images have alt text |
| **Keyboard Full Access** | Every function reachable via keyboard |
| **Dynamic Type** | Respect system font size preferences |
| **Reduce Transparency** | Provide opaque sidebar/toolbar fallback |
| **Increase Contrast** | Sharper borders, higher contrast colors |
| **Reduce Motion** | Disable non-essential animations |
| **Color Contrast** | 4.5:1 minimum for normal text (WCAG AA) |
| **Focus Indicators** | Visible focus ring on all interactive elements |

---

## 7. Recommendations for Deco

### 7.1 Immediate Actions

1. **Download macOS 26 Figma UI Kit** — Use as reference for all UI components
2. **Install SF Symbols 7** — Browse and select icons for toolbar, sidebar, context menus
3. **Download SF Pro font** — Ensure correct typography rendering in Tauri WebView

### 7.2 UI Architecture (following macOS conventions)

```
Deco Window Layout:
┌─────────────────────────────────────────────────────┐
│ ●●● ☰  "Project Name" ▾  [V][H][T][R]  🔍 ⚙ ◧   │ Unified toolbar (~52pt)
├────────┬────────────────────────────────────┬───────┤
│        │                                    │       │
│ Layer  │      PixiJS Canvas                 │ Info  │
│ List   │      (Infinite canvas)             │ Panel │
│        │                                    │       │
│ Tags   │      Reference images              │ Props │
│        │      Text annotations              │       │
│ Files  │      Shape tools                   │ Tags  │
│        │                                    │       │
│ 200px  │                                    │ 240px │
├────────┼────────────────────────────────────┼───────┤
│ + - ⓘ │           2 of 48 selected         │       │
└────────┴────────────────────────────────────┴───────┘
  Bottom     Status bar
  bar (32pt)
```

### 7.3 Toolbar Items (Unified style)

| Position | Items | SF Symbol |
|----------|-------|-----------|
| Leading | Sidebar toggle | `sidebar.left` |
| Leading+ | Document title + menu | — |
| Center | Select (V), Hand (H), Text (T), Rect (R), Oval (O) | `arrow.up.left`, `hand.raised`, `textformat`, `rectangle`, `circle` |
| Trailing | Search | `magnifyingglass` |
| Trailing | Settings | `gearshape` |
| Trailing | Inspector toggle | `sidebar.right` |

### 7.4 Color Tokens (Dark Mode)

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-window` | `#1e1e1e` | Window background |
| `--bg-sidebar` | `rgba(30,30,30,0.85)` | Sidebar with blur |
| `--bg-toolbar` | `rgba(40,40,40,0.9)` | Toolbar area |
| `--bg-canvas` | `#121212` | Canvas background |
| `--text-primary` | `#e5e5e5` | Primary text |
| `--text-secondary` | `#8e8e93` | Secondary / labels |
| `--accent` | `#007AFF` | System blue (or app accent) |
| `--border` | `rgba(255,255,255,0.1)` | Subtle dividers |
| `--focus-ring` | `#007AFF` + 3pt offset | Keyboard focus |

### 7.5 CSS Approximation of Liquid Glass

```css
/* Sidebar */
.sidebar {
  background: rgba(30, 30, 30, 0.7);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  backdrop-filter: blur(20px) saturate(180%);
  border-right: 1px solid rgba(255, 255, 255, 0.08);
}

/* Toolbar */
.toolbar {
  background: rgba(40, 40, 40, 0.85);
  -webkit-backdrop-filter: blur(16px) saturate(150%);
  backdrop-filter: blur(16px) saturate(150%);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

/* Reduced transparency fallback */
@media (prefers-reduced-transparency: reduce) {
  .sidebar { background: #2d2d2d; backdrop-filter: none; }
  .toolbar { background: #323232; backdrop-filter: none; }
}

/* Respect reduced motion */
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0s !important; transition-duration: 0.1s !important; }
}
```

---

## 8. Resource Download Links

| Resource | URL |
|----------|-----|
| macOS Design Resources | https://developer.apple.com/design/resources/#macos-apps |
| Human Interface Guidelines | https://developer.apple.com/design/human-interface-guidelines/ |
| SF Symbols 7 Download | https://developer.apple.com/sf-symbols/ |
| SF Pro Font Download | https://developer.apple.com/fonts/ |
| Icon Composer | https://developer.apple.com/design/resources/ |
| macOS 26 Figma Kit | https://developer.apple.com/design/resources/#macos-apps |
| Toolbar Guidelines (HIG) | https://developer.apple.com/design/human-interface-guidelines/toolbars |
| Sidebar Guidelines (HIG) | https://developer.apple.com/design/human-interface-guidelines/sidebars |
| Window Guidelines (HIG) | https://developer.apple.com/design/human-interface-guidelines/windows |
| Accessibility Guidelines | https://developer.apple.com/design/human-interface-guidelines/accessibility |
| Designing for macOS | https://developer.apple.com/design/human-interface-guidelines/designing-for-macos |
| WWDC25: Meet Liquid Glass | https://developer.apple.com/videos/play/wwdc2025/219/ |
| WWDC25: New Design System | https://developer.apple.com/videos/play/wwdc2025/356/ |
| Mario Guzman's Mac Design | https://marioaguzman.github.io/design/ |

---

## 9. References

- [Apple Design Resources](https://developer.apple.com/design/resources/#macos-apps)
- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)
- [SF Symbols](https://developer.apple.com/sf-symbols/)
- [Apple Liquid Glass Announcement](https://www.apple.com/newsroom/2025/06/apple-introduces-a-delightful-and-elegant-new-software-design/)
- [Liquid Glass Explained](https://www.freecomputertricks.in/2025/09/liquid-glass-apples-new-design-language.html)
- [Mario Guzman — Toolbar Guidelines](https://marioaguzman.github.io/design/toolbarguidelines/)
- [Mario Guzman — Sidebar Guidelines](https://marioaguzman.github.io/design/sidebarguidelines/)
- [Mario Guzman — Layout Guidelines](https://marioaguzman.github.io/design/layoutguidelines/)
- [Apple HIG Design System Overview](https://designsystems.surf/design-systems/apple)
- [Insights from Apple HIG](https://innoplixit.com/blogs/2025/03/22/insights-from-apples-human-interface-design-guidelines/)
