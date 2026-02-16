// Deco 2.0 — Main entry point
// Initializes the PixiJS canvas, AI panels, search, and wires up the UI shell

import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { initCanvas, loadProject, fitAll, setUIElements, onCardSelect, applyFilter, getBoardState, restoreBoardState, startAutoSave, getSelection, addImageCard, getViewport, applySavedTheme, setThemeMode, exportCanvasPNG, getAllCards, getSelectionScreenBounds, handleContextAction, changeSelectionColor, changeShapeStrokeWidth, changeTextFontSize, toggleTextBold, toggleTextItalic, toggleSelectionFill, toggleSelectionLineStyle } from './canvas/index.js';
import { initPanels, showMetadata, closePanel, openSettings, closeSettings, analyzeCard, analyzeBatch, openGenerateDialog, startGenerate, initGenerateDialog, closeGenerateDialog } from './panels.js';
import { initSearch, setProject, updateSearchMetadata, findSimilar } from './search.js';
import { initCollection, setCollectionProject, findMoreLike, toggleWebPanel } from './collection.js';

async function main() {
  // Apply system theme immediately (before canvas init) so home screen renders correctly
  const appWindow = getCurrentWindow();
  try {
    const initialTheme = await appWindow.theme();
    if (initialTheme !== 'dark') {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  } catch {
    // Fallback if Tauri API unavailable
    if (!window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  }

  const container = document.getElementById('canvas-container');
  const loading = document.getElementById('loading-indicator');
  const zoomDisplay = document.getElementById('zoom-display');

  // Initialize PixiJS canvas
  await initCanvas(container);
  setUIElements({ loading, zoom: zoomDisplay });

  // Apply system theme and listen for changes via Tauri API
  await applySavedTheme(appWindow);

  // Warm up CLIP model in background after UI is ready
  // Delayed to ensure UI loads first, then model initializes in background
  setTimeout(() => {
    console.log('[CLIP] Requesting warmup...');
    invoke('cmd_warmup_clip')
      .then(() => console.log('[CLIP] Warmup complete'))
      .catch((err) => console.log('[CLIP] Warmup skipped:', err));
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
      enabled: localStorage.getItem('deco-compress') !== 'off',
      quality: parseFloat(localStorage.getItem('deco-compress-quality') || '0.82'),
      maxDimension: parseInt(localStorage.getItem('deco-compress-maxdim') || '2048', 10),
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
      console.log('[CLIP] Import complete, requesting embedding for project');
      invoke('cmd_embed_project', { projectPath: currentProjectPath })
        .then((count) => {
          if (count > 0) console.log(`[CLIP] Embedded ${count} new images`);
          else console.log('[CLIP] No new embeddings needed');
        })
        .catch(() => {});
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
          console.log('[CLIP] Paste detected, requesting embedding for project');
          const dlg = document.getElementById('model-download-dialog');
          if (dlg) dlg.style.display = 'flex';
          invoke('cmd_embed_project', { projectPath: currentProjectPath })
            .then((count) => {
              if (dlg) dlg.style.display = 'none';
              if (count > 0) console.log(`[CLIP] Embedded ${count} new images`);
              else console.log('[CLIP] No new embeddings needed');
            })
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
    getAllCards,
  });

  // Initialize generate image dialog
  initGenerateDialog();

  // Generate submit button handler
  document.querySelector('.generate-submit')?.addEventListener('click', () => {
    startGenerate({
      projectPath: currentProjectPath,
      onCreatePlaceholder: ({ width, height, index, prompt }) => {
        return createGeneratePlaceholder(container, width, height, index, prompt);
      },
      onFillPlaceholder: (placeholder, result) => {
        replaceGeneratePlaceholder(placeholder, result);
      },
      onFail: (placeholder, error, retry) => {
        showGeneratePlaceholderError(placeholder, error, retry);
      },
    });
  });

  // Card selection -> open metadata panel + auto-embed if needed
  // Only show details for image cards (skip shapes, text, groups)
  onCardSelect((card) => {
    if (!card.isShape && !card.isText) {
      showMetadata(card);
    }

    // Auto-embed if not yet embedded
    if (currentProjectPath && card?.data?.path) {
      invoke('cmd_has_embedding', { projectPath: currentProjectPath, imagePath: card.data.path })
        .then((hasEmbed) => {
          if (!hasEmbed) {
            console.log('[CLIP] Auto-embedding unanalyzed image:', card.data.name);
            invoke('cmd_embed_project', { projectPath: currentProjectPath })
              .then((count) => {
                if (count > 0) console.log(`[CLIP] Embedded ${count} new images`);
              })
              .catch(() => {});
          }
        })
        .catch(() => {});
    }
  });

  // ---- Floating Selection Toolbar ----
  initFloatingToolbar();

  // Toolbar: Home button — show home screen, update active state
  const toolbarHomeBtn = document.getElementById('toolbar-home-btn');
  if (toolbarHomeBtn) {
    toolbarHomeBtn.addEventListener('click', () => {
      const homeScreen = document.getElementById('home-screen');
      const main = document.getElementById('main');
      if (homeScreen) homeScreen.classList.remove('hidden');
      if (main) main.classList.add('home-view');
      updateSidebarActive('home');
      window.dispatchEvent(new CustomEvent('deco:refresh-home'));
    });
  }

  // Toolbar: Sidebar toggle button
  const sidebarToggleBtn = document.getElementById('toolbar-sidebar-toggle');
  const appSidebar = document.getElementById('app-sidebar');
  if (sidebarToggleBtn && appSidebar) {
    // Restore sidebar state from localStorage
    const sidebarHidden = localStorage.getItem('deco-sidebar-hidden') === 'true';
    if (sidebarHidden) {
      appSidebar.classList.add('collapsed');
    } else {
      sidebarToggleBtn.classList.add('active');
    }
    sidebarToggleBtn.addEventListener('click', () => {
      const isCollapsed = appSidebar.classList.toggle('collapsed');
      sidebarToggleBtn.classList.toggle('active', !isCollapsed);
      localStorage.setItem('deco-sidebar-hidden', isCollapsed);
    });
  }

  // Sidebar nav: Settings button → open settings page
  const sidebarSettingsBtn = document.getElementById('sidebar-settings-btn');
  if (sidebarSettingsBtn) {
    sidebarSettingsBtn.addEventListener('click', () => openSettings());
  }


  // Hints toggle button
  const hintsToggle = document.getElementById('hints-toggle');
  const hintsPanel = document.getElementById('hints');
  if (hintsToggle && hintsPanel) {
    hintsToggle.addEventListener('click', () => {
      hintsPanel.classList.toggle('visible');
      hintsToggle.classList.toggle('active');
    });
  }

  // Web collection sidebar button
  const webSidebarBtn = document.getElementById('web-sidebar-btn');
  if (webSidebarBtn) {
    webSidebarBtn.addEventListener('click', () => toggleWebPanel());
  }


  // Keyboard shortcuts
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
  window.addEventListener('deco:context-action', (e) => {
    const { action, cards } = e.detail;
    if (action === 'analyze-batch') {
      const imageCards = cards.filter(c => !c.isText && !c.isShape);
      if (imageCards.length > 0) {
        const saveFn = currentProjectPath ? () => {
          invoke('save_board_state', { projectPath: currentProjectPath, state: getBoardState() }).catch(() => {});
        } : null;
        analyzeBatch(imageCards, saveFn);
      }
      return;
    }
    if (cards.length !== 1) return;
    const card = cards[0];
    if (action === 'analyze') analyzeCard(card);
    else if (action === 'find-similar') findSimilar(card);
    else if (action === 'find-online') findMoreLike(card);
  });

  // Export canvas as PNG (Cmd+Shift+E or context menu)
  window.addEventListener('deco:export-png', async () => {
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
        : 'deco-export.png';
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

  // Listen for HTTP API import events (from external tools like OpenClaw)
  listen('api:image-imported', async (event) => {
    const { image, position } = event.payload || {};
    if (!image) return;
    console.log(`[API] Image imported via HTTP: ${image.name}`);
    const x = position?.x ?? 0;
    const y = position?.y ?? 0;
    await addImageCard(image, x, y);
    setStatus(`Imported via API: ${image.name}`);
    // Trigger embedding in background
    if (currentProjectPath) {
      invoke('cmd_embed_project', { projectPath: currentProjectPath })
        .then((count) => {
          if (count > 0) console.log(`[CLIP] Embedded ${count} new images`);
        })
        .catch(() => {});
    }
  }).catch(() => {});

  // Immediate save after destructive operations (delete) + real file deletion
  window.addEventListener('deco:cards-deleted', (e) => {
    saveNow();
    const imagePaths = e.detail?.imagePaths || [];
    if (currentProjectPath && imagePaths.length > 0) {
      for (const imgPath of imagePaths) {
        invoke('delete_image', { projectPath: currentProjectPath, imagePath: imgPath })
          .catch((err) => console.warn('[DELETE] Failed to delete image file:', imgPath, err));
      }
    }
  });

  // Save board state before window closes
  window.addEventListener('beforeunload', () => saveNow());

  // Initialize home screen
  const homeScreen = document.getElementById('home-screen');
  initHomeScreen(homeScreen, loading);
}

/** Update active state based on current view. */
function updateSidebarActive(view) {
  const toolbarHomeBtn = document.getElementById('toolbar-home-btn');
  const settingsBtn = document.getElementById('sidebar-settings-btn');
  if (toolbarHomeBtn) toolbarHomeBtn.classList.toggle('current', view === 'home');
  if (settingsBtn) settingsBtn.classList.remove('active');
}

let currentProjectPath = null;

/** Immediately persist the current board state (for destructive ops). */
function saveNow() {
  if (!currentProjectPath) return;
  invoke('save_board_state', {
    projectPath: currentProjectPath,
    state: getBoardState(),
  }).catch(() => {});
}

function setStatus(text) {
  const el = document.getElementById('status-text');
  if (el) el.textContent = text;
}

async function openProject(dirPath, loading) {
  // Close any open detail/analysis panel from previous project
  closePanel();

  // Hide home screen, remove home-view class, update sidebar active state
  const homeScreen = document.getElementById('home-screen');
  const main = document.getElementById('main');
  if (homeScreen) homeScreen.classList.add('hidden');
  if (main) main.classList.remove('home-view');
  updateSidebarActive('board');

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
          if (count > 0) {
            console.log(`[CLIP] Embedded ${count} new images`);
            setStatus(`Generated embeddings for ${count} images`);
          } else {
            console.log('[CLIP] No new embeddings needed');
          }
        })
        .catch((err) => {
          if (dlg) dlg.style.display = 'none';
          console.log('[CLIP] Embedding skipped:', err);
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

async function initHomeScreen(homeScreen, loading) {
  if (!homeScreen) return;

  const gridEl = document.getElementById('home-project-list');
  const openBtn = document.getElementById('home-open-btn');
  const newBtn = document.getElementById('home-new-btn');

  // Reusable function to fetch and render project list
  async function refreshProjectList() {
    try {
      // Read app config to get default projects folder
      let projectsFolder = null;
      try {
        const appConfig = await invoke('get_app_config');
        projectsFolder = appConfig.projectsFolder || null;
      } catch {}

      // If no folder configured, use ~/Documents/Deco as default
      if (!projectsFolder) {
        try {
          const { documentDir } = await import('@tauri-apps/api/path');
          const docs = await documentDir();
          const sep = docs.endsWith('/') ? '' : '/';
          projectsFolder = `${docs}${sep}Deco`;
        } catch {}
      }

      // Scan default folder for projects
      let scannedProjects = [];
      if (projectsFolder) {
        try {
          scannedProjects = await invoke('scan_projects_folder', { folder: projectsFolder });
        } catch (err) {
          console.warn('Could not scan projects folder:', err);
        }
      }

      // Also load recent projects (may include projects outside the default folder)
      let recentProjects = [];
      try {
        recentProjects = await invoke('list_projects');
      } catch {}

      // Merge: scanned first, then recent (dedup by path)
      const seen = new Set();
      const projects = [];
      for (const p of scannedProjects) {
        if (!seen.has(p.path)) {
          seen.add(p.path);
          projects.push(p);
        }
      }
      for (const p of recentProjects) {
        if (!seen.has(p.path)) {
          seen.add(p.path);
          projects.push(p);
        }
      }

      if (projects.length > 0) {
        gridEl.innerHTML = projects.map((p) => {
          const safeName = p.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
          const safePath = p.path.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
          return `
          <button class="home-project-card" data-path="${safePath}">
            <div class="home-project-thumb">
              <span class="home-project-thumb-placeholder"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg></span>
            </div>
            <div class="home-project-info">
              <div class="home-project-name">${safeName}</div>
              <div class="home-project-meta">
                <span>${p.imageCount} images</span>
              </div>
            </div>
          </button>`;
        }).join('');

        // Click card to open project
        gridEl.querySelectorAll('.home-project-card').forEach((card) => {
          card.addEventListener('click', () => {
            const path = card.dataset.path;
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
      } else {
        gridEl.innerHTML = `
          <div class="home-empty">
            <div class="home-empty-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg></div>
            <div class="home-empty-title">No recent projects</div>
            Open an image folder or create a new project to get started.
          </div>`;
      }
    } catch (err) {
      console.warn('Could not load recent projects:', err);
    }
  }

  // Initial load
  await refreshProjectList();

  // Refresh project list when window regains focus (picks up Finder renames/deletes)
  const appWindow = getCurrentWindow();
  appWindow.onFocusChanged(({ payload: focused }) => {
    if (focused && !homeScreen.classList.contains('hidden')) {
      refreshProjectList();
    }
  });

  // Refresh when navigating back to home or after deletions
  window.addEventListener('deco:refresh-home', () => refreshProjectList());

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

  // Search filter for recent projects (removed)
  // const homeSearchInput = document.getElementById('home-search-input');
  // if (homeSearchInput) {
  //   homeSearchInput.addEventListener('input', () => {
  //     const query = homeSearchInput.value.toLowerCase().trim();
  //     gridEl.querySelectorAll('.home-project-card').forEach((card) => {
  //       const name = card.querySelector('.home-project-name')?.textContent.toLowerCase() || '';
  //       card.style.display = name.includes(query) ? '' : 'none';
  //     });
  //   });
  // }

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
    // Save references before hideContextMenu() nulls ctxTargetCard
    const targetCard = ctxTargetCard;
    const path = targetCard.dataset.path;
    hideContextMenu();

    if (action === 'open') {
      openProject(path, loading);
    } else if (action === 'finder') {
      try {
        await invoke('show_in_finder', { path });
      } catch (err) {
        setStatus(`Could not open Finder: ${err}`);
      }
    } else if (action === 'rename') {
      // Inline rename: replace name element with input
      const nameEl = targetCard.querySelector('.home-project-name');
      if (!nameEl) return;
      const oldName = nameEl.textContent;
      const input = document.createElement('input');
      input.value = oldName;
      input.className = 'home-search-input';
      input.style.cssText = 'width: 100%; font-size: 13px; font-weight: 500; padding: 2px 4px;';
      nameEl.replaceWith(input);
      input.focus();
      input.select();
      let renameFinished = false;
      const finishRename = async () => {
        if (renameFinished) return;
        renameFinished = true;
        const newName = input.value.trim() || oldName;
        const span = document.createElement('div');
        span.className = 'home-project-name';
        span.textContent = newName;
        input.replaceWith(span);
        if (newName !== oldName) {
          try {
            await invoke('rename_project', { projectPath: path, newName });
            // Update card's data-path to reflect the renamed folder
            const parentDir = path.substring(0, path.lastIndexOf('/'));
            const newPath = parentDir + '/' + newName;
            targetCard.dataset.path = newPath;
          } catch (err) {
            console.error('[Rename] Failed:', err);
            span.textContent = oldName; // Revert display on failure
          }
        }
      };
      input.addEventListener('blur', finishRename);
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') input.blur();
        if (ev.key === 'Escape') { input.value = oldName; input.blur(); }
      });
    } else if (action === 'delete') {
      const name = targetCard.querySelector('.home-project-name')?.textContent || 'this project';
      const { ask } = await import('@tauri-apps/plugin-dialog');
      const confirmed = await ask(`Delete "${name}"?\nThis will permanently remove the project folder and all its files.`, { title: 'Delete Project', kind: 'warning' });
      if (confirmed) {
        try {
          await invoke('remove_from_recent', { projectPath: path });
        } catch (err) {
          console.error('[Delete] Failed:', err);
        }
        targetCard.remove();
        // Show empty state if no cards left
        if (gridEl.querySelectorAll('.home-project-card').length === 0) {
          gridEl.innerHTML = `
            <div class="home-empty">
              <div class="home-empty-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg></div>
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
          openProject(selected, loading);
        }
      } catch (err) {
        console.error('[Dialog] Open folder failed:', err);
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
      if (newPreview) newPreview.textContent = '~/Documents/Deco/';
    });

    // Update path preview as user types
    if (newNameInput && newPreview) {
      newNameInput.addEventListener('input', () => {
        const name = newNameInput.value.trim() || '';
        newPreview.textContent = name
          ? `~/Documents/Deco/${name}/`
          : '~/Documents/Deco/';
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
          // Use Tauri's documentDir for correct base path
          let base;
          try {
            const { documentDir } = await import('@tauri-apps/api/path');
            base = await documentDir();
          } catch {
            // Fallback if Tauri path API unavailable
            const home = await getHomePath();
            base = home ? `${home}/Documents` : null;
          }
          if (!base) {
            throw new Error('Cannot determine Documents directory');
          }
          const sep = base.endsWith('/') ? '' : '/';
          const path = `${base}${sep}Deco/${name}`;
          const result = await invoke('create_project', { name, path });
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

// ============================================================
// Generate Image — Placeholder Cards (DOM overlay on canvas)
// ============================================================

/**
 * Create a DOM placeholder element overlaid on the canvas while generating.
 * @param {HTMLElement} canvasContainer - The #canvas-container element
 * @param {number} width - Requested image width
 * @param {number} height - Requested image height
 * @param {number} index - Placeholder index (for staggering position)
 * @param {string} prompt - Generation prompt text
 * @returns {object} Placeholder reference { el, worldX, worldY }
 */
function createGeneratePlaceholder(canvasContainer, width, height, index, prompt) {
  // Scale placeholder to a reasonable display size
  const maxDisplayW = 280;
  const aspect = height / width;
  const displayW = maxDisplayW;
  const displayH = Math.round(maxDisplayW * aspect);

  // Position at center of canvas viewport, staggered right per index
  const rect = canvasContainer.getBoundingClientRect();
  const stagger = index * (displayW + 16);
  const left = Math.round((rect.width - displayW) / 2 + stagger);
  const top = Math.round((rect.height - displayH) / 2);

  // Calculate world coordinates for later card placement
  const vp = getViewport();
  const worldX = (left - vp.x) / vp.scale;
  const worldY = (top - vp.y) / vp.scale;

  const el = document.createElement('div');
  el.className = 'generate-placeholder';
  el.style.cssText = `position:absolute;left:${left}px;top:${top}px;width:${displayW}px;height:${displayH}px;z-index:50;`;

  el.innerHTML = `
    <div class="generate-placeholder-shimmer"></div>
    <div class="generate-placeholder-text">
      <div class="generate-placeholder-spinner"></div>
      <span>Generating...</span>
    </div>
  `;
  el.title = prompt;

  canvasContainer.appendChild(el);
  return { el, worldX, worldY, prompt };
}

/**
 * Replace a generate placeholder with a real PixiJS image card.
 * @param {object} placeholder - { el, worldX, worldY }
 * @param {object} result - { path, filename, width, height, prompt, revised_prompt? }
 */
async function replaceGeneratePlaceholder(placeholder, result) {
  const { el, worldX, worldY } = placeholder;

  // Fade in the filled state briefly
  el.classList.add('filled');

  // Show the generated image as preview in the placeholder
  const img = document.createElement('img');
  img.src = convertFileSrc(result.path);
  img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:6px;';
  el.innerHTML = '';
  el.appendChild(img);

  // After brief visual confirmation, remove DOM element and add real canvas card
  setTimeout(async () => {
    el.remove();
    await addImageCard(result, worldX, worldY);
    const statusText = document.getElementById('status-text');
    if (statusText) statusText.textContent = `Generated: ${result.filename}`;
  }, 400);
}

/**
 * Show error state on a generate placeholder with retry button.
 * @param {object} placeholder - { el, worldX, worldY }
 * @param {string} error - Error message
 * @param {function} retryFn - Callback to retry generation
 */
function showGeneratePlaceholderError(placeholder, error, retryFn) {
  const { el } = placeholder;
  el.classList.add('failed');

  el.innerHTML = `
    <div class="generate-placeholder-text">
      <span style="color:var(--destructive,#ff3b30);font-size:12px;">Failed: ${error.slice(0, 80)}</span>
      <button class="generate-placeholder-retry">Retry</button>
    </div>
  `;

  el.querySelector('.generate-placeholder-retry')?.addEventListener('click', () => {
    el.remove();
    retryFn();
  });

  // Auto-remove after 15 seconds if not retried
  setTimeout(() => {
    if (el.parentElement) el.remove();
  }, 15000);
}

// ============================================================
// Floating Selection Toolbar
// ============================================================

function initFloatingToolbar() {
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

main().catch(console.error);
