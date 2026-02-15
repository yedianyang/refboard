// RefBoard 2.0 — PixiJS 8 Infinite Canvas Engine
// M3: Multi-select, resize, undo/redo, groups, auto-layout, minimap, keyboard shortcuts

import { Application, Container, Sprite, Graphics, Assets, Rectangle, Text, TextStyle } from 'pixi.js';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { icon } from './icons.js';

// ============================================================
// State
// ============================================================

let app;
let world;        // World container — holds all canvas content
let gridGfx;      // Grid background graphics
let minimapGfx;   // Minimap overlay graphics
let selectRectGfx; // Drag-select rectangle graphics
let guideGfx;      // Alignment guide lines

const allCards = [];
const allGroups = []; // { name, cards: Set, container, label, border }

const viewport = {
  x: 0, y: 0, scale: 1,
  minScale: 0.05, maxScale: 8.0,
  isPanning: false,
  lastPointer: { x: 0, y: 0 },
};

let spaceDown = false;
let currentTool = 'select'; // 'select' | 'hand' | 'text'
let gridVisible = true;
let minimapVisible = false;
let activeAnnotationColor = parseInt(localStorage.getItem('refboard-annotation-color') || '0x4a9eff', 16) || 0x4a9eff;

// Drag state
let dragState = null;
// { type: 'card'|'multicard'|'resize'|'selectRect', ... }

// Theme colors
const THEME = {
  bg: 0x1a1a2e,
  cardBg: 0x2a2a3e,
  cardBorder: 0x3a3a5e,
  cardHover: 0x4a4a6a,
  selectBorder: 0x4a9eff,
  selectRect: 0x4a9eff,
  groupBorder: 0x7b68ee,
  groupBg: 0x7b68ee,
  gridLine: 0x262640,
  gridLineMajor: 0x303050,
  resizeHandle: 0x4a9eff,
  minimap: {
    bg: 0x16213e,
    viewport: 0x4a9eff,
    card: 0x4a9eff,
    border: 0x2a2a4a,
  },
  text: '#e0e0e0',
  textDim: '#888899',
};

// ============================================================
// Undo/Redo
// ============================================================

const undoStack = [];
const redoStack = [];
const MAX_UNDO = 100;

function pushUndo(action) {
  undoStack.push(action);
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack.length = 0; // Clear redo on new action
}

function undo() {
  if (undoStack.length === 0) return;
  const action = undoStack.pop();
  redoStack.push(action);
  applyAction(action, true);
}

function redo() {
  if (redoStack.length === 0) return;
  const action = redoStack.pop();
  undoStack.push(action);
  applyAction(action, false);
}

function applyAction(action, isUndo) {
  switch (action.type) {
    case 'move': {
      for (const entry of action.entries) {
        const pos = isUndo ? entry.from : entry.to;
        entry.card.container.x = pos.x;
        entry.card.container.y = pos.y;
        entry.card.data.x = pos.x;
        entry.card.data.y = pos.y;
      }
      break;
    }
    case 'resize': {
      const { card } = action;
      const dims = isUndo ? action.from : action.to;
      resizeCardTo(card, dims.width, dims.height);
      break;
    }
    case 'delete': {
      if (isUndo) {
        // Re-add cards
        for (const entry of action.entries) {
          world.addChild(entry.card.container);
          allCards.push(entry.card);
        }
      } else {
        // Re-delete
        for (const entry of action.entries) {
          removeCardFromCanvas(entry.card);
        }
      }
      requestCull();
      break;
    }
  }
}

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
  app.canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showCanvasContextMenu(e.clientX, e.clientY);
  });

  // Grid layer
  gridGfx = new Graphics();
  app.stage.addChild(gridGfx);

  // World container
  world = new Container({ isRenderGroup: true });
  world.sortableChildren = true;
  app.stage.addChild(world);

  // Alignment guide lines (in world space, above cards)
  guideGfx = new Graphics();
  guideGfx.zIndex = 9998;
  world.addChild(guideGfx);

  // Drag-select rectangle (on top of world)
  selectRectGfx = new Graphics();
  selectRectGfx.visible = false;
  app.stage.addChild(selectRectGfx);

  // Minimap (topmost)
  minimapGfx = new Graphics();
  minimapGfx.visible = false;
  app.stage.addChild(minimapGfx);

  setupPanZoom();
  setupKeyboard();
  setupGlobalDrag();
  drawGrid();

  // Redraw grid/minimap on any resize
  const onResize = () => {
    drawGrid();
    app.stage.hitArea = app.screen;
    invalidateMinimapCardCache();
    requestMinimapRedraw();
  };
  window.addEventListener('resize', onResize);

  // Also observe container size changes (more reliable than window resize)
  const ro = new ResizeObserver(() => {
    if (app?.renderer) {
      app.resize();
      onResize();
    }
  });
  ro.observe(containerEl);

  // Wire sidebar tool buttons to click handlers
  const toolMap = { 'Select': 'select', 'Hand': 'hand', 'Note': 'text', 'Rect': 'rect', 'Ellipse': 'ellipse', 'Line': 'line' };
  document.querySelectorAll('.sidebar-btn').forEach((btn) => {
    const title = btn.title || '';
    for (const [prefix, tool] of Object.entries(toolMap)) {
      if (title.startsWith(prefix)) {
        btn.addEventListener('click', () => setTool(tool));
        break;
      }
    }
  });

  initColorPalette();
  initPropsBar();
  initZoomControls();

  return { app, world, viewport };
}

// ============================================================
// Grid Background
// ============================================================

function drawGrid() {
  gridGfx.clear();
  if (!gridVisible) return;

  const w = app.screen.width;
  const h = app.screen.height;
  const baseSize = 50;
  let gridSize = baseSize * viewport.scale;
  while (gridSize < 20) gridSize *= 5;
  while (gridSize > 200) gridSize /= 5;

  const offsetX = viewport.x % gridSize;
  const offsetY = viewport.y % gridSize;

  for (let x = offsetX; x <= w; x += gridSize) {
    gridGfx.moveTo(x, 0).lineTo(x, h);
  }
  for (let y = offsetY; y <= h; y += gridSize) {
    gridGfx.moveTo(0, y).lineTo(w, y);
  }
  gridGfx.stroke({ color: THEME.gridLine, width: 0.5, alpha: 0.4 });

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
  requestMinimapRedraw();
}

function screenToWorld(sx, sy) {
  return {
    x: (sx - viewport.x) / viewport.scale,
    y: (sy - viewport.y) / viewport.scale,
  };
}

function setupPanZoom() {
  const canvas = app.canvas;

  canvas.addEventListener('pointerdown', (e) => {
    if (spaceDown || e.button === 1 || currentTool === 'hand') {
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
      canvas.style.cursor = (spaceDown || currentTool === 'hand') ? 'grab' : 'default';
    }
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
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
// Keyboard Shortcuts (PRD Section 4.5)
// ============================================================

function isInputFocused() {
  const el = document.activeElement;
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

function setupKeyboard() {
  window.addEventListener('keydown', (e) => {
    // Don't handle shortcuts when typing in inputs or lightbox is open
    if (isInputFocused()) return;
    if (lightboxOpen) return;

    const meta = e.metaKey || e.ctrlKey;

    // Space = pan mode
    if (e.code === 'Space' && !e.repeat) {
      spaceDown = true;
      if (!dragState) app.canvas.style.cursor = 'grab';
      e.preventDefault();
      return;
    }

    // Navigation
    if (e.key === '1' && e.shiftKey && !meta) { fitAll(); return; }
    if (e.key === '2' && e.shiftKey && !meta) { fitSelection(); return; }
    if (e.key === '0' && meta) { zoomTo100(); e.preventDefault(); return; }

    // Tools
    if ((e.key === 'v' || e.key === 'V') && !meta) { setTool('select'); return; }
    if ((e.key === 'h' || e.key === 'H') && !meta) { setTool('hand'); return; }
    if ((e.key === 't' || e.key === 'T') && !meta && !e.shiftKey) { setTool('text'); return; }
    if ((e.key === 'r' || e.key === 'R') && !meta && !e.shiftKey) { setTool('rect'); return; }
    if ((e.key === 'o' || e.key === 'O') && !meta && !e.shiftKey) { setTool('ellipse'); return; }
    if ((e.key === 'l' || e.key === 'L') && !meta && !e.shiftKey) { setTool('line'); return; }
    if (e.key === 'g' && !meta) { toggleGrid(); return; }
    if (e.key === 'm' && !meta) { toggleMinimap(); return; }

    // Edit — Undo/Redo
    if (e.key === 'z' && meta && !e.shiftKey) { undo(); e.preventDefault(); return; }
    if (e.key === 'z' && meta && e.shiftKey) { redo(); e.preventDefault(); return; }
    // (Cmd+Shift+Z on macOS / Ctrl+Y also common)
    if (e.key === 'y' && meta) { redo(); e.preventDefault(); return; }

    // Edit — Copy/Paste
    if (e.key === 'c' && meta && !e.shiftKey) { copySelected(); e.preventDefault(); return; }
    if (e.key === 'v' && meta && !e.shiftKey && clipboard.length > 0) { pasteFromClipboard(); e.preventDefault(); return; }

    // Edit — Selection operations
    if (e.key === 'a' && meta) { selectAll(); e.preventDefault(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && !meta) { deleteSelected(); return; }
    if (e.key === 'd' && meta) { duplicateSelected(); e.preventDefault(); return; }

    // Edit — Grouping
    if (e.key === 'g' && meta && !e.shiftKey) { groupSelected(); e.preventDefault(); return; }
    if (e.key === 'g' && meta && e.shiftKey) { ungroupSelected(); e.preventDefault(); return; }

    // Edit — Lock/Unlock
    if (e.key === 'l' && meta && !e.shiftKey) { toggleLockSelected(); e.preventDefault(); return; }

    // Edit — Z-order
    if (e.key === ']' && meta) { bringForward(); e.preventDefault(); return; }
    if (e.key === '[' && meta) { sendBackward(); e.preventDefault(); return; }

    // Layout — Tidy up
    if (e.key === 't' && meta && e.shiftKey) { tidyUp(); e.preventDefault(); return; }

    // Export canvas as PNG
    if (e.key === 'e' && meta && e.shiftKey) {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('refboard:export-png'));
      return;
    }

    // Arrow keys — nudge selected items
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && !meta) {
      if (selection.size === 0) return;
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      for (const card of selection) {
        if (card.locked) continue;
        card.container.x += dx;
        card.container.y += dy;
        card.data.x = card.container.x;
        card.data.y = card.container.y;
      }
      markDirty();
      return;
    }

    // Escape = deselect
    if (e.key === 'Escape') { clearSelection(); return; }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      spaceDown = false;
      if (!dragState) app.canvas.style.cursor = currentTool === 'hand' ? 'grab' : 'default';
    }
  });
}

const SHAPE_TOOLS = new Set(['rect', 'ellipse', 'line']);

const ANNOTATION_TOOLS = new Set(['rect', 'ellipse', 'line', 'text']);

function setTool(tool) {
  currentTool = tool;
  // Update sidebar button active state
  document.querySelectorAll('.sidebar-btn').forEach((btn) => btn.classList.remove('active'));
  const titles = { select: 'Select', hand: 'Hand', text: 'Note', rect: 'Rect', ellipse: 'Ellipse', line: 'Line' };
  const btn = Array.from(document.querySelectorAll('.sidebar-btn'))
    .find((b) => b.title?.startsWith(titles[tool] || ''));
  if (btn) btn.classList.add('active');
  app.canvas.style.cursor = tool === 'hand' ? 'grab' : tool === 'text' ? 'text' : SHAPE_TOOLS.has(tool) ? 'crosshair' : 'default';
  updateColorPaletteVisibility();
}

// ============================================================
// Fit All / Fit Selection / Zoom 100%
// ============================================================

export function fitAll(padding = 80) {
  if (allCards.length === 0) return;
  const bounds = getCardsBounds(allCards);
  fitBounds(bounds, padding);
}

function fitSelection(padding = 80) {
  const selected = Array.from(selection);
  if (selected.length === 0) return fitAll(padding);
  const bounds = getCardsBounds(selected);
  fitBounds(bounds, padding);
}

function fitBounds(bounds, padding) {
  const { minX, minY, maxX, maxY } = bounds;
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

function zoomTo100() {
  // Zoom to 100% centered on current view center
  const cx = (app.screen.width / 2 - viewport.x) / viewport.scale;
  const cy = (app.screen.height / 2 - viewport.y) / viewport.scale;
  viewport.scale = 1;
  viewport.x = app.screen.width / 2 - cx;
  viewport.y = app.screen.height / 2 - cy;
  applyViewport();
  updateZoomDisplay();
}

function getCardsBounds(cards) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const card of cards) {
    const c = card.container;
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x + card.cardWidth);
    maxY = Math.max(maxY, c.y + card.cardHeight);
  }
  return { minX, minY, maxX, maxY };
}

// ============================================================
// Viewport Culling + Texture Memory Management
// ============================================================

const TEXTURE_UNLOAD_PAD = 1200; // Unload sprite beyond this distance

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

  // Wider zone for texture/sprite management
  const uPad = TEXTURE_UNLOAD_PAD;
  const uvl = (-viewport.x / viewport.scale) - uPad;
  const uvt = (-viewport.y / viewport.scale) - uPad;
  const uvr = ((app.screen.width - viewport.x) / viewport.scale) + uPad;
  const uvb = ((app.screen.height - viewport.y) / viewport.scale) + uPad;

  for (const card of allCards) {
    const c = card.container;
    const w = card.cardWidth || 200;
    const h = card.cardHeight || 200;
    const vis = (c.x + w > vl && c.x < vr && c.y + h > vt && c.y < vb);
    c.visible = vis;
    c.eventMode = vis ? 'static' : 'none';

    // Destroy sprites far off-screen to reduce scene graph size + GPU overhead
    const inTextureZone = (c.x + w > uvl && c.x < uvr && c.y + h > uvt && c.y < uvb);
    if (!inTextureZone && card.sprite && !card._textureUnloaded) {
      card.container.removeChild(card.sprite);
      card.sprite.destroy();
      card.sprite = null;
      card._textureUnloaded = true;
    } else if (inTextureZone && card._textureUnloaded) {
      reloadCardTexture(card);
    }
  }
}

async function reloadCardTexture(card) {
  if (!card._textureUrl || !card._textureUnloaded) return;
  card._textureUnloaded = false; // Prevent duplicate reloads
  try {
    const texture = await Assets.load(card._textureUrl);
    if (!card.container.parent) return; // Card removed during load
    const sprite = new Sprite(texture);
    sprite.width = card.cardWidth - CARD_PADDING * 2;
    sprite.height = card.cardHeight - CARD_PADDING * 2;
    sprite.position.set(CARD_PADDING, CARD_PADDING);
    card.sprite = sprite;
    card.container.addChildAt(sprite, 1); // Between bg and hoverBorder
  } catch (err) {
    card._textureUnloaded = true; // Retry on next cull
  }
}

// ============================================================
// Global Drag Handler
// Handles: card drag, multi-card drag, drag-select rectangle, resize
// ============================================================

function setupGlobalDrag() {
  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;

  window.addEventListener('resize', () => {
    app.stage.hitArea = app.screen;
  });

  app.stage.on('globalpointermove', (e) => {
    if (!dragState) return;

    switch (dragState.type) {
      case 'card': {
        if (dragState.card.locked) break;
        dragState.moved = true;
        const wp = screenToWorld(e.global.x, e.global.y);
        dragState.card.container.x = wp.x - dragState.offset.x;
        dragState.card.container.y = wp.y - dragState.offset.y;
        // Smart alignment snap
        if (!dragState._snapTargets) {
          dragState._snapTargets = getSnapTargets([dragState.card]);
        }
        const snaps = applySnapToCard(dragState.card, dragState._snapTargets);
        drawGuides(snaps.hSnap, snaps.vSnap);
        break;
      }
      case 'multicard': {
        dragState.moved = true;
        const wp = screenToWorld(e.global.x, e.global.y);
        const dx = wp.x - dragState.lastWorld.x;
        const dy = wp.y - dragState.lastWorld.y;
        for (const card of dragState.cards) {
          if (card.locked) continue;
          card.container.x += dx;
          card.container.y += dy;
        }
        dragState.lastWorld = wp;
        break;
      }
      case 'selectRect': {
        dragState.current = { x: e.global.x, y: e.global.y };
        drawSelectRect(dragState.start, dragState.current);
        break;
      }
      case 'resize': {
        dragState.moved = true;
        const wp = screenToWorld(e.global.x, e.global.y);
        handleResize(dragState, wp);
        break;
      }
      case 'drawShape': {
        const wp = screenToWorld(e.global.x, e.global.y);
        dragState.current = wp;
        // Draw preview
        if (dragState.preview) {
          const sx = Math.min(dragState.start.x, wp.x);
          const sy = Math.min(dragState.start.y, wp.y);
          const sw = Math.abs(wp.x - dragState.start.x);
          const sh = Math.abs(wp.y - dragState.start.y);
          dragState.preview.clear();
          drawShapeGraphics(dragState.preview, dragState.shapeType, sw, sh, activeAnnotationColor);
          dragState.preview.position.set(sx, sy);
        }
        break;
      }
    }
  });

  app.stage.on('pointerup', (e) => finishDrag(e));
  app.stage.on('pointerupoutside', (e) => finishDrag(e));

  // Click on empty canvas = start drag-select or deselect
  app.stage.on('pointerdown', (e) => {
    hideCanvasContextMenu();
    if (e.target !== app.stage) return;
    if (spaceDown || currentTool === 'hand') return;

    const shiftKey = e?.data?.originalEvent?.shiftKey;

    if (currentTool === 'text') {
      // Create text annotation at click position
      const wp = screenToWorld(e.global.x, e.global.y);
      const textCard = createTextCard('', wp.x, wp.y, { color: activeAnnotationColor });
      clearSelection();
      setCardSelected(textCard, true);
      setTool('select');
      // Open inline editor immediately
      startTextEdit(textCard);
      return;
    }

    if (SHAPE_TOOLS.has(currentTool)) {
      // Start shape draw drag
      const wp = screenToWorld(e.global.x, e.global.y);
      dragState = {
        type: 'drawShape',
        shapeType: currentTool,
        start: wp,
        current: wp,
        preview: null,
      };
      // Create preview graphics
      const preview = new Graphics();
      preview.zIndex = 9999;
      world.addChild(preview);
      dragState.preview = preview;
      return;
    }

    if (currentTool === 'select') {
      // Start drag-select rectangle
      dragState = {
        type: 'selectRect',
        start: { x: e.global.x, y: e.global.y },
        current: { x: e.global.x, y: e.global.y },
        additive: shiftKey, // Shift = add to existing selection
      };
      selectRectGfx.visible = true;
    }

    if (!shiftKey) {
      clearSelection();
    }
  });
}

function finishDrag(e) {
  if (!dragState) return;
  clearGuides();

  switch (dragState.type) {
    case 'card': {
      const card = dragState.card;
      if (!dragState.moved) {
        handleCardClick(card, e);
      } else {
        // Record move for undo
        pushUndo({
          type: 'move',
          entries: [{
            card,
            from: { x: dragState.startPos.x, y: dragState.startPos.y },
            to: { x: card.container.x, y: card.container.y },
          }],
        });
        card.data.x = card.container.x;
        card.data.y = card.container.y;
        markDirty();
      }
      hideResizeHandles();
      if (selection.size === 1) showResizeHandles(Array.from(selection)[0]);
      break;
    }
    case 'multicard': {
      if (dragState.moved) {
        const entries = dragState.cards.map((card) => ({
          card,
          from: dragState.startPositions.get(card),
          to: { x: card.container.x, y: card.container.y },
        }));
        pushUndo({ type: 'move', entries });
        for (const card of dragState.cards) {
          card.data.x = card.container.x;
          card.data.y = card.container.y;
        }
        markDirty();
      }
      break;
    }
    case 'selectRect': {
      selectRectGfx.visible = false;
      selectRectGfx.clear();
      const rect = getSelectRect(dragState.start, dragState.current);
      if (rect.w > 3 || rect.h > 3) {
        selectCardsInRect(rect, dragState.additive);
      }
      break;
    }
    case 'resize': {
      if (dragState.moved) {
        pushUndo({
          type: 'resize',
          card: dragState.card,
          from: dragState.startDims,
          to: { width: dragState.card.cardWidth, height: dragState.card.cardHeight },
        });
        markDirty();
      }
      break;
    }
    case 'drawShape': {
      // Remove preview
      if (dragState.preview) {
        dragState.preview.destroy();
      }
      // Calculate final dimensions
      const sx = Math.min(dragState.start.x, dragState.current.x);
      const sy = Math.min(dragState.start.y, dragState.current.y);
      const sw = Math.abs(dragState.current.x - dragState.start.x);
      const sh = Math.abs(dragState.current.y - dragState.start.y);
      // Only create shape if dragged enough
      if (sw >= SHAPE_MIN_SIZE || sh >= SHAPE_MIN_SIZE) {
        const shape = createShapeCard(dragState.shapeType, sx, sy, {
          width: Math.max(sw, SHAPE_MIN_SIZE),
          height: Math.max(sh, SHAPE_MIN_SIZE),
          color: activeAnnotationColor,
        });
        clearSelection();
        setCardSelected(shape, true);
      }
      setTool('select');
      break;
    }
  }

  dragState = null;
}

let lastClickCard = null;
let lastClickTime = 0;

function handleCardClick(card, e) {
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
  hideResizeHandles();
  if (selection.size === 1) showResizeHandles(card);
  if (onCardSelectCallback && selection.size === 1) {
    onCardSelectCallback(card);
  }

  // Double-click detection
  const now = Date.now();
  if (lastClickCard === card && now - lastClickTime < 400) {
    if (card.isText) {
      startTextEdit(card);
    } else if (!card.isShape) {
      openLightbox(card);
    }
    lastClickCard = null;
    lastClickTime = 0;
  } else {
    lastClickCard = card;
    lastClickTime = now;
  }
}

// ============================================================
// Drag-Select Rectangle
// ============================================================

function drawSelectRect(start, current) {
  selectRectGfx.clear();
  const x = Math.min(start.x, current.x);
  const y = Math.min(start.y, current.y);
  const w = Math.abs(current.x - start.x);
  const h = Math.abs(current.y - start.y);

  selectRectGfx
    .rect(x, y, w, h)
    .fill({ color: THEME.selectRect, alpha: 0.08 })
    .stroke({ color: THEME.selectRect, width: 1, alpha: 0.5 });
}

function getSelectRect(start, end) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    w: Math.abs(end.x - start.x),
    h: Math.abs(end.y - start.y),
  };
}

function selectCardsInRect(rect, additive) {
  // Convert screen rect to world coordinates
  const wTL = screenToWorld(rect.x, rect.y);
  const wBR = screenToWorld(rect.x + rect.w, rect.y + rect.h);

  if (!additive) clearSelection();

  for (const card of allCards) {
    const cx = card.container.x;
    const cy = card.container.y;
    const cw = card.cardWidth;
    const ch = card.cardHeight;

    // Check if card overlaps with selection rectangle
    if (cx + cw > wTL.x && cx < wBR.x && cy + ch > wTL.y && cy < wBR.y) {
      setCardSelected(card, true);
    }
  }

  if (onCardSelectCallback && selection.size === 1) {
    onCardSelectCallback(Array.from(selection)[0]);
  }
}

// ============================================================
// Resize Handles
// ============================================================

const HANDLE_SIZE = 8;
let resizeHandleGfx = null; // Graphics object for handles
let resizeTarget = null;    // Card being resized

function showResizeHandles(card) {
  hideResizeHandles();
  resizeTarget = card;

  resizeHandleGfx = new Graphics();
  drawResizeHandleGraphics(card);

  // Add handles as a child of the card container so they move with it
  card.container.addChild(resizeHandleGfx);

  // Invisible hit areas for each corner
  const corners = getCornerPositions(card);
  for (const [name, pos] of Object.entries(corners)) {
    const hitArea = new Graphics()
      .rect(pos.x - HANDLE_SIZE, pos.y - HANDLE_SIZE, HANDLE_SIZE * 2, HANDLE_SIZE * 2)
      .fill({ color: 0xffffff, alpha: 0.001 });
    hitArea.eventMode = 'static';
    hitArea.cursor = getResizeCursor(name);
    hitArea.on('pointerdown', (e) => {
      startResize(card, name, e);
      e.stopPropagation();
    });
    card.container.addChild(hitArea);
    if (!card._resizeHitAreas) card._resizeHitAreas = [];
    card._resizeHitAreas.push(hitArea);
  }
}

function hideResizeHandles() {
  if (resizeHandleGfx && resizeTarget) {
    resizeTarget.container.removeChild(resizeHandleGfx);
    resizeHandleGfx.destroy();
    resizeHandleGfx = null;
  }
  if (resizeTarget?._resizeHitAreas) {
    for (const ha of resizeTarget._resizeHitAreas) {
      resizeTarget.container.removeChild(ha);
      ha.destroy();
    }
    resizeTarget._resizeHitAreas = null;
  }
  resizeTarget = null;
}

function drawResizeHandleGraphics(card) {
  if (!resizeHandleGfx) return;
  resizeHandleGfx.clear();
  const corners = getCornerPositions(card);
  for (const pos of Object.values(corners)) {
    resizeHandleGfx
      .rect(pos.x - HANDLE_SIZE / 2, pos.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE)
      .fill({ color: 0xffffff })
      .stroke({ color: THEME.resizeHandle, width: 1.5 });
  }
}

function getCornerPositions(card) {
  return {
    nw: { x: 0, y: 0 },
    ne: { x: card.cardWidth, y: 0 },
    sw: { x: 0, y: card.cardHeight },
    se: { x: card.cardWidth, y: card.cardHeight },
  };
}

function getResizeCursor(corner) {
  if (corner === 'nw' || corner === 'se') return 'nwse-resize';
  return 'nesw-resize';
}

function startResize(card, corner, e) {
  if (card.locked) return;
  const wp = screenToWorld(e.global.x, e.global.y);
  dragState = {
    type: 'resize',
    card,
    corner,
    startWorld: wp,
    startDims: { width: card.cardWidth, height: card.cardHeight },
    moved: false,
  };
}

function handleResize(state, wp) {
  const { card, corner, startWorld, startDims } = state;
  const dx = wp.x - startWorld.x;
  const dy = wp.y - startWorld.y;

  let newW = startDims.width;
  let newH = startDims.height;

  // Calculate new dimensions based on corner
  if (corner === 'se') {
    newW = Math.max(60, startDims.width + dx);
  } else if (corner === 'sw') {
    newW = Math.max(60, startDims.width - dx);
  } else if (corner === 'ne') {
    newW = Math.max(60, startDims.width + dx);
  } else if (corner === 'nw') {
    newW = Math.max(60, startDims.width - dx);
  }

  // Lock aspect ratio
  const aspect = startDims.width / startDims.height;
  newH = newW / aspect;

  // Move origin for nw/ne/sw corners
  if (corner === 'nw') {
    card.container.x = card.container.x + (card.cardWidth - newW);
    card.container.y = card.container.y + (card.cardHeight - newH);
  } else if (corner === 'sw') {
    card.container.x = card.container.x + (card.cardWidth - newW);
  } else if (corner === 'ne') {
    card.container.y = card.container.y + (card.cardHeight - newH);
  }

  resizeCardTo(card, newW, newH);
}

function resizeCardTo(card, w, h) {
  card.cardWidth = w;
  card.cardHeight = h;

  // Resize sprite
  if (card.sprite) {
    card.sprite.width = w - CARD_PADDING * 2;
    card.sprite.height = h - CARD_PADDING * 2;
  }

  // Rebuild background
  if (card.bg) {
    card.bg.clear()
      .roundRect(0, 0, w, h, CARD_RADIUS)
      .fill({ color: THEME.cardBg })
      .stroke({ color: THEME.cardBorder, width: 1 });
  }

  // Rebuild hover border
  if (card.hoverBorder) {
    card.hoverBorder.clear()
      .roundRect(-2, -2, w + 4, h + 4, CARD_RADIUS + 2)
      .stroke({ color: THEME.cardHover, width: 2 });
  }

  // Rebuild selection border
  if (card.selectionBorder) {
    card.selectionBorder.clear()
      .roundRect(-4, -4, w + 8, h + 8, 10)
      .stroke({ color: THEME.selectBorder, width: 2.5 });
  }

  // Update hit area
  card.container.hitArea = new Rectangle(-2, -2, w + 4, h + 4);

  // Update resize handles if visible
  if (resizeTarget === card) {
    drawResizeHandleGraphics(card);
  }
}

// ============================================================
// Selection
// ============================================================

const selection = new Set();

function clearSelection() {
  hideResizeHandles();
  for (const card of selection) {
    setCardSelected(card, false);
  }
  selection.clear();
  updateColorPaletteVisibility();
  updateSelectionInfo();
  updatePropsBar();
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
  updateColorPaletteVisibility();
  updateSelectionInfo();
  updatePropsBar();
}

/** Get current selection. */
export function getSelection() { return selection; }

// ============================================================
// Text Annotations
// ============================================================

const TEXT_DEFAULT_WIDTH = 200;
const TEXT_DEFAULT_HEIGHT = 60;
const TEXT_MIN_WIDTH = 60;
const TEXT_PADDING = 10;

let textEditOverlay = null; // Active HTML editing overlay

function createTextCard(content, x, y, opts = {}) {
  const w = opts.width || TEXT_DEFAULT_WIDTH;
  const h = opts.height || TEXT_DEFAULT_HEIGHT;
  const fontSize = opts.fontSize || 14;
  const color = opts.color != null ? opts.color : null; // null = use theme default
  const id = opts.id || `text-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const card = {
    container: new Container(),
    data: { type: 'text', id, text: content, fontSize, color },
    cardWidth: w,
    cardHeight: h,
    isText: true,
  };

  card.container.eventMode = 'static';
  card.container.cursor = 'pointer';
  card.container.position.set(x, y);

  // Background
  const bg = new Graphics()
    .roundRect(0, 0, w, h, CARD_RADIUS)
    .fill({ color: THEME.cardBg, alpha: 0.7 })
    .stroke({ color: THEME.cardBorder, width: 1 });
  card.bg = bg;

  // Hover border
  const hoverBorder = new Graphics()
    .roundRect(-2, -2, w + 4, h + 4, CARD_RADIUS + 2)
    .stroke({ color: THEME.cardHover, width: 2 });
  hoverBorder.visible = false;
  card.hoverBorder = hoverBorder;

  // PixiJS text
  const textFill = color != null ? '#' + color.toString(16).padStart(6, '0') : THEME.text;
  const textStyle = new TextStyle({
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    fontSize,
    fill: textFill,
    wordWrap: true,
    wordWrapWidth: w - TEXT_PADDING * 2,
    lineHeight: Math.round(fontSize * 1.5),
  });
  const textObj = new Text({ text: content || 'Type here...', style: textStyle });
  textObj.position.set(TEXT_PADDING, TEXT_PADDING);
  textObj.alpha = content ? 1.0 : 0.35;
  card.textObj = textObj;

  card.container.addChild(bg, hoverBorder, textObj);
  card.container.hitArea = new Rectangle(-2, -2, w + 4, h + 4);

  // Hover events
  card.container.on('pointerover', () => {
    if (!selection.has(card)) hoverBorder.visible = true;
  });
  card.container.on('pointerout', () => {
    hoverBorder.visible = false;
  });

  // Drag events (same as image cards)
  card.container.on('pointerdown', (e) => {
    if (spaceDown || currentTool === 'hand') return;
    const wp = screenToWorld(e.global.x, e.global.y);
    if (selection.has(card) && selection.size > 1) {
      const startPositions = new Map();
      for (const c of selection) {
        startPositions.set(c, { x: c.container.x, y: c.container.y });
      }
      dragState = {
        type: 'multicard',
        cards: Array.from(selection),
        startPositions,
        lastWorld: wp,
        moved: false,
      };
    } else {
      dragState = {
        type: 'card',
        card,
        offset: { x: wp.x - card.container.x, y: wp.y - card.container.y },
        startPos: { x: card.container.x, y: card.container.y },
        moved: false,
      };
    }
  });

  world.addChild(card.container);
  allCards.push(card);
  requestCull();
  markDirty();
  return card;
}

/** Auto-size text card height to fit content. */
function autoSizeTextCard(card) {
  if (!card.isText || !card.textObj) return;
  const measuredH = card.textObj.height + TEXT_PADDING * 2;
  const newH = Math.max(TEXT_DEFAULT_HEIGHT, measuredH);
  if (Math.abs(newH - card.cardHeight) < 2) return;
  card.cardHeight = newH;

  card.bg.clear()
    .roundRect(0, 0, card.cardWidth, newH, CARD_RADIUS)
    .fill({ color: THEME.cardBg, alpha: 0.7 })
    .stroke({ color: THEME.cardBorder, width: 1 });
  card.hoverBorder.clear()
    .roundRect(-2, -2, card.cardWidth + 4, newH + 4, CARD_RADIUS + 2)
    .stroke({ color: THEME.cardHover, width: 2 });
  card.container.hitArea = new Rectangle(-2, -2, card.cardWidth + 4, newH + 4);
}

/** Open HTML overlay for inline text editing. */
function startTextEdit(card) {
  if (!card.isText) return;
  if (textEditOverlay) finishTextEdit();

  const canvasEl = app.canvas;
  const canvasRect = canvasEl.getBoundingClientRect();

  // Calculate screen position of the card
  const screenX = card.container.x * viewport.scale + viewport.x + canvasRect.left;
  const screenY = card.container.y * viewport.scale + viewport.y + canvasRect.top;
  const screenW = card.cardWidth * viewport.scale;
  const screenH = Math.max(card.cardHeight * viewport.scale, 40);

  const textarea = document.createElement('textarea');
  textarea.value = card.data.text || '';
  textarea.style.cssText = `
    position: fixed;
    left: ${screenX + TEXT_PADDING * viewport.scale}px;
    top: ${screenY + TEXT_PADDING * viewport.scale}px;
    width: ${screenW - TEXT_PADDING * 2 * viewport.scale}px;
    min-height: ${screenH - TEXT_PADDING * 2 * viewport.scale}px;
    background: transparent;
    border: none;
    outline: none;
    color: ${card.data.color != null ? '#' + card.data.color.toString(16).padStart(6, '0') : 'var(--text)'};
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: ${card.data.fontSize * viewport.scale}px;
    line-height: ${Math.round(card.data.fontSize * 1.5) * viewport.scale}px;
    resize: none;
    z-index: 1000;
    padding: 0;
    margin: 0;
    overflow: hidden;
  `;

  // Hide PixiJS text while editing
  card.textObj.visible = false;

  textarea.addEventListener('keydown', (e) => {
    e.stopPropagation(); // Don't trigger canvas shortcuts
    if (e.key === 'Escape') {
      finishTextEdit();
    }
  });

  textarea.addEventListener('blur', () => {
    finishTextEdit();
  });

  document.body.appendChild(textarea);
  textarea.focus();
  textEditOverlay = { textarea, card };
}

/** Finish inline text editing, apply content back to card. */
function finishTextEdit() {
  if (!textEditOverlay) return;
  const { textarea, card } = textEditOverlay;
  const newText = textarea.value;

  card.data.text = newText;
  card.textObj.text = newText || 'Type here...';
  card.textObj.alpha = newText ? 1.0 : 0.35;
  card.textObj.visible = true;
  autoSizeTextCard(card);

  textarea.remove();
  textEditOverlay = null;
  markDirty();
}

export function addTextCard(content, x, y, opts) {
  return createTextCard(content, x, y, opts);
}

// ============================================================
// Shape Annotations (Rectangle, Ellipse, Line)
// ============================================================

const SHAPE_STROKE_WIDTH = 2;
const SHAPE_DEFAULT_COLOR = 0x4a9eff;
const SHAPE_MIN_SIZE = 10;

/**
 * Create a shape card (rect, ellipse, or line).
 * @param {'rect'|'ellipse'|'line'} shapeType
 * @param {number} x - World X
 * @param {number} y - World Y
 * @param {object} opts - { width, height, color, id }
 */
function createShapeCard(shapeType, x, y, opts = {}) {
  const w = opts.width || 120;
  const h = opts.height || 80;
  const color = opts.color ?? SHAPE_DEFAULT_COLOR;
  const strokeWidth = opts.strokeWidth || SHAPE_STROKE_WIDTH;
  const id = opts.id || `shape-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const card = {
    container: new Container(),
    data: { type: 'shape', id, shapeType, color, strokeWidth },
    cardWidth: w,
    cardHeight: h,
    isShape: true,
  };

  card.container.eventMode = 'static';
  card.container.cursor = 'pointer';
  card.container.position.set(x, y);

  // Shape graphics
  const shapeGfx = new Graphics();
  drawShapeGraphics(shapeGfx, shapeType, w, h, color, strokeWidth);
  card.shapeGfx = shapeGfx;

  // Hover border
  const hoverBorder = new Graphics()
    .roundRect(-4, -4, w + 8, h + 8, 2)
    .stroke({ color: THEME.cardHover, width: 1.5 });
  hoverBorder.visible = false;
  card.hoverBorder = hoverBorder;

  card.container.addChild(shapeGfx, hoverBorder);
  card.container.hitArea = new Rectangle(-4, -4, w + 8, h + 8);

  // Hover events
  card.container.on('pointerover', () => {
    if (!selection.has(card)) hoverBorder.visible = true;
  });
  card.container.on('pointerout', () => {
    hoverBorder.visible = false;
  });

  // Drag events
  card.container.on('pointerdown', (e) => {
    if (spaceDown || currentTool === 'hand') return;
    const wp = screenToWorld(e.global.x, e.global.y);
    if (selection.has(card) && selection.size > 1) {
      const startPositions = new Map();
      for (const c of selection) {
        startPositions.set(c, { x: c.container.x, y: c.container.y });
      }
      dragState = {
        type: 'multicard',
        cards: Array.from(selection),
        startPositions,
        lastWorld: wp,
        moved: false,
      };
    } else {
      dragState = {
        type: 'card',
        card,
        offset: { x: wp.x - card.container.x, y: wp.y - card.container.y },
        startPos: { x: card.container.x, y: card.container.y },
        moved: false,
      };
    }
  });

  world.addChild(card.container);
  allCards.push(card);
  requestCull();
  markDirty();
  return card;
}

function drawShapeGraphics(gfx, shapeType, w, h, color, sw) {
  const strokeW = sw || SHAPE_STROKE_WIDTH;
  gfx.clear();
  if (shapeType === 'rect') {
    gfx.roundRect(0, 0, w, h, 3)
      .stroke({ color, width: strokeW });
  } else if (shapeType === 'ellipse') {
    gfx.ellipse(w / 2, h / 2, w / 2, h / 2)
      .stroke({ color, width: strokeW });
  } else if (shapeType === 'line') {
    gfx.moveTo(0, 0).lineTo(w, h)
      .stroke({ color, width: strokeW });
    // Arrowhead
    const angle = Math.atan2(h, w);
    const arrLen = Math.max(10, strokeW * 5);
    gfx.moveTo(w, h)
      .lineTo(w - arrLen * Math.cos(angle - 0.4), h - arrLen * Math.sin(angle - 0.4))
      .stroke({ color, width: strokeW });
    gfx.moveTo(w, h)
      .lineTo(w - arrLen * Math.cos(angle + 0.4), h - arrLen * Math.sin(angle + 0.4))
      .stroke({ color, width: strokeW });
  }
}

/** Resize a shape card and redraw its graphics. */
function resizeShapeCard(card, w, h) {
  card.cardWidth = w;
  card.cardHeight = h;
  drawShapeGraphics(card.shapeGfx, card.data.shapeType, w, h, card.data.color, card.data.strokeWidth);
  card.hoverBorder.clear()
    .roundRect(-4, -4, w + 8, h + 8, 2)
    .stroke({ color: THEME.cardHover, width: 1.5 });
  card.container.hitArea = new Rectangle(-4, -4, w + 8, h + 8);
}

// ============================================================
// Image Cards
// ============================================================

const CARD_MAX_WIDTH = 220;
const CARD_PADDING = 6;
const CARD_RADIUS = 8;

/**
 * Create a placeholder card (container + bg + events) without loading a texture.
 * Used for instant grid display; texture loaded later via loadTextureIntoCard().
 */
function createPlaceholderCard(imageInfo, x, y) {
  const card = { container: new Container(), data: imageInfo };
  card.container.eventMode = 'static';
  card.container.cursor = 'pointer';
  card.container.position.set(x, y);

  // Estimated dimensions (updated when texture loads)
  const estW = CARD_MAX_WIDTH + CARD_PADDING * 2;
  const estH = Math.round(CARD_MAX_WIDTH * 0.75) + CARD_PADDING * 2;
  card.cardWidth = estW;
  card.cardHeight = estH;

  const bg = new Graphics()
    .roundRect(0, 0, estW, estH, CARD_RADIUS)
    .fill({ color: THEME.cardBg })
    .stroke({ color: THEME.cardBorder, width: 1 });
  card.bg = bg;

  const hoverBorder = new Graphics()
    .roundRect(-2, -2, estW + 4, estH + 4, CARD_RADIUS + 2)
    .stroke({ color: THEME.cardHover, width: 2 });
  hoverBorder.visible = false;
  card.hoverBorder = hoverBorder;

  card.container.addChild(bg, hoverBorder);
  card.container.hitArea = new Rectangle(-2, -2, estW + 4, estH + 4);

  card.container.on('pointerover', () => {
    if (!selection.has(card)) hoverBorder.visible = true;
  });
  card.container.on('pointerout', () => {
    hoverBorder.visible = false;
  });

  card.container.on('pointerdown', (e) => {
    if (spaceDown || currentTool === 'hand') return;

    const wp = screenToWorld(e.global.x, e.global.y);

    if (selection.has(card) && selection.size > 1) {
      const startPositions = new Map();
      for (const c of selection) {
        startPositions.set(c, { x: c.container.x, y: c.container.y });
      }
      dragState = {
        type: 'multicard',
        cards: Array.from(selection),
        startPositions,
        lastWorld: wp,
        moved: false,
      };
    } else {
      dragState = {
        type: 'card',
        card,
        offset: { x: wp.x - card.container.x, y: wp.y - card.container.y },
        startPos: { x: card.container.x, y: card.container.y },
        moved: false,
      };
    }

    const parent = card.container.parent;
    parent.removeChild(card.container);
    parent.addChild(card.container);

    e.stopPropagation();
  });

  // Texture management state
  card.sprite = null;
  card.texture = null;
  card._textureUrl = convertFileSrc(imageInfo.path);
  card._textureUnloaded = false;

  world.addChild(card.container);
  allCards.push(card);
  return card;
}

/**
 * Load texture into an existing placeholder card. Updates sprite, dimensions, and graphics.
 */
async function loadTextureIntoCard(card) {
  try {
    const texture = await Assets.load(card._textureUrl);
    if (!card.container.parent) return; // Card removed during loading

    const aspect = texture.width / texture.height;
    const cardW = Math.min(CARD_MAX_WIDTH, texture.width);
    const cardH = cardW / aspect;

    const sprite = new Sprite(texture);
    sprite.width = cardW;
    sprite.height = cardH;
    sprite.position.set(CARD_PADDING, CARD_PADDING);
    card.sprite = sprite;
    card.texture = texture;
    card._textureUnloaded = false;

    // Insert sprite between bg (index 0) and hoverBorder (index 1)
    card.container.addChildAt(sprite, 1);

    // Resize card to actual texture dimensions
    resizeCardTo(card, cardW + CARD_PADDING * 2, cardH + CARD_PADDING * 2);
  } catch (err) {
    console.warn(`Failed to load image: ${card.data.name}`, err);
  }
}

/**
 * Convenience: create card and load texture in one step.
 * Used by duplicateSelected() and other operations that add individual cards.
 */
export async function addImageCard(imageInfo, x, y) {
  const card = createPlaceholderCard(imageInfo, x, y);
  await loadTextureIntoCard(card);
  return card;
}

function removeCardFromCanvas(card) {
  if (card.container.parent) {
    card.container.parent.removeChild(card.container);
  }
  const idx = allCards.indexOf(card);
  if (idx >= 0) allCards.splice(idx, 1);
  selection.delete(card);
}

// ============================================================
// Card Operations: Delete, Duplicate, Z-Order
// ============================================================

function deleteSelected() {
  if (selection.size === 0) return;
  // Skip locked cards
  const deletable = Array.from(selection).filter(c => !c.locked);
  if (deletable.length === 0) return;
  const entries = deletable.map((card) => ({
    card,
    pos: { x: card.container.x, y: card.container.y },
  }));

  pushUndo({ type: 'delete', entries });

  for (const { card } of entries) {
    removeCardFromCanvas(card);
  }
  hideResizeHandles();
  requestCull();
  markDirty();
  updateColorPaletteVisibility();
}

// Internal clipboard for copy/paste
let clipboard = [];

function copySelected() {
  if (selection.size === 0) return;
  clipboard = Array.from(selection).map(card => ({
    data: { ...card.data },
    x: card.container.x,
    y: card.container.y,
    width: card.cardWidth,
    height: card.cardHeight,
    isText: !!card.isText,
    isShape: !!card.isShape,
    // Preserve text content for text cards
    text: card.isText && card.textObj ? card.textObj.text : undefined,
  }));
}

function pasteFromClipboard() {
  if (clipboard.length === 0) return;
  const offset = 30;
  clearSelection();
  for (const item of clipboard) {
    const nx = item.x + offset;
    const ny = item.y + offset;

    if (item.isText) {
      const newCard = createTextCard(item.text || item.data.text || '', nx, ny, {
        width: item.width,
        height: item.height,
        fontSize: item.data.fontSize,
        color: item.data.color,
      });
      setCardSelected(newCard, true);
    } else if (item.isShape) {
      const newCard = createShapeCard(item.data.shapeType, nx, ny, {
        width: item.width,
        height: item.height,
        color: item.data.color,
        strokeWidth: item.data.strokeWidth,
      });
      setCardSelected(newCard, true);
    } else {
      // Image card
      addImageCard(item.data, nx, ny)
        .then((newCard) => {
          if (newCard) {
            resizeCardTo(newCard, item.width, item.height);
            setCardSelected(newCard, true);
          }
        });
    }
  }
  // Shift clipboard positions so repeated paste offsets further
  clipboard = clipboard.map(item => ({
    ...item,
    x: item.x + offset,
    y: item.y + offset,
  }));
}

function duplicateSelected() {
  if (selection.size === 0) return;
  copySelected();
  pasteFromClipboard();
}

function selectAll() {
  clearSelection();
  for (const card of allCards) {
    setCardSelected(card, true);
  }
  if (selection.size === 1) showResizeHandles(Array.from(selection)[0]);
}

function toggleLockSelected() {
  if (selection.size === 0) return;
  // If any selected item is unlocked, lock all; otherwise unlock all
  const anyUnlocked = Array.from(selection).some(c => !c.locked);
  for (const card of selection) {
    setCardLocked(card, anyUnlocked);
  }
  markDirty();
  updatePropsBar();
}

function setCardLocked(card, locked) {
  card.locked = locked;
  card.data.locked = locked;
  // Show/hide lock indicator (drawn as a small padlock graphic)
  if (locked) {
    if (!card.lockIcon) {
      card.lockIcon = new Graphics();
      drawLockIcon(card.lockIcon);
      card.lockIcon.x = card.cardWidth - 18;
      card.lockIcon.y = 4;
    }
    card.container.addChild(card.lockIcon);
  } else {
    if (card.lockIcon) {
      card.container.removeChild(card.lockIcon);
      card.lockIcon.destroy();
      card.lockIcon = null;
    }
  }
}

function drawLockIcon(g) {
  // 14x14 padlock: body rect + shackle arc
  g.roundRect(1, 7, 12, 7, 1.5)
    .fill({ color: 0x000000, alpha: 0.45 })
    .stroke({ color: 0xffffff, width: 1.5 });
  g.arc(7, 7, 3.5, Math.PI, 0)
    .stroke({ color: 0xffffff, width: 1.5 });
}

export function changeSelectionOpacity(value) {
  for (const card of selection) {
    card.container.alpha = value;
    card.data.opacity = value;
  }
  markDirty();
}

function bringForward() {
  for (const card of selection) {
    const parent = card.container.parent;
    if (parent) {
      parent.removeChild(card.container);
      parent.addChild(card.container);
    }
  }
}

function sendBackward() {
  for (const card of selection) {
    const parent = card.container.parent;
    if (parent) {
      parent.removeChild(card.container);
      parent.addChildAt(card.container, 0);
    }
  }
}

// ============================================================
// Groups
// ============================================================

function groupSelected() {
  if (selection.size < 2) return;
  const cards = new Set(selection);
  const bounds = getCardsBounds(Array.from(cards));
  const pad = 16;

  // Group visual container (rendered behind cards)
  const groupContainer = new Container();
  groupContainer.zIndex = -1;

  // Group border
  const border = new Graphics()
    .roundRect(
      bounds.minX - pad, bounds.minY - pad,
      bounds.maxX - bounds.minX + pad * 2,
      bounds.maxY - bounds.minY + pad * 2,
      12
    )
    .fill({ color: THEME.groupBg, alpha: 0.06 })
    .stroke({ color: THEME.groupBorder, width: 1.5, alpha: 0.4 });

  // Group label
  const label = new Text({
    text: `Group ${allGroups.length + 1}`,
    style: new TextStyle({
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      fontSize: 12,
      fill: THEME.groupBorder,
      fontWeight: '600',
    }),
  });
  label.position.set(bounds.minX - pad + 8, bounds.minY - pad - 18);

  groupContainer.addChild(border, label);
  world.addChild(groupContainer);

  const group = { name: `Group ${allGroups.length + 1}`, cards, container: groupContainer, label, border };
  allGroups.push(group);

  // Mark cards as grouped
  for (const card of cards) {
    card.group = group;
  }
}

function ungroupSelected() {
  const groups = new Set();
  for (const card of selection) {
    if (card.group) groups.add(card.group);
  }

  for (const group of groups) {
    // Remove group visuals
    if (group.container.parent) {
      group.container.parent.removeChild(group.container);
    }
    group.container.destroy({ children: true });

    // Unmark cards
    for (const card of group.cards) {
      card.group = null;
    }

    const idx = allGroups.indexOf(group);
    if (idx >= 0) allGroups.splice(idx, 1);
  }
}

// ============================================================
// Auto-Layout: Tidy Up
// ============================================================

/** Arrange selected cards (or all) in a neat grid. */
export function tidyUp() {
  const cards = selection.size > 1 ? Array.from(selection) : allCards;
  if (cards.length === 0) return;

  // Record positions for undo
  const entries = cards.map((card) => ({
    card,
    from: { x: card.container.x, y: card.container.y },
    to: null, // filled below
  }));

  // Grid layout
  const cols = Math.max(3, Math.ceil(Math.sqrt(cards.length)));
  const gap = 24;
  const startX = cards.length === allCards.length ? 50 : cards[0].container.x;
  const startY = cards.length === allCards.length ? 50 : cards[0].container.y;

  let x = startX, y = startY, col = 0, rowHeight = 0;

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    card.container.x = x;
    card.container.y = y;
    card.data.x = x;
    card.data.y = y;

    entries[i].to = { x, y };

    rowHeight = Math.max(rowHeight, card.cardHeight);
    col++;
    if (col >= cols) {
      col = 0;
      x = startX;
      y += rowHeight + gap;
      rowHeight = 0;
    } else {
      x += card.cardWidth + gap;
    }
  }

  pushUndo({ type: 'move', entries });
  requestCull();
  requestMinimapRedraw();
  markDirty();
}

// ============================================================
// Grid & Minimap Toggles
// ============================================================

function toggleGrid() {
  gridVisible = !gridVisible;
  drawGrid();
}

function toggleMinimap() {
  minimapVisible = !minimapVisible;
  minimapGfx.visible = minimapVisible;
  if (minimapVisible) {
    invalidateMinimapCardCache();
    requestMinimapRedraw();
  }
}

// ============================================================
// Theme Toggle (Dark / Light)
// ============================================================

const DARK_THEME = {
  bg: 0x1a1a2e,
  cardBg: 0x2a2a3e,
  cardBorder: 0x3a3a5e,
  cardHover: 0x4a4a6a,
  selectBorder: 0x4a9eff,
  selectRect: 0x4a9eff,
  groupBorder: 0x7b68ee,
  groupBg: 0x7b68ee,
  gridLine: 0x262640,
  gridLineMajor: 0x303050,
  resizeHandle: 0x4a9eff,
  minimap: { bg: 0x16213e, viewport: 0x4a9eff, card: 0x4a9eff, border: 0x2a2a4a },
  text: '#e0e0e0',
  textDim: '#888899',
};

const LIGHT_THEME = {
  bg: 0xe8e8ef,
  cardBg: 0xffffff,
  cardBorder: 0xd0d0d8,
  cardHover: 0xb0b0c0,
  selectBorder: 0x0066dd,
  selectRect: 0x0066dd,
  groupBorder: 0x7b68ee,
  groupBg: 0x7b68ee,
  gridLine: 0xd0d0d8,
  gridLineMajor: 0xb8b8c8,
  resizeHandle: 0x0066dd,
  minimap: { bg: 0xffffff, viewport: 0x0066dd, card: 0x0066dd, border: 0xd0d0d8 },
  text: '#1a1a2e',
  textDim: '#666680',
};

function applyThemeToCanvas(isDark) {
  const t = isDark ? DARK_THEME : LIGHT_THEME;
  Object.assign(THEME, t);
  THEME.minimap = { ...t.minimap };

  // Update app background
  if (app?.renderer) {
    app.renderer.background.color = THEME.bg;
  }

  // Redraw grid with new colors
  drawGrid();

  // Redraw minimap
  invalidateMinimapCardCache();
  requestMinimapRedraw();
}

function applySystemTheme(isDark) {
  const html = document.documentElement;
  if (isDark) {
    html.removeAttribute('data-theme');
  } else {
    html.setAttribute('data-theme', 'light');
  }
  applyThemeToCanvas(isDark);
}

/**
 * Apply system theme on startup and listen for changes via Tauri API.
 * Follows macOS appearance (dark/light) automatically.
 * @param {import('@tauri-apps/api/window').Window} appWindow - Tauri window instance
 */
export async function applySavedTheme(appWindow) {
  try {
    // Use Tauri native API (works reliably on macOS)
    const initialTheme = await appWindow.theme();
    applySystemTheme(initialTheme === 'dark');

    // Listen for real-time system theme changes
    await appWindow.onThemeChanged(({ payload: theme }) => {
      applySystemTheme(theme === 'dark');
    });
  } catch (err) {
    // Fallback for non-Tauri environments
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
    applySystemTheme(prefersDark.matches);
    prefersDark.addEventListener('change', (e) => applySystemTheme(e.matches));
  }
}

/**
 * Manually set theme override. Use 'system' to follow OS, or 'dark'/'light' to force.
 * Intended for future Settings > General page.
 * @param {'system'|'dark'|'light'} mode
 * @param {import('@tauri-apps/api/window').Window} [appWindow]
 */
export async function setThemeMode(mode, appWindow) {
  if (mode === 'dark') {
    applySystemTheme(true);
  } else if (mode === 'light') {
    applySystemTheme(false);
  } else if (mode === 'system' && appWindow) {
    const theme = await appWindow.theme();
    applySystemTheme(theme === 'dark');
  }
}

// ============================================================
// Color Palette for Annotations
// ============================================================

function updateColorPaletteVisibility() {
  const palette = document.getElementById('color-palette');
  if (!palette) return;
  // Show when an annotation tool is active OR when an annotation is selected
  const toolActive = ANNOTATION_TOOLS.has(currentTool);
  const annotationSelected = currentTool === 'select' && hasAnnotationSelected();
  palette.classList.toggle('visible', toolActive || annotationSelected);
}

function hasAnnotationSelected() {
  for (const card of selection) {
    if (card.isShape || card.isText) return true;
  }
  return false;
}

export function setAnnotationColor(colorHex) {
  activeAnnotationColor = colorHex;
  localStorage.setItem('refboard-annotation-color', '0x' + colorHex.toString(16));
  // Update palette swatch active state
  document.querySelectorAll('.color-swatch').forEach((sw) => {
    const swColor = parseInt(sw.dataset.color, 16);
    sw.classList.toggle('active', swColor === colorHex);
  });
}

export function changeSelectionColor(colorHex) {
  for (const card of selection) {
    if (card.isShape) {
      card.data.color = colorHex;
      drawShapeGraphics(card.shapeGfx, card.data.shapeType, card.cardWidth, card.cardHeight, colorHex);
    } else if (card.isText) {
      const hexStr = '#' + colorHex.toString(16).padStart(6, '0');
      card.data.color = colorHex;
      card.textObj.style.fill = hexStr;
    }
  }
  markDirty();
}

export function changeShapeStrokeWidth(width) {
  for (const card of selection) {
    if (card.isShape) {
      card.data.strokeWidth = width;
      drawShapeGraphics(card.shapeGfx, card.data.shapeType, card.cardWidth, card.cardHeight, card.data.color, width);
    }
  }
  markDirty();
}

export function changeTextFontSize(size) {
  for (const card of selection) {
    if (card.isText && card.textObj) {
      card.data.fontSize = size;
      card.textObj.style.fontSize = size;
      card.textObj.style.lineHeight = Math.round(size * 1.5);
      autoSizeTextCard(card);
    }
  }
  markDirty();
}

export function getAnnotationColor() {
  return activeAnnotationColor;
}

function initColorPalette() {
  const palette = document.getElementById('color-palette');
  if (!palette) return;
  // Restore saved active swatch
  document.querySelectorAll('.color-swatch').forEach((sw) => {
    const swColor = parseInt(sw.dataset.color, 16);
    sw.classList.toggle('active', swColor === activeAnnotationColor);
  });
  palette.addEventListener('click', (e) => {
    const swatch = e.target.closest('.color-swatch');
    if (!swatch) return;
    const color = parseInt(swatch.dataset.color, 16);
    setAnnotationColor(color);
    // If annotations are selected, recolor them immediately
    if (hasAnnotationSelected()) {
      changeSelectionColor(color);
    }
  });
}

// ============================================================
// Properties Bar
// ============================================================

function initPropsBar() {
  const strokeSelect = document.getElementById('props-stroke-width');
  const fontSelect = document.getElementById('props-font-size');
  const opacitySlider = document.getElementById('props-opacity-slider');
  const opacityValue = document.getElementById('props-opacity-value');

  if (strokeSelect) {
    strokeSelect.addEventListener('change', () => {
      changeShapeStrokeWidth(parseFloat(strokeSelect.value));
    });
  }
  if (fontSelect) {
    fontSelect.addEventListener('change', () => {
      changeTextFontSize(parseInt(fontSelect.value, 10));
    });
  }
  if (opacitySlider) {
    opacitySlider.addEventListener('input', () => {
      const pct = parseInt(opacitySlider.value, 10);
      if (opacityValue) opacityValue.textContent = pct + '%';
      changeSelectionOpacity(pct / 100);
    });
  }
}

function updatePropsBar() {
  const bar = document.getElementById('props-bar');
  const strokeGroup = document.getElementById('props-stroke');
  const fontGroup = document.getElementById('props-font');
  const opacityGroup = document.getElementById('props-opacity');
  if (!bar) return;

  let showStroke = false;
  let showFont = false;
  const showOpacity = selection.size > 0;

  if (selection.size > 0) {
    for (const card of selection) {
      if (card.isShape) showStroke = true;
      if (card.isText) showFont = true;
    }
  }

  // Populate current values from first matching selected item
  if (showStroke) {
    const strokeSelect = document.getElementById('props-stroke-width');
    const shapeCard = Array.from(selection).find(c => c.isShape);
    if (strokeSelect && shapeCard) {
      strokeSelect.value = String(shapeCard.data.strokeWidth || SHAPE_STROKE_WIDTH);
    }
  }
  if (showFont) {
    const fontSelect = document.getElementById('props-font-size');
    const textCard = Array.from(selection).find(c => c.isText);
    if (fontSelect && textCard) {
      fontSelect.value = String(textCard.data.fontSize || 14);
    }
  }
  if (showOpacity) {
    const opacitySlider = document.getElementById('props-opacity-slider');
    const opacityValue = document.getElementById('props-opacity-value');
    const firstCard = Array.from(selection)[0];
    const pct = Math.round((firstCard.data.opacity ?? 1) * 100);
    if (opacitySlider) opacitySlider.value = pct;
    if (opacityValue) opacityValue.textContent = pct + '%';
  }

  if (strokeGroup) strokeGroup.style.display = showStroke ? 'flex' : 'none';
  if (fontGroup) fontGroup.style.display = showFont ? 'flex' : 'none';
  if (opacityGroup) opacityGroup.style.display = showOpacity ? 'flex' : 'none';
  bar.classList.toggle('visible', showStroke || showFont || showOpacity);
}

// ============================================================
// Canvas Context Menu
// ============================================================

function showCanvasContextMenu(clientX, clientY) {
  const menu = document.getElementById('canvas-context-menu');
  if (!menu) return;

  // Determine what was right-clicked
  const wp = screenToWorld(
    clientX - app.canvas.getBoundingClientRect().left,
    clientY - app.canvas.getBoundingClientRect().top,
  );
  const clickedCard = findCardAt(wp.x, wp.y);

  // If right-clicked on a card not in selection, select it
  if (clickedCard && !selection.has(clickedCard)) {
    clearSelection();
    setCardSelected(clickedCard, true);
  }

  // Build menu items
  const items = [];
  const sel = Array.from(selection);
  const hasSelection = sel.length > 0;
  const singleImage = sel.length === 1 && !sel[0].isText && !sel[0].isShape;

  if (hasSelection) {
    if (singleImage) {
      items.push({ icon: icon('sparkles', 14), label: 'Analyze with AI', shortcut: '\u2318\u21E7A', action: 'analyze' });
      items.push({ icon: icon('search', 14), label: 'Find Similar', action: 'find-similar' });
      items.push({ icon: icon('globe', 14), label: 'Find More Online', shortcut: '\u2318\u21E7F', action: 'find-online' });
      items.push({ divider: true });
    } else {
      const imageCards = sel.filter(c => !c.isText && !c.isShape);
      if (imageCards.length > 1) {
        items.push({ icon: icon('sparkles', 14), label: `Analyze All (${imageCards.length})`, shortcut: '\u2318\u21E7A', action: 'analyze-batch' });
        items.push({ divider: true });
      }
    }
    items.push({ icon: icon('copy', 14), label: 'Copy', shortcut: '\u2318C', action: 'copy' });
    items.push({ icon: icon('clipboard-paste', 14), label: 'Paste', shortcut: '\u2318V', action: 'paste', disabled: clipboard.length === 0 });
    items.push({ icon: icon('copy-plus', 14), label: 'Duplicate', shortcut: '\u2318D', action: 'duplicate' });
    items.push({ divider: true });
    items.push({ icon: icon('arrow-up-to-line', 14), label: 'Bring to Front', shortcut: '\u2318]', action: 'bring-front' });
    items.push({ icon: icon('arrow-down-to-line', 14), label: 'Send to Back', shortcut: '\u2318[', action: 'send-back' });
    if (sel.length >= 2) {
      items.push({ divider: true });
      items.push({ icon: icon('group', 14), label: 'Group', shortcut: '\u2318G', action: 'group' });
    }
    const anyLocked = sel.some(c => c.locked);
    items.push({ icon: icon(anyLocked ? 'unlock' : 'lock', 14), label: anyLocked ? 'Unlock' : 'Lock', shortcut: '\u2318L', action: 'toggle-lock' });
    items.push({ divider: true });
    items.push({ icon: icon('trash-2', 14), label: 'Delete', shortcut: 'Del', action: 'delete', destructive: true });
  } else {
    if (clipboard.length > 0) {
      items.push({ icon: icon('clipboard-paste', 14), label: 'Paste', shortcut: '\u2318V', action: 'paste' });
      items.push({ divider: true });
    }
    items.push({ icon: icon('maximize', 14), label: 'Fit All', shortcut: '\u21E71', action: 'fit-all' });
    items.push({ icon: icon('scan', 14), label: 'Zoom to 100%', shortcut: '\u23180', action: 'zoom-100' });
    items.push({ divider: true });
    items.push({ icon: icon('grid-3x3', 14), label: `${gridVisible ? 'Hide' : 'Show'} Grid`, shortcut: 'G', action: 'toggle-grid' });
    items.push({ icon: icon('map', 14), label: `${minimapVisible ? 'Hide' : 'Show'} Minimap`, shortcut: 'M', action: 'toggle-minimap' });
    items.push({ divider: true });
    items.push({ icon: icon('layout-grid', 14), label: 'Tidy Up', shortcut: '\u2318\u21E7T', action: 'tidy-up' });
    items.push({ divider: true });
    items.push({ icon: icon('image-down', 14), label: 'Export as PNG', shortcut: '\u2318\u21E7E', action: 'export-png' });
  }

  // Render menu
  menu.innerHTML = items.map((item) => {
    if (item.divider) return '<div class="ctx-divider"></div>';
    const cls = item.destructive ? 'ctx-item destructive' : 'ctx-item';
    const shortcut = item.shortcut ? `<span class="ctx-item-shortcut">${item.shortcut}</span>` : '';
    return `<button class="${cls}" data-action="${item.action}"><span class="ctx-item-icon">${item.icon}</span>${item.label}${shortcut}</button>`;
  }).join('');

  // Position (ensure stays within viewport)
  menu.style.display = 'block';
  const menuRect = menu.getBoundingClientRect();
  const mx = Math.min(clientX, window.innerWidth - menuRect.width - 8);
  const my = Math.min(clientY, window.innerHeight - menuRect.height - 8);
  menu.style.left = mx + 'px';
  menu.style.top = my + 'px';

  // Handle clicks
  const handleClick = (e) => {
    const btn = e.target.closest('.ctx-item');
    if (!btn) return;
    hideCanvasContextMenu();
    handleContextAction(btn.dataset.action);
  };
  menu.addEventListener('click', handleClick, { once: true });

  // Close on outside click or Escape
  const close = (e) => {
    if (e.type === 'keydown' && e.key !== 'Escape') return;
    hideCanvasContextMenu();
    window.removeEventListener('mousedown', close);
    window.removeEventListener('keydown', close);
  };
  // Delay so the current right-click doesn't immediately close it
  requestAnimationFrame(() => {
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
  });
}

function hideCanvasContextMenu() {
  const menu = document.getElementById('canvas-context-menu');
  if (menu) menu.style.display = 'none';
}

function findCardAt(worldX, worldY) {
  // Find the topmost card at the given world position
  for (let i = allCards.length - 1; i >= 0; i--) {
    const card = allCards[i];
    const cx = card.container.x;
    const cy = card.container.y;
    if (worldX >= cx && worldX <= cx + card.cardWidth &&
        worldY >= cy && worldY <= cy + card.cardHeight) {
      return card;
    }
  }
  return null;
}

function handleContextAction(action) {
  switch (action) {
    case 'copy': copySelected(); break;
    case 'paste': pasteFromClipboard(); break;
    case 'delete': deleteSelected(); break;
    case 'duplicate': duplicateSelected(); break;
    case 'bring-front': bringForward(); break;
    case 'send-back': sendBackward(); break;
    case 'group': groupSelected(); break;
    case 'fit-all': fitAll(); break;
    case 'zoom-100': zoomTo100(); break;
    case 'toggle-grid': toggleGrid(); break;
    case 'toggle-minimap': toggleMinimap(); break;
    case 'tidy-up': tidyUp(); break;
    case 'toggle-lock': toggleLockSelected(); break;
    case 'export-png':
      window.dispatchEvent(new CustomEvent('refboard:export-png'));
      break;
    // Cross-module actions: dispatch custom events for main.js to handle
    case 'analyze':
    case 'analyze-batch':
    case 'find-similar':
    case 'find-online':
      window.dispatchEvent(new CustomEvent('refboard:context-action', { detail: { action, cards: Array.from(selection) } }));
      break;
  }
}

// ============================================================
// Smart Alignment Guides
// ============================================================

const SNAP_THRESHOLD = 5; // World-space pixels to snap within
const GUIDE_COLOR = 0xe91e63; // Pink guide lines

function getSnapTargets(excludeCards) {
  const excluded = new Set(excludeCards);
  const hEdges = []; // { pos, type }  — horizontal positions (x values)
  const vEdges = []; // { pos, type }  — vertical positions (y values)
  for (const card of allCards) {
    if (excluded.has(card) || !card.container.visible) continue;
    const x = card.container.x;
    const y = card.container.y;
    const w = card.cardWidth;
    const h = card.cardHeight;
    hEdges.push(x, x + w / 2, x + w);          // left, centerX, right
    vEdges.push(y, y + h / 2, y + h);           // top, centerY, bottom
  }
  return { hEdges, vEdges };
}

function findSnap(value, targets) {
  let best = null;
  let bestDist = SNAP_THRESHOLD + 1;
  for (const t of targets) {
    const dist = Math.abs(value - t);
    if (dist < bestDist) {
      bestDist = dist;
      best = t;
    }
  }
  return best;
}

function applySnapToCard(card, targets) {
  const x = card.container.x;
  const y = card.container.y;
  const w = card.cardWidth;
  const h = card.cardHeight;

  // Check left, center, right against horizontal targets
  const snapLeft = findSnap(x, targets.hEdges);
  const snapCenterX = findSnap(x + w / 2, targets.hEdges);
  const snapRight = findSnap(x + w, targets.hEdges);

  // Pick closest horizontal snap
  let hSnap = null;
  let hSnapDist = SNAP_THRESHOLD + 1;
  if (snapLeft !== null && Math.abs(x - snapLeft) < hSnapDist) {
    hSnap = { target: snapLeft, adjust: snapLeft - x };
    hSnapDist = Math.abs(x - snapLeft);
  }
  if (snapCenterX !== null && Math.abs(x + w / 2 - snapCenterX) < hSnapDist) {
    hSnap = { target: snapCenterX, adjust: snapCenterX - (x + w / 2) };
    hSnapDist = Math.abs(x + w / 2 - snapCenterX);
  }
  if (snapRight !== null && Math.abs(x + w - snapRight) < hSnapDist) {
    hSnap = { target: snapRight, adjust: snapRight - (x + w) };
  }

  // Check top, center, bottom against vertical targets
  const snapTop = findSnap(y, targets.vEdges);
  const snapCenterY = findSnap(y + h / 2, targets.vEdges);
  const snapBottom = findSnap(y + h, targets.vEdges);

  let vSnap = null;
  let vSnapDist = SNAP_THRESHOLD + 1;
  if (snapTop !== null && Math.abs(y - snapTop) < vSnapDist) {
    vSnap = { target: snapTop, adjust: snapTop - y };
    vSnapDist = Math.abs(y - snapTop);
  }
  if (snapCenterY !== null && Math.abs(y + h / 2 - snapCenterY) < vSnapDist) {
    vSnap = { target: snapCenterY, adjust: snapCenterY - (y + h / 2) };
    vSnapDist = Math.abs(y + h / 2 - snapCenterY);
  }
  if (snapBottom !== null && Math.abs(y + h - snapBottom) < vSnapDist) {
    vSnap = { target: snapBottom, adjust: snapBottom - (y + h) };
  }

  // Apply snaps
  if (hSnap) card.container.x += hSnap.adjust;
  if (vSnap) card.container.y += vSnap.adjust;

  return { hSnap, vSnap };
}

function drawGuides(hSnap, vSnap) {
  guideGfx.clear();
  // Determine visible world bounds for drawing full-length lines
  const vp = viewport;
  const worldLeft = -vp.x / vp.scale;
  const worldTop = -vp.y / vp.scale;
  const worldRight = worldLeft + app.screen.width / vp.scale;
  const worldBottom = worldTop + app.screen.height / vp.scale;

  if (hSnap) {
    guideGfx
      .moveTo(hSnap.target, worldTop)
      .lineTo(hSnap.target, worldBottom)
      .stroke({ color: GUIDE_COLOR, width: 1 / vp.scale, alpha: 0.7 });
  }
  if (vSnap) {
    guideGfx
      .moveTo(worldLeft, vSnap.target)
      .lineTo(worldRight, vSnap.target)
      .stroke({ color: GUIDE_COLOR, width: 1 / vp.scale, alpha: 0.7 });
  }
}

function clearGuides() {
  guideGfx.clear();
}

// ============================================================
// Minimap (with card position caching)
// ============================================================

const MINIMAP = { width: 180, height: 120, margin: 12 };

// Cached minimap card data — recomputed only when cards move/resize/delete
let minimapCardCache = null;

function invalidateMinimapCardCache() {
  minimapCardCache = null;
}

let minimapRAF = null;
function requestMinimapRedraw() {
  if (!minimapVisible) return;
  if (minimapRAF) return;
  minimapRAF = requestAnimationFrame(() => {
    drawMinimap();
    minimapRAF = null;
  });
}

function drawMinimap() {
  minimapGfx.clear();
  if (allCards.length === 0) return;

  const mx = app.screen.width - MINIMAP.width - MINIMAP.margin;
  const my = app.screen.height - MINIMAP.height - MINIMAP.margin - 24; // above statusbar

  // Background
  minimapGfx
    .roundRect(mx, my, MINIMAP.width, MINIMAP.height, 6)
    .fill({ color: THEME.minimap.bg, alpha: 0.92 })
    .stroke({ color: THEME.minimap.border, width: 1 });

  // Rebuild card position cache if invalidated
  if (!minimapCardCache) {
    const bounds = getCardsBounds(allCards);
    const worldW = bounds.maxX - bounds.minX;
    const worldH = bounds.maxY - bounds.minY;
    if (worldW === 0 || worldH === 0) return;

    const pad = 8;
    const scaleX = (MINIMAP.width - pad * 2) / worldW;
    const scaleY = (MINIMAP.height - pad * 2) / worldH;
    const ms = Math.min(scaleX, scaleY);

    minimapCardCache = {
      bounds, ms, pad,
      cards: allCards.map(card => ({
        rx: (card.container.x - bounds.minX) * ms,
        ry: (card.container.y - bounds.minY) * ms,
        rw: Math.max(2, card.cardWidth * ms),
        rh: Math.max(2, card.cardHeight * ms),
      })),
    };
  }

  const { bounds, ms, pad } = minimapCardCache;
  const worldW = bounds.maxX - bounds.minX;
  const worldH = bounds.maxY - bounds.minY;
  const ox = mx + pad + ((MINIMAP.width - pad * 2) - worldW * ms) / 2;
  const oy = my + pad + ((MINIMAP.height - pad * 2) - worldH * ms) / 2;

  // Draw cached card positions (no recalculation per card)
  for (const c of minimapCardCache.cards) {
    minimapGfx.rect(ox + c.rx, oy + c.ry, c.rw, c.rh);
  }
  minimapGfx.fill({ color: THEME.minimap.card, alpha: 0.5 });

  // Viewport rectangle (always recalculated — depends on current viewport)
  const vx = ox + (-viewport.x / viewport.scale - bounds.minX) * ms;
  const vy = oy + (-viewport.y / viewport.scale - bounds.minY) * ms;
  const vw = (app.screen.width / viewport.scale) * ms;
  const vh = (app.screen.height / viewport.scale) * ms;

  minimapGfx
    .rect(vx, vy, vw, vh)
    .stroke({ color: THEME.minimap.viewport, width: 1.5, alpha: 0.8 });
}

// ============================================================
// Load Project
// ============================================================

export async function loadProject(dirPath) {
  const images = await invoke('scan_images', { dirPath });
  if (images.length === 0) {
    console.warn('No images found in', dirPath);
    return { loaded: 0, total: 0 };  // Return valid result for empty projects
  }

  const total = images.length;

  // Pre-compute grid positions with estimated card sizes
  const maxCols = Math.max(3, Math.floor(Math.sqrt(total)));
  const gap = 24;
  const estCardW = CARD_MAX_WIDTH + CARD_PADDING * 2;
  const estCardH = Math.round(CARD_MAX_WIDTH * 0.75) + CARD_PADDING * 2;
  const positions = [];
  let x = 50, y = 50, col = 0;

  for (let i = 0; i < total; i++) {
    positions.push({ x, y });
    col++;
    if (col >= maxCols) {
      col = 0;
      x = 50;
      y += estCardH + gap;
    } else {
      x += estCardW + gap;
    }
  }

  // Step 1: Create all placeholder cards instantly (~5ms for 500)
  const cards = [];
  for (let i = 0; i < total; i++) {
    cards.push(createPlaceholderCard(images[i], positions[i].x, positions[i].y));
  }

  // Show the grid layout immediately
  fitAll();
  updateZoomDisplay();
  updateLoadingProgress(0, total);

  // Step 2: Load textures in parallel chunks for progressive display
  const CHUNK_SIZE = 10;
  let loaded = 0;

  for (let i = 0; i < total; i += CHUNK_SIZE) {
    const chunk = cards.slice(i, i + CHUNK_SIZE);
    await Promise.allSettled(chunk.map(card => loadTextureIntoCard(card)));
    loaded = Math.min(i + CHUNK_SIZE, total);
    updateLoadingProgress(loaded, total);
    // Yield to renderer so cards appear progressively
    await new Promise(r => requestAnimationFrame(r));
  }

  requestCull();
  updateItemCount();
  return { loaded: total, total };
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
    if (loaded >= total) loadingEl.style.display = 'none';
  }
}

function updateZoomDisplay() {
  if (zoomEl) zoomEl.textContent = `${Math.round(viewport.scale * 100)}%`;
}

function zoomByStep(direction) {
  // direction: +1 = zoom in, -1 = zoom out
  const factor = 1 + direction * 0.15;
  const newScale = Math.max(viewport.minScale,
    Math.min(viewport.maxScale, viewport.scale * factor));
  // Zoom centered on canvas center
  const cx = app.screen.width / 2;
  const cy = app.screen.height / 2;
  const wx = (cx - viewport.x) / viewport.scale;
  const wy = (cy - viewport.y) / viewport.scale;
  viewport.scale = newScale;
  viewport.x = cx - wx * viewport.scale;
  viewport.y = cy - wy * viewport.scale;
  applyViewport();
  updateZoomDisplay();
}

function initZoomControls() {
  const zoomIn = document.getElementById('zoom-in-btn');
  const zoomOut = document.getElementById('zoom-out-btn');
  const zoomDisplay = document.getElementById('zoom-display');
  if (zoomIn) zoomIn.addEventListener('click', () => zoomByStep(1));
  if (zoomOut) zoomOut.addEventListener('click', () => zoomByStep(-1));
  if (zoomDisplay) zoomDisplay.addEventListener('click', () => zoomTo100());
}

function updateSelectionInfo() {
  const el = document.getElementById('selection-info');
  if (!el) return;
  const count = selection.size;
  if (count === 0) {
    el.textContent = '';
    return;
  }
  if (count > 1) {
    const locked = Array.from(selection).filter(c => c.locked).length;
    el.textContent = `${count} items selected${locked ? ` (${locked} locked)` : ''}`;
    return;
  }
  const card = Array.from(selection)[0];
  const lockTag = card.locked ? ' (locked)' : '';
  if (card.isText) {
    const preview = (card.data.text || 'Empty note').slice(0, 30);
    el.textContent = `Text: "${preview}${card.data.text?.length > 30 ? '...' : ''}"${lockTag}`;
  } else if (card.isShape) {
    const names = { rect: 'Rectangle', ellipse: 'Ellipse', line: 'Line' };
    el.textContent = `${names[card.data.shapeType] || 'Shape'} \u2014 ${Math.round(card.cardWidth)}\u00D7${Math.round(card.cardHeight)}${lockTag}`;
  } else {
    el.textContent = `${card.data.name} \u2014 ${Math.round(card.cardWidth)}\u00D7${Math.round(card.cardHeight)}${lockTag}`;
  }
}

function updateItemCount() {
  const el = document.getElementById('canvas-item-count');
  if (!el) return;
  const images = allCards.filter(c => !c.isText && !c.isShape).length;
  const annotations = allCards.filter(c => c.isText || c.isShape).length;
  const parts = [];
  if (images > 0) parts.push(`${images} image${images !== 1 ? 's' : ''}`);
  if (annotations > 0) parts.push(`${annotations} annotation${annotations !== 1 ? 's' : ''}`);
  el.textContent = parts.length > 0 ? parts.join(', ') : '';
}

// ============================================================
// Selection Callbacks
// ============================================================

let onCardSelectCallback = null;

export function onCardSelect(callback) {
  onCardSelectCallback = callback;
}

export function getAllCards() { return allCards; }

// ============================================================
// Canvas Filtering (from M2)
// ============================================================

let activeFilter = null;

export function applyFilter(matchingPaths) {
  if (!matchingPaths) {
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
      card.container.eventMode = 'static';
    }
  }
}

export function scrollToCard(imagePath) {
  const card = allCards.find((c) => c.data.path === imagePath);
  if (!card) return;
  const cx = card.container.x + (card.cardWidth / 2);
  const cy = card.container.y + (card.cardHeight / 2);
  viewport.x = (app.screen.width / 2) - cx * viewport.scale;
  viewport.y = (app.screen.height / 2) - cy * viewport.scale;
  applyViewport();
  updateZoomDisplay();
  clearSelection();
  setCardSelected(card, true);
  if (onCardSelectCallback) onCardSelectCallback(card);
}

if (typeof window !== 'undefined') {
  window.addEventListener('refboard:scroll-to-card', (e) => {
    if (e.detail?.path) scrollToCard(e.detail.path);
  });
}

// ============================================================
// Image Lightbox
// ============================================================

let lightboxOpen = false;
let lightboxIndex = -1;

function getImageCards() {
  return allCards.filter(c => !c.isText && !c.isShape);
}

function openLightbox(card) {
  const imageCards = getImageCards();
  const idx = imageCards.indexOf(card);
  if (idx < 0) return;

  lightboxIndex = idx;
  lightboxOpen = true;
  showLightboxImage(imageCards[idx]);

  const lb = document.getElementById('lightbox');
  if (lb) {
    lb.classList.add('open');
    requestAnimationFrame(() => lb.classList.add('visible'));
  }
}

function closeLightbox() {
  if (!lightboxOpen) return;
  const lb = document.getElementById('lightbox');
  if (lb) {
    lb.classList.remove('visible');
    setTimeout(() => lb.classList.remove('open'), 200);
  }
  lightboxOpen = false;
  lightboxIndex = -1;
}

function showLightboxImage(card) {
  const img = document.getElementById('lightbox-img');
  const caption = document.getElementById('lightbox-caption');
  if (!img) return;

  img.src = card._textureUrl || convertFileSrc(card.data.path);
  if (caption) {
    const name = card.data.name || card.data.path.split('/').pop();
    caption.textContent = name;
  }

  // Update nav hint with position
  const nav = document.getElementById('lightbox-nav');
  const imageCards = getImageCards();
  if (nav) {
    nav.textContent = `${lightboxIndex + 1} / ${imageCards.length} — ← → Navigate · Esc Close`;
  }
}

function lightboxNav(dir) {
  if (!lightboxOpen) return;
  const imageCards = getImageCards();
  if (imageCards.length === 0) return;

  lightboxIndex = (lightboxIndex + dir + imageCards.length) % imageCards.length;
  showLightboxImage(imageCards[lightboxIndex]);
}

// Wire lightbox events once DOM is ready
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    const lb = document.getElementById('lightbox');
    const closeBtn = document.getElementById('lightbox-close');

    if (lb) {
      lb.addEventListener('click', (e) => {
        // Close if clicking the backdrop (not the image)
        if (e.target === lb) closeLightbox();
      });
    }
    if (closeBtn) {
      closeBtn.addEventListener('click', () => closeLightbox());
    }

    window.addEventListener('keydown', (e) => {
      if (!lightboxOpen) return;
      if (e.key === 'Escape') { closeLightbox(); e.preventDefault(); e.stopPropagation(); return; }
      if (e.key === 'ArrowLeft') { lightboxNav(-1); e.preventDefault(); return; }
      if (e.key === 'ArrowRight') { lightboxNav(1); e.preventDefault(); return; }
    }, true); // Capture phase to intercept before canvas keyboard handler
  });
}

// ============================================================
// Canvas Export to PNG
// ============================================================

export async function exportCanvasPNG() {
  if (allCards.length === 0) return null;

  const PADDING = 40;
  const MAX_DIM = 8192;
  const bounds = getCardsBounds(allCards);
  const bw = bounds.maxX - bounds.minX + PADDING * 2;
  const bh = bounds.maxY - bounds.minY + PADDING * 2;

  // Limit export resolution so canvas doesn't exceed GPU limits
  let res = 1;
  if (bw > MAX_DIM || bh > MAX_DIM) {
    res = Math.min(MAX_DIM / bw, MAX_DIM / bh);
  }

  // Hide overlays and selection borders during export
  const savedGuide = guideGfx.visible;
  guideGfx.visible = false;
  const savedSelections = [];
  for (const card of allCards) {
    if (card.selectionBorder) {
      savedSelections.push({ card, visible: card.selectionBorder.visible });
      card.selectionBorder.visible = false;
    }
  }

  // Save and reset world transform so extract frame matches world coords
  const savedWX = world.x, savedWY = world.y, savedWS = world.scale.x;
  world.x = 0;
  world.y = 0;
  world.scale.set(1);

  // Extract world container with frame covering all cards + padding
  const frame = new Rectangle(
    bounds.minX - PADDING,
    bounds.minY - PADDING,
    bw,
    bh,
  );
  const canvas = app.renderer.extract.canvas({
    target: world,
    frame,
    resolution: res,
    clearColor: document.documentElement.getAttribute('data-theme') === 'light' ? '#f5f5f7' : '#1a1a2e',
  });

  // Convert to PNG bytes
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  const arrayBuffer = await blob.arrayBuffer();
  const pngData = new Uint8Array(arrayBuffer);

  // Restore world transform
  world.x = savedWX;
  world.y = savedWY;
  world.scale.set(savedWS);

  // Restore guide lines and selection borders
  guideGfx.visible = savedGuide;
  for (const { card, visible } of savedSelections) {
    card.selectionBorder.visible = visible;
  }

  return pngData;
}

// ============================================================
// Public API
// ============================================================

export function getViewport() { return viewport; }
export function getCardCount() { return allCards.length; }
export function getApp() { return app; }
export { tidyUp as autoLayout };

// ============================================================
// Board State: Save / Load (Auto-save support)
// ============================================================

let boardDirty = false;
let autoSaveTimer = null;
const AUTO_SAVE_INTERVAL = 30000; // 30 seconds

function markDirty() {
  boardDirty = true;
  invalidateMinimapCardCache();
  updateItemCount();
}

/**
 * Serialize current board state for saving.
 */
export function getBoardState() {
  const items = allCards.filter(c => !c.isText && !c.isShape).map((card) => ({
    path: card.data.path,
    name: card.data.name,
    x: card.container.x,
    y: card.container.y,
    width: card.cardWidth,
    height: card.cardHeight,
    ...(card.locked ? { locked: true } : {}),
    ...(card.data.opacity != null && card.data.opacity !== 1 ? { opacity: card.data.opacity } : {}),
  }));

  const textAnnotations = allCards.filter(c => c.isText).map((card) => ({
    id: card.data.id,
    text: card.data.text,
    fontSize: card.data.fontSize,
    color: card.data.color,
    x: card.container.x,
    y: card.container.y,
    width: card.cardWidth,
    height: card.cardHeight,
    ...(card.locked ? { locked: true } : {}),
    ...(card.data.opacity != null && card.data.opacity !== 1 ? { opacity: card.data.opacity } : {}),
  }));

  const shapeAnnotations = allCards.filter(c => c.isShape).map((card) => ({
    id: card.data.id,
    shapeType: card.data.shapeType,
    color: card.data.color,
    strokeWidth: card.data.strokeWidth,
    x: card.container.x,
    y: card.container.y,
    width: card.cardWidth,
    height: card.cardHeight,
    ...(card.locked ? { locked: true } : {}),
    ...(card.data.opacity != null && card.data.opacity !== 1 ? { opacity: card.data.opacity } : {}),
  }));

  const groups = allGroups.map((g) => ({
    name: g.name,
    cardPaths: Array.from(g.cards).map((c) => (c.isText || c.isShape) ? c.data.id : c.data.path),
  }));

  return {
    version: 2,
    viewport: {
      x: viewport.x,
      y: viewport.y,
      zoom: viewport.scale,
    },
    items,
    textAnnotations,
    shapeAnnotations,
    groups,
  };
}

/**
 * Restore board state: apply saved positions to loaded cards.
 * Call after loadProject has loaded all cards.
 * @param {object} state - Saved board state
 */
export function restoreBoardState(state) {
  if (!state || !state.items) return false;

  const posMap = new Map();
  for (const item of state.items) {
    posMap.set(item.path, item);
  }

  let restored = 0;
  for (const card of allCards) {
    const saved = posMap.get(card.data.path);
    if (saved) {
      card.container.x = saved.x;
      card.container.y = saved.y;
      card.data.x = saved.x;
      card.data.y = saved.y;
      if (saved.width && saved.height) {
        resizeCardTo(card, saved.width, saved.height);
      }
      if (saved.locked) setCardLocked(card, true);
      if (saved.opacity != null && saved.opacity !== 1) {
        card.container.alpha = saved.opacity;
        card.data.opacity = saved.opacity;
      }
      restored++;
    }
  }

  // Restore text annotations
  if (state.textAnnotations && state.textAnnotations.length > 0) {
    for (const t of state.textAnnotations) {
      const card = createTextCard(t.text || '', t.x, t.y, {
        id: t.id,
        fontSize: t.fontSize,
        color: t.color,
        width: t.width,
        height: t.height,
      });
      if (card && t.locked) setCardLocked(card, true);
      if (card && t.opacity != null && t.opacity !== 1) {
        card.container.alpha = t.opacity;
        card.data.opacity = t.opacity;
      }
      restored++;
    }
  }

  // Restore shape annotations
  if (state.shapeAnnotations && state.shapeAnnotations.length > 0) {
    for (const s of state.shapeAnnotations) {
      const card = createShapeCard(s.shapeType, s.x, s.y, {
        id: s.id,
        color: s.color,
        strokeWidth: s.strokeWidth,
        width: s.width,
        height: s.height,
      });
      if (card && s.locked) setCardLocked(card, true);
      if (card && s.opacity != null && s.opacity !== 1) {
        card.container.alpha = s.opacity;
        card.data.opacity = s.opacity;
      }
      restored++;
    }
  }

  // Restore viewport
  if (state.viewport) {
    viewport.x = state.viewport.x || 0;
    viewport.y = state.viewport.y || 0;
    viewport.scale = state.viewport.zoom || 1;
    applyViewport();
    updateZoomDisplay();
  }

  // Restore groups
  if (state.groups && state.groups.length > 0) {
    const cardByKey = new Map();
    for (const card of allCards) {
      const key = (card.isText || card.isShape) ? card.data.id : card.data.path;
      cardByKey.set(key, card);
    }
    for (const g of state.groups) {
      const cards = new Set();
      for (const path of g.cardPaths || []) {
        const card = cardByKey.get(path);
        if (card) cards.add(card);
      }
      if (cards.size >= 2) {
        // Select those cards and create group
        for (const card of cards) selection.add(card);
        groupSelected();
        clearSelection();
        // Rename last group
        const lastGroup = allGroups[allGroups.length - 1];
        if (lastGroup && g.name) {
          lastGroup.name = g.name;
          if (lastGroup.label) lastGroup.label.text = g.name;
        }
      }
    }
  }

  requestCull();
  updateItemCount();
  return restored > 0;
}

/**
 * Start auto-save timer. Call with a save callback.
 * @param {function} saveFn - async function to persist state
 */
export function startAutoSave(saveFn) {
  if (autoSaveTimer) clearInterval(autoSaveTimer);
  autoSaveTimer = setInterval(async () => {
    if (boardDirty && allCards.length > 0) {
      boardDirty = false;
      try {
        await saveFn(getBoardState());
      } catch (err) {
        console.warn('Auto-save failed:', err);
      }
    }
  }, AUTO_SAVE_INTERVAL);
}
