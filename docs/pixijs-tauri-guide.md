# PixiJS 8 + Tauri 2.0 Integration Guide

A practical, code-heavy reference for building Deco 2.0's infinite canvas. Covers PixiJS 8 API, Tauri integration, pan/zoom/drag interactions, and performance patterns for 500+ image boards.

---

## Table of Contents

1. [PixiJS 8 Application Setup](#1-pixijs-8-application-setup)
2. [Scene Graph: Containers & Sprites](#2-scene-graph-containers--sprites)
3. [Loading Images via Tauri Asset Protocol](#3-loading-images-via-tauri-asset-protocol)
4. [Graphics API (Cards, Regions, Annotations)](#4-graphics-api-cards-regions-annotations)
5. [Text Rendering](#5-text-rendering)
6. [Event System & Interaction](#6-event-system--interaction)
7. [Infinite Canvas: Pan, Zoom, Viewport](#7-infinite-canvas-pan-zoom-viewport)
8. [Drag & Drop Image Cards](#8-drag--drop-image-cards)
9. [Selection System](#9-selection-system)
10. [Performance: 500+ Images](#10-performance-500-images)
11. [Tauri IPC Integration Patterns](#11-tauri-ipc-integration-patterns)
12. [Full Working Example](#12-full-working-example)

---

## 1. PixiJS 8 Application Setup

PixiJS 8 requires **async initialization** — the constructor no longer accepts options.

### Install

```bash
npm install pixi.js
```

### Basic Setup

```javascript
import { Application } from 'pixi.js';

const app = new Application();

await app.init({
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: 0x1a1a2e,    // Dark theme background
  antialias: true,
  resolution: window.devicePixelRatio || 1,
  autoDensity: true,             // CSS pixel scaling for Retina
  resizeTo: window,              // Auto-resize with window
  preference: 'webgl',           // Use 'webgpu' for WebGPU (experimental)
  powerPreference: 'high-performance',
});

document.body.appendChild(app.canvas);
```

### Key Properties

```javascript
app.stage      // Root Container — add all display objects here
app.canvas     // The <canvas> HTMLElement
app.renderer   // The WebGL/WebGPU renderer instance
app.ticker     // The render loop (requestAnimationFrame manager)
app.screen     // { x, y, width, height } of the renderer
```

### Resize Handling

```javascript
// Option A: resizeTo (set in init)
// Automatically resizes renderer when window resizes.

// Option B: Manual resize
window.addEventListener('resize', () => {
  app.renderer.resize(window.innerWidth, window.innerHeight);
});
```

### Render Loop

```javascript
// PixiJS auto-renders via app.ticker. Add per-frame logic:
app.ticker.add((ticker) => {
  // ticker.deltaTime = frames elapsed since last tick (usually ~1)
  // ticker.elapsedMS = milliseconds since last tick
  updateViewport();
});
```

> **v7 → v8 breaking change**: `new Application({ width, height })` no longer works. You must use `await app.init({ ... })`.

---

## 2. Scene Graph: Containers & Sprites

### Container Hierarchy

```javascript
import { Container, Sprite, Assets } from 'pixi.js';

// Create the world container (holds all canvas content)
const world = new Container();
app.stage.addChild(world);

// Create a card container for one image
const card = new Container();
card.position.set(100, 200);
world.addChild(card);

// Add a sprite to the card
const texture = await Assets.load('asset://localhost/path/to/image.jpg');
const sprite = new Sprite(texture);
sprite.width = 200;
sprite.height = 150;
card.addChild(sprite);
```

### Sprite Creation Patterns

```javascript
import { Sprite, Assets, Texture } from 'pixi.js';

// Pattern 1: Load + create (most common for Deco)
const texture = await Assets.load(imageUrl);
const sprite = new Sprite(texture);

// Pattern 2: Options object
const sprite = new Sprite({
  texture: await Assets.load(imageUrl),
  anchor: { x: 0, y: 0 },      // Top-left origin
  position: { x: 100, y: 200 },
  width: 200,                     // Scales to fit
  height: 150,
});

// Pattern 3: From an already-cached texture (after Assets.load)
const sprite = Sprite.from('image-key');
```

### Key Sprite Properties

```javascript
sprite.texture      // The Texture instance
sprite.anchor       // Origin point (0,0 = top-left, 0.5,0.5 = center)
sprite.position     // { x, y } in parent coordinates
sprite.scale        // { x, y } multiplier (1 = original size)
sprite.width        // Shorthand: sets scale.x based on texture width
sprite.height       // Shorthand: sets scale.y based on texture height
sprite.alpha        // Opacity (0 = invisible, 1 = opaque)
sprite.tint         // Color multiply (0xffffff = no tint)
sprite.visible      // Show/hide
sprite.zIndex       // Layer ordering (needs parent.sortableChildren = true)
```

### Container Properties

```javascript
container.children          // Array of child display objects
container.sortableChildren  // Enable zIndex sorting (default: false)
container.interactiveChildren // Enable hit-testing children (default: true)

// Render Groups (v8 feature) — GPU-accelerated transforms
container.isRenderGroup = true;
// Or:
const gpuContainer = new Container({ isRenderGroup: true });
```

### Maintaining Aspect Ratio

```javascript
// Scale sprite to fit within a max width/height box while keeping aspect ratio
function fitSprite(sprite, maxWidth, maxHeight) {
  const tex = sprite.texture;
  const aspect = tex.width / tex.height;

  if (aspect > maxWidth / maxHeight) {
    // Width-constrained
    sprite.width = maxWidth;
    sprite.height = maxWidth / aspect;
  } else {
    // Height-constrained
    sprite.height = maxHeight;
    sprite.width = maxHeight * aspect;
  }
}
```

> **v7 → v8 breaking change**: `Texture.from('url')` no longer loads from URLs. Use `Assets.load('url')` instead. `Texture.from()` now only works with already-loaded resources or source objects.

---

## 3. Loading Images via Tauri Asset Protocol

In Tauri, the WebView cannot access `file://` URLs directly. Use the **asset protocol** to serve local files.

### Setup (tauri.conf.json)

```json
{
  "app": {
    "security": {
      "csp": "default-src 'self' 'unsafe-inline'; img-src 'self' asset: http://asset.localhost; connect-src 'self' asset: http://asset.localhost",
      "assetProtocol": {
        "enable": true,
        "scope": ["$HOME/**/*", "$DOCUMENT/**/*", "$PICTURE/**/*"]
      }
    }
  }
}
```

> **Important**: Include both `asset:` and `http://asset.localhost` in the CSP. Different platforms use different URL schemes internally. The `connect-src` directive is needed for PixiJS `Assets.load()` which uses `fetch()`.

### Convert File Paths → Asset URLs

```javascript
import { convertFileSrc } from '@tauri-apps/api/core';

// Convert a local path to a WebView-loadable URL
const localPath = '/Users/me/projects/art-deco/reference.jpg';
const assetUrl = convertFileSrc(localPath);
// → "asset://localhost/Users/me/projects/art-deco/reference.jpg"
```

### Load into PixiJS

```javascript
import { Assets } from 'pixi.js';
import { convertFileSrc } from '@tauri-apps/api/core';

async function loadImageTexture(filePath) {
  const url = convertFileSrc(filePath);
  const texture = await Assets.load(url);
  return texture;
}

// Usage:
const texture = await loadImageTexture('/Users/me/image.jpg');
const sprite = new Sprite(texture);
```

### Batch Loading with Progress

```javascript
import { Assets } from 'pixi.js';
import { convertFileSrc } from '@tauri-apps/api/core';

async function loadImageBatch(filePaths, onProgress) {
  // Register all assets with the resolver
  const assetMap = {};
  for (const fp of filePaths) {
    const key = fp;  // Use file path as the cache key
    const url = convertFileSrc(fp);
    Assets.add({ alias: key, src: url });
    assetMap[key] = url;
  }

  // Load as a bundle with progress callback
  const keys = Object.keys(assetMap);
  const textures = await Assets.load(keys, (progress) => {
    onProgress?.(progress);  // 0.0 → 1.0
  });

  return textures;  // { '/path/to/a.jpg': Texture, '/path/to/b.png': Texture, ... }
}
```

### Background Loading (Non-blocking)

```javascript
// Start loading in background — useful for lazy loading off-screen images
Assets.backgroundLoad([convertFileSrc('/path/to/image1.jpg')]);
Assets.backgroundLoad([convertFileSrc('/path/to/image2.jpg')]);

// Later, when needed, the texture is already cached:
const texture = await Assets.load(convertFileSrc('/path/to/image1.jpg'));
// Returns instantly if already loaded in background
```

---

## 4. Graphics API (Cards, Regions, Annotations)

PixiJS 8 uses a new chainable Graphics API.

### Card Background with Rounded Corners

```javascript
import { Graphics } from 'pixi.js';

function createCardBackground(width, height, options = {}) {
  const {
    fillColor = 0x2a2a3e,
    borderColor = 0x4a4a6a,
    borderWidth = 1,
    cornerRadius = 8,
    fillAlpha = 1,
  } = options;

  const bg = new Graphics()
    .roundRect(0, 0, width, height, cornerRadius)
    .fill({ color: fillColor, alpha: fillAlpha })
    .stroke({ color: borderColor, width: borderWidth });

  return bg;
}
```

### Selection Highlight

```javascript
function createSelectionBorder(width, height) {
  const border = new Graphics()
    .roundRect(-2, -2, width + 4, height + 4, 10)
    .stroke({ color: 0x4a9eff, width: 2 });
  return border;
}
```

### Group Region (Named Area)

```javascript
function createGroupRegion(x, y, width, height, color = 0xf5c518) {
  const region = new Graphics()
    .roundRect(0, 0, width, height, 12)
    .fill({ color, alpha: 0.08 })
    .stroke({ color, width: 2, alpha: 0.4 });

  region.position.set(x, y);
  return region;
}
```

### Arrow / Connector

```javascript
function createArrow(fromX, fromY, toX, toY, color = 0x888888) {
  const arrow = new Graphics()
    .moveTo(fromX, fromY)
    .lineTo(toX, toY)
    .stroke({ color, width: 2 });

  // Arrowhead
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const headLen = 12;
  arrow
    .moveTo(toX, toY)
    .lineTo(
      toX - headLen * Math.cos(angle - Math.PI / 6),
      toY - headLen * Math.sin(angle - Math.PI / 6)
    )
    .moveTo(toX, toY)
    .lineTo(
      toX - headLen * Math.cos(angle + Math.PI / 6),
      toY - headLen * Math.sin(angle + Math.PI / 6)
    )
    .stroke({ color, width: 2 });

  return arrow;
}
```

### Grid Background

```javascript
function createGridGraphics(viewWidth, viewHeight, gridSize = 50, color = 0x333344) {
  const grid = new Graphics();

  for (let x = 0; x <= viewWidth; x += gridSize) {
    grid.moveTo(x, 0).lineTo(x, viewHeight);
  }
  for (let y = 0; y <= viewHeight; y += gridSize) {
    grid.moveTo(0, y).lineTo(viewWidth, y);
  }
  grid.stroke({ color, width: 0.5, alpha: 0.3 });

  return grid;
}
```

> **v7 → v8 breaking change**: `beginFill()` / `endFill()` / `lineStyle()` are gone. Use `.rect().fill().stroke()` chaining instead.

---

## 5. Text Rendering

### Basic Text (Canvas-rasterized)

```javascript
import { Text, TextStyle } from 'pixi.js';

const style = new TextStyle({
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontSize: 14,
  fill: '#e0e0e0',
  wordWrap: true,
  wordWrapWidth: 180,
});

const label = new Text({ text: 'Art Deco Dancer', style });
label.position.set(8, 210);
```

### BitmapText (GPU-rasterized, better for many labels)

```javascript
import { BitmapText } from 'pixi.js';

// Dynamic font generation (no font file needed)
const label = new BitmapText({
  text: 'art-deco',
  style: {
    fontFamily: 'Arial',
    fontSize: 12,
    fill: '#aaaaaa',
  },
});
```

### Tag Pill

```javascript
function createTagPill(text, color = 0x4a4a6a) {
  const container = new Container();

  const label = new BitmapText({
    text,
    style: { fontFamily: 'Arial', fontSize: 11, fill: '#cccccc' },
  });

  const padding = 6;
  const bg = new Graphics()
    .roundRect(0, 0, label.width + padding * 2, label.height + padding * 2, 4)
    .fill({ color, alpha: 0.6 });

  label.position.set(padding, padding);
  container.addChild(bg, label);
  return container;
}
```

> **Performance tip**: Use `BitmapText` for labels that change frequently or exist in large numbers (e.g., tag pills on 500 cards). Regular `Text` re-rasterizes the entire canvas texture on every change.

---

## 6. Event System & Interaction

### Event Modes

```javascript
// Set on any Container or Sprite to enable events:
sprite.eventMode = 'static';    // Standard — receives pointer events
sprite.eventMode = 'dynamic';   // Like static + fires events when object moves under cursor
sprite.eventMode = 'passive';   // Does not receive events, but children can
sprite.eventMode = 'none';      // No events at all (best performance)
sprite.eventMode = 'auto';      // Inherits from parent
```

### Pointer Events

```javascript
sprite.eventMode = 'static';
sprite.cursor = 'pointer';

sprite.on('pointerdown', (e) => {
  console.log('Pressed at', e.global.x, e.global.y);
  console.log('Local coords:', e.getLocalPosition(sprite));
});

sprite.on('pointerup', (e) => { /* released */ });
sprite.on('pointermove', (e) => { /* moved over sprite */ });
sprite.on('pointerover', (e) => { /* entered sprite bounds */ });
sprite.on('pointerout', (e) => { /* left sprite bounds */ });

// Global move (fires even when not over a specific object)
app.stage.on('globalpointermove', (e) => {
  // e.global.x, e.global.y — screen coordinates
});
```

### Hit Area Optimization

```javascript
import { Rectangle } from 'pixi.js';

// Override bounds-based hit testing with a simpler shape
sprite.hitArea = new Rectangle(0, 0, 200, 150);

// Skip hit-testing children (when only the container itself is interactive)
container.interactiveChildren = false;
```

### Right-Click / Context Menu

```javascript
sprite.eventMode = 'static';
sprite.on('rightclick', (e) => {
  e.preventDefault();
  showContextMenu(e.global.x, e.global.y, cardData);
});

// Prevent browser default context menu on the canvas
app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
```

> **v7 → v8 breaking change**: `interactive = true` is replaced by `eventMode = 'static'`. The `pointermove` event now only fires when over the object; use `globalpointermove` for canvas-wide tracking.

---

## 7. Infinite Canvas: Pan, Zoom, Viewport

Two approaches: **pixi-viewport** (recommended for quick setup) or **custom implementation** (full control).

### Approach A: pixi-viewport (Recommended)

```bash
npm install pixi-viewport
```

```javascript
import { Viewport } from 'pixi-viewport';

const viewport = new Viewport({
  screenWidth: window.innerWidth,
  screenHeight: window.innerHeight,
  worldWidth: 10000,
  worldHeight: 10000,
  events: app.renderer.events,  // Required for PixiJS 8
});

app.stage.addChild(viewport);

// Enable interaction plugins
viewport
  .drag({ mouseButtons: 'left' })      // Left-click drag to pan
  .pinch()                               // Pinch-to-zoom (trackpad/touch)
  .wheel({ smooth: 3 })                 // Scroll wheel zoom
  .decelerate({ friction: 0.93 });       // Inertial scrolling after release

// Set zoom limits
viewport.clampZoom({
  minScale: 0.05,    // 5% zoom
  maxScale: 8.0,     // 800% zoom
});

// Add content to the viewport (not app.stage)
viewport.addChild(myImageCard);

// Navigate programmatically
viewport.moveCenter(500, 300);                    // Center on point
viewport.animate({ position: { x: 500, y: 300 }, scale: 1 }); // Smooth animate
viewport.fitWorld();                               // Fit all content

// Listen for viewport changes
viewport.on('moved', () => {
  updateMinimap(viewport);
  cullOffscreenCards(viewport);
});
viewport.on('zoomed', () => {
  updateZoomIndicator(viewport.scale.x);
});

// Resize handling
window.addEventListener('resize', () => {
  viewport.resize(window.innerWidth, window.innerHeight);
});
```

### Approach B: Custom Pan/Zoom (Full Control)

For Deco, a custom implementation gives better control over interaction modes (select vs. pan) and integration with the card drag system.

```javascript
import { Container } from 'pixi.js';

// World container — all canvas content lives here
const world = new Container({ isRenderGroup: true });
app.stage.addChild(world);

// Viewport state
const viewport = {
  x: 0,
  y: 0,
  scale: 1,
  minScale: 0.05,
  maxScale: 8.0,
  isPanning: false,
  lastPointer: { x: 0, y: 0 },
};

// Apply viewport transform to world container
function applyViewport() {
  world.scale.set(viewport.scale);
  world.position.set(viewport.x, viewport.y);
}

// ---- PAN (Space+drag or middle mouse) ----

let spaceDown = false;
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !e.repeat) {
    spaceDown = true;
    app.canvas.style.cursor = 'grab';
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') {
    spaceDown = false;
    app.canvas.style.cursor = 'default';
  }
});

app.canvas.addEventListener('pointerdown', (e) => {
  if (spaceDown || e.button === 1) {  // Space+click or middle mouse
    viewport.isPanning = true;
    viewport.lastPointer = { x: e.clientX, y: e.clientY };
    app.canvas.style.cursor = 'grabbing';
    e.preventDefault();
  }
});

window.addEventListener('pointermove', (e) => {
  if (!viewport.isPanning) return;
  const dx = e.clientX - viewport.lastPointer.x;
  const dy = e.clientY - viewport.lastPointer.y;
  viewport.x += dx;
  viewport.y += dy;
  viewport.lastPointer = { x: e.clientX, y: e.clientY };
  applyViewport();
});

window.addEventListener('pointerup', () => {
  if (viewport.isPanning) {
    viewport.isPanning = false;
    app.canvas.style.cursor = spaceDown ? 'grab' : 'default';
  }
});

// ---- ZOOM (Scroll wheel, cursor-centered) ----

app.canvas.addEventListener('wheel', (e) => {
  e.preventDefault();

  const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
  const newScale = Math.max(
    viewport.minScale,
    Math.min(viewport.maxScale, viewport.scale * zoomFactor)
  );

  // Zoom toward cursor position
  const rect = app.canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  // Convert mouse position to world coordinates before zoom
  const worldX = (mouseX - viewport.x) / viewport.scale;
  const worldY = (mouseY - viewport.y) / viewport.scale;

  viewport.scale = newScale;

  // Adjust position so the point under cursor stays fixed
  viewport.x = mouseX - worldX * viewport.scale;
  viewport.y = mouseY - worldY * viewport.scale;

  applyViewport();
}, { passive: false });

// ---- TRACKPAD PINCH (macOS) ----
// macOS trackpad pinch fires wheel events with e.ctrlKey = true

// The wheel handler above already handles this correctly because
// macOS WebKit sends synthetic wheel events for pinch gestures.
// No additional code needed.

// ---- FIT ALL ----

function fitAll(padding = 50) {
  const bounds = world.getLocalBounds();
  if (bounds.width === 0 || bounds.height === 0) return;

  const scaleX = (app.screen.width - padding * 2) / bounds.width;
  const scaleY = (app.screen.height - padding * 2) / bounds.height;
  viewport.scale = Math.min(scaleX, scaleY, 1); // Don't zoom past 100%

  viewport.x = (app.screen.width - bounds.width * viewport.scale) / 2 - bounds.x * viewport.scale;
  viewport.y = (app.screen.height - bounds.height * viewport.scale) / 2 - bounds.y * viewport.scale;
  applyViewport();
}
```

### Screen ↔ World Coordinate Conversion

```javascript
// Screen coordinates → World coordinates
function screenToWorld(screenX, screenY) {
  return {
    x: (screenX - viewport.x) / viewport.scale,
    y: (screenY - viewport.y) / viewport.scale,
  };
}

// World coordinates → Screen coordinates
function worldToScreen(worldX, worldY) {
  return {
    x: worldX * viewport.scale + viewport.x,
    y: worldY * viewport.scale + viewport.y,
  };
}
```

---

## 8. Drag & Drop Image Cards

### Card Container Structure

```javascript
import { Container, Sprite, Graphics, Assets } from 'pixi.js';
import { convertFileSrc } from '@tauri-apps/api/core';

class ImageCard {
  constructor(imageData) {
    this.data = imageData;
    this.container = new Container();
    this.container.eventMode = 'static';
    this.container.cursor = 'pointer';
    this.selected = false;
    this.dragging = false;
  }

  async init() {
    const { filePath, width, height } = this.data;

    // Load image texture via asset protocol
    const url = convertFileSrc(filePath);
    const texture = await Assets.load(url);

    // Image sprite
    this.sprite = new Sprite(texture);
    fitSprite(this.sprite, width || 200, height || 200);

    // Card background
    this.bg = new Graphics()
      .roundRect(-4, -4, this.sprite.width + 8, this.sprite.height + 8, 6)
      .fill({ color: 0x2a2a3e })
      .stroke({ color: 0x3a3a5e, width: 1 });

    this.container.addChild(this.bg, this.sprite);

    // Position
    this.container.position.set(this.data.x || 0, this.data.y || 0);

    // Set up drag
    this.setupDrag();

    return this;
  }

  setupDrag() {
    let dragOffset = { x: 0, y: 0 };

    this.container.on('pointerdown', (e) => {
      if (spaceDown) return; // Don't drag if panning

      this.dragging = true;
      const local = e.getLocalPosition(this.container.parent);
      dragOffset.x = local.x - this.container.x;
      dragOffset.y = local.y - this.container.y;

      // Bring to front
      const parent = this.container.parent;
      parent.removeChild(this.container);
      parent.addChild(this.container);

      e.stopPropagation();
    });

    app.stage.on('globalpointermove', (e) => {
      if (!this.dragging) return;

      // Convert screen coords to world coords
      const worldPos = screenToWorld(e.global.x, e.global.y);
      this.container.x = worldPos.x - dragOffset.x;
      this.container.y = worldPos.y - dragOffset.y;
    });

    app.stage.on('pointerup', () => {
      if (this.dragging) {
        this.dragging = false;
        // Save position
        this.data.x = this.container.x;
        this.data.y = this.container.y;
      }
    });
  }

  setSelected(selected) {
    this.selected = selected;
    if (this.selectionBorder) {
      this.container.removeChild(this.selectionBorder);
      this.selectionBorder.destroy();
    }
    if (selected) {
      this.selectionBorder = new Graphics()
        .roundRect(-6, -6, this.sprite.width + 12, this.sprite.height + 12, 8)
        .stroke({ color: 0x4a9eff, width: 2 });
      this.container.addChildAt(this.selectionBorder, 0);
    }
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
```

### External Drag & Drop (Files from OS)

```javascript
// Handle files dragged from Finder/Explorer onto the canvas
app.canvas.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  showDropOverlay();   // Visual feedback
});

app.canvas.addEventListener('dragleave', () => {
  hideDropOverlay();
});

app.canvas.addEventListener('drop', async (e) => {
  e.preventDefault();
  hideDropOverlay();

  const files = Array.from(e.dataTransfer.files);
  const imageFiles = files.filter(f =>
    /\.(png|jpe?g|gif|webp|svg|bmp|avif|tiff?)$/i.test(f.name)
  );

  // Get drop position in world coordinates
  const rect = app.canvas.getBoundingClientRect();
  const dropWorld = screenToWorld(
    e.clientX - rect.left,
    e.clientY - rect.top
  );

  // Import images via Tauri backend
  for (const file of imageFiles) {
    const result = await invoke('import_image', { sourcePath: file.path });
    const card = new ImageCard({
      filePath: result.path,
      x: dropWorld.x,
      y: dropWorld.y,
    });
    await card.init();
    world.addChild(card.container);
    dropWorld.x += 220;  // Offset each card
  }
});
```

---

## 9. Selection System

### Multi-Select with Shift+Click and Drag-Select

```javascript
const selection = {
  items: new Set(),
  selectionRect: null,
  startPoint: null,
};

// Shift+click to add/remove from selection
function handleCardClick(card, event) {
  if (event.shiftKey) {
    // Toggle in selection
    if (selection.items.has(card)) {
      selection.items.delete(card);
      card.setSelected(false);
    } else {
      selection.items.add(card);
      card.setSelected(true);
    }
  } else {
    // Clear and select only this card
    clearSelection();
    selection.items.add(card);
    card.setSelected(true);
  }
}

function clearSelection() {
  for (const card of selection.items) {
    card.setSelected(false);
  }
  selection.items.clear();
}

// Drag-select rectangle (rubber band)
function startDragSelect(screenX, screenY) {
  selection.startPoint = { x: screenX, y: screenY };
  selection.selectionRect = new Graphics();
  app.stage.addChild(selection.selectionRect);
}

function updateDragSelect(screenX, screenY) {
  if (!selection.startPoint) return;

  const x = Math.min(selection.startPoint.x, screenX);
  const y = Math.min(selection.startPoint.y, screenY);
  const w = Math.abs(screenX - selection.startPoint.x);
  const h = Math.abs(screenY - selection.startPoint.y);

  selection.selectionRect.clear()
    .rect(x, y, w, h)
    .fill({ color: 0x4a9eff, alpha: 0.1 })
    .stroke({ color: 0x4a9eff, width: 1 });
}

function endDragSelect(screenX, screenY) {
  if (!selection.startPoint) return;

  // Calculate selection bounds in world space
  const topLeft = screenToWorld(
    Math.min(selection.startPoint.x, screenX),
    Math.min(selection.startPoint.y, screenY)
  );
  const bottomRight = screenToWorld(
    Math.max(selection.startPoint.x, screenX),
    Math.max(selection.startPoint.y, screenY)
  );

  // Select all cards intersecting the rectangle
  clearSelection();
  for (const card of allCards) {
    const cx = card.container.x;
    const cy = card.container.y;
    const cw = card.sprite.width;
    const ch = card.sprite.height;

    if (cx + cw > topLeft.x && cx < bottomRight.x &&
        cy + ch > topLeft.y && cy < bottomRight.y) {
      selection.items.add(card);
      card.setSelected(true);
    }
  }

  // Clean up
  app.stage.removeChild(selection.selectionRect);
  selection.selectionRect.destroy();
  selection.selectionRect = null;
  selection.startPoint = null;
}
```

---

## 10. Performance: 500+ Images

### Strategy Overview

| Technique | Impact | When to Use |
|-----------|--------|-------------|
| Thumbnails | High | Always — load thumbnails first, full-res on zoom |
| Viewport culling | High | Always — hide off-screen cards |
| Render groups | Medium | For the world container and HUD |
| Texture GC | Medium | Large boards with scrolling |
| Object pooling | Medium | Boards with 1000+ images |
| BitmapText | Low-Medium | Cards with text labels |

### Thumbnail Strategy

Generate thumbnails on the Rust side. Load thumbnails by default; swap to full-res when zoomed in.

```rust
// Rust: Generate thumbnail (add to Cargo.toml: image = "0.25")
use image::imageops::FilterType;

#[tauri::command]
fn generate_thumbnail(
    image_path: String,
    thumb_path: String,
    max_size: u32,
) -> Result<String, String> {
    let img = image::open(&image_path).map_err(|e| e.to_string())?;
    let thumb = img.resize(max_size, max_size, FilterType::Triangle);
    thumb.save(&thumb_path).map_err(|e| e.to_string())?;
    Ok(thumb_path)
}
```

```javascript
// JS: Load thumbnail, swap to full-res on demand
class ImageCard {
  async loadThumbnail() {
    const thumbUrl = convertFileSrc(this.data.thumbnailPath);
    this.sprite.texture = await Assets.load(thumbUrl);
  }

  async loadFullRes() {
    if (this.fullResLoaded) return;
    const fullUrl = convertFileSrc(this.data.filePath);
    this.sprite.texture = await Assets.load(fullUrl);
    this.fullResLoaded = true;
  }
}
```

### Viewport Culling

Hide cards that are completely off-screen. Check on every viewport move/zoom.

```javascript
function cullOffscreenCards(cards) {
  // Visible area in world coordinates
  const viewBounds = {
    left: -viewport.x / viewport.scale,
    top: -viewport.y / viewport.scale,
    right: (app.screen.width - viewport.x) / viewport.scale,
    bottom: (app.screen.height - viewport.y) / viewport.scale,
  };

  // Add padding to avoid pop-in
  const pad = 200;
  viewBounds.left -= pad;
  viewBounds.top -= pad;
  viewBounds.right += pad;
  viewBounds.bottom += pad;

  for (const card of cards) {
    const cx = card.container.x;
    const cy = card.container.y;
    const cw = card.sprite?.width || 200;
    const ch = card.sprite?.height || 200;

    const visible = (
      cx + cw > viewBounds.left &&
      cx < viewBounds.right &&
      cy + ch > viewBounds.top &&
      cy < viewBounds.bottom
    );

    card.container.visible = visible;
    card.container.eventMode = visible ? 'static' : 'none';
  }
}
```

### Level-of-Detail (LOD)

At low zoom levels, render simplified cards instead of full images.

```javascript
function updateLOD(cards) {
  const scale = viewport.scale;

  for (const card of cards) {
    if (scale < 0.15) {
      // Very zoomed out: show colored rectangle only
      card.sprite.visible = false;
      card.placeholder.visible = true;
    } else if (scale < 0.5) {
      // Medium zoom: show thumbnail
      card.sprite.visible = true;
      card.placeholder.visible = false;
      card.loadThumbnail();
    } else {
      // Close up: show full-res
      card.sprite.visible = true;
      card.placeholder.visible = false;
      card.loadFullRes();
    }
  }
}
```

### Render Groups for Performance

```javascript
// The world container should be a render group — its transform
// (position, scale from pan/zoom) is applied on the GPU, avoiding
// CPU recalculation of all child transforms every frame.
const world = new Container({ isRenderGroup: true });
app.stage.addChild(world);

// The HUD/UI overlay should be a separate render group
const hud = new Container({ isRenderGroup: true });
app.stage.addChild(hud);
// HUD children (minimap, toolbar) stay fixed regardless of world pan/zoom
```

### Texture Garbage Collection

```javascript
// PixiJS 8 auto-garbage-collects unused textures after ~60s.
// For large boards, you can tune this:
app.renderer.textureGC.maxIdle = 1800;       // Frames before GC (default 3600)
app.renderer.textureGC.checkCountMax = 300;   // Check interval in frames (default 600)

// Manually unload a texture when a card is removed
function removeCard(card) {
  const texture = card.sprite.texture;
  card.destroy();
  Assets.unload(card.data.filePath);  // Remove from cache
  texture.destroy(true);               // Free GPU memory
}
```

### Object Pooling (for 1000+ images)

```javascript
class CardPool {
  constructor() {
    this.pool = [];
  }

  acquire() {
    return this.pool.pop() || this.createNew();
  }

  release(card) {
    card.container.visible = false;
    card.container.eventMode = 'none';
    this.pool.push(card);
  }

  createNew() {
    // Create a card with placeholder content
    const card = new ImageCard({ filePath: '', x: 0, y: 0 });
    return card;
  }
}
```

---

## 11. Tauri IPC Integration Patterns

### Loading the Board on App Start

```javascript
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { convertFileSrc } from '@tauri-apps/api/core';

// 1. Scan images from project directory
const images = await invoke('scan_images', { dirPath: projectPath });

// 2. Load board state (positions, groups, etc.)
const boardState = await invoke('read_board_state', { projectPath });

// 3. Create cards from data
for (const img of images) {
  const savedPos = boardState.items?.find(i => i.file === img.name);
  const card = new ImageCard({
    filePath: img.path,
    thumbnailPath: img.thumbnailPath,
    x: savedPos?.position.x || autoLayoutX,
    y: savedPos?.position.y || autoLayoutY,
  });
  await card.init();
  world.addChild(card.container);
  allCards.push(card);
}
```

### Saving Board State

```javascript
async function saveBoardState() {
  const state = {
    version: 2,
    viewport: {
      x: viewport.x,
      y: viewport.y,
      zoom: viewport.scale,
    },
    items: allCards.map(card => ({
      id: card.data.id,
      file: card.data.fileName,
      position: { x: card.container.x, y: card.container.y },
      size: { width: card.sprite.width, height: card.sprite.height },
    })),
  };

  await invoke('write_board_state', {
    projectPath,
    state: JSON.stringify(state),
  });
}

// Auto-save on card move (debounced)
let saveTimeout;
function scheduleSave() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveBoardState, 2000);
}
```

### Streaming Progress via Channels

```javascript
import { invoke, Channel } from '@tauri-apps/api/core';

// Scan with real-time progress updates
async function scanWithProgress(dirPath) {
  const onEvent = new Channel();

  onEvent.onmessage = (msg) => {
    switch (msg.event) {
      case 'started':
        showProgress(`Scanning ${msg.data.total} files...`);
        break;
      case 'progress':
        updateProgress(msg.data.current / msg.data.total);
        break;
      case 'finished':
        hideProgress();
        break;
    }
  };

  const images = await invoke('scan_with_progress', { dirPath, onEvent });
  return images;
}
```

### File Watcher Events (Live Reload)

```javascript
import { listen } from '@tauri-apps/api/event';

// Listen for file system changes from the Rust watcher
const unlisten = await listen('file-changed', async (event) => {
  const { path, kind } = event.payload;
  // kind: 'created' | 'modified' | 'removed'

  if (kind === 'created' && isImageFile(path)) {
    // New image added to project folder
    const card = new ImageCard({ filePath: path, x: nextX, y: nextY });
    await card.init();
    world.addChild(card.container);
  } else if (kind === 'removed') {
    // Image deleted — remove card
    const card = allCards.find(c => c.data.filePath === path);
    if (card) removeCard(card);
  }
});
```

---

## 12. Full Working Example

Complete minimal setup: Tauri + PixiJS 8 infinite canvas with image cards.

### `src/canvas.js`

```javascript
import { Application, Container, Sprite, Graphics, Assets } from 'pixi.js';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';

// ============================================================
// State
// ============================================================

let app;
let world;
const allCards = [];

const viewport = {
  x: 0, y: 0, scale: 1,
  minScale: 0.05, maxScale: 8.0,
  isPanning: false,
  lastPointer: { x: 0, y: 0 },
};

let spaceDown = false;

// ============================================================
// Init
// ============================================================

export async function initCanvas(containerEl) {
  app = new Application();
  await app.init({
    resizeTo: containerEl,
    backgroundColor: 0x1a1a2e,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    preference: 'webgl',
    powerPreference: 'high-performance',
  });
  containerEl.appendChild(app.canvas);

  // World container (render group for GPU-powered transforms)
  world = new Container({ isRenderGroup: true });
  app.stage.addChild(world);

  setupPanZoom();
  setupKeyboard();

  return app;
}

// ============================================================
// Pan & Zoom
// ============================================================

function applyViewport() {
  world.scale.set(viewport.scale);
  world.position.set(viewport.x, viewport.y);
}

function screenToWorld(sx, sy) {
  return {
    x: (sx - viewport.x) / viewport.scale,
    y: (sy - viewport.y) / viewport.scale,
  };
}

function setupPanZoom() {
  const canvas = app.canvas;

  // Pan: space+drag or middle mouse
  canvas.addEventListener('pointerdown', (e) => {
    if (spaceDown || e.button === 1) {
      viewport.isPanning = true;
      viewport.lastPointer = { x: e.clientX, y: e.clientY };
      canvas.style.cursor = 'grabbing';
      e.preventDefault();
    }
  });

  window.addEventListener('pointermove', (e) => {
    if (!viewport.isPanning) return;
    viewport.x += e.clientX - viewport.lastPointer.x;
    viewport.y += e.clientY - viewport.lastPointer.y;
    viewport.lastPointer = { x: e.clientX, y: e.clientY };
    applyViewport();
  });

  window.addEventListener('pointerup', () => {
    if (viewport.isPanning) {
      viewport.isPanning = false;
      canvas.style.cursor = spaceDown ? 'grab' : 'default';
    }
  });

  // Zoom: scroll wheel (cursor-centered)
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.08 : 0.92;
    const newScale = Math.max(viewport.minScale,
      Math.min(viewport.maxScale, viewport.scale * factor));

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const wx = (mx - viewport.x) / viewport.scale;
    const wy = (my - viewport.y) / viewport.scale;

    viewport.scale = newScale;
    viewport.x = mx - wx * viewport.scale;
    viewport.y = my - wy * viewport.scale;
    applyViewport();
    requestCull();
  }, { passive: false });
}

// ============================================================
// Keyboard
// ============================================================

function setupKeyboard() {
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.repeat) {
      spaceDown = true;
      app.canvas.style.cursor = 'grab';
    }
    if (e.key === '1' && e.shiftKey) fitAll();
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      spaceDown = false;
      app.canvas.style.cursor = 'default';
    }
  });
}

// ============================================================
// Fit All
// ============================================================

function fitAll(padding = 80) {
  if (allCards.length === 0) return;
  const bounds = world.getLocalBounds();
  if (bounds.width === 0) return;

  const sx = (app.screen.width - padding * 2) / bounds.width;
  const sy = (app.screen.height - padding * 2) / bounds.height;
  viewport.scale = Math.min(sx, sy, 1);
  viewport.x = (app.screen.width - bounds.width * viewport.scale) / 2
    - bounds.x * viewport.scale;
  viewport.y = (app.screen.height - bounds.height * viewport.scale) / 2
    - bounds.y * viewport.scale;
  applyViewport();
}

// ============================================================
// Viewport Culling
// ============================================================

let cullRAF;
function requestCull() {
  if (cullRAF) return;
  cullRAF = requestAnimationFrame(() => {
    cullCards();
    cullRAF = null;
  });
}

function cullCards() {
  const pad = 200;
  const vl = (-viewport.x / viewport.scale) - pad;
  const vt = (-viewport.y / viewport.scale) - pad;
  const vr = ((app.screen.width - viewport.x) / viewport.scale) + pad;
  const vb = ((app.screen.height - viewport.y) / viewport.scale) + pad;

  for (const card of allCards) {
    const c = card.container;
    const w = card.cardWidth || 200;
    const h = card.cardHeight || 200;
    const vis = (c.x + w > vl && c.x < vr && c.y + h > vt && c.y < vb);
    c.visible = vis;
    c.eventMode = vis ? 'static' : 'none';
  }
}

// ============================================================
// Image Cards
// ============================================================

export async function addImageCard(imageInfo, x, y) {
  const url = convertFileSrc(imageInfo.path);
  const texture = await Assets.load(url);

  const card = new Container();
  card.eventMode = 'static';
  card.cursor = 'pointer';
  card.position.set(x, y);

  // Image sprite (fit to 200px wide)
  const sprite = new Sprite(texture);
  const maxW = 200;
  const aspect = texture.width / texture.height;
  sprite.width = maxW;
  sprite.height = maxW / aspect;

  // Background
  const bg = new Graphics()
    .roundRect(-4, -4, sprite.width + 8, sprite.height + 8, 6)
    .fill({ color: 0x2a2a3e })
    .stroke({ color: 0x3a3a5e, width: 1 });

  card.addChild(bg, sprite);

  // Drag support
  let dragging = false;
  let dragOffset = { x: 0, y: 0 };

  card.on('pointerdown', (e) => {
    if (spaceDown) return;
    dragging = true;
    const wp = screenToWorld(e.global.x, e.global.y);
    dragOffset = { x: wp.x - card.x, y: wp.y - card.y };
    const parent = card.parent;
    parent.removeChild(card);
    parent.addChild(card);
    e.stopPropagation();
  });

  app.stage.on('globalpointermove', (e) => {
    if (!dragging) return;
    const wp = screenToWorld(e.global.x, e.global.y);
    card.x = wp.x - dragOffset.x;
    card.y = wp.y - dragOffset.y;
  });

  app.stage.on('pointerup', () => { dragging = false; });

  world.addChild(card);

  const cardData = { container: card, sprite, cardWidth: sprite.width, cardHeight: sprite.height };
  allCards.push(cardData);
  return cardData;
}

// ============================================================
// Load Project
// ============================================================

export async function loadProject(dirPath) {
  const images = await invoke('scan_images', { dirPath });

  let x = 50, y = 50, rowHeight = 0, col = 0;
  const maxCols = 5;
  const gap = 20;

  for (const img of images) {
    const card = await addImageCard(img, x, y);
    rowHeight = Math.max(rowHeight, card.cardHeight + 8);
    col++;
    if (col >= maxCols) {
      col = 0;
      x = 50;
      y += rowHeight + gap;
      rowHeight = 0;
    } else {
      x += card.cardWidth + 8 + gap;
    }
  }

  fitAll();
}
```

### `src/main.js`

```javascript
import { initCanvas, loadProject } from './canvas.js';

async function main() {
  const container = document.getElementById('canvas-container');
  await initCanvas(container);

  // Example: Load a project directory
  // const projectDir = await invoke('get_last_project');
  // if (projectDir) await loadProject(projectDir);
}

main().catch(console.error);
```

### `index.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Deco</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    body {
      background: #1a1a2e;
      color: #e0e0e0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    #canvas-container {
      width: 100%;
      height: 100%;
      position: relative;
    }
    #canvas-container canvas {
      display: block;
    }
  </style>
</head>
<body>
  <div id="canvas-container"></div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

---

## Quick Reference: Key API Differences v7 → v8

| Feature | PixiJS v7 | PixiJS v8 |
|---------|-----------|-----------|
| App init | `new Application({ width, height })` | `const app = new Application(); await app.init({...})` |
| Imports | `import * as PIXI from 'pixi.js'` | `import { Application, Sprite } from 'pixi.js'` |
| Load texture | `Texture.from('url')` | `await Assets.load('url')` |
| Interaction | `interactive = true` | `eventMode = 'static'` |
| Mouse move | `pointermove` fires globally | `pointermove` only on hover; use `globalpointermove` |
| Graphics fill | `beginFill(0xff0000); drawRect(...); endFill()` | `.rect(...).fill({ color: 0xff0000 })` |
| Graphics stroke | `lineStyle(2, 0xff0000)` | `.stroke({ color: 0xff0000, width: 2 })` |
| Render groups | N/A | `new Container({ isRenderGroup: true })` |
| Canvas element | `app.view` | `app.canvas` |
| BaseTexture | `BaseTexture` class | Removed — use `TextureSource` |
| Culling | `sprite.cullable = true` | Removed — implement culling in app code |

---

## Sources

- [PixiJS 8 Application API](https://pixijs.download/dev/docs/app.Application.html)
- [PixiJS 8 Getting Started](https://pixijs.com/8.x/tutorials/getting-started)
- [PixiJS 8 Assets Guide](https://pixijs.com/8.x/guides/components/assets)
- [PixiJS 8 Sprite Guide](https://pixijs.com/8.x/guides/components/scene-objects/sprite)
- [PixiJS 8 Events/Interaction](https://pixijs.com/8.x/guides/components/events)
- [PixiJS 8 Graphics API](https://pixijs.com/8.x/guides/components/scene-objects/graphics)
- [PixiJS 8 Text & BitmapText](https://pixijs.com/8.x/guides/components/scene-objects/text)
- [PixiJS 8 Render Groups](https://pixijs.com/8.x/guides/concepts/render-groups)
- [PixiJS 8 Performance Tips](https://pixijs.com/8.x/guides/concepts/performance-tips)
- [PixiJS 8 Garbage Collection](https://pixijs.com/8.x/guides/concepts/garbage-collection)
- [PixiJS v8 Migration Guide](https://pixijs.com/8.x/guides/migrations/v8)
- [PixiJS v8 Migration Discussion](https://github.com/pixijs/pixijs/discussions/9791)
- [pixi-viewport (PixiJS 8)](https://github.com/pixijs-userland/pixi-viewport)
- [Viewport/2D Camera Discussion](https://github.com/pixijs/pixijs/discussions/10371)
- [Tauri Asset Protocol](https://github.com/orgs/tauri-apps/discussions/11498)
- [Tauri convertFileSrc API](https://v2.tauri.app/reference/javascript/api/namespacecore/)
