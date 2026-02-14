// RefBoard 2.0 — Main entry point
// Initializes the PixiJS canvas, AI panels, search, and wires up the UI shell

import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { initCanvas, loadProject, fitAll, setUIElements, onCardSelect, applyFilter, getBoardState, restoreBoardState, startAutoSave, getSelection, addImageCard, getViewport } from './canvas.js';
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

  // Shared image extension set
  const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'tiff']);
  const dropOverlay = document.getElementById('drop-overlay');

  // Convert a window-relative drop/paste position to world coordinates
  function dropPosToWorld(windowX, windowY) {
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const canvasX = windowX / dpr - rect.left;
    const canvasY = windowY / dpr - rect.top;
    const vp = getViewport();
    return {
      x: (canvasX - vp.x) / vp.scale,
      y: (canvasY - vp.y) / vp.scale,
    };
  }

  // Import image files into the project and add cards at (worldX, worldY)
  async function importAndAddCards(filePaths, worldX, worldY) {
    if (!currentProjectPath) {
      setStatus('Open a project first before importing images');
      return;
    }
    const imagePaths = filePaths.filter((p) => {
      const ext = p.split('.').pop().toLowerCase();
      return IMAGE_EXTS.has(ext);
    });
    if (imagePaths.length === 0) {
      setStatus('No supported image files found');
      return;
    }
    try {
      const imported = await invoke('import_images', {
        paths: imagePaths,
        projectPath: currentProjectPath,
      });
      const stagger = 220;
      for (let i = 0; i < imported.length; i++) {
        await addImageCard(imported[i], worldX + i * stagger, worldY);
      }
      setStatus(`Imported ${imported.length} image${imported.length !== 1 ? 's' : ''}`);
      invoke('cmd_embed_project', { projectPath: currentProjectPath }).catch(() => {});
    } catch (err) {
      setStatus(`Import failed: ${err}`);
    }
  }

  // Drag-and-drop from Finder
  getCurrentWindow().onDragDropEvent((event) => {
    if (event.payload.type === 'enter') {
      dropOverlay.style.display = 'flex';
    } else if (event.payload.type === 'leave') {
      dropOverlay.style.display = 'none';
    } else if (event.payload.type === 'drop') {
      dropOverlay.style.display = 'none';
      const pos = event.payload.position || { x: 0, y: 0 };
      const wp = dropPosToWorld(pos.x, pos.y);
      importAndAddCards(event.payload.paths || [], wp.x, wp.y);
    }
  });

  // Paste images from clipboard (Cmd+V)
  window.addEventListener('paste', async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        if (!currentProjectPath) {
          setStatus('Open a project first before pasting images');
          return;
        }
        const blob = item.getAsFile();
        if (!blob) return;
        const buffer = await blob.arrayBuffer();
        const data = Array.from(new Uint8Array(buffer));
        const ext = item.type.split('/')[1] === 'jpeg' ? 'jpg' : item.type.split('/')[1] || 'png';
        try {
          const info = await invoke('import_clipboard_image', {
            data,
            extension: ext,
            projectPath: currentProjectPath,
          });
          // Place at center of current viewport
          const vp = getViewport();
          const rect = container.getBoundingClientRect();
          const centerX = (rect.width / 2 - vp.x) / vp.scale;
          const centerY = (rect.height / 2 - vp.y) / vp.scale;
          await addImageCard(info, centerX, centerY);
          setStatus(`Pasted image: ${info.name}`);
          invoke('cmd_embed_project', { projectPath: currentProjectPath }).catch(() => {});
        } catch (err) {
          setStatus(`Paste failed: ${err}`);
        }
        return;
      }
    }
  });

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

  // Initialize home screen — hide toolbar when on home
  const toolbar = document.getElementById('toolbar');
  const homeScreen = document.getElementById('home-screen');
  if (toolbar) toolbar.classList.add('toolbar-hidden');
  initHomeScreen(homeScreen, projectPath, loading);
}

let currentProjectPath = null;

function setStatus(text) {
  const el = document.getElementById('status-text');
  if (el) el.textContent = text;
}

async function openProject(dirPath, loading) {
  // Hide home screen, show toolbar when opening a project
  const homeScreen = document.getElementById('home-screen');
  const toolbar = document.getElementById('toolbar');
  if (homeScreen) homeScreen.classList.add('hidden');
  if (toolbar) toolbar.classList.remove('toolbar-hidden');

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

      // Generate CLIP embeddings in background
      const dlg = document.getElementById('model-download-dialog');
      if (dlg) dlg.style.display = 'flex';
      invoke('cmd_embed_project', { projectPath: dirPath })
        .then((count) => {
          if (dlg) dlg.style.display = 'none';
          if (count > 0) setStatus(`Generated embeddings for ${count} images`);
        })
        .catch((err) => {
          if (dlg) dlg.style.display = 'none';
          console.warn('Embedding generation skipped:', err);
        });

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

async function initHomeScreen(homeScreen, projectPathInput, loading) {
  if (!homeScreen) return;

  const gridEl = document.getElementById('home-project-list');
  const openBtn = document.getElementById('home-open-btn');
  const newBtn = document.getElementById('home-new-btn');

  // Load recent projects as card grid
  try {
    const projects = await invoke('list_projects');
    if (projects.length > 0) {
      gridEl.innerHTML = projects.map((p) => {
        const safeName = p.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        const safePath = p.path.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        return `
        <button class="home-project-card" data-path="${safePath}">
          <div class="home-project-thumb">
            <span class="home-project-thumb-placeholder">&#128444;</span>
          </div>
          <div class="home-project-info">
            <div class="home-project-name">${safeName}</div>
            <div class="home-project-meta">
              <span>${p.image_count} images</span>
            </div>
          </div>
        </button>`;
      }).join('');

      // Click card to open project
      gridEl.querySelectorAll('.home-project-card').forEach((card) => {
        card.addEventListener('click', () => {
          const path = card.dataset.path;
          projectPathInput.value = path;
          openProject(path, loading);
        });
      });
    }
  } catch (err) {
    console.warn('Could not load recent projects:', err);
  }

  // Grid/list view toggle
  const gridBtn = document.getElementById('home-grid-btn');
  const listBtn = document.getElementById('home-list-btn');
  if (gridBtn && listBtn) {
    gridBtn.addEventListener('click', () => {
      gridEl.classList.remove('list-view');
      gridBtn.classList.add('active');
      listBtn.classList.remove('active');
    });
    listBtn.addEventListener('click', () => {
      gridEl.classList.add('list-view');
      listBtn.classList.add('active');
      gridBtn.classList.remove('active');
    });
  }

  // Search filter for recent projects
  const homeSearchInput = document.getElementById('home-search-input');
  if (homeSearchInput) {
    homeSearchInput.addEventListener('input', () => {
      const query = homeSearchInput.value.toLowerCase().trim();
      gridEl.querySelectorAll('.home-project-card').forEach((card) => {
        const name = card.querySelector('.home-project-name')?.textContent.toLowerCase() || '';
        card.style.display = name.includes(query) ? '' : 'none';
      });
    });
  }

  // Right-click context menu for project cards
  const ctxMenu = document.getElementById('context-menu');
  let ctxTargetCard = null;

  function showContextMenu(x, y, card) {
    ctxTargetCard = card;
    ctxMenu.style.left = x + 'px';
    ctxMenu.style.top = y + 'px';
    ctxMenu.style.display = 'block';
    // Adjust if menu overflows viewport
    requestAnimationFrame(() => {
      const rect = ctxMenu.getBoundingClientRect();
      if (rect.right > window.innerWidth) ctxMenu.style.left = (window.innerWidth - rect.width - 8) + 'px';
      if (rect.bottom > window.innerHeight) ctxMenu.style.top = (window.innerHeight - rect.height - 8) + 'px';
    });
  }

  function hideContextMenu() {
    ctxMenu.style.display = 'none';
    ctxTargetCard = null;
  }

  // Close context menu on click elsewhere or Escape
  window.addEventListener('click', hideContextMenu);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideContextMenu();
  });

  // Attach context menu to project cards
  gridEl.addEventListener('contextmenu', (e) => {
    const card = e.target.closest('.home-project-card');
    if (!card) return;
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY, card);
  });

  // Handle context menu actions
  ctxMenu.addEventListener('click', async (e) => {
    const action = e.target.closest('.ctx-item')?.dataset.action;
    if (!action || !ctxTargetCard) return;
    e.stopPropagation();
    const path = ctxTargetCard.dataset.path;
    hideContextMenu();

    if (action === 'open') {
      projectPathInput.value = path;
      openProject(path, loading);
    } else if (action === 'finder') {
      try {
        await invoke('plugin:shell|open', { path });
      } catch {
        // Fallback: use Tauri shell opener
        try {
          const { open: shellOpen } = await import('@tauri-apps/plugin-shell');
          await shellOpen(path);
        } catch (err) {
          setStatus(`Could not open Finder: ${err}`);
        }
      }
    } else if (action === 'rename') {
      // Inline rename: replace name element with input
      const nameEl = ctxTargetCard.querySelector('.home-project-name');
      if (!nameEl) return;
      const oldName = nameEl.textContent;
      const input = document.createElement('input');
      input.value = oldName;
      input.className = 'home-search-input';
      input.style.cssText = 'width: 100%; font-size: 13px; font-weight: 500; padding: 2px 4px;';
      nameEl.replaceWith(input);
      input.focus();
      input.select();
      const finishRename = async () => {
        const newName = input.value.trim() || oldName;
        const span = document.createElement('div');
        span.className = 'home-project-name';
        span.textContent = newName;
        input.replaceWith(span);
        if (newName !== oldName) {
          try {
            await invoke('rename_project', { projectPath: path, newName });
          } catch {
            // Backend command may not exist yet — just update UI
            span.textContent = newName;
          }
        }
      };
      input.addEventListener('blur', finishRename);
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') input.blur();
        if (ev.key === 'Escape') { input.value = oldName; input.blur(); }
      });
    } else if (action === 'delete') {
      const name = ctxTargetCard.querySelector('.home-project-name')?.textContent || 'this project';
      if (confirm(`Remove "${name}" from recent projects?`)) {
        try {
          await invoke('remove_from_recent', { projectPath: path });
        } catch {
          // Backend command may not exist yet
        }
        ctxTargetCard.remove();
        // Show empty state if no cards left
        if (gridEl.querySelectorAll('.home-project-card').length === 0) {
          gridEl.innerHTML = `
            <div class="home-empty">
              <div class="home-empty-icon">&#128444;</div>
              <div class="home-empty-title">No recent projects</div>
              Open an image folder or create a new project to get started.
            </div>`;
        }
      }
    }
  });

  // Open folder button — native directory picker
  if (openBtn) {
    openBtn.addEventListener('click', async () => {
      try {
        const { open } = await import('@tauri-apps/plugin-dialog');
        const selected = await open({ directory: true, title: 'Open Image Folder' });
        if (selected) {
          projectPathInput.value = selected;
          openProject(selected, loading);
        }
      } catch {
        projectPathInput.focus();
      }
    });
  }

  // New project button — show dialog
  const newDialog = document.getElementById('new-project-dialog');
  const newNameInput = document.getElementById('new-project-name');
  const newPreview = document.getElementById('new-project-path-preview');
  const newCancelBtn = document.getElementById('new-project-cancel-btn');
  const newCreateBtn = document.getElementById('new-project-create-btn');

  if (newBtn && newDialog) {
    newBtn.addEventListener('click', () => {
      newDialog.classList.add('open');
      if (newNameInput) {
        newNameInput.value = '';
        newNameInput.focus();
      }
      if (newPreview) newPreview.textContent = '~/Documents/RefBoard/';
    });

    // Update path preview as user types
    if (newNameInput && newPreview) {
      newNameInput.addEventListener('input', () => {
        const name = newNameInput.value.trim() || '';
        newPreview.textContent = name
          ? `~/Documents/RefBoard/${name}/`
          : '~/Documents/RefBoard/';
      });
    }

    // Cancel
    if (newCancelBtn) {
      newCancelBtn.addEventListener('click', () => {
        newDialog.classList.remove('open');
      });
    }

    // Close on backdrop click
    newDialog.addEventListener('click', (e) => {
      if (e.target === newDialog) newDialog.classList.remove('open');
    });

    // Create project
    if (newCreateBtn) {
      newCreateBtn.addEventListener('click', async () => {
        const name = newNameInput?.value.trim();
        if (!name) return;
        newDialog.classList.remove('open');
        try {
          const result = await invoke('cmd_create_project', { name });
          projectPathInput.value = result.path;
          openProject(result.path, loading);
        } catch (err) {
          // Fallback: create directory manually via home path
          const home = await getHomePath();
          if (home) {
            const base = home.endsWith('/') ? home : home + '/';
            const path = `${base}Documents/RefBoard/${name}`;
            projectPathInput.value = path;
            openProject(path, loading);
          }
        }
      });

      // Enter key creates project
      if (newNameInput) {
        newNameInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') newCreateBtn.click();
          if (e.key === 'Escape') newDialog.classList.remove('open');
        });
      }
    }
  }
}

main().catch(console.error);
