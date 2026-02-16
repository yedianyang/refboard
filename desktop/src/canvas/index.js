// Deco 2.0 — PixiJS 8 Infinite Canvas Engine
// M3: Multi-select, resize, undo/redo, groups, auto-layout, minimap, keyboard shortcuts

import { Application, Container, Graphics } from 'pixi.js';
import { state, THEME } from './state.js';
import { drawGrid, setupPanZoom, invalidateMinimapCardCache, requestMinimapRedraw, applyViewport } from './renderer.js';
import { setupKeyboard } from './shortcuts.js';
import { setupGlobalDrag } from './selection.js';
import { initColorPalette, initPropsBar, setTool } from './toolbar.js';
import { initZoomControls } from './renderer.js';
import { showCanvasContextMenu } from './shortcuts.js';

// ============================================================
// Init
// ============================================================

export async function initCanvas(containerEl) {
  state.app = new Application();
  await state.app.init({
    resizeTo: containerEl,
    backgroundColor: THEME.bg,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    preference: 'webgl',
    powerPreference: 'high-performance',
  });
  containerEl.appendChild(state.app.canvas);
  state.app.canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showCanvasContextMenu(e.clientX, e.clientY);
  });

  // Grid layer
  state.gridGfx = new Graphics();
  state.app.stage.addChild(state.gridGfx);

  // World container
  state.world = new Container({ isRenderGroup: true });
  state.world.sortableChildren = true;
  state.app.stage.addChild(state.world);

  // Alignment guide lines (in world space, above cards)
  state.guideGfx = new Graphics();
  state.guideGfx.zIndex = 9998;
  state.world.addChild(state.guideGfx);

  // Drag-select rectangle (on top of world)
  state.selectRectGfx = new Graphics();
  state.selectRectGfx.visible = false;
  state.app.stage.addChild(state.selectRectGfx);

  // Minimap (topmost)
  state.minimapGfx = new Graphics();
  state.minimapGfx.visible = false;
  state.app.stage.addChild(state.minimapGfx);

  setupPanZoom();
  setupKeyboard();
  setupGlobalDrag();
  drawGrid();

  // Redraw grid/minimap on any resize
  const onResize = () => {
    drawGrid();
    state.app.stage.hitArea = state.app.screen;
    invalidateMinimapCardCache();
    requestMinimapRedraw();
  };
  window.addEventListener('resize', onResize);

  // Also observe container size changes (more reliable than window resize)
  const ro = new ResizeObserver(() => {
    if (state.app?.renderer) {
      state.app.resize();
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

  return { app: state.app, world: state.world, viewport: state.viewport };
}

// ============================================================
// Re-exports: Public API
// ============================================================

// renderer.js
export { fitAll, zoomTo100, getCardsBounds, toggleGrid, toggleMinimap } from './renderer.js';

// cards.js
export { addImageCard, addTextCard, createTextCard, createShapeCard, resizeCardTo } from './cards.js';

// groups.js
export { groupSelected, ungroupSelected, updateGroupBounds } from './groups.js';

// selection.js
export { clearSelection, setCardSelected, selectAll, getSelectionScreenBounds } from './selection.js';

// shortcuts.js
export { handleContextAction, tidyUp, undo, redo, deleteSelected, alignSelected, distributeSelected } from './shortcuts.js';
export { tidyUp as autoLayout } from './shortcuts.js';

// toolbar.js
export {
  loadProject,
  setUIElements,
  onCardSelect,
  applyFilter,
  scrollToCard,
  getBoardState,
  restoreBoardState,
  startAutoSave,
  markDirty,
  applySavedTheme,
  setThemeMode,
  exportCanvasPNG,
  getAllCards,
  getSelection,
  getViewport,
  getCardCount,
  getApp,
  setAnnotationColor,
  changeSelectionColor,
  changeShapeStrokeWidth,
  changeTextFontSize,
  changeSelectionOpacity,
  toggleSelectionFill,
  toggleSelectionLineStyle,
  getAnnotationColor,
  openLightbox,
  closeLightbox,
  setTool,
  updateColorPaletteVisibility,
  updatePropsBar,
  updateSelectionInfo,
  updateLoadingProgress,
} from './toolbar.js';
