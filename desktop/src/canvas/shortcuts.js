// RefBoard 2.0 — Keyboard Shortcuts, Context Menu, Undo/Redo, Card Operations

import { Graphics } from 'pixi.js';
import { state, THEME, SHAPE_STROKE_WIDTH, ANNOTATION_TOOLS, MAX_UNDO } from './state.js';
import { screenToWorld, fitAll, fitSelection, zoomTo100, toggleGrid, toggleMinimap, requestCull, requestMinimapRedraw, getCardsBounds } from './renderer.js';
import { resizeCardTo, removeCardFromCanvas, createTextCard, createShapeCard, addImageCard, drawShapeGraphics, autoSizeTextCard } from './cards.js';
import { updateGroupBounds, groupSelected, ungroupSelected, exitGroupEditMode } from './groups.js';
import { clearSelection, setCardSelected, selectAll, showResizeHandles, hideResizeHandles } from './selection.js';
import { updateColorPaletteVisibility, updatePropsBar, markDirty, setTool, changeSelectionColor, changeShapeStrokeWidth, changeTextFontSize, changeSelectionOpacity } from './toolbar.js';
import { icon } from '../icons.js';

// ============================================================
// Undo/Redo
// ============================================================

export function pushUndo(action) {
  state.undoStack.push(action);
  if (state.undoStack.length > MAX_UNDO) state.undoStack.shift();
  state.redoStack.length = 0;
}

export function undo() {
  if (state.undoStack.length === 0) return;
  const action = state.undoStack.pop();
  state.redoStack.push(action);
  applyAction(action, true);
}

export function redo() {
  if (state.redoStack.length === 0) return;
  const action = state.redoStack.pop();
  state.undoStack.push(action);
  applyAction(action, false);
}

export function applyAction(action, isUndo) {
  switch (action.type) {
    case 'move': {
      const affectedGroups = new Set();
      for (const entry of action.entries) {
        const pos = isUndo ? entry.from : entry.to;
        entry.card.container.x = pos.x;
        entry.card.container.y = pos.y;
        entry.card.data.x = pos.x;
        entry.card.data.y = pos.y;
        if (entry.card.group) affectedGroups.add(entry.card.group);
      }
      for (const group of affectedGroups) updateGroupBounds(group);
      break;
    }
    case 'resize': {
      const { card } = action;
      const dims = isUndo ? action.from : action.to;
      resizeCardTo(card, dims.width, dims.height);
      if (card.group) updateGroupBounds(card.group);
      break;
    }
    case 'delete': {
      if (isUndo) {
        for (const entry of action.entries) {
          state.world.addChild(entry.card.container);
          state.allCards.push(entry.card);
        }
      } else {
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
// Keyboard Shortcuts
// ============================================================

export function isInputFocused() {
  const el = document.activeElement;
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

export function setupKeyboard() {
  window.addEventListener('keydown', (e) => {
    if (isInputFocused()) return;
    if (state.lightboxOpen) return;

    const meta = e.metaKey || e.ctrlKey;

    if (e.code === 'Space' && !e.repeat) {
      state.spaceDown = true;
      if (!state.dragState) state.app.canvas.style.cursor = 'grab';
      e.preventDefault();
      return;
    }

    if (e.key === '1' && e.shiftKey && !meta) { fitAll(); return; }
    if (e.key === '2' && e.shiftKey && !meta) { fitSelection(); return; }
    if (e.key === '0' && meta) { zoomTo100(); e.preventDefault(); return; }

    if ((e.key === 'v' || e.key === 'V') && !meta) { setTool('select'); return; }
    if ((e.key === 'h' || e.key === 'H') && !meta) { setTool('hand'); return; }
    if ((e.key === 't' || e.key === 'T') && !meta && !e.shiftKey) { setTool('text'); return; }
    if ((e.key === 'r' || e.key === 'R') && !meta && !e.shiftKey) { setTool('rect'); return; }
    if ((e.key === 'o' || e.key === 'O') && !meta && !e.shiftKey) { setTool('ellipse'); return; }
    if ((e.key === 'l' || e.key === 'L') && !meta && !e.shiftKey) { setTool('line'); return; }
    if (e.key === 'g' && !meta) { toggleGrid(); return; }
    if (e.key === 'm' && !meta) { toggleMinimap(); return; }

    if (e.key === 'z' && meta && !e.shiftKey) { undo(); e.preventDefault(); return; }
    if (e.key === 'z' && meta && e.shiftKey) { redo(); e.preventDefault(); return; }
    if (e.key === 'y' && meta) { redo(); e.preventDefault(); return; }

    if (e.key === 'c' && meta && !e.shiftKey) { copySelected(); e.preventDefault(); return; }
    if (e.key === 'v' && meta && !e.shiftKey && state.clipboard.length > 0) { pasteFromClipboard(); e.preventDefault(); return; }

    if (e.key === 'a' && meta) { selectAll(); e.preventDefault(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && !meta) { deleteSelected(); return; }
    if (e.key === 'd' && meta) { duplicateSelected(); e.preventDefault(); return; }

    if (e.key === 'g' && meta && !e.shiftKey) { groupSelected(); e.preventDefault(); return; }
    if (e.key === 'u' && meta && e.shiftKey) { ungroupSelected(); e.preventDefault(); return; }

    if (e.key === 'l' && meta && !e.shiftKey) { toggleLockSelected(); e.preventDefault(); return; }

    if (e.key === ']' && meta) { bringForward(); e.preventDefault(); return; }
    if (e.key === '[' && meta) { sendBackward(); e.preventDefault(); return; }

    if (e.key === 't' && meta && e.shiftKey) { tidyUp(); e.preventDefault(); return; }

    if (e.key === 'e' && meta && e.shiftKey) {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('refboard:export-png'));
      return;
    }

    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && !meta) {
      if (state.selection.size === 0) return;
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      const nudgedGroups = new Set();
      for (const card of state.selection) {
        if (card.locked) continue;
        card.container.x += dx;
        card.container.y += dy;
        card.data.x = card.container.x;
        card.data.y = card.container.y;
        if (card.group) nudgedGroups.add(card.group);
      }
      for (const group of nudgedGroups) updateGroupBounds(group);
      markDirty();
      return;
    }

    if (e.key === 'Escape') {
      if (state.editingGroup) {
        exitGroupEditMode();
      } else {
        clearSelection();
      }
      return;
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      state.spaceDown = false;
      if (!state.dragState) state.app.canvas.style.cursor = state.currentTool === 'hand' ? 'grab' : 'default';
    }
  });
}

// ============================================================
// Card Operations: Delete, Duplicate, Z-Order
// ============================================================

export function deleteSelected() {
  if (state.selection.size === 0) return;
  const deletable = Array.from(state.selection).filter(c => !c.locked);
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

export function copySelected() {
  if (state.selection.size === 0) return;
  state.clipboard = Array.from(state.selection).map(card => ({
    data: { ...card.data },
    x: card.container.x,
    y: card.container.y,
    width: card.cardWidth,
    height: card.cardHeight,
    isText: !!card.isText,
    isShape: !!card.isShape,
    text: card.isText && card.textObj ? card.textObj.text : undefined,
  }));
}

export function pasteFromClipboard() {
  if (state.clipboard.length === 0) return;
  const offset = 30;
  clearSelection();
  for (const item of state.clipboard) {
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
      addImageCard(item.data, nx, ny)
        .then((newCard) => {
          if (newCard) {
            resizeCardTo(newCard, item.width, item.height);
            setCardSelected(newCard, true);
          }
        });
    }
  }
  state.clipboard = state.clipboard.map(item => ({
    ...item,
    x: item.x + offset,
    y: item.y + offset,
  }));
}

export function duplicateSelected() {
  if (state.selection.size === 0) return;
  copySelected();
  pasteFromClipboard();
}

export function toggleLockSelected() {
  if (state.selection.size === 0) return;
  const anyUnlocked = Array.from(state.selection).some(c => !c.locked);
  for (const card of state.selection) {
    setCardLocked(card, anyUnlocked);
  }
  markDirty();
  updatePropsBar();
}

export function setCardLocked(card, locked) {
  card.locked = locked;
  card.data.locked = locked;
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

export function drawLockIcon(g) {
  g.roundRect(1, 7, 12, 7, 1.5)
    .fill({ color: 0x000000, alpha: 0.45 })
    .stroke({ color: 0xffffff, width: 1.5 });
  g.arc(7, 7, 3.5, Math.PI, 0)
    .stroke({ color: 0xffffff, width: 1.5 });
}

export function bringForward() {
  for (const card of state.selection) {
    const parent = card.container.parent;
    if (parent) {
      parent.removeChild(card.container);
      parent.addChild(card.container);
    }
  }
}

export function sendBackward() {
  for (const card of state.selection) {
    const parent = card.container.parent;
    if (parent) {
      parent.removeChild(card.container);
      parent.addChildAt(card.container, 0);
    }
  }
}

// ============================================================
// Alignment & Distribution
// ============================================================

export function alignSelected(direction) {
  const cards = Array.from(state.selection);
  if (cards.length < 2) return;
  const bounds = getCardsBounds(cards);

  for (const card of cards) {
    switch (direction) {
      case 'left':   card.container.x = bounds.minX; break;
      case 'center': card.container.x = bounds.minX + (bounds.maxX - bounds.minX) / 2 - card.cardWidth / 2; break;
      case 'right':  card.container.x = bounds.maxX - card.cardWidth; break;
      case 'top':    card.container.y = bounds.minY; break;
      case 'middle': card.container.y = bounds.minY + (bounds.maxY - bounds.minY) / 2 - card.cardHeight / 2; break;
      case 'bottom': card.container.y = bounds.maxY - card.cardHeight; break;
    }
    card.data.x = card.container.x;
    card.data.y = card.container.y;
  }
  const alignGroups = new Set();
  for (const card of cards) { if (card.group) alignGroups.add(card.group); }
  for (const group of alignGroups) updateGroupBounds(group);
  markDirty();
}

export function distributeSelected(axis) {
  const cards = Array.from(state.selection);
  if (cards.length < 3) return;

  if (axis === 'h') {
    cards.sort((a, b) => a.container.x - b.container.x);
    const first = cards[0].container.x;
    const last = cards[cards.length - 1].container.x;
    const step = (last - first) / (cards.length - 1);
    cards.forEach((card, i) => {
      card.container.x = first + step * i;
      card.data.x = card.container.x;
    });
  } else {
    cards.sort((a, b) => a.container.y - b.container.y);
    const first = cards[0].container.y;
    const last = cards[cards.length - 1].container.y;
    const step = (last - first) / (cards.length - 1);
    cards.forEach((card, i) => {
      card.container.y = first + step * i;
      card.data.y = card.container.y;
    });
  }
  const distGroups = new Set();
  for (const card of cards) { if (card.group) distGroups.add(card.group); }
  for (const group of distGroups) updateGroupBounds(group);
  markDirty();
}

// ============================================================
// Auto-Layout: Tidy Up
// ============================================================

export function tidyUp() {
  const cards = state.selection.size > 1 ? Array.from(state.selection) : state.allCards;
  if (cards.length === 0) return;

  const entries = cards.map((card) => ({
    card,
    from: { x: card.container.x, y: card.container.y },
    to: null,
  }));

  const cols = Math.max(3, Math.ceil(Math.sqrt(cards.length)));
  const gap = 24;
  const startX = cards.length === state.allCards.length ? 50 : cards[0].container.x;
  const startY = cards.length === state.allCards.length ? 50 : cards[0].container.y;

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
  const tidyGroups = new Set();
  for (const card of cards) {
    if (card.group) tidyGroups.add(card.group);
  }
  for (const group of tidyGroups) updateGroupBounds(group);
  requestCull();
  requestMinimapRedraw();
  markDirty();
}

// ============================================================
// Canvas Context Menu
// ============================================================

export function showCanvasContextMenu(clientX, clientY) {
  const menu = document.getElementById('canvas-context-menu');
  if (!menu) return;

  const wp = screenToWorld(
    clientX - state.app.canvas.getBoundingClientRect().left,
    clientY - state.app.canvas.getBoundingClientRect().top,
  );
  const clickedCard = findCardAt(wp.x, wp.y);

  if (clickedCard && !state.selection.has(clickedCard)) {
    clearSelection();
    setCardSelected(clickedCard, true);
  }

  const items = [];
  const sel = Array.from(state.selection);
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
    items.push({ icon: icon('clipboard-paste', 14), label: 'Paste', shortcut: '\u2318V', action: 'paste', disabled: state.clipboard.length === 0 });
    items.push({ icon: icon('copy-plus', 14), label: 'Duplicate', shortcut: '\u2318D', action: 'duplicate' });
    items.push({ divider: true });
    items.push({ icon: icon('arrow-up-to-line', 14), label: 'Bring to Front', shortcut: '\u2318]', action: 'bring-front' });
    items.push({ icon: icon('arrow-down-to-line', 14), label: 'Send to Back', shortcut: '\u2318[', action: 'send-back' });
    if (sel.length >= 2) {
      items.push({ divider: true });
      items.push({ icon: icon('group', 14), label: 'Group', shortcut: '\u2318G', action: 'group' });
    }
    const anyGrouped = sel.some(c => c.group);
    if (anyGrouped) {
      items.push({ icon: icon('ungroup', 14), label: 'Ungroup', shortcut: '\u2318\u21E7U', action: 'ungroup' });
    }
    const anyLocked = sel.some(c => c.locked);
    items.push({ icon: icon(anyLocked ? 'unlock' : 'lock', 14), label: anyLocked ? 'Unlock' : 'Lock', shortcut: '\u2318L', action: 'toggle-lock' });
    items.push({ divider: true });
    items.push({ icon: icon('trash-2', 14), label: 'Delete', shortcut: 'Del', action: 'delete', destructive: true });
  } else {
    if (state.clipboard.length > 0) {
      items.push({ icon: icon('clipboard-paste', 14), label: 'Paste', shortcut: '\u2318V', action: 'paste' });
      items.push({ divider: true });
    }
    items.push({ icon: icon('maximize', 14), label: 'Fit All', shortcut: '\u21E71', action: 'fit-all' });
    items.push({ icon: icon('scan', 14), label: 'Zoom to 100%', shortcut: '\u23180', action: 'zoom-100' });
    items.push({ divider: true });
    items.push({ icon: icon('grid-3x3', 14), label: `${state.gridVisible ? 'Hide' : 'Show'} Grid`, shortcut: 'G', action: 'toggle-grid' });
    items.push({ icon: icon('map', 14), label: `${state.minimapVisible ? 'Hide' : 'Show'} Minimap`, shortcut: 'M', action: 'toggle-minimap' });
    items.push({ divider: true });
    items.push({ icon: icon('layout-grid', 14), label: 'Tidy Up', shortcut: '\u2318\u21E7T', action: 'tidy-up' });
    items.push({ divider: true });
    items.push({ icon: icon('image-down', 14), label: 'Export as PNG', shortcut: '\u2318\u21E7E', action: 'export-png' });
  }

  menu.innerHTML = items.map((item) => {
    if (item.divider) return '<div class="ctx-divider"></div>';
    const cls = item.destructive ? 'ctx-item destructive' : 'ctx-item';
    const shortcut = item.shortcut ? `<span class="ctx-item-shortcut">${item.shortcut}</span>` : '';
    return `<button class="${cls}" data-action="${item.action}"><span class="ctx-item-icon">${item.icon}</span>${item.label}${shortcut}</button>`;
  }).join('');

  menu.style.display = 'block';
  const menuRect = menu.getBoundingClientRect();
  const mx = Math.min(clientX, window.innerWidth - menuRect.width - 8);
  const my = Math.min(clientY, window.innerHeight - menuRect.height - 8);
  menu.style.left = mx + 'px';
  menu.style.top = my + 'px';

  const handleClick = (e) => {
    const btn = e.target.closest('.ctx-item');
    if (!btn) return;
    hideCanvasContextMenu();
    handleContextAction(btn.dataset.action);
  };
  menu.addEventListener('click', handleClick, { once: true });

  const close = (e) => {
    if (e.type === 'keydown' && e.key !== 'Escape') return;
    hideCanvasContextMenu();
    window.removeEventListener('mousedown', close);
    window.removeEventListener('keydown', close);
  };
  requestAnimationFrame(() => {
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
  });
}

export function hideCanvasContextMenu() {
  const menu = document.getElementById('canvas-context-menu');
  if (menu) menu.style.display = 'none';
}

export function findCardAt(worldX, worldY) {
  for (let i = state.allCards.length - 1; i >= 0; i--) {
    const card = state.allCards[i];
    const cx = card.container.x;
    const cy = card.container.y;
    if (worldX >= cx && worldX <= cx + card.cardWidth &&
        worldY >= cy && worldY <= cy + card.cardHeight) {
      return card;
    }
  }
  return null;
}

export function handleContextAction(action) {
  switch (action) {
    case 'copy': copySelected(); break;
    case 'paste': pasteFromClipboard(); break;
    case 'delete': deleteSelected(); break;
    case 'duplicate': duplicateSelected(); break;
    case 'bring-front': bringForward(); break;
    case 'send-back': sendBackward(); break;
    case 'group': groupSelected(); break;
    case 'ungroup': ungroupSelected(); break;
    case 'fit-all': fitAll(); break;
    case 'zoom-100': zoomTo100(); break;
    case 'toggle-grid': toggleGrid(); break;
    case 'toggle-minimap': toggleMinimap(); break;
    case 'tidy-up': tidyUp(); break;
    case 'toggle-lock': toggleLockSelected(); break;
    case 'align-left': alignSelected('left'); break;
    case 'align-center': alignSelected('center'); break;
    case 'align-right': alignSelected('right'); break;
    case 'align-top': alignSelected('top'); break;
    case 'align-middle': alignSelected('middle'); break;
    case 'align-bottom': alignSelected('bottom'); break;
    case 'distribute-h': distributeSelected('h'); break;
    case 'distribute-v': distributeSelected('v'); break;
    case 'export-png':
      window.dispatchEvent(new CustomEvent('refboard:export-png'));
      break;
    case 'analyze':
    case 'analyze-batch':
    case 'find-similar':
    case 'find-online':
      window.dispatchEvent(new CustomEvent('refboard:context-action', { detail: { action, cards: Array.from(state.selection) } }));
      break;
  }
}
