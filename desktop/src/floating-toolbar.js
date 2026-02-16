// Deco 2.0 — Floating Selection Toolbar
// Context-aware toolbar that appears above the current selection

import { getSelection, getSelectionScreenBounds, handleContextAction, changeSelectionColor, changeShapeStrokeWidth, changeTextFontSize, toggleTextBold, toggleTextItalic, toggleSelectionFill, toggleSelectionLineStyle } from './canvas/index.js';
import { closePanel } from './panels.js';

export function initFloatingToolbar() {
  const toolbar = document.getElementById('floating-toolbar');
  const canvasContainer = document.getElementById('canvas-container');
  if (!toolbar || !canvasContainer) return;

  let isVisible = false;
  let positionRAF = null;
  const TOOLBAR_GAP = 10; // Gap between toolbar and selection top edge

  // --- Show / Hide ---

  function showToolbar() {
    if (isVisible) return;
    isVisible = true;
    toolbar.classList.add('visible');
    updateToolbarPosition();
  }

  function hideToolbar() {
    if (!isVisible) return;
    isVisible = false;
    toolbar.classList.remove('visible');
    closeSubmenus();
  }

  function closeSubmenus() {
    toolbar.querySelectorAll('.ftb-submenu.open').forEach(m => m.classList.remove('open'));
    toolbar.querySelectorAll('.ftb-btn.active').forEach(b => b.classList.remove('active'));
  }

  // --- Position Calculation ---

  function updateToolbarPosition() {
    if (!isVisible) return;
    const screenBounds = getSelectionScreenBounds();
    if (!screenBounds) { hideToolbar(); return; }

    const containerRect = canvasContainer.getBoundingClientRect();
    const tbRect = toolbar.getBoundingClientRect();
    const tbWidth = tbRect.width || 200;
    const tbHeight = tbRect.height || 40;

    // Center horizontally above selection
    let left = (screenBounds.left + screenBounds.right) / 2 - tbWidth / 2;
    let top = screenBounds.top - tbHeight - TOOLBAR_GAP;

    // Clamp to container edges
    left = Math.max(4, Math.min(left, containerRect.width - tbWidth - 4));
    top = Math.max(4, top);

    // If above doesn't fit (selection near top), place below
    if (top < 4) {
      top = screenBounds.bottom + TOOLBAR_GAP;
    }

    toolbar.style.left = `${Math.round(left)}px`;
    toolbar.style.top = `${Math.round(top)}px`;
  }

  function requestPositionUpdate() {
    if (positionRAF) return;
    positionRAF = requestAnimationFrame(() => {
      positionRAF = null;
      updateToolbarPosition();
    });
  }

  // --- Selection Change Detection ---
  // Poll selection state since canvas.js doesn't fire a custom event for selection changes.
  // We hook into the existing MutationObserver approach or use a lightweight poller.

  let lastSelectionSize = 0;
  let lastAnnotationKey = '';

  function checkSelection() {
    const sel = getSelection();
    const count = sel.size;

    if (count > 0 && count !== lastSelectionSize) {
      showToolbar();
      updateLockButtonState();
      updateAnnotationControls();
    } else if (count === 0 && lastSelectionSize > 0) {
      hideToolbar();
      closePanel();
    } else if (count > 0) {
      requestPositionUpdate();
      // Lightweight check: only update annotation controls if selection composition changed
      const key = Array.from(sel).map(c => c.data?.id || c.data?.path || '').join(',');
      if (key !== lastAnnotationKey) {
        lastAnnotationKey = key;
        updateAnnotationControls();
      }
    }
    lastSelectionSize = count;
  }

  function getSelectionType(cards) {
    if (!cards || cards.size === 0) return 'none';
    const types = new Set();
    for (const card of cards) {
      if (card.isText) types.add('text');
      else if (card.isShape) {
        const st = card.shapeType || card._shapeType || card.data?.shapeType || '';
        if (st === 'line') types.add('line');
        else types.add('shape');
      } else types.add('image');
    }
    if (types.size > 1) return 'mixed';
    return types.values().next().value || 'image';
  }

  function updateToolbarContext(selType) {
    if (!toolbar) return;
    toolbar.querySelectorAll('[data-context]').forEach(el => {
      const contexts = el.dataset.context.split(',');
      const visible = contexts.includes('all') || contexts.includes(selType) || (selType === 'mixed' && !contexts.includes('all'));
      el.style.display = visible ? '' : 'none';
    });
    // For 'mixed' selection, only show 'all' context items
    if (selType === 'mixed') {
      toolbar.querySelectorAll('[data-context]').forEach(el => {
        const contexts = el.dataset.context.split(',');
        el.style.display = contexts.includes('all') ? '' : 'none';
      });
    }
  }

  function updateAnnotationControls() {
    const sel = getSelection();
    const selType = getSelectionType(sel);
    updateToolbarContext(selType);

    const hasShape = Array.from(sel).some(c => c.isShape);
    const hasText = Array.from(sel).some(c => c.isText);

    if (hasShape) {
      // Sync dash toggle state
      const dashBtn = document.getElementById('ftb-dash');
      const firstShape = Array.from(sel).find(c => c.isShape);
      if (dashBtn && firstShape) {
        dashBtn.classList.toggle('toggled', firstShape.data.lineStyle === 'dashed');
      }

      // Sync fill toggle state
      const fillBtn = document.getElementById('ftb-fill-toggle');
      if (fillBtn && firstShape) {
        fillBtn.classList.toggle('toggled', !!firstShape.data.hasFill);
        // Show filled icon when toggled
        if (firstShape.data.hasFill) {
          fillBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" opacity="0.3"/><rect x="3" y="3" width="18" height="18" rx="2" fill="none"/></svg>';
        } else {
          fillBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>';
        }
      }

      // Sync stroke width active option
      if (firstShape) {
        const sw = firstShape.data.strokeWidth || 2;
        toolbar.querySelectorAll('.ftb-stroke-opt').forEach(o => {
          o.classList.toggle('active', parseFloat(o.dataset.sw) === sw);
        });
      }

      // Sync color indicator + swatches
      if (firstShape) {
        const activeColor = firstShape.data.color;
        const indicator = document.getElementById('ftb-color-indicator');
        if (indicator) indicator.style.background = '#' + activeColor.toString(16).padStart(6, '0');
        const swatches = document.querySelectorAll('#ftb-color-popup .ftb-swatch');
        swatches.forEach(sw => {
          const swColor = parseInt(sw.dataset.color, 16);
          sw.classList.toggle('active', swColor === activeColor);
        });
      }
    }

    if (hasText) {
      // Sync bold/italic toggle states
      const boldBtn = document.getElementById('ftb-bold');
      const italicBtn = document.getElementById('ftb-italic');
      const firstText = Array.from(sel).find(c => c.isText);
      if (boldBtn && firstText) {
        boldBtn.classList.toggle('toggled', !!firstText.data.bold);
      }
      if (italicBtn && firstText) {
        italicBtn.classList.toggle('toggled', !!firstText.data.italic);
      }

      // Sync font size active option
      if (firstText) {
        const fs = firstText.data.fontSize || 14;
        toolbar.querySelectorAll('.ftb-font-opt').forEach(o => {
          o.classList.toggle('active', parseInt(o.dataset.fs, 10) === fs);
        });
      }
    }
  }

  // Observe selection changes via requestAnimationFrame loop
  function selectionWatcher() {
    checkSelection();
    requestAnimationFrame(selectionWatcher);
  }
  requestAnimationFrame(selectionWatcher);

  // Also update on pan/zoom (viewport changes)
  canvasContainer.addEventListener('wheel', () => requestPositionUpdate(), { passive: true });
  canvasContainer.addEventListener('pointermove', () => {
    if (isVisible) requestPositionUpdate();
  }, { passive: true });

  // --- Lock Button State ---

  function updateLockButtonState() {
    const lockBtn = document.getElementById('ftb-lock');
    if (!lockBtn) return;
    const sel = getSelection();
    const allLocked = sel.size > 0 && Array.from(sel).every(c => c.locked);
    lockBtn.title = allLocked ? 'Unlock' : 'Lock';
    lockBtn.classList.toggle('active', allLocked);
    // Swap icon: locked vs unlocked
    lockBtn.innerHTML = allLocked
      ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>'
      : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
  }

  // --- Button Handlers ---

  toolbar.addEventListener('click', (e) => {
    // Handle font size option clicks
    const fontOpt = e.target.closest('.ftb-font-opt');
    if (fontOpt) {
      e.stopPropagation();
      const fs = parseInt(fontOpt.dataset.fs, 10);
      changeTextFontSize(fs);
      toolbar.querySelectorAll('.ftb-font-opt').forEach(o => o.classList.remove('active'));
      fontOpt.classList.add('active');
      closeSubmenus();
      return;
    }

    // Handle stroke width option clicks
    const strokeOpt = e.target.closest('.ftb-stroke-opt');
    if (strokeOpt) {
      e.stopPropagation();
      const sw = parseFloat(strokeOpt.dataset.sw);
      changeShapeStrokeWidth(sw);
      toolbar.querySelectorAll('.ftb-stroke-opt').forEach(o => o.classList.remove('active'));
      strokeOpt.classList.add('active');
      closeSubmenus();
      return;
    }

    // Handle color swatch clicks in popup
    const swatch = e.target.closest('.ftb-swatch');
    if (swatch) {
      e.stopPropagation();
      const color = parseInt(swatch.dataset.color, 16);
      changeSelectionColor(color);
      // Update active swatch indicator
      toolbar.querySelectorAll('.ftb-swatch').forEach(sw => sw.classList.remove('active'));
      swatch.classList.add('active');
      // Update color button indicator
      const indicator = document.getElementById('ftb-color-indicator');
      if (indicator) indicator.style.background = swatch.style.background.split(';')[0];
      closeSubmenus();
      return;
    }

    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    e.stopPropagation();
    const action = btn.dataset.action;

    switch (action) {
      case 'lock':
        handleContextAction('toggle-lock');
        updateLockButtonState();
        break;
      case 'toggle-dash':
        toggleSelectionLineStyle();
        updateAnnotationControls();
        break;
      case 'toggle-stroke':
        toggleSubmenu('ftb-stroke-popup', btn);
        break;
      case 'toggle-fill':
        toggleSelectionFill();
        updateAnnotationControls();
        break;
      case 'toggle-colors':
        toggleSubmenu('ftb-color-popup', btn);
        break;
      case 'copy':
        handleContextAction('duplicate');
        break;
      case 'delete':
        handleContextAction('delete');
        hideToolbar();
        break;
      case 'align':
        // Toggle alignment submenu
        toggleSubmenu('ftb-align-submenu', btn);
        break;
      case 'toggle-font-size':
        toggleSubmenu('ftb-font-size-popup', btn);
        break;
      case 'toggle-bold':
        toggleTextBold();
        updateAnnotationControls();
        break;
      case 'toggle-italic':
        toggleTextItalic();
        updateAnnotationControls();
        break;
      case 'analyze-batch': {
        const sel = getSelection();
        const imageCards = Array.from(sel).filter(c => !c.isText && !c.isShape);
        if (imageCards.length > 0) {
          handleContextAction('analyze-batch');
        }
        break;
      }
      case 'more':
        // Show context menu with more options
        showMoreMenu(btn);
        break;
      // Alignment submenu actions
      case 'align-left':
      case 'align-center':
      case 'align-right':
      case 'align-top':
      case 'align-middle':
      case 'align-bottom':
      case 'distribute-h':
      case 'distribute-v':
        handleContextAction(action);
        closeSubmenus();
        requestPositionUpdate();
        break;
    }
  });

  function toggleSubmenu(submenuId, triggerBtn) {
    const sub = document.getElementById(submenuId);
    if (!sub) return;
    const wasOpen = sub.classList.contains('open');
    closeSubmenus();
    if (!wasOpen) {
      sub.classList.add('open');
      triggerBtn.classList.add('active');
    }
  }

  function showMoreMenu(triggerBtn) {
    // Dispatch the analyze-batch action for selected images
    const sel = getSelection();
    const imageCards = Array.from(sel).filter(c => !c.isText && !c.isShape);
    if (imageCards.length > 0) {
      handleContextAction('analyze-batch');
    }
    closeSubmenus();
  }

  // Close submenus when clicking outside
  document.addEventListener('click', (e) => {
    if (!toolbar.contains(e.target)) {
      closeSubmenus();
    }
  });
}
