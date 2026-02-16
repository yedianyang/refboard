// Deco 2.0 — Selection, Drag-Select, Resize Handles, Click Handling, Drag System, Snap Guides

import { Graphics, Rectangle } from 'pixi.js';
import {
  state, THEME,
  HANDLE_SIZE, SNAP_THRESHOLD, GUIDE_COLOR,
  SHAPE_TOOLS, SHAPE_MIN_SIZE,
} from './state.js';
import { screenToWorld, requestCull, getCardsBounds } from './renderer.js';
import { resizeCardTo, drawResizeHandleGraphics, getCornerPositions, createTextCard, createShapeCard, drawShapeGraphics, startTextEdit } from './cards.js';
import { updateGroupBounds, enterGroupEditMode, exitGroupEditMode, selectGroup } from './groups.js';
import { updateColorPaletteVisibility, updatePropsBar, updateSelectionInfo, markDirty, openLightbox, setTool } from './toolbar.js';

// ============================================================
// Selection
// ============================================================

export function clearSelection() {
  hideResizeHandles();
  for (const card of state.selection) {
    setCardSelected(card, false);
  }
  state.selection.clear();
  updateColorPaletteVisibility();
  updateSelectionInfo();
  updatePropsBar();
}

export function setCardSelected(card, selected) {
  if (selected) {
    if (!card.selectionBorder) {
      card.selectionBorder = new Graphics()
        .roundRect(-4, -4, card.cardWidth + 8, card.cardHeight + 8, 10)
        .stroke({ color: THEME.selectBorder, width: 2.5 });
      card.container.addChildAt(card.selectionBorder, 0);
    }
    state.selection.add(card);
  } else {
    if (card.selectionBorder) {
      card.container.removeChild(card.selectionBorder);
      card.selectionBorder.destroy();
      card.selectionBorder = null;
    }
    state.selection.delete(card);
  }
  updateColorPaletteVisibility();
  updateSelectionInfo();
  updatePropsBar();
}

export function selectAll() {
  clearSelection();
  for (const card of state.allCards) {
    setCardSelected(card, true);
  }
  if (state.selection.size === 1) showResizeHandles(Array.from(state.selection)[0]);
}

export function selectCardsInRect(rect, additive) {
  const wTL = screenToWorld(rect.x, rect.y);
  const wBR = screenToWorld(rect.x + rect.w, rect.y + rect.h);

  if (!additive) clearSelection();

  for (const card of state.allCards) {
    const cx = card.container.x;
    const cy = card.container.y;
    const cw = card.cardWidth;
    const ch = card.cardHeight;

    if (cx + cw > wTL.x && cx < wBR.x && cy + ch > wTL.y && cy < wBR.y) {
      setCardSelected(card, true);
    }
  }

  if (state.onCardSelectCallback && state.selection.size === 1) {
    state.onCardSelectCallback(Array.from(state.selection)[0]);
  }
}

// ============================================================
// Drag-Select Rectangle
// ============================================================

export function drawSelectRect(start, current) {
  state.selectRectGfx.clear();
  const x = Math.min(start.x, current.x);
  const y = Math.min(start.y, current.y);
  const w = Math.abs(current.x - start.x);
  const h = Math.abs(current.y - start.y);

  state.selectRectGfx
    .rect(x, y, w, h)
    .fill({ color: THEME.selectRect, alpha: 0.08 })
    .stroke({ color: THEME.selectRect, width: 1, alpha: 0.5 });
}

export function getSelectRect(start, end) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    w: Math.abs(end.x - start.x),
    h: Math.abs(end.y - start.y),
  };
}

// ============================================================
// Resize Handles
// ============================================================

export function showResizeHandles(card) {
  hideResizeHandles();
  state.resizeTarget = card;

  state.resizeHandleGfx = new Graphics();
  drawResizeHandleGraphics(card);

  card.container.addChild(state.resizeHandleGfx);

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

export function hideResizeHandles() {
  if (state.resizeHandleGfx && state.resizeTarget) {
    state.resizeTarget.container.removeChild(state.resizeHandleGfx);
    state.resizeHandleGfx.destroy();
    state.resizeHandleGfx = null;
  }
  if (state.resizeTarget?._resizeHitAreas) {
    for (const ha of state.resizeTarget._resizeHitAreas) {
      state.resizeTarget.container.removeChild(ha);
      ha.destroy();
    }
    state.resizeTarget._resizeHitAreas = null;
  }
  state.resizeTarget = null;
}

export function getResizeCursor(corner) {
  if (corner === 'nw' || corner === 'se') return 'nwse-resize';
  return 'nesw-resize';
}

export function startResize(card, corner, e) {
  if (card.locked) return;
  const wp = screenToWorld(e.global.x, e.global.y);
  state.dragState = {
    type: 'resize',
    card,
    corner,
    startWorld: wp,
    startDims: { width: card.cardWidth, height: card.cardHeight },
    moved: false,
  };
}

export function handleResize(ds, wp) {
  const { card, corner, startWorld, startDims } = ds;
  const dx = wp.x - startWorld.x;
  const dy = wp.y - startWorld.y;

  let newW = startDims.width;
  let newH = startDims.height;

  if (corner === 'se') {
    newW = Math.max(60, startDims.width + dx);
  } else if (corner === 'sw') {
    newW = Math.max(60, startDims.width - dx);
  } else if (corner === 'ne') {
    newW = Math.max(60, startDims.width + dx);
  } else if (corner === 'nw') {
    newW = Math.max(60, startDims.width - dx);
  }

  const aspect = startDims.width / startDims.height;
  newH = newW / aspect;

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

// ============================================================
// Card Click Handler
// ============================================================

export function handleCardClick(card, e) {
  const shiftKey = e?.data?.originalEvent?.shiftKey || e?.nativeEvent?.shiftKey;

  const now = Date.now();
  const isDoubleClick = state.lastClickCard === card && now - state.lastClickTime < 400;

  if (isDoubleClick) {
    state.lastClickCard = null;
    state.lastClickTime = 0;

    if (card.group && state.editingGroup !== card.group) {
      enterGroupEditMode(card.group);
      clearSelection();
      setCardSelected(card, true);
      hideResizeHandles();
      if (state.selection.size === 1) showResizeHandles(card);
      if (state.onCardSelectCallback) state.onCardSelectCallback(card);
      return;
    }

    if (card.isText) {
      startTextEdit(card);
      return;
    }
    if (!card.isShape) {
      openLightbox(card);
      return;
    }
    return;
  }

  state.lastClickCard = card;
  state.lastClickTime = now;

  if (card.group && state.editingGroup !== card.group) {
    if (shiftKey) {
      const allInSel = [...card.group.cards].every(c => state.selection.has(c));
      if (allInSel) {
        for (const c of card.group.cards) setCardSelected(c, false);
      } else {
        for (const c of card.group.cards) setCardSelected(c, true);
      }
    } else {
      selectGroup(card.group);
    }
    hideResizeHandles();
    if (state.onCardSelectCallback && state.selection.size === 1) {
      state.onCardSelectCallback(Array.from(state.selection)[0]);
    }
    return;
  }

  if (shiftKey) {
    if (state.selection.has(card)) {
      setCardSelected(card, false);
    } else {
      setCardSelected(card, true);
    }
  } else {
    clearSelection();
    setCardSelected(card, true);
  }
  hideResizeHandles();
  if (state.selection.size === 1) showResizeHandles(card);
  if (state.onCardSelectCallback && state.selection.size === 1) {
    state.onCardSelectCallback(card);
  }
}

// ============================================================
// Card Drag Start
// ============================================================

export function startCardDrag(card, e) {
  if (state.spaceDown || state.currentTool === 'hand') return;
  const wp = screenToWorld(e.global.x, e.global.y);

  if (card.group && state.editingGroup !== card.group) {
    if (!state.selection.has(card) || ![...card.group.cards].every(c => state.selection.has(c))) {
      clearSelection();
      for (const c of card.group.cards) {
        setCardSelected(c, true);
      }
    }
    const startPositions = new Map();
    for (const c of state.selection) {
      startPositions.set(c, { x: c.container.x, y: c.container.y });
    }
    state.dragState = {
      type: 'multicard',
      cards: Array.from(state.selection),
      startPositions,
      lastWorld: wp,
      moved: false,
    };
    return;
  }

  if (state.selection.has(card) && state.selection.size > 1) {
    const startPositions = new Map();
    for (const c of state.selection) {
      startPositions.set(c, { x: c.container.x, y: c.container.y });
    }
    state.dragState = {
      type: 'multicard',
      cards: Array.from(state.selection),
      startPositions,
      lastWorld: wp,
      moved: false,
    };
  } else {
    state.dragState = {
      type: 'card',
      card,
      offset: { x: wp.x - card.container.x, y: wp.y - card.container.y },
      startPos: { x: card.container.x, y: card.container.y },
      moved: false,
    };
  }
}

// ============================================================
// Global Drag Handler
// ============================================================

export function setupGlobalDrag() {
  state.app.stage.eventMode = 'static';
  state.app.stage.hitArea = state.app.screen;

  window.addEventListener('resize', () => {
    state.app.stage.hitArea = state.app.screen;
  });

  state.app.stage.on('globalpointermove', (e) => {
    if (!state.dragState) return;

    switch (state.dragState.type) {
      case 'card': {
        if (state.dragState.card.locked) break;
        state.dragState.moved = true;
        const wp = screenToWorld(e.global.x, e.global.y);
        state.dragState.card.container.x = wp.x - state.dragState.offset.x;
        state.dragState.card.container.y = wp.y - state.dragState.offset.y;
        if (!state.dragState._snapTargets) {
          state.dragState._snapTargets = getSnapTargets([state.dragState.card]);
        }
        const snaps = applySnapToCard(state.dragState.card, state.dragState._snapTargets);
        drawGuides(snaps.hSnap, snaps.vSnap);
        if (state.dragState.card.group) updateGroupBounds(state.dragState.card.group);
        break;
      }
      case 'multicard': {
        state.dragState.moved = true;
        const wp = screenToWorld(e.global.x, e.global.y);
        const dx = wp.x - state.dragState.lastWorld.x;
        const dy = wp.y - state.dragState.lastWorld.y;
        for (const card of state.dragState.cards) {
          if (card.locked) continue;
          card.container.x += dx;
          card.container.y += dy;
        }
        state.dragState.lastWorld = wp;
        const dragGroups = new Set();
        for (const card of state.dragState.cards) {
          if (card.group) dragGroups.add(card.group);
        }
        for (const group of dragGroups) updateGroupBounds(group);
        break;
      }
      case 'selectRect': {
        state.dragState.current = { x: e.global.x, y: e.global.y };
        drawSelectRect(state.dragState.start, state.dragState.current);
        break;
      }
      case 'resize': {
        state.dragState.moved = true;
        const wp = screenToWorld(e.global.x, e.global.y);
        handleResize(state.dragState, wp);
        if (state.dragState.card.group) updateGroupBounds(state.dragState.card.group);
        break;
      }
      case 'drawShape': {
        const wp = screenToWorld(e.global.x, e.global.y);
        state.dragState.current = wp;
        if (state.dragState.preview) {
          const sx = Math.min(state.dragState.start.x, wp.x);
          const sy = Math.min(state.dragState.start.y, wp.y);
          const sw = Math.abs(wp.x - state.dragState.start.x);
          const sh = Math.abs(wp.y - state.dragState.start.y);
          state.dragState.preview.clear();
          drawShapeGraphics(state.dragState.preview, state.dragState.shapeType, sw, sh, state.activeAnnotationColor);
          state.dragState.preview.position.set(sx, sy);
        }
        break;
      }
    }
  });

  state.app.stage.on('pointerup', (e) => finishDrag(e));
  state.app.stage.on('pointerupoutside', (e) => finishDrag(e));

  state.app.stage.on('pointerdown', (e) => {
    hideCanvasContextMenu();
    if (e.target !== state.app.stage) return;
    if (state.spaceDown || state.currentTool === 'hand') return;

    const shiftKey = e?.data?.originalEvent?.shiftKey;

    if (state.currentTool === 'text') {
      const wp = screenToWorld(e.global.x, e.global.y);
      const textCard = createTextCard('', wp.x, wp.y, { color: state.activeAnnotationColor });
      clearSelection();
      setCardSelected(textCard, true);
      setTool('select');
      startTextEdit(textCard);
      return;
    }

    if (SHAPE_TOOLS.has(state.currentTool)) {
      const wp = screenToWorld(e.global.x, e.global.y);
      state.dragState = {
        type: 'drawShape',
        shapeType: state.currentTool,
        start: wp,
        current: wp,
        preview: null,
      };
      const preview = new Graphics();
      preview.zIndex = 9999;
      state.world.addChild(preview);
      state.dragState.preview = preview;
      return;
    }

    if (state.currentTool === 'select') {
      state.dragState = {
        type: 'selectRect',
        start: { x: e.global.x, y: e.global.y },
        current: { x: e.global.x, y: e.global.y },
        additive: shiftKey,
      };
      state.selectRectGfx.visible = true;
    }

    if (!shiftKey) {
      state.editingGroup = null;
      clearSelection();
    }
  });
}

export function finishDrag(e) {
  if (!state.dragState) return;
  clearGuides();

  switch (state.dragState.type) {
    case 'card': {
      const card = state.dragState.card;
      if (!state.dragState.moved) {
        handleCardClick(card, e);
      } else {
        pushUndo({
          type: 'move',
          entries: [{
            card,
            from: { x: state.dragState.startPos.x, y: state.dragState.startPos.y },
            to: { x: card.container.x, y: card.container.y },
          }],
        });
        card.data.x = card.container.x;
        card.data.y = card.container.y;
        if (card.group) updateGroupBounds(card.group);
        markDirty();
      }
      hideResizeHandles();
      if (state.selection.size === 1) showResizeHandles(Array.from(state.selection)[0]);
      break;
    }
    case 'multicard': {
      if (state.dragState.moved) {
        const entries = state.dragState.cards.map((card) => ({
          card,
          from: state.dragState.startPositions.get(card),
          to: { x: card.container.x, y: card.container.y },
        }));
        pushUndo({ type: 'move', entries });
        const movedGroups = new Set();
        for (const card of state.dragState.cards) {
          card.data.x = card.container.x;
          card.data.y = card.container.y;
          if (card.group) movedGroups.add(card.group);
        }
        for (const group of movedGroups) updateGroupBounds(group);
        markDirty();
      }
      break;
    }
    case 'selectRect': {
      state.selectRectGfx.visible = false;
      state.selectRectGfx.clear();
      const rect = getSelectRect(state.dragState.start, state.dragState.current);
      if (rect.w > 3 || rect.h > 3) {
        selectCardsInRect(rect, state.dragState.additive);
      }
      break;
    }
    case 'resize': {
      if (state.dragState.moved) {
        pushUndo({
          type: 'resize',
          card: state.dragState.card,
          from: state.dragState.startDims,
          to: { width: state.dragState.card.cardWidth, height: state.dragState.card.cardHeight },
        });
        if (state.dragState.card.group) updateGroupBounds(state.dragState.card.group);
        markDirty();
      }
      break;
    }
    case 'drawShape': {
      if (state.dragState.preview) {
        state.dragState.preview.destroy();
      }
      const sx = Math.min(state.dragState.start.x, state.dragState.current.x);
      const sy = Math.min(state.dragState.start.y, state.dragState.current.y);
      const sw = Math.abs(state.dragState.current.x - state.dragState.start.x);
      const sh = Math.abs(state.dragState.current.y - state.dragState.start.y);
      if (sw >= SHAPE_MIN_SIZE || sh >= SHAPE_MIN_SIZE) {
        const shape = createShapeCard(state.dragState.shapeType, sx, sy, {
          width: Math.max(sw, SHAPE_MIN_SIZE),
          height: Math.max(sh, SHAPE_MIN_SIZE),
          color: state.activeAnnotationColor,
        });
        clearSelection();
        setCardSelected(shape, true);
      }
      setTool('select');
      break;
    }
  }

  state.dragState = null;
}

// ============================================================
// Smart Alignment Guides
// ============================================================

export function getSnapTargets(excludeCards) {
  const excluded = new Set(excludeCards);
  const hEdges = [];
  const vEdges = [];
  for (const card of state.allCards) {
    if (excluded.has(card) || !card.container.visible) continue;
    const x = card.container.x;
    const y = card.container.y;
    const w = card.cardWidth;
    const h = card.cardHeight;
    hEdges.push(x, x + w / 2, x + w);
    vEdges.push(y, y + h / 2, y + h);
  }
  return { hEdges, vEdges };
}

export function findSnap(value, targets) {
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

export function applySnapToCard(card, targets) {
  const x = card.container.x;
  const y = card.container.y;
  const w = card.cardWidth;
  const h = card.cardHeight;

  const snapLeft = findSnap(x, targets.hEdges);
  const snapCenterX = findSnap(x + w / 2, targets.hEdges);
  const snapRight = findSnap(x + w, targets.hEdges);

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

  if (hSnap) card.container.x += hSnap.adjust;
  if (vSnap) card.container.y += vSnap.adjust;

  return { hSnap, vSnap };
}

export function drawGuides(hSnap, vSnap) {
  state.guideGfx.clear();
  const vp = state.viewport;
  const worldLeft = -vp.x / vp.scale;
  const worldTop = -vp.y / vp.scale;
  const worldRight = worldLeft + state.app.screen.width / vp.scale;
  const worldBottom = worldTop + state.app.screen.height / vp.scale;

  if (hSnap) {
    state.guideGfx
      .moveTo(hSnap.target, worldTop)
      .lineTo(hSnap.target, worldBottom)
      .stroke({ color: GUIDE_COLOR, width: 1 / vp.scale, alpha: 0.7 });
  }
  if (vSnap) {
    state.guideGfx
      .moveTo(worldLeft, vSnap.target)
      .lineTo(worldRight, vSnap.target)
      .stroke({ color: GUIDE_COLOR, width: 1 / vp.scale, alpha: 0.7 });
  }
}

export function clearGuides() {
  state.guideGfx.clear();
}

// ============================================================
// Selection Screen Bounds (for toolbar positioning)
// ============================================================

export function getSelectionScreenBounds() {
  if (state.selection.size === 0) return null;
  const cards = Array.from(state.selection);
  const bounds = getCardsBounds(cards);
  return {
    left:   bounds.minX * state.viewport.scale + state.viewport.x,
    top:    bounds.minY * state.viewport.scale + state.viewport.y,
    right:  bounds.maxX * state.viewport.scale + state.viewport.x,
    bottom: bounds.maxY * state.viewport.scale + state.viewport.y,
  };
}

// ============================================================
// Undo/Redo (used by finishDrag)
// ============================================================

import { pushUndo } from './shortcuts.js';

// ============================================================
// Context menu hide (used by setupGlobalDrag)
// ============================================================

import { hideCanvasContextMenu } from './shortcuts.js';
