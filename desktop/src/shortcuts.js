// Deco 2.0 — Keyboard Shortcuts
// Global keyboard shortcuts registered in the main window

import { invoke } from '@tauri-apps/api/core';
import { getSelection, getBoardState } from './canvas/index.js';
import { openSettings, analyzeCard, analyzeBatch, openGenerateDialog } from './panels.js';
import { findMoreLike } from './collection.js';

/**
 * Initialize global keyboard shortcuts.
 * @param {object} deps - Dependencies injected from main.js
 * @param {function} deps.getCurrentProjectPath - Returns the current project path
 */
export function initShortcuts(deps) {
  const { getCurrentProjectPath } = deps;

  window.addEventListener('keydown', (e) => {
    const meta = e.metaKey || e.ctrlKey;

    // Cmd+,: open settings page (macOS convention)
    if (meta && e.key === ',') {
      e.preventDefault();
      openSettings();
      return;
    }

    // Cmd+\: toggle sidebar
    if (meta && e.key === '\\') {
      e.preventDefault();
      const sidebar = document.getElementById('app-sidebar');
      const toggleBtn = document.getElementById('toolbar-sidebar-toggle');
      if (sidebar) {
        const isCollapsed = sidebar.classList.toggle('collapsed');
        if (toggleBtn) toggleBtn.classList.toggle('active', !isCollapsed);
        localStorage.setItem('deco-sidebar-hidden', isCollapsed);
      }
      return;
    }

    // Cmd+F: focus search
    if (meta && e.key === 'f' && !e.shiftKey) {
      e.preventDefault();
      const searchInput = document.getElementById('search-input');
      if (searchInput) searchInput.focus();
      return;
    }

    // Cmd+Shift+A: Analyze selected image(s)
    if (meta && e.shiftKey && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault();
      const sel = getSelection();
      const imageCards = Array.from(sel).filter(c => !c.isText && !c.isShape);
      if (imageCards.length === 1) {
        analyzeCard(imageCards[0]);
      } else if (imageCards.length > 1) {
        const currentProjectPath = getCurrentProjectPath();
        const saveFn = currentProjectPath ? () => {
          invoke('save_board_state', { projectPath: currentProjectPath, state: getBoardState() }).catch(() => {});
        } : null;
        analyzeBatch(imageCards, saveFn);
      }
      return;
    }

    // Cmd+Shift+F: Find more like selected (online)
    if (meta && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
      e.preventDefault();
      const sel = getSelection();
      if (sel.size === 1) {
        const card = Array.from(sel)[0];
        findMoreLike(card);
      }
      return;
    }

    // Cmd+Shift+G: Open Generate Image dialog
    if (meta && e.shiftKey && (e.key === 'g' || e.key === 'G')) {
      e.preventDefault();
      const sel = getSelection();
      const imageCards = Array.from(sel).filter(c => !c.isText && !c.isShape);
      openGenerateDialog(imageCards);
      return;
    }

    // Cmd+N: New project (when on home screen)
    if (meta && e.key === 'n' && !e.shiftKey) {
      const homeScreen = document.getElementById('home-screen');
      if (homeScreen && !homeScreen.classList.contains('hidden')) {
        e.preventDefault();
        const newBtn = document.getElementById('home-new-btn');
        if (newBtn) newBtn.click();
        return;
      }
    }

    // Cmd+S: Manual save
    if (meta && e.key === 's' && !e.shiftKey) {
      e.preventDefault();
      const currentProjectPath = getCurrentProjectPath();
      if (currentProjectPath) {
        invoke('save_board_state', {
          projectPath: currentProjectPath,
          state: getBoardState(),
        }).then(() => {
          const statusText = document.getElementById('status-text');
          if (statusText) statusText.textContent = 'Board saved';
        }).catch(() => {});
      }
      return;
    }
  });
}
