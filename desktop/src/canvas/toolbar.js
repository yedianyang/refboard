// Deco 2.0 — Color Palette, Props Bar, Theme, UI Helpers, Lightbox, Board State, Filtering, Export

import { Rectangle, Graphics, Container, Text, TextStyle } from 'pixi.js';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import {
  state, THEME, DARK_THEME, LIGHT_THEME,
  CARD_MAX_WIDTH, CARD_PADDING, CARD_RADIUS,
  SHAPE_STROKE_WIDTH, SHAPE_TOOLS, ANNOTATION_TOOLS,
  AUTO_SAVE_INTERVAL,
} from './state.js';
import { drawGrid, applyViewport, requestCull, updateZoomDisplay, invalidateMinimapCardCache, requestMinimapRedraw, getCardsBounds, fitAll } from './renderer.js';
import { createPlaceholderCard, loadTextureIntoCard, resizeCardTo, createTextCard, createShapeCard, drawShapeGraphics, autoSizeTextCard, addImageCard } from './cards.js';
import { updateGroupBounds, groupSelected, selectGroup } from './groups.js';
import { clearSelection, setCardSelected, showResizeHandles, hideResizeHandles } from './selection.js';
import { setCardLocked, pushUndo } from './shortcuts.js';

// ============================================================
// Color Palette for Annotations
// ============================================================

export function updateColorPaletteVisibility() {
  const palette = document.getElementById('color-palette');
  if (!palette) return;
  const toolActive = ANNOTATION_TOOLS.has(state.currentTool);
  const annotationSelected = state.currentTool === 'select' && hasAnnotationSelected();
  palette.classList.toggle('visible', toolActive || annotationSelected);
}

export function hasAnnotationSelected() {
  for (const card of state.selection) {
    if (card.isShape || card.isText) return true;
  }
  return false;
}

export function setAnnotationColor(colorHex) {
  state.activeAnnotationColor = colorHex;
  localStorage.setItem('deco-annotation-color', '0x' + colorHex.toString(16));
  document.querySelectorAll('.color-swatch').forEach((sw) => {
    const swColor = parseInt(sw.dataset.color, 16);
    sw.classList.toggle('active', swColor === colorHex);
  });
}

export function changeSelectionColor(colorHex) {
  for (const card of state.selection) {
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
  for (const card of state.selection) {
    if (card.isShape) {
      card.data.strokeWidth = width;
      drawShapeGraphics(card.shapeGfx, card.data.shapeType, card.cardWidth, card.cardHeight, card.data.color, width);
    }
  }
  markDirty();
}

export function changeTextFontSize(size) {
  for (const card of state.selection) {
    if (card.isText && card.textObj) {
      card.data.fontSize = size;
      card.textObj.style.fontSize = size;
      card.textObj.style.lineHeight = Math.round(size * 1.5);
      autoSizeTextCard(card);
    }
  }
  markDirty();
}

export function changeSelectionOpacity(value) {
  for (const card of state.selection) {
    card.container.alpha = value;
    card.data.opacity = value;
  }
  markDirty();
}

export function getAnnotationColor() {
  return state.activeAnnotationColor;
}

export function initColorPalette() {
  const palette = document.getElementById('color-palette');
  if (!palette) return;
  document.querySelectorAll('.color-swatch').forEach((sw) => {
    const swColor = parseInt(sw.dataset.color, 16);
    sw.classList.toggle('active', swColor === state.activeAnnotationColor);
  });
  palette.addEventListener('click', (e) => {
    const swatch = e.target.closest('.color-swatch');
    if (!swatch) return;
    const color = parseInt(swatch.dataset.color, 16);
    setAnnotationColor(color);
    if (hasAnnotationSelected()) {
      changeSelectionColor(color);
    }
  });
}

// ============================================================
// Properties Bar
// ============================================================

export function initPropsBar() {
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

export function updatePropsBar() {
  const bar = document.getElementById('props-bar');
  const strokeGroup = document.getElementById('props-stroke');
  const fontGroup = document.getElementById('props-font');
  const opacityGroup = document.getElementById('props-opacity');
  if (!bar) return;

  let showStroke = false;
  let showFont = false;
  const showOpacity = state.selection.size > 0;

  if (state.selection.size > 0) {
    for (const card of state.selection) {
      if (card.isShape) showStroke = true;
      if (card.isText) showFont = true;
    }
  }

  if (showStroke) {
    const strokeSelect = document.getElementById('props-stroke-width');
    const shapeCard = Array.from(state.selection).find(c => c.isShape);
    if (strokeSelect && shapeCard) {
      strokeSelect.value = String(shapeCard.data.strokeWidth || SHAPE_STROKE_WIDTH);
    }
  }
  if (showFont) {
    const fontSelect = document.getElementById('props-font-size');
    const textCard = Array.from(state.selection).find(c => c.isText);
    if (fontSelect && textCard) {
      fontSelect.value = String(textCard.data.fontSize || 14);
    }
  }
  if (showOpacity) {
    const opacitySlider = document.getElementById('props-opacity-slider');
    const opacityValue = document.getElementById('props-opacity-value');
    const firstCard = Array.from(state.selection)[0];
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
// Tool Setting
// ============================================================

export function setTool(tool) {
  state.currentTool = tool;
  document.querySelectorAll('.sidebar-btn').forEach((btn) => btn.classList.remove('active'));
  const titles = { select: 'Select', hand: 'Hand', text: 'Note', rect: 'Rect', ellipse: 'Ellipse', line: 'Line' };
  const btn = Array.from(document.querySelectorAll('.sidebar-btn'))
    .find((b) => b.title?.startsWith(titles[tool] || ''));
  if (btn) btn.classList.add('active');
  state.app.canvas.style.cursor = tool === 'hand' ? 'grab' : tool === 'text' ? 'text' : SHAPE_TOOLS.has(tool) ? 'crosshair' : 'default';
  updateColorPaletteVisibility();
}

// ============================================================
// Theme Toggle (Dark / Light)
// ============================================================

export function applyThemeToCanvas(isDark) {
  const t = isDark ? DARK_THEME : LIGHT_THEME;
  Object.assign(THEME, t);
  THEME.minimap = { ...t.minimap };

  if (state.app?.renderer) {
    state.app.renderer.background.color = THEME.bg;
  }

  drawGrid();

  invalidateMinimapCardCache();
  requestMinimapRedraw();
}

export function applySystemTheme(isDark) {
  const html = document.documentElement;
  if (isDark) {
    html.removeAttribute('data-theme');
  } else {
    html.setAttribute('data-theme', 'light');
  }
  applyThemeToCanvas(isDark);
}

export async function applySavedTheme(appWindow) {
  try {
    const initialTheme = await appWindow.theme();
    applySystemTheme(initialTheme === 'dark');

    await appWindow.onThemeChanged(({ payload: theme }) => {
      applySystemTheme(theme === 'dark');
    });
  } catch (err) {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
    applySystemTheme(prefersDark.matches);
    prefersDark.addEventListener('change', (e) => applySystemTheme(e.matches));
  }
}

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
// Image Lightbox
// ============================================================

export function getImageCards() {
  return state.allCards.filter(c => !c.isText && !c.isShape);
}

export function openLightbox(card) {
  const imageCards = getImageCards();
  const idx = imageCards.indexOf(card);
  if (idx < 0) return;

  state.lightboxIndex = idx;
  state.lightboxOpen = true;
  showLightboxImage(imageCards[idx]);

  const lb = document.getElementById('lightbox');
  if (lb) {
    lb.classList.add('open');
    requestAnimationFrame(() => lb.classList.add('visible'));
  }
}

export function closeLightbox() {
  if (!state.lightboxOpen) return;
  const lb = document.getElementById('lightbox');
  if (lb) {
    lb.classList.remove('visible');
    setTimeout(() => lb.classList.remove('open'), 200);
  }
  state.lightboxOpen = false;
  state.lightboxIndex = -1;
}

export function showLightboxImage(card) {
  const img = document.getElementById('lightbox-img');
  const caption = document.getElementById('lightbox-caption');
  if (!img) return;

  img.src = card._textureUrl || convertFileSrc(card.data.path);
  if (caption) {
    const name = card.data.name || card.data.path.split('/').pop();
    caption.textContent = name;
  }

  const nav = document.getElementById('lightbox-nav');
  const imageCards = getImageCards();
  if (nav) {
    nav.textContent = `${state.lightboxIndex + 1} / ${imageCards.length} — ← → Navigate · Esc Close`;
  }
}

export function lightboxNav(dir) {
  if (!state.lightboxOpen) return;
  const imageCards = getImageCards();
  if (imageCards.length === 0) return;

  state.lightboxIndex = (state.lightboxIndex + dir + imageCards.length) % imageCards.length;
  showLightboxImage(imageCards[state.lightboxIndex]);
}

// Wire lightbox events once DOM is ready
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    const lb = document.getElementById('lightbox');
    const closeBtn = document.getElementById('lightbox-close');

    if (lb) {
      lb.addEventListener('click', (e) => {
        if (e.target === lb) closeLightbox();
      });
    }
    if (closeBtn) {
      closeBtn.addEventListener('click', () => closeLightbox());
    }

    window.addEventListener('keydown', (e) => {
      if (!state.lightboxOpen) return;
      if (e.key === 'Escape') { closeLightbox(); e.preventDefault(); e.stopPropagation(); return; }
      if (e.key === 'ArrowLeft') { lightboxNav(-1); e.preventDefault(); return; }
      if (e.key === 'ArrowRight') { lightboxNav(1); e.preventDefault(); return; }
    }, true);
  });
}

// ============================================================
// HUD / UI Helpers
// ============================================================

export function updateLoadingProgress(loaded, total) {
  if (state.loadingEl) {
    state.loadingEl.textContent = `Loading images... ${loaded}/${total}`;
    if (loaded >= total) state.loadingEl.style.display = 'none';
  }
}

export function updateSelectionInfo() {
  const el = document.getElementById('selection-info');
  if (!el) return;
  const count = state.selection.size;
  if (count === 0) {
    el.textContent = '';
    return;
  }
  if (count > 1) {
    const locked = Array.from(state.selection).filter(c => c.locked).length;
    el.textContent = `${count} items selected${locked ? ` (${locked} locked)` : ''}`;
    return;
  }
  const card = Array.from(state.selection)[0];
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

export function updateItemCount() {
  const el = document.getElementById('canvas-item-count');
  if (!el) return;
  const images = state.allCards.filter(c => !c.isText && !c.isShape).length;
  const annotations = state.allCards.filter(c => c.isText || c.isShape).length;
  const parts = [];
  if (images > 0) parts.push(`${images} image${images !== 1 ? 's' : ''}`);
  if (annotations > 0) parts.push(`${annotations} annotation${annotations !== 1 ? 's' : ''}`);
  el.textContent = parts.length > 0 ? parts.join(', ') : '';
}

export function setUIElements(elements) {
  state.loadingEl = elements.loading || null;
  state.zoomEl = elements.zoom || null;
}

// ============================================================
// Selection Callbacks
// ============================================================

export function onCardSelect(callback) {
  state.onCardSelectCallback = callback;
}

export function getAllCards() { return state.allCards; }
export function getSelection() { return state.selection; }
export function getViewport() { return state.viewport; }
export function getCardCount() { return state.allCards.length; }
export function getApp() { return state.app; }

// ============================================================
// Canvas Filtering
// ============================================================

export function applyFilter(matchingPaths) {
  if (!matchingPaths) {
    state.activeFilter = null;
    for (const card of state.allCards) {
      card.container.alpha = 1;
      card.container.eventMode = 'static';
    }
    requestCull();
    return;
  }
  state.activeFilter = new Set(matchingPaths);
  for (const card of state.allCards) {
    if (state.activeFilter.has(card.data.path)) {
      card.container.alpha = 1;
      card.container.eventMode = 'static';
    } else {
      card.container.alpha = 0.15;
      card.container.eventMode = 'static';
    }
  }
}

export function scrollToCard(imagePath) {
  const card = state.allCards.find((c) => c.data.path === imagePath);
  if (!card) return;
  const cx = card.container.x + (card.cardWidth / 2);
  const cy = card.container.y + (card.cardHeight / 2);
  state.viewport.x = (state.app.screen.width / 2) - cx * state.viewport.scale;
  state.viewport.y = (state.app.screen.height / 2) - cy * state.viewport.scale;
  applyViewport();
  updateZoomDisplay();
  clearSelection();
  setCardSelected(card, true);
  if (state.onCardSelectCallback) state.onCardSelectCallback(card);
}

if (typeof window !== 'undefined') {
  window.addEventListener('deco:scroll-to-card', (e) => {
    if (e.detail?.path) scrollToCard(e.detail.path);
  });
}

// ============================================================
// Canvas Export to PNG
// ============================================================

export async function exportCanvasPNG() {
  if (state.allCards.length === 0) return null;

  const PADDING = 40;
  const MAX_DIM = 8192;
  const bounds = getCardsBounds(state.allCards);
  const bw = bounds.maxX - bounds.minX + PADDING * 2;
  const bh = bounds.maxY - bounds.minY + PADDING * 2;

  let res = 1;
  if (bw > MAX_DIM || bh > MAX_DIM) {
    res = Math.min(MAX_DIM / bw, MAX_DIM / bh);
  }

  const savedGuide = state.guideGfx.visible;
  state.guideGfx.visible = false;
  const savedSelections = [];
  for (const card of state.allCards) {
    if (card.selectionBorder) {
      savedSelections.push({ card, visible: card.selectionBorder.visible });
      card.selectionBorder.visible = false;
    }
  }

  const savedWX = state.world.x, savedWY = state.world.y, savedWS = state.world.scale.x;
  state.world.x = 0;
  state.world.y = 0;
  state.world.scale.set(1);

  const frame = new Rectangle(
    bounds.minX - PADDING,
    bounds.minY - PADDING,
    bw,
    bh,
  );
  const canvas = state.app.renderer.extract.canvas({
    target: state.world,
    frame,
    resolution: res,
    clearColor: document.documentElement.getAttribute('data-theme') === 'light' ? '#f5f5f7' : '#1a1a2e',
  });

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  const arrayBuffer = await blob.arrayBuffer();
  const pngData = new Uint8Array(arrayBuffer);

  state.world.x = savedWX;
  state.world.y = savedWY;
  state.world.scale.set(savedWS);

  state.guideGfx.visible = savedGuide;
  for (const { card, visible } of savedSelections) {
    card.selectionBorder.visible = visible;
  }

  return pngData;
}

// ============================================================
// Board State: Save / Load
// ============================================================

export function markDirty() {
  state.boardDirty = true;
  invalidateMinimapCardCache();
  updateItemCount();
}

export function getBoardState() {
  const items = state.allCards.filter(c => !c.isText && !c.isShape).map((card) => ({
    path: card.data.path,
    name: card.data.name,
    x: card.container.x,
    y: card.container.y,
    width: card.cardWidth,
    height: card.cardHeight,
    ...(card.locked ? { locked: true } : {}),
    ...(card.data.opacity != null && card.data.opacity !== 1 ? { opacity: card.data.opacity } : {}),
  }));

  const textAnnotations = state.allCards.filter(c => c.isText).map((card) => ({
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

  const shapeAnnotations = state.allCards.filter(c => c.isShape).map((card) => ({
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

  const groups = state.allGroups.map((g) => ({
    name: g.name,
    cardPaths: Array.from(g.cards).map((c) => (c.isText || c.isShape) ? c.data.id : c.data.path),
  }));

  return {
    version: 2,
    viewport: {
      x: state.viewport.x,
      y: state.viewport.y,
      zoom: state.viewport.scale,
    },
    items,
    textAnnotations,
    shapeAnnotations,
    groups,
  };
}

export function restoreBoardState(savedState) {
  if (!savedState || !savedState.items) return false;

  const posMap = new Map();
  for (const item of savedState.items) {
    posMap.set(item.path, item);
  }

  let restored = 0;
  for (const card of state.allCards) {
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

  if (savedState.textAnnotations && savedState.textAnnotations.length > 0) {
    for (const t of savedState.textAnnotations) {
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

  if (savedState.shapeAnnotations && savedState.shapeAnnotations.length > 0) {
    for (const s of savedState.shapeAnnotations) {
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

  if (savedState.viewport) {
    state.viewport.x = savedState.viewport.x || 0;
    state.viewport.y = savedState.viewport.y || 0;
    state.viewport.scale = savedState.viewport.zoom || 1;
    applyViewport();
    updateZoomDisplay();
  }

  if (savedState.groups && savedState.groups.length > 0) {
    const cardByKey = new Map();
    for (const card of state.allCards) {
      const key = (card.isText || card.isShape) ? card.data.id : card.data.path;
      cardByKey.set(key, card);
    }
    for (const g of savedState.groups) {
      const cards = new Set();
      for (const path of g.cardPaths || []) {
        const card = cardByKey.get(path);
        if (card) cards.add(card);
      }
      if (cards.size >= 2) {
        for (const card of cards) state.selection.add(card);
        groupSelected();
        clearSelection();
        const lastGroup = state.allGroups[state.allGroups.length - 1];
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

export function startAutoSave(saveFn) {
  if (state.autoSaveTimer) clearInterval(state.autoSaveTimer);
  state.autoSaveTimer = setInterval(async () => {
    if (state.boardDirty && state.allCards.length > 0) {
      state.boardDirty = false;
      try {
        await saveFn(getBoardState());
      } catch (err) {
        console.warn('Auto-save failed:', err);
      }
    }
  }, AUTO_SAVE_INTERVAL);
}

// ============================================================
// Load Project
// ============================================================

export async function loadProject(dirPath) {
  // Clear previous project's cards, groups, and selection
  for (const card of state.allCards) {
    if (card.texture) {
      card.texture.destroy(true);
      card.texture = null;
    }
    if (card.container.parent) {
      card.container.parent.removeChild(card.container);
    }
    card.container.destroy({ children: true });
  }
  for (const group of state.allGroups) {
    if (group.container?.parent) {
      group.container.parent.removeChild(group.container);
    }
  }
  state.allCards.length = 0;
  state.allGroups.length = 0;
  state.selection.clear();
  state.undoStack.length = 0;
  state.redoStack.length = 0;
  state.clipboard.length = 0;
  state.boardDirty = false;
  state.activeFilter = null;

  const images = await invoke('scan_images', { dirPath });
  if (images.length === 0) {
    console.warn('No images found in', dirPath);
    return { loaded: 0, total: 0 };
  }

  const total = images.length;

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

  const cards = [];
  for (let i = 0; i < total; i++) {
    cards.push(createPlaceholderCard(images[i], positions[i].x, positions[i].y));
  }

  fitAll();
  updateZoomDisplay();
  updateLoadingProgress(0, total);

  const CHUNK_SIZE = 10;
  let loaded = 0;

  for (let i = 0; i < total; i += CHUNK_SIZE) {
    const chunk = cards.slice(i, i + CHUNK_SIZE);
    await Promise.allSettled(chunk.map(card => loadTextureIntoCard(card)));
    loaded = Math.min(i + CHUNK_SIZE, total);
    updateLoadingProgress(loaded, total);
    await new Promise(r => requestAnimationFrame(r));
  }

  requestCull();
  updateItemCount();
  return { loaded: total, total };
}
