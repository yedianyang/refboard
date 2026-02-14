// RefBoard 2.0 — Main entry point
// Initializes the PixiJS canvas, AI panels, search, and wires up the UI shell

import { initCanvas, loadProject, fitAll, setUIElements, onCardSelect, applyFilter } from './canvas.js';
import { initPanels, showMetadata, openSettings } from './panels.js';
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

  // Keyboard shortcut: Cmd/Ctrl+F to focus search
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      e.preventDefault();
      const searchInput = document.getElementById('search-input');
      if (searchInput) searchInput.focus();
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

async function openProject(dirPath, loading) {
  loading.style.display = 'block';
  loading.textContent = 'Scanning images...';

  try {
    const result = await loadProject(dirPath);
    if (result) {
      loading.textContent = `Loaded ${result.loaded} images. Indexing for search...`;
      // Index project for search
      await setProject(dirPath);
      setCollectionProject(dirPath);
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
