// RefBoard 2.0 — PixiJS 8 Infinite Canvas Engine
// Handles: WebGL rendering, pan/zoom, image cards, grid background, viewport culling

import { Application, Container, Sprite, Graphics, Assets, Rectangle } from 'pixi.js';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';

// ============================================================
// State
// ============================================================

let app;
let world;        // World container — holds all canvas content (pan/zoom applied here)
let gridGfx;      // Grid background graphics

const allCards = [];

const viewport = {
  x: 0, y: 0, scale: 1,
  minScale: 0.05, maxScale: 8.0,
  isPanning: false,
  lastPointer: { x: 0, y: 0 },
};

let spaceDown = false;
let dragState = null; // { card, offset: {x,y}, moved: boolean } — active drag info

// Theme colors
const THEME = {
  bg: 0x1a1a2e,
  cardBg: 0x2a2a3e,
  cardBorder: 0x3a3a5e,
  cardHover: 0x4a4a6a,
  selectBorder: 0x4a9eff,
  gridLine: 0x262640,
  gridLineMajor: 0x303050,
  text: '#e0e0e0',
  textDim: '#888899',
};

// ============================================================
// Init
// ============================================================

export async function initCanvas(containerEl) {
  app = new Application();
  await app.init({
    resizeTo: containerEl,
    backgroundColor: THEME.bg,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    preference: 'webgl',
    powerPreference: 'high-performance',
  });
  containerEl.appendChild(app.canvas);

  // Prevent browser context menu on canvas
  app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // Grid layer (behind world)
  gridGfx = new Graphics();
  app.stage.addChild(gridGfx);

  // World container (render group for GPU-powered transforms)
  world = new Container({ isRenderGroup: true });
  world.sortableChildren = true;
  app.stage.addChild(world);

  setupPanZoom();
  setupKeyboard();
  setupGlobalDrag();
  drawGrid();

  // Redraw grid on resize
  window.addEventListener('resize', () => {
    drawGrid();
  });

  return { app, world, viewport };
}

// ============================================================
// Grid Background
// ============================================================

function drawGrid() {
  gridGfx.clear();

  const w = app.screen.width;
  const h = app.screen.height;
  const baseSize = 50;

  // Scale grid with zoom level — find a nice grid spacing
  let gridSize = baseSize * viewport.scale;

  // Keep grid lines within a readable range
  while (gridSize < 20) gridSize *= 5;
  while (gridSize > 200) gridSize /= 5;

  // Offset based on pan position
  const offsetX = viewport.x % gridSize;
  const offsetY = viewport.y % gridSize;

  // Minor grid lines
  for (let x = offsetX; x <= w; x += gridSize) {
    gridGfx.moveTo(x, 0).lineTo(x, h);
  }
  for (let y = offsetY; y <= h; y += gridSize) {
    gridGfx.moveTo(0, y).lineTo(w, y);
  }
  gridGfx.stroke({ color: THEME.gridLine, width: 0.5, alpha: 0.4 });

  // Major grid lines (every 5th line)
  const majorSize = gridSize * 5;
  const majorOffX = viewport.x % majorSize;
  const majorOffY = viewport.y % majorSize;

  for (let x = majorOffX; x <= w; x += majorSize) {
    gridGfx.moveTo(x, 0).lineTo(x, h);
  }
  for (let y = majorOffY; y <= h; y += majorSize) {
    gridGfx.moveTo(0, y).lineTo(w, y);
  }
  gridGfx.stroke({ color: THEME.gridLineMajor, width: 0.5, alpha: 0.6 });
}

// ============================================================
// Pan & Zoom
// ============================================================

function applyViewport() {
  world.scale.set(viewport.scale);
  world.position.set(viewport.x, viewport.y);
  drawGrid();
  requestCull();
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

    // Use finer zoom factor for trackpad pinch (ctrlKey)
    const intensity = e.ctrlKey ? 0.02 : 0.08;
    const direction = e.deltaY < 0 ? 1 : -1;
    const factor = 1 + direction * intensity;

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
    updateZoomDisplay();
  }, { passive: false });
}

// ============================================================
// Keyboard
// ============================================================

function setupKeyboard() {
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.repeat) {
      spaceDown = true;
      if (!dragState) {
        app.canvas.style.cursor = 'grab';
      }
      e.preventDefault(); // Prevent page scroll
    }
    // Shift+1 = fit all
    if (e.key === '1' && e.shiftKey) {
      fitAll();
    }
    // Escape = deselect all
    if (e.key === 'Escape') {
      clearSelection();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      spaceDown = false;
      if (!dragState) {
        app.canvas.style.cursor = 'default';
      }
    }
  });
}

// ============================================================
// Fit All
// ============================================================

export function fitAll(padding = 80) {
  if (allCards.length === 0) return;

  // Calculate bounds manually from card positions
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const card of allCards) {
    const c = card.container;
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x + card.cardWidth);
    maxY = Math.max(maxY, c.y + card.cardHeight);
  }

  const bw = maxX - minX;
  const bh = maxY - minY;
  if (bw === 0 || bh === 0) return;

  const sx = (app.screen.width - padding * 2) / bw;
  const sy = (app.screen.height - padding * 2) / bh;
  viewport.scale = Math.min(sx, sy, 1);
  viewport.x = (app.screen.width - bw * viewport.scale) / 2 - minX * viewport.scale;
  viewport.y = (app.screen.height - bh * viewport.scale) / 2 - minY * viewport.scale;
  applyViewport();
  updateZoomDisplay();
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
  const pad = 300;
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
// Global Drag Handler (single handler for all cards)
// ============================================================

function setupGlobalDrag() {
  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;

  // Resize hit area when window resizes
  window.addEventListener('resize', () => {
    app.stage.hitArea = app.screen;
  });

  app.stage.on('globalpointermove', (e) => {
    if (!dragState) return;
    dragState.moved = true;
    const wp = screenToWorld(e.global.x, e.global.y);
    dragState.card.container.x = wp.x - dragState.offset.x;
    dragState.card.container.y = wp.y - dragState.offset.y;
  });

  app.stage.on('pointerup', (e) => {
    finishDrag(e);
  });

  app.stage.on('pointerupoutside', (e) => {
    finishDrag(e);
  });

  // Click on empty canvas = deselect
  app.stage.on('pointerdown', (e) => {
    // Only if clicking on the stage itself (not a card)
    if (e.target === app.stage) {
      clearSelection();
    }
  });
}

function finishDrag(e) {
  if (!dragState) return;
  const card = dragState.card;

  if (!dragState.moved) {
    // It was a click, not a drag — handle selection
    const shiftKey = e?.data?.originalEvent?.shiftKey || e?.nativeEvent?.shiftKey;
    if (shiftKey) {
      if (selection.has(card)) {
        setCardSelected(card, false);
      } else {
        setCardSelected(card, true);
      }
    } else {
      clearSelection();
      setCardSelected(card, true);
    }
    // Notify panels of single-card selection
    if (onCardSelectCallback && selection.size === 1) {
      onCardSelectCallback(card);
    }
  }

  card.data.x = card.container.x;
  card.data.y = card.container.y;
  dragState = null;
}

// ============================================================
// Selection
// ============================================================

const selection = new Set();

function clearSelection() {
  for (const card of selection) {
    setCardSelected(card, false);
  }
  selection.clear();
}

function setCardSelected(card, selected) {
  if (selected) {
    if (!card.selectionBorder) {
      card.selectionBorder = new Graphics()
        .roundRect(-4, -4, card.cardWidth + 8, card.cardHeight + 8, 10)
        .stroke({ color: THEME.selectBorder, width: 2.5 });
      card.container.addChildAt(card.selectionBorder, 0);
    }
    selection.add(card);
  } else {
    if (card.selectionBorder) {
      card.container.removeChild(card.selectionBorder);
      card.selectionBorder.destroy();
      card.selectionBorder = null;
    }
    selection.delete(card);
  }
}

// ============================================================
// Image Cards
// ============================================================

const CARD_MAX_WIDTH = 220;
const CARD_PADDING = 6;
const CARD_RADIUS = 8;

export async function addImageCard(imageInfo, x, y) {
  const url = convertFileSrc(imageInfo.path);

  let texture;
  try {
    texture = await Assets.load(url);
  } catch (err) {
    console.warn(`Failed to load image: ${imageInfo.name}`, err);
    return null;
  }

  const card = { container: new Container(), data: imageInfo };
  card.container.eventMode = 'static';
  card.container.cursor = 'pointer';
  card.container.position.set(x, y);

  // Sprite (fit to max width, preserve aspect ratio)
  const sprite = new Sprite(texture);
  const aspect = texture.width / texture.height;
  const cardW = Math.min(CARD_MAX_WIDTH, texture.width);
  const cardH = cardW / aspect;
  sprite.width = cardW;
  sprite.height = cardH;
  sprite.position.set(CARD_PADDING, CARD_PADDING);

  card.cardWidth = cardW + CARD_PADDING * 2;
  card.cardHeight = cardH + CARD_PADDING * 2;
  card.sprite = sprite;

  // Background
  const bg = new Graphics()
    .roundRect(0, 0, card.cardWidth, card.cardHeight, CARD_RADIUS)
    .fill({ color: THEME.cardBg })
    .stroke({ color: THEME.cardBorder, width: 1 });
  card.bg = bg;

  // Hover overlay (invisible by default)
  const hoverBorder = new Graphics()
    .roundRect(-2, -2, card.cardWidth + 4, card.cardHeight + 4, CARD_RADIUS + 2)
    .stroke({ color: THEME.cardHover, width: 2 });
  hoverBorder.visible = false;
  card.hoverBorder = hoverBorder;

  card.container.addChild(bg, sprite, hoverBorder);

  // Hit area for the whole card
  card.container.hitArea = new Rectangle(
    -2, -2, card.cardWidth + 4, card.cardHeight + 4
  );

  // -- Hover effects --
  card.container.on('pointerover', () => {
    if (!selection.has(card)) {
      hoverBorder.visible = true;
    }
  });
  card.container.on('pointerout', () => {
    hoverBorder.visible = false;
  });

  // -- Drag (uses global handler via dragState) --
  card.container.on('pointerdown', (e) => {
    if (spaceDown) return; // Pan mode

    const wp = screenToWorld(e.global.x, e.global.y);
    dragState = {
      card,
      offset: { x: wp.x - card.container.x, y: wp.y - card.container.y },
      moved: false,
    };

    // Bring to front
    const parent = card.container.parent;
    parent.removeChild(card.container);
    parent.addChild(card.container);

    e.stopPropagation();
  });

  world.addChild(card.container);
  allCards.push(card);
  return card;
}

// ============================================================
// Load Project
// ============================================================

export async function loadProject(dirPath) {
  const images = await invoke('scan_images', { dirPath });

  if (images.length === 0) {
    console.warn('No images found in', dirPath);
    return;
  }

  // Auto-layout: grid of cards
  let x = 50, y = 50, rowHeight = 0, col = 0;
  const maxCols = Math.max(3, Math.floor(Math.sqrt(images.length)));
  const gap = 24;

  // Load cards with basic progress tracking
  let loaded = 0;
  const total = images.length;

  for (const img of images) {
    const card = await addImageCard(img, x, y);
    loaded++;

    if (card) {
      rowHeight = Math.max(rowHeight, card.cardHeight);
      col++;
      if (col >= maxCols) {
        col = 0;
        x = 50;
        y += rowHeight + gap;
        rowHeight = 0;
      } else {
        x += card.cardWidth + gap;
      }
    }

    // Update loading indicator if we have one
    if (loaded % 5 === 0 || loaded === total) {
      updateLoadingProgress(loaded, total);
    }
  }

  // Fit all cards in view
  fitAll();
  updateZoomDisplay();

  return { loaded, total };
}

// ============================================================
// HUD / UI Helpers
// ============================================================

let loadingEl = null;
let zoomEl = null;

export function setUIElements(elements) {
  loadingEl = elements.loading || null;
  zoomEl = elements.zoom || null;
}

function updateLoadingProgress(loaded, total) {
  if (loadingEl) {
    loadingEl.textContent = `Loading images... ${loaded}/${total}`;
    if (loaded >= total) {
      loadingEl.style.display = 'none';
    }
  }
}

function updateZoomDisplay() {
  if (zoomEl) {
    zoomEl.textContent = `${Math.round(viewport.scale * 100)}%`;
  }
}

// ============================================================
// Selection Callbacks
// ============================================================

let onCardSelectCallback = null;

/** Register a callback for when a card is selected (single-click). */
export function onCardSelect(callback) {
  onCardSelectCallback = callback;
}

/** Get all loaded cards. */
export function getAllCards() { return allCards; }

// ============================================================
// Canvas Filtering
// ============================================================

let activeFilter = null; // Set of image paths to highlight, or null

/**
 * Apply a filter to the canvas. Matching cards stay fully visible;
 * non-matching cards are dimmed. Pass null to clear the filter.
 * @param {string[]|null} matchingPaths - Array of image paths to highlight, or null
 */
export function applyFilter(matchingPaths) {
  if (!matchingPaths) {
    // Clear filter — restore all cards
    activeFilter = null;
    for (const card of allCards) {
      card.container.alpha = 1;
      card.container.eventMode = 'static';
    }
    requestCull();
    return;
  }

  activeFilter = new Set(matchingPaths);

  for (const card of allCards) {
    if (activeFilter.has(card.data.path)) {
      card.container.alpha = 1;
      card.container.eventMode = 'static';
    } else {
      card.container.alpha = 0.15;
      card.container.eventMode = 'static'; // Still interactive but visually dimmed
    }
  }
}

/**
 * Scroll the canvas to center on a specific card by image path.
 * @param {string} imagePath
 */
export function scrollToCard(imagePath) {
  const card = allCards.find((c) => c.data.path === imagePath);
  if (!card) return;

  // Center the card in the viewport
  const cx = card.container.x + (card.cardWidth / 2);
  const cy = card.container.y + (card.cardHeight / 2);

  viewport.x = (app.screen.width / 2) - cx * viewport.scale;
  viewport.y = (app.screen.height / 2) - cy * viewport.scale;
  applyViewport();
  updateZoomDisplay();

  // Flash-select the card
  clearSelection();
  setCardSelected(card, true);
  if (onCardSelectCallback) {
    onCardSelectCallback(card);
  }
}

// Listen for scroll-to-card events from search results
if (typeof window !== 'undefined') {
  window.addEventListener('refboard:scroll-to-card', (e) => {
    if (e.detail?.path) scrollToCard(e.detail.path);
  });
}

// ============================================================
// Public API
// ============================================================

export function getViewport() { return viewport; }
export function getCardCount() { return allCards.length; }
export function getApp() { return app; }
