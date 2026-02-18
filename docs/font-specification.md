# Deco Typography Specification

> Established: 2026-02-17
> Status: Approved (pending implementation)

## Overview

Deco uses two font families:

- **Bungee Inline** (Google Fonts, free) for the logo / brand mark
- **SF Pro** (macOS system font) for all UI text

All font sizes are increased **+2px** from current values, aligned to macOS HIG proportions. The logo size increases +4px to better differentiate it from UI text.

---

## Font Families

| Role | Font | Source | Fallback |
|------|------|--------|----------|
| **Logo / Brand** | Bungee Inline | Google Fonts (free) | Impact, sans-serif |
| **All UI Text** | SF Pro | macOS system font | -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif |

### Font Stack (CSS)

```css
/* UI text (already in base.css) */
font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Helvetica Neue', sans-serif;

/* Logo only */
font-family: 'Bungee Inline', Impact, sans-serif;
```

---

## Type Scale (7 Levels)

| Level | Font | Current Size | New Size | Weight | Line Height | Letter Spacing | Usage Examples |
|-------|------|-------------|----------|--------|-------------|----------------|----------------|
| **Display** | Bungee Inline | 32px | **36px** | 700 (Bold) | 1.2 | -0.5px | Home page "Deco" logo |
| **Title** | SF Pro | 15-16px | **18px** | 600 (Semibold) | 1.3 | -0.3px | Dialog titles (New Project h2, Generate h3, Provider name) |
| **Heading** | SF Pro | 14px | **16px** | 500-600 | 1.3 | -0.2px | Model download title, Home empty title, Drop overlay label (20px bold) |
| **Body** | SF Pro | 13px | **15px** | 400 (Regular) | 1.4 | 0 | Base body text, nav items, project names, form inputs, action buttons, toolbar logo |
| **Label** | SF Pro | 12px | **14px** | 400-500 | 1.4 | 0 | Toolbar buttons, panel headers, context menu items, settings labels, tag items, search results |
| **Caption** | SF Pro | 11px | **13px** | 400 | 1.4 | 0 | Descriptions, counts, status bar, chip text, metadata secondary, batch progress |
| **Micro** | SF Pro | 9-10px | **12px** | 500-600 | 1.3 | 0.5-0.8px | Section labels (uppercase), keyboard shortcuts, tag counts, tooltips, result tags |

### Special Cases

| Element | New Size | Weight | Notes |
|---------|----------|--------|-------|
| Drop overlay label | 20px | 600 | Larger for visibility during drag |
| Toolbar icon buttons | 18px | -- | Icon size, not text |
| Provider header icon | 18px | 700 | Icon badge inside circle |
| Status bar | 13px | 400 | Matches Caption level |
| Zoom level display | 13px | 400 | `font-variant-numeric: tabular-nums` for alignment |
| Uppercase section headers | 12px | 600 | `letter-spacing: 0.5-0.8px; text-transform: uppercase` |

---

## CSS Variables

```css
:root {
  /* Typography scale */
  --font-display: 36px;    /* Logo */
  --font-title: 18px;      /* Dialog titles */
  --font-heading: 16px;    /* Section headings */
  --font-body: 15px;       /* Base UI text */
  --font-label: 14px;      /* Buttons, controls */
  --font-caption: 13px;    /* Secondary text */
  --font-micro: 12px;      /* Labels, shortcuts */

  /* Font families */
  --ff-ui: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Helvetica Neue', sans-serif;
  --ff-logo: 'Bungee Inline', Impact, sans-serif;

  /* Line heights */
  --lh-tight: 1.2;
  --lh-normal: 1.3;
  --lh-relaxed: 1.4;
}
```

---

## Change Map (Current → New)

| Current | New | Delta | Affected Selectors (count) |
|---------|-----|-------|---------------------------|
| 9px | 11px | +2 | 3 selectors (result-tag, web-result-domain, web-result-dims) |
| 10px | 12px | +2 | 13 selectors (section labels, shortcuts, tooltips, tag counts) |
| 11px | 13px | +2 | 18 selectors (descriptions, counts, chip text, status) |
| 12px | 14px | +2 | 28 selectors (buttons, inputs, labels, panel headers, menus) |
| 13px | 15px | +2 | 14 selectors (body base, nav items, project names, form inputs) |
| 14px | 16px | +2 | 3 selectors (model-dl-title, home-empty-title, search-clear-btn) |
| 15px | 17px | +2 | 1 selector (generate-header h3) |
| 16px | 18px | +2 | 4 selectors (dialog h2, provider name, icons) |
| 18px | 20px | +2 | 1 selector (drop-label) |
| 32px | 36px | +4 | 1 selector (home-logo, +font change to Bungee Inline) |

**Total: ~86 font-size declarations across 10 CSS files.**

---

## Affected Files

| File | Key Changes |
|------|-------------|
| `desktop/src/styles/base.css` | body font-size (13 → 15), CSS variable definitions |
| `desktop/src/styles/toolbar.css` | toolbar buttons, inputs, icon buttons, props bar |
| `desktop/src/styles/sidebar.css` | nav items, tag sidebar, section labels |
| `desktop/src/styles/canvas.css` | lightbox, statusbar, zoom, loading, hints |
| `desktop/src/styles/panels.css` | panel headers, chips, buttons, metadata, dialogs |
| `desktop/src/styles/settings.css` | settings labels, inputs, provider items |
| `desktop/src/styles/search.css` | search input, results, find bar, clusters |
| `desktop/src/styles/collection.css` | web panel header, search, result cards |
| `desktop/src/styles/home.css` | home logo (+Bungee Inline), project cards, actions |
| `desktop/src/styles/context-menu.css` | context menu, new project dialog, generate dialog |

---

## Implementation Notes

1. **Bungee Inline loading**: Add `@import url('https://fonts.googleapis.com/css2?family=Bungee+Inline&display=swap')` in `desktop/index.html` or `base.css`
2. **CSS variables first**: Define the 7-level scale as CSS variables in `base.css`, then update all selectors to reference variables
3. **Height adjustments**: Some fixed-height elements (buttons at 24px/28px, inputs at 22px/28px/32px) may need +2-4px to accommodate larger text
4. **Testing**: Check all panels at both light/dark themes, verify text doesn't overflow in constrained areas (tag items, chips, statusbar)

---

## Responsive Font Sizing

### Retina / HiDPI Handling

**No code changes needed.** macOS WKWebView (used by Tauri) handles Retina scaling natively:

- CSS `px` is already a "logical pixel" — on Retina (2x), 1 CSS px = 2 device pixels
- Text renders crisply at native resolution automatically
- PixiJS canvas already uses `resolution: window.devicePixelRatio` (see `canvas/index.js`)
- `-webkit-font-smoothing: antialiased` already set in `base.css`

No `devicePixelRatio` CSS hacks or media queries are needed for font sizing on macOS.

### Strategy: CSS Variables + `data-font-size` Attribute

Rather than converting all ~86 selectors to `rem` (massive refactor, fragile), we use the same pattern as the existing theme system (`data-theme="light"`):

```html
<html data-theme="light" data-font-size="medium">
```

This gives us:
- Explicit control over every level per preset
- Zero risk of rem cascading bugs
- Consistent with existing `data-theme` pattern
- Easy to extend with more presets later

### Three Size Presets

| Level | Compact | Default | Large |
|-------|---------|---------|-------|
| **Display** | 32px | 36px | 40px |
| **Title** | 16px | 18px | 20px |
| **Heading** | 14px | 16px | 18px |
| **Body** | 13px | 15px | 17px |
| **Label** | 12px | 14px | 16px |
| **Caption** | 11px | 13px | 14px |
| **Micro** | 10px | 12px | 13px |

**Design rationale:**
- **Compact** = current sizes (for users who prefer information density)
- **Default** = +2px from current (the new standard)
- **Large** = +4px from current (for accessibility / larger screens)

### CSS Implementation

```css
/* ---- Default (medium) — already in :root ---- */
:root {
  --font-display: 36px;
  --font-title: 18px;
  --font-heading: 16px;
  --font-body: 15px;
  --font-label: 14px;
  --font-caption: 13px;
  --font-micro: 12px;
}

/* ---- Compact ---- */
[data-font-size="compact"] {
  --font-display: 32px;
  --font-title: 16px;
  --font-heading: 14px;
  --font-body: 13px;
  --font-label: 12px;
  --font-caption: 11px;
  --font-micro: 10px;
}

/* ---- Large ---- */
[data-font-size="large"] {
  --font-display: 40px;
  --font-title: 20px;
  --font-heading: 18px;
  --font-body: 17px;
  --font-label: 16px;
  --font-caption: 14px;
  --font-micro: 13px;
}
```

### Height Adjustments per Preset

Larger text needs taller interactive elements:

```css
:root {
  --h-control: 30px;    /* buttons, inputs (was 28px) */
  --h-control-sm: 26px; /* small buttons (was 24px) */
  --h-list-item: 34px;  /* nav items, list rows (was 32px) */
  --h-statusbar: 26px;  /* status bar (was 24px) */
}

[data-font-size="compact"] {
  --h-control: 28px;
  --h-control-sm: 24px;
  --h-list-item: 32px;
  --h-statusbar: 24px;
}

[data-font-size="large"] {
  --h-control: 34px;
  --h-control-sm: 28px;
  --h-list-item: 38px;
  --h-statusbar: 28px;
}
```

### User Preference Persistence

The setting is stored in `~/.deco/config.json` via the existing `AppConfig` struct:

**Rust — add field:**
```rust
pub struct AppConfig {
    // ... existing fields ...
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_size: Option<String>,  // "compact" | "default" | "large"
}
```

**JS — apply on startup:**
```js
// In main.js init
const config = await invoke('get_app_config');
if (config.font_size && config.font_size !== 'default') {
  document.documentElement.setAttribute('data-font-size', config.font_size);
}
```

### Settings UI Placement

Add to the existing Settings panel under Appearance:

```
┌─ Settings ─────────────────────────────┐
│  AI Providers                          │
│  Appearance  <-- NEW                   │
│  ...                                   │
├────────────────────────────────────────┤
│  Theme          [Dark *] [Light]       │
│  Font Size      [Compact] [Default *] [Large] │
│  (preview text updates live)           │
└────────────────────────────────────────┘
```

Three segmented control buttons, active state highlighted. Applies immediately (no save button needed).

### Why Not rem

| Approach | Pros | Cons |
|----------|------|------|
| **CSS Variables + data attr** | Matches existing theme pattern, explicit per-level control, zero cascade risk | Need to use `var()` in all selectors |
| **rem units** | Single root change affects everything | All ~86 selectors need px-to-rem conversion, fractional values (0.8125rem), sub-pixel rounding differs across WebViews |
| **JS + devicePixelRatio** | Could match OS scaling | Unnecessary -- macOS WebView handles this natively |

---

## Implementation Order

1. Add CSS variable definitions to `base.css` `:root` (7 font vars + 3 presets)
2. Add height variables for controls
3. Update all ~86 font-size declarations to use `var(--font-*)`
4. Add `font_size` field to `AppConfig` struct (generator)
5. Add Appearance section to Settings UI with segmented control (template)
6. Wire up JS: read config on startup, apply `data-font-size`, save on change (template)
