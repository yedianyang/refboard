// RefBoard 2.0 — Main entry point
// Initializes the PixiJS canvas, AI panels, search, and wires up the UI shell

import { invoke } from '@tauri-apps/api/core';
import { initCanvas, loadProject, fitAll, setUIElements, onCardSelect, applyFilter, getBoardState, restoreBoardState, startAutoSave, getSelection } from './canvas.js';
import { initPanels, showMetadata, openSettings, analyzeCard } from './panels.js';
import { initSearch, setProject, updateSearchMetadata, findSimilar } from './search.js';
import { initCollection, setCollectionProject, findMoreLike, toggleWebPanel } from './collection.js';

async function main() {
  const container = document.getElementById('canvas-container');
  const loading = document.getElementById('loading-indicator');
  const zoomDisplay = document.getElementById('zoom-display');
  const projectPath = document.getElementById('project-path');
  const openBtn = document.getElementById('open-btn');
  const fitBtn = document.getElementById('fit-btn');
  const settingsBtn = document.getElementById('settings-btn');

  // Initialize PixiJS canvas
  await initCanvas(container);
  setUIElements({ loading, zoom: zoomDisplay });

  // Initialize search module
  initSearch({
    onFilter: (matchingPaths) => {
      applyFilter(matchingPaths);
    },
    onFindSimilar: (results) => {
      const statusText = document.getElementById('status-text');
      if (statusText) {
        statusText.textContent = `Found ${results.length} similar images`;
      }
    },
  });

  // Initialize web collection
  initCollection({
    onImageAdded: (result) => {
      const statusText = document.getElementById('status-text');
      if (statusText) statusText.textContent = `Added: ${result.name}`;
    },
  });

  // Initialize AI panels
  initPanels({
    onAccept: async (card, analysis) => {
      const statusText = document.getElementById('status-text');
      if (statusText) {
        const tagCount = analysis.tags?.length || 0;
        statusText.textContent = `Accepted ${tagCount} tags for ${card.data.name}`;
      }
      // Update search index with new metadata
      await updateSearchMetadata(card);
    },
    onFindSimilar: (card) => {
      findSimilar(card);
    },
    onFindOnline: (card) => {
      findMoreLike(card);
    },
  });

  // Card selection -> open metadata panel
  onCardSelect((card) => {
    showMetadata(card);
  });

  // Settings button
  settingsBtn.addEventListener('click', () => openSettings());

  // Export button
  const exportBtn = document.getElementById('export-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
      if (!currentProjectPath) return;
      const outputPath = currentProjectPath + '/export.json';
      try {
        const count = await invoke('export_metadata', {
          projectPath: currentProjectPath,
          outputPath,
        });
        const statusText = document.getElementById('status-text');
        if (statusText) statusText.textContent = `Exported ${count} images to export.json`;
      } catch (err) {
        const statusText = document.getElementById('status-text');
        if (statusText) statusText.textContent = `Export failed: ${err}`;
      }
    });
  }

  // Web collection sidebar button
  const webSidebarBtn = document.getElementById('web-sidebar-btn');
  if (webSidebarBtn) {
    webSidebarBtn.addEventListener('click', () => toggleWebPanel());
  }

  // Open project button
  openBtn.addEventListener('click', async () => {
    const dirPath = projectPath.value.trim();
    if (!dirPath) return;
    await openProject(dirPath, loading);
  });

  // Fit all button
  fitBtn.addEventListener('click', () => fitAll());

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    const meta = e.metaKey || e.ctrlKey;

    // Cmd+F: focus search
    if (meta && e.key === 'f' && !e.shiftKey) {
      e.preventDefault();
      const searchInput = document.getElementById('search-input');
      if (searchInput) searchInput.focus();
      return;
    }

    // Cmd+Shift+A: Analyze selected image
    if (meta && e.shiftKey && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault();
      const sel = getSelection();
      if (sel.size === 1) {
        const card = Array.from(sel)[0];
        analyzeCard(card);
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

    // Cmd+S: Manual save
    if (meta && e.key === 's' && !e.shiftKey) {
      e.preventDefault();
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

  // Auto-load art-deco project for testing
  const testPath = '~/.openclaw/workspace/visual-refs/art-deco-power';
  const home = await getHomePath();
  if (home) {
    const resolved = testPath.replace('~', home);
    projectPath.value = resolved;
  }
}

let currentProjectPath = null;

async function openProject(dirPath, loading) {
  loading.style.display = 'block';
  loading.textContent = 'Scanning images...';

  try {
    const result = await loadProject(dirPath);
    if (result) {
      currentProjectPath = dirPath;

      // Try to restore saved board state (positions, groups, viewport)
      loading.textContent = `Loaded ${result.loaded} images. Restoring layout...`;
      try {
        const savedState = await invoke('load_board_state', { projectPath: dirPath });
        if (savedState) {
          restoreBoardState(savedState);
          loading.textContent = `Restored layout for ${result.loaded} images`;
        }
      } catch (err) {
        // No saved state or corrupt — use default layout
        console.warn('Board state restore skipped:', err);
      }

      // Index project for search
      loading.textContent = `Indexing ${result.loaded} images for search...`;
      await setProject(dirPath);
      setCollectionProject(dirPath);

      // Start auto-save
      startAutoSave(async (state) => {
        await invoke('save_board_state', {
          projectPath: dirPath,
          state,
        });
      });

      loading.textContent = `Loaded ${result.loaded} images`;
      setTimeout(() => { loading.style.display = 'none'; }, 2000);
    }
  } catch (err) {
    loading.textContent = `Error: ${err}`;
    loading.style.color = '#e74c3c';
  }
}

async function getHomePath() {
  try {
    const { homeDir } = await import('@tauri-apps/api/path');
    return await homeDir();
  } catch {
    return null;
  }
}

main().catch(console.error);
