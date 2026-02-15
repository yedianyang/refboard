// RefBoard 2.0 — Main entry point
// Initializes the PixiJS canvas, AI panels, search, and wires up the UI shell

import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { initCanvas, loadProject, fitAll, setUIElements, onCardSelect, applyFilter, getBoardState, restoreBoardState, startAutoSave, getSelection, addImageCard, getViewport, applySavedTheme, exportCanvasPNG } from './canvas.js';
import { initPanels, showMetadata, openSettings, analyzeCard } from './panels.js';
import { initSearch, setProject, updateSearchMetadata, findSimilar } from './search.js';
import { initCollection, setCollectionProject, findMoreLike, toggleWebPanel } from './collection.js';

async function main() {
  // Apply saved theme immediately (before canvas init) so home screen renders correctly
  const savedTheme = localStorage.getItem('refboard-theme');
  if (savedTheme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  }

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

  // Apply saved theme (dark/light)
  applySavedTheme();

  // Warm up CLIP model in background after UI is ready
  // Delayed to ensure UI loads first, then model initializes in background
  setTimeout(() => {
    invoke('cmd_warmup_clip').catch((err) => {
      console.warn('CLIP warmup skipped:', err);
    });
  }, 3000);  // Wait 3 seconds after app start

  // Shared image extension set
  const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'tiff']);
  // Formats that should NOT be compressed (vector, animated, or already tiny)
  const SKIP_COMPRESS_EXTS = new Set(['svg', 'gif']);
  const dropOverlay = document.getElementById('drop-overlay');

  // ---- Image Compression ----

  /** Get compression settings from localStorage. */
  function getCompressionSettings() {
    return {
      enabled: localStorage.getItem('refboard-compress') !== 'off',
      quality: parseFloat(localStorage.getItem('refboard-compress-quality') || '0.82'),
      maxDimension: parseInt(localStorage.getItem('refboard-compress-maxdim') || '2048', 10),
    };
  }

  /**
   * Compress an image blob using OffscreenCanvas.
   * Returns { data: Uint8Array, ext: string } or null if compression skipped.
   */
  async function compressImageBlob(blob, originalExt) {
    const settings = getCompressionSettings();
    if (!settings.enabled) return null;
    if (SKIP_COMPRESS_EXTS.has(originalExt)) return null;

    try {
      const bitmap = await createImageBitmap(blob);
      let { width, height } = bitmap;
      const maxDim = settings.maxDimension;

      // Downscale if larger than maxDimension
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();

      // Choose output format: use WebP if supported, else JPEG
      // Keep PNG for images with alpha (transparency)
      const hasAlpha = originalExt === 'png' || originalExt === 'webp';
      const outputType = hasAlpha ? 'image/webp' : 'image/jpeg';
      const outputExt = hasAlpha ? 'webp' : 'jpg';

      const compressedBlob = await canvas.convertToBlob({
        type: outputType,
        quality: settings.quality,
      });

      // Only use compressed version if it's actually smaller
      if (compressedBlob.size >= blob.size * 0.95) return null;

      const buffer = await compressedBlob.arrayBuffer();
      return { data: new Uint8Array(buffer), ext: outputExt };
    } catch {
      return null; // Fallback to uncompressed
    }
  }

  /**
   * Compress an image from a file path (read via asset URL).
   * Returns { data: Uint8Array, ext: string } or null.
   */
  async function compressImageFromPath(filePath) {
    const ext = filePath.split('.').pop().toLowerCase();
    if (SKIP_COMPRESS_EXTS.has(ext)) return null;

    const settings = getCompressionSettings();
    if (!settings.enabled) return null;

    try {
      const url = convertFileSrc(filePath);
      const response = await fetch(url);
      const blob = await response.blob();

      // Skip small files (< 200KB)
      if (blob.size < 200 * 1024) return null;

      return await compressImageBlob(blob, ext);
    } catch {
      return null;
    }
  }

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
      const imported = [];
      let compressed = 0;

      for (const filePath of imagePaths) {
        // Try to compress the image before importing
        const result = await compressImageFromPath(filePath);
        if (result) {
          // Import compressed bytes
          const stem = filePath.split('/').pop().replace(/\.[^.]+$/, '');
          const info = await invoke('import_clipboard_image', {
            data: Array.from(result.data),
            extension: result.ext,
            projectPath: currentProjectPath,
          });
          imported.push(info);
          compressed++;
        } else {
          // Import original file (no compression or below threshold)
          const [info] = await invoke('import_images', {
            paths: [filePath],
            projectPath: currentProjectPath,
          });
          if (info) imported.push(info);
        }
      }

      const stagger = 220;
      for (let i = 0; i < imported.length; i++) {
        await addImageCard(imported[i], worldX + i * stagger, worldY);
      }
      const msg = `Imported ${imported.length} image${imported.length !== 1 ? 's' : ''}`;
      setStatus(compressed > 0 ? `${msg} (${compressed} compressed)` : msg);
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
        const origExt = item.type.split('/')[1] === 'jpeg' ? 'jpg' : item.type.split('/')[1] || 'png';

        // Try to compress before importing
        const compressed = await compressImageBlob(blob, origExt);
        let data, ext;
        if (compressed) {
          data = Array.from(compressed.data);
          ext = compressed.ext;
        } else {
          const buffer = await blob.arrayBuffer();
          data = Array.from(new Uint8Array(buffer));
          ext = origExt;
        }

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
          const suffix = compressed ? ' (compressed)' : '';
          setStatus(`Pasted image: ${info.name}${suffix}`);
          // Generate embedding in background with dialog feedback
          const dlg = document.getElementById('model-download-dialog');
          if (dlg) dlg.style.display = 'flex';
          invoke('cmd_embed_project', { projectPath: currentProjectPath })
            .then(() => { if (dlg) dlg.style.display = 'none'; })
            .catch(() => { if (dlg) dlg.style.display = 'none'; });
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

  // Export button — PNG export
  const exportBtn = document.getElementById('export-btn');
  if (exportBtn) {
    exportBtn.title = 'Export board as PNG (Cmd+Shift+E)';
    exportBtn.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('refboard:export-png'));
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

  // Canvas context menu actions (dispatched from canvas.js)
  window.addEventListener('refboard:context-action', (e) => {
    const { action, cards } = e.detail;
    if (cards.length !== 1) return;
    const card = cards[0];
    if (action === 'analyze') analyzeCard(card);
    else if (action === 'find-similar') findSimilar(card);
    else if (action === 'find-online') findMoreLike(card);
  });

  // Export canvas as PNG (Cmd+Shift+E or context menu)
  window.addEventListener('refboard:export-png', async () => {
    const statusText = document.getElementById('status-text');
    try {
      if (statusText) statusText.textContent = 'Exporting...';
      const pngData = await exportCanvasPNG();
      if (!pngData) {
        if (statusText) statusText.textContent = 'Nothing to export';
        return;
      }
      const { save } = await import('@tauri-apps/plugin-dialog');
      const defaultName = currentProjectPath
        ? currentProjectPath.split('/').pop() + '-board.png'
        : 'refboard-export.png';
      const filePath = await save({
        title: 'Export Board as PNG',
        defaultPath: defaultName,
        filters: [{ name: 'PNG Image', extensions: ['png'] }],
      });
      if (!filePath) {
        if (statusText) statusText.textContent = 'Export cancelled';
        return;
      }
      const { writeFile } = await import('@tauri-apps/plugin-fs');
      await writeFile(filePath, pngData);
      if (statusText) statusText.textContent = `Exported to ${filePath.split('/').pop()}`;
    } catch (err) {
      console.error('Export failed:', err);
      if (statusText) statusText.textContent = `Export failed: ${err}`;
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

      if (result.loaded === 0) {
        loading.textContent = 'Empty project — drag images here or use Find Online (Cmd+Shift+F)';
        loading.style.color = '#888';
      } else {
        loading.textContent = `Loaded ${result.loaded} images`;
      }
      setTimeout(() => { loading.style.display = 'none'; }, 3000);
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

      // Lazy-load thumbnail mosaics for each project card
      for (const card of gridEl.querySelectorAll('.home-project-card')) {
        const path = card.dataset.path;
        const thumbEl = card.querySelector('.home-project-thumb');
        if (!thumbEl) continue;
        invoke('scan_images', { dirPath: path }).then((images) => {
          if (!images || images.length === 0) return;
          const count = Math.min(images.length, 4);
          const mosaic = document.createElement('div');
          mosaic.className = 'home-thumb-mosaic' + (count === 1 ? ' single' : '');
          for (let i = 0; i < count; i++) {
            const img = document.createElement('img');
            img.src = convertFileSrc(images[i].path);
            img.alt = '';
            img.loading = 'lazy';
            mosaic.appendChild(img);
          }
          thumbEl.innerHTML = '';
          thumbEl.appendChild(mosaic);
        }).catch(() => {});
      }
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
        const { open: shellOpen } = await import('@tauri-apps/plugin-shell');
        await shellOpen(path);
      } catch (err) {
        setStatus(`Could not open Finder: ${err}`);
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
          // Construct full path and call create_project with both name and path
          const home = await getHomePath();
          const base = home.endsWith('/') ? home : home + '/';
          const path = `${base}Documents/RefBoard/${name}`;
          const result = await invoke('create_project', { name, path });
          projectPathInput.value = result.path;
          openProject(result.path, loading);
        } catch (err) {
          console.error('Failed to create project:', err);
          const statusText = document.getElementById('status-text');
          if (statusText) statusText.textContent = `Error: ${err}`;
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
