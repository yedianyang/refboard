// RefBoard 2.0 — PixiJS 8 Infinite Canvas Engine
// M3: Multi-select, resize, undo/redo, groups, auto-layout, minimap, keyboard shortcuts

import { Application, Container, Sprite, Graphics, Assets, Rectangle, Text, TextStyle } from 'pixi.js';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';

// ============================================================
// State
// ============================================================

let app;
let world;        // World container — holds all canvas content
let gridGfx;      // Grid background graphics
let minimapGfx;   // Minimap overlay graphics
let selectRectGfx; // Drag-select rectangle graphics

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
  app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // Grid layer
  gridGfx = new Graphics();
  app.stage.addChild(gridGfx);

  // World container
  world = new Container({ isRenderGroup: true });
  world.sortableChildren = true;
  app.stage.addChild(world);

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

  window.addEventListener('resize', () => {
    drawGrid();
    app.stage.hitArea = app.screen;
    if (minimapVisible) drawMinimap();
  });

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
  if (minimapVisible) drawMinimap();
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
    // Don't handle shortcuts when typing in inputs
    if (isInputFocused()) return;

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
    if (e.key === 'v' || e.key === 'V') { setTool('select'); return; }
    if (e.key === 'h' || e.key === 'H') { setTool('hand'); return; }
    if (e.key === 'g' && !meta) { toggleGrid(); return; }
    if (e.key === 'm' && !meta) { toggleMinimap(); return; }

    // Edit — Undo/Redo
    if (e.key === 'z' && meta && !e.shiftKey) { undo(); e.preventDefault(); return; }
    if (e.key === 'z' && meta && e.shiftKey) { redo(); e.preventDefault(); return; }
    // (Cmd+Shift+Z on macOS / Ctrl+Y also common)
    if (e.key === 'y' && meta) { redo(); e.preventDefault(); return; }

    // Edit — Selection operations
    if ((e.key === 'Delete' || e.key === 'Backspace') && !meta) { deleteSelected(); return; }
    if (e.key === 'd' && meta) { duplicateSelected(); e.preventDefault(); return; }

    // Edit — Grouping
    if (e.key === 'g' && meta && !e.shiftKey) { groupSelected(); e.preventDefault(); return; }
    if (e.key === 'g' && meta && e.shiftKey) { ungroupSelected(); e.preventDefault(); return; }

    // Edit — Z-order
    if (e.key === ']' && meta) { bringForward(); e.preventDefault(); return; }
    if (e.key === '[' && meta) { sendBackward(); e.preventDefault(); return; }

    // Layout — Tidy up
    if (e.key === 't' && meta && e.shiftKey) { tidyUp(); e.preventDefault(); return; }

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

function setTool(tool) {
  currentTool = tool;
  // Update sidebar button active state
  document.querySelectorAll('.sidebar-btn').forEach((btn) => btn.classList.remove('active'));
  const titles = { select: 'Select', hand: 'Hand' };
  const btn = Array.from(document.querySelectorAll('.sidebar-btn'))
    .find((b) => b.title?.startsWith(titles[tool] || ''));
  if (btn) btn.classList.add('active');
  app.canvas.style.cursor = tool === 'hand' ? 'grab' : 'default';
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
        dragState.moved = true;
        const wp = screenToWorld(e.global.x, e.global.y);
        dragState.card.container.x = wp.x - dragState.offset.x;
        dragState.card.container.y = wp.y - dragState.offset.y;
        break;
      }
      case 'multicard': {
        dragState.moved = true;
        const wp = screenToWorld(e.global.x, e.global.y);
        const dx = wp.x - dragState.lastWorld.x;
        const dy = wp.y - dragState.lastWorld.y;
        for (const card of dragState.cards) {
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
    }
  });

  app.stage.on('pointerup', (e) => finishDrag(e));
  app.stage.on('pointerupoutside', (e) => finishDrag(e));

  // Click on empty canvas = start drag-select or deselect
  app.stage.on('pointerdown', (e) => {
    if (e.target !== app.stage) return;
    if (spaceDown || currentTool === 'hand') return;

    const shiftKey = e?.data?.originalEvent?.shiftKey;

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
  }

  dragState = null;
}

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

/** Get current selection. */
export function getSelection() { return selection; }

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
  card.texture = texture; // Keep reference for aspect ratio

  const bg = new Graphics()
    .roundRect(0, 0, card.cardWidth, card.cardHeight, CARD_RADIUS)
    .fill({ color: THEME.cardBg })
    .stroke({ color: THEME.cardBorder, width: 1 });
  card.bg = bg;

  const hoverBorder = new Graphics()
    .roundRect(-2, -2, card.cardWidth + 4, card.cardHeight + 4, CARD_RADIUS + 2)
    .stroke({ color: THEME.cardHover, width: 2 });
  hoverBorder.visible = false;
  card.hoverBorder = hoverBorder;

  card.container.addChild(bg, sprite, hoverBorder);

  card.container.hitArea = new Rectangle(-2, -2, card.cardWidth + 4, card.cardHeight + 4);

  card.container.on('pointerover', () => {
    if (!selection.has(card)) hoverBorder.visible = true;
  });
  card.container.on('pointerout', () => {
    hoverBorder.visible = false;
  });

  card.container.on('pointerdown', (e) => {
    if (spaceDown || currentTool === 'hand') return;

    const wp = screenToWorld(e.global.x, e.global.y);

    // If clicking on an already-selected card within a multi-selection, drag all
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
  const entries = Array.from(selection).map((card) => ({
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
}

function duplicateSelected() {
  if (selection.size === 0) return;
  const offset = 30;
  const toDuplicate = Array.from(selection);

  clearSelection();

  for (const card of toDuplicate) {
    // Create a duplicate by adding a new card at offset position
    addImageCard(card.data, card.container.x + offset, card.container.y + offset)
      .then((newCard) => {
        if (newCard) {
          resizeCardTo(newCard, card.cardWidth, card.cardHeight);
          setCardSelected(newCard, true);
        }
      });
  }
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
  if (minimapVisible) drawMinimap();
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
  if (minimapVisible) drawMinimap();
}

// ============================================================
// Minimap
// ============================================================

const MINIMAP = { width: 180, height: 120, margin: 12 };

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

  // Calculate world bounds
  const bounds = getCardsBounds(allCards);
  const worldW = bounds.maxX - bounds.minX;
  const worldH = bounds.maxY - bounds.minY;
  if (worldW === 0 || worldH === 0) return;

  // Scale to fit minimap (with padding)
  const pad = 8;
  const scaleX = (MINIMAP.width - pad * 2) / worldW;
  const scaleY = (MINIMAP.height - pad * 2) / worldH;
  const ms = Math.min(scaleX, scaleY);

  const ox = mx + pad + ((MINIMAP.width - pad * 2) - worldW * ms) / 2;
  const oy = my + pad + ((MINIMAP.height - pad * 2) - worldH * ms) / 2;

  // Draw cards as dots/rects
  for (const card of allCards) {
    const cx = ox + (card.container.x - bounds.minX) * ms;
    const cy = oy + (card.container.y - bounds.minY) * ms;
    const cw = Math.max(2, card.cardWidth * ms);
    const ch = Math.max(2, card.cardHeight * ms);
    minimapGfx.rect(cx, cy, cw, ch);
  }
  minimapGfx.fill({ color: THEME.minimap.card, alpha: 0.5 });

  // Draw viewport rectangle
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
    return;
  }

  let x = 50, y = 50, rowHeight = 0, col = 0;
  const maxCols = Math.max(3, Math.floor(Math.sqrt(images.length)));
  const gap = 24;
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
    if (loaded % 5 === 0 || loaded === total) {
      updateLoadingProgress(loaded, total);
    }
  }

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
    if (loaded >= total) loadingEl.style.display = 'none';
  }
}

function updateZoomDisplay() {
  if (zoomEl) zoomEl.textContent = `${Math.round(viewport.scale * 100)}%`;
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
}

/**
 * Serialize current board state for saving.
 */
export function getBoardState() {
  const items = allCards.map((card) => ({
    path: card.data.path,
    name: card.data.name,
    x: card.container.x,
    y: card.container.y,
    width: card.cardWidth,
    height: card.cardHeight,
  }));

  const groups = allGroups.map((g) => ({
    name: g.name,
    cardPaths: Array.from(g.cards).map((c) => c.data.path),
  }));

  return {
    version: 2,
    viewport: {
      x: viewport.x,
      y: viewport.y,
      zoom: viewport.scale,
    },
    items,
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
    const cardByPath = new Map();
    for (const card of allCards) {
      cardByPath.set(card.data.path, card);
    }
    for (const g of state.groups) {
      const cards = new Set();
      for (const path of g.cardPaths || []) {
        const card = cardByPath.get(path);
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
