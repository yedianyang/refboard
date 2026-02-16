// Deco 2.0 — Viewport, Pan/Zoom, Grid, Culling, Minimap

import { Assets, Sprite, Graphics } from 'pixi.js';
import { state, THEME, CARD_PADDING, TEXTURE_UNLOAD_PAD, MINIMAP } from './state.js';

// ============================================================
// Grid Background
// ============================================================

export function drawGrid() {
  state.gridGfx.clear();
  if (!state.gridVisible) return;

  const w = state.app.screen.width;
  const h = state.app.screen.height;
  const baseSize = 50;
  let gridSize = baseSize * state.viewport.scale;
  while (gridSize < 20) gridSize *= 5;
  while (gridSize > 200) gridSize /= 5;

  const offsetX = state.viewport.x % gridSize;
  const offsetY = state.viewport.y % gridSize;

  for (let x = offsetX; x <= w; x += gridSize) {
    state.gridGfx.moveTo(x, 0).lineTo(x, h);
  }
  for (let y = offsetY; y <= h; y += gridSize) {
    state.gridGfx.moveTo(0, y).lineTo(w, y);
  }
  state.gridGfx.stroke({ color: THEME.gridLine, width: 0.5, alpha: 0.4 });

  const majorSize = gridSize * 5;
  const majorOffX = state.viewport.x % majorSize;
  const majorOffY = state.viewport.y % majorSize;

  for (let x = majorOffX; x <= w; x += majorSize) {
    state.gridGfx.moveTo(x, 0).lineTo(x, h);
  }
  for (let y = majorOffY; y <= h; y += majorSize) {
    state.gridGfx.moveTo(0, y).lineTo(w, y);
  }
  state.gridGfx.stroke({ color: THEME.gridLineMajor, width: 0.5, alpha: 0.6 });
}

// ============================================================
// Pan & Zoom
// ============================================================

export function applyViewport() {
  state.world.scale.set(state.viewport.scale);
  state.world.position.set(state.viewport.x, state.viewport.y);
  drawGrid();
  requestCull();
  requestMinimapRedraw();
}

export function screenToWorld(sx, sy) {
  return {
    x: (sx - state.viewport.x) / state.viewport.scale,
    y: (sy - state.viewport.y) / state.viewport.scale,
  };
}

export function setupPanZoom() {
  const canvas = state.app.canvas;

  canvas.addEventListener('pointerdown', (e) => {
    if (state.spaceDown || e.button === 1 || state.currentTool === 'hand') {
      state.viewport.isPanning = true;
      state.viewport.lastPointer = { x: e.clientX, y: e.clientY };
      canvas.style.cursor = 'grabbing';
      e.preventDefault();
    }
  });

  window.addEventListener('pointermove', (e) => {
    if (!state.viewport.isPanning) return;
    state.viewport.x += e.clientX - state.viewport.lastPointer.x;
    state.viewport.y += e.clientY - state.viewport.lastPointer.y;
    state.viewport.lastPointer = { x: e.clientX, y: e.clientY };
    applyViewport();
  });

  window.addEventListener('pointerup', () => {
    if (state.viewport.isPanning) {
      state.viewport.isPanning = false;
      canvas.style.cursor = (state.spaceDown || state.currentTool === 'hand') ? 'grab' : 'default';
    }
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const intensity = e.ctrlKey ? 0.02 : 0.08;
    const direction = e.deltaY < 0 ? 1 : -1;
    const factor = 1 + direction * intensity;
    const newScale = Math.max(state.viewport.minScale,
      Math.min(state.viewport.maxScale, state.viewport.scale * factor));

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const wx = (mx - state.viewport.x) / state.viewport.scale;
    const wy = (my - state.viewport.y) / state.viewport.scale;

    state.viewport.scale = newScale;
    state.viewport.x = mx - wx * state.viewport.scale;
    state.viewport.y = my - wy * state.viewport.scale;
    applyViewport();
    updateZoomDisplay();
  }, { passive: false });
}

// ============================================================
// Fit All / Fit Selection / Zoom 100%
// ============================================================

export function fitAll(padding = 80) {
  if (state.allCards.length === 0) return;
  const bounds = getCardsBounds(state.allCards);
  fitBounds(bounds, padding);
}

export function fitSelection(padding = 80) {
  const selected = Array.from(state.selection);
  if (selected.length === 0) return fitAll(padding);
  const bounds = getCardsBounds(selected);
  fitBounds(bounds, padding);
}

export function fitBounds(bounds, padding) {
  const { minX, minY, maxX, maxY } = bounds;
  const bw = maxX - minX;
  const bh = maxY - minY;
  if (bw === 0 || bh === 0) return;

  const sx = (state.app.screen.width - padding * 2) / bw;
  const sy = (state.app.screen.height - padding * 2) / bh;
  state.viewport.scale = Math.min(sx, sy, 1);
  state.viewport.x = (state.app.screen.width - bw * state.viewport.scale) / 2 - minX * state.viewport.scale;
  state.viewport.y = (state.app.screen.height - bh * state.viewport.scale) / 2 - minY * state.viewport.scale;
  applyViewport();
  updateZoomDisplay();
}

export function zoomTo100() {
  const cx = (state.app.screen.width / 2 - state.viewport.x) / state.viewport.scale;
  const cy = (state.app.screen.height / 2 - state.viewport.y) / state.viewport.scale;
  state.viewport.scale = 1;
  state.viewport.x = state.app.screen.width / 2 - cx;
  state.viewport.y = state.app.screen.height / 2 - cy;
  applyViewport();
  updateZoomDisplay();
}

export function zoomByStep(direction) {
  const factor = 1 + direction * 0.15;
  const newScale = Math.max(state.viewport.minScale,
    Math.min(state.viewport.maxScale, state.viewport.scale * factor));
  const cx = state.app.screen.width / 2;
  const cy = state.app.screen.height / 2;
  const wx = (cx - state.viewport.x) / state.viewport.scale;
  const wy = (cy - state.viewport.y) / state.viewport.scale;
  state.viewport.scale = newScale;
  state.viewport.x = cx - wx * state.viewport.scale;
  state.viewport.y = cy - wy * state.viewport.scale;
  applyViewport();
  updateZoomDisplay();
}

export function getCardsBounds(cards) {
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

export function requestCull() {
  if (state.cullRAF) return;
  state.cullRAF = requestAnimationFrame(() => {
    cullCards();
    state.cullRAF = null;
  });
}

export function cullCards() {
  const pad = 300;
  const vl = (-state.viewport.x / state.viewport.scale) - pad;
  const vt = (-state.viewport.y / state.viewport.scale) - pad;
  const vr = ((state.app.screen.width - state.viewport.x) / state.viewport.scale) + pad;
  const vb = ((state.app.screen.height - state.viewport.y) / state.viewport.scale) + pad;

  const uPad = TEXTURE_UNLOAD_PAD;
  const uvl = (-state.viewport.x / state.viewport.scale) - uPad;
  const uvt = (-state.viewport.y / state.viewport.scale) - uPad;
  const uvr = ((state.app.screen.width - state.viewport.x) / state.viewport.scale) + uPad;
  const uvb = ((state.app.screen.height - state.viewport.y) / state.viewport.scale) + uPad;

  for (const card of state.allCards) {
    const c = card.container;
    const w = card.cardWidth || 200;
    const h = card.cardHeight || 200;
    const vis = (c.x + w > vl && c.x < vr && c.y + h > vt && c.y < vb);
    c.visible = vis;
    c.eventMode = vis ? 'static' : 'none';

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

export async function reloadCardTexture(card) {
  if (!card._textureUrl || !card._textureUnloaded) return;
  card._textureUnloaded = false;
  try {
    const texture = await Assets.load(card._textureUrl);
    if (!card.container.parent) return;
    const sprite = new Sprite(texture);
    if (card._originalSpriteWidth) {
      sprite.width = card._originalSpriteWidth;
      sprite.height = card._originalSpriteHeight;
    } else {
      sprite.width = card.cardWidth - CARD_PADDING * 2;
      sprite.height = card.cardHeight - CARD_PADDING * 2;
    }
    sprite.position.set(CARD_PADDING, CARD_PADDING);
    card.sprite = sprite;
    card.container.addChildAt(sprite, 1);
    if (card._frameMask) {
      sprite.mask = card._frameMask;
    }
  } catch (err) {
    card._textureUnloaded = true;
  }
}

// ============================================================
// Grid & Minimap Toggles
// ============================================================

export function toggleGrid() {
  state.gridVisible = !state.gridVisible;
  drawGrid();
}

export function toggleMinimap() {
  state.minimapVisible = !state.minimapVisible;
  state.minimapGfx.visible = state.minimapVisible;
  if (state.minimapVisible) {
    invalidateMinimapCardCache();
    requestMinimapRedraw();
  }
}

// ============================================================
// Minimap (with card position caching)
// ============================================================

export function invalidateMinimapCardCache() {
  state.minimapCardCache = null;
}

export function requestMinimapRedraw() {
  if (!state.minimapVisible) return;
  if (state.minimapRAF) return;
  state.minimapRAF = requestAnimationFrame(() => {
    drawMinimap();
    state.minimapRAF = null;
  });
}

export function drawMinimap() {
  state.minimapGfx.clear();
  if (state.allCards.length === 0) return;

  const mx = state.app.screen.width - MINIMAP.width - MINIMAP.margin;
  const my = state.app.screen.height - MINIMAP.height - MINIMAP.margin - 24;

  state.minimapGfx
    .roundRect(mx, my, MINIMAP.width, MINIMAP.height, 6)
    .fill({ color: THEME.minimap.bg, alpha: 0.92 })
    .stroke({ color: THEME.minimap.border, width: 1 });

  if (!state.minimapCardCache) {
    const bounds = getCardsBounds(state.allCards);
    const worldW = bounds.maxX - bounds.minX;
    const worldH = bounds.maxY - bounds.minY;
    if (worldW === 0 || worldH === 0) return;

    const pad = 8;
    const scaleX = (MINIMAP.width - pad * 2) / worldW;
    const scaleY = (MINIMAP.height - pad * 2) / worldH;
    const ms = Math.min(scaleX, scaleY);

    state.minimapCardCache = {
      bounds, ms, pad,
      cards: state.allCards.map(card => ({
        rx: (card.container.x - bounds.minX) * ms,
        ry: (card.container.y - bounds.minY) * ms,
        rw: Math.max(2, card.cardWidth * ms),
        rh: Math.max(2, card.cardHeight * ms),
      })),
    };
  }

  const { bounds, ms, pad } = state.minimapCardCache;
  const worldW = bounds.maxX - bounds.minX;
  const worldH = bounds.maxY - bounds.minY;
  const ox = mx + pad + ((MINIMAP.width - pad * 2) - worldW * ms) / 2;
  const oy = my + pad + ((MINIMAP.height - pad * 2) - worldH * ms) / 2;

  for (const c of state.minimapCardCache.cards) {
    state.minimapGfx.rect(ox + c.rx, oy + c.ry, c.rw, c.rh);
  }
  state.minimapGfx.fill({ color: THEME.minimap.card, alpha: 0.5 });

  const vx = ox + (-state.viewport.x / state.viewport.scale - bounds.minX) * ms;
  const vy = oy + (-state.viewport.y / state.viewport.scale - bounds.minY) * ms;
  const vw = (state.app.screen.width / state.viewport.scale) * ms;
  const vh = (state.app.screen.height / state.viewport.scale) * ms;

  state.minimapGfx
    .rect(vx, vy, vw, vh)
    .stroke({ color: THEME.minimap.viewport, width: 1.5, alpha: 0.8 });
}

// ============================================================
// HUD / UI Helpers (zoom display, loading progress)
// ============================================================

export function updateZoomDisplay() {
  if (state.zoomEl) state.zoomEl.textContent = `${Math.round(state.viewport.scale * 100)}%`;
}

export function initZoomControls() {
  const zoomIn = document.getElementById('zoom-in-btn');
  const zoomOut = document.getElementById('zoom-out-btn');
  const zoomDisplay = document.getElementById('zoom-display');
  if (zoomIn) zoomIn.addEventListener('click', () => zoomByStep(1));
  if (zoomOut) zoomOut.addEventListener('click', () => zoomByStep(-1));
  if (zoomDisplay) zoomDisplay.addEventListener('click', () => zoomTo100());
}
