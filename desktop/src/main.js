// Deco 2.0 — Main entry point
// Initializes the PixiJS canvas, AI panels, search, and wires up the UI shell

import './styles/index.css';

import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { initCanvas, loadProject, fitAll, setUIElements, onCardSelect, applyFilter, getBoardState, restoreBoardState, startAutoSave, getSelection, addImageCard, getViewport, applySavedTheme, setThemeMode, exportCanvasPNG, getAllCards, getSelectionScreenBounds, handleContextAction, changeSelectionColor, changeShapeStrokeWidth, changeTextFontSize, toggleTextBold, toggleTextItalic, toggleSelectionFill, toggleSelectionLineStyle } from './canvas/index.js';
import { initPanels, showMetadata, closePanel, openSettings, closeSettings, analyzeCard, analyzeBatch, openGenerateDialog, startGenerate, initGenerateDialog, closeGenerateDialog, isAutoAnalyzeEnabled, loadFontSizeOnStartup } from './panels.js';
import { initSearch, setProject, updateSearchMetadata, findSimilar, clusterProject, searchByColor } from './search.js';
import { initCollection, setCollectionProject, findMoreLike, toggleWebPanel } from './collection.js';

// Extracted modules
import { compressImageBlob, compressImageFromPath } from './compress.js';
import { createGeneratePlaceholder, replaceGeneratePlaceholder, showGeneratePlaceholderError } from './generate-ui.js';
import { initFloatingToolbar } from './floating-toolbar.js';
import { initShortcuts } from './shortcuts.js';
import { initFindBar } from './find-bar.js';
import { initHomeScreen } from './home.js';

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

  // Load font size preference early (before layout)
  await loadFontSizeOnStartup();

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
      const newCards = [];
      for (let i = 0; i < imported.length; i++) {
        const card = await addImageCard(imported[i], worldX + i * stagger, worldY);
        newCards.push(card);
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

      // Auto-analyze imported images if enabled
      if (isAutoAnalyzeEnabled() && newCards.length > 0) {
        const imageCards = newCards.filter(c => !c.isText && !c.isShape);
        if (imageCards.length > 0) {
          const saveFn = () => {
            invoke('save_board_state', { projectPath: currentProjectPath, state: getBoardState() }).catch(() => {});
          };
          analyzeBatch(imageCards, saveFn);
        }
      }
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
          const card = await addImageCard(info, centerX, centerY);
          const suffix = compressed ? ' (compressed)' : '';
          setStatus(`Pasted image: ${info.name}${suffix}`);

          // Auto-analyze if enabled
          if (isAutoAnalyzeEnabled() && card && !card.isText && !card.isShape) {
            const saveFn = () => {
              invoke('save_board_state', { projectPath: currentProjectPath, state: getBoardState() }).catch(() => {});
            };
            analyzeBatch([card], saveFn);
          }
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

  // Cluster button in tag sidebar
  document.getElementById('cluster-btn')?.addEventListener('click', () => {
    clusterProject(0.7);
  });

  // Color search in tag sidebar
  document.getElementById('color-search-btn')?.addEventListener('click', () => {
    const picker = document.getElementById('color-search-picker');
    if (picker) searchByColor(picker.value);
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

  // ---- Find Bar (Cmd+F) ----
  initFindBar();

  // ---- Keyboard Shortcuts ----
  initShortcuts({
    getCurrentProjectPath: () => currentProjectPath,
  });

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
    const card = await addImageCard(image, x, y);
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

  // Listen for analyze requests from HTTP API (analyze=true on import)
  listen('api:analyze-request', async (event) => {
    const imagePath = event.payload;
    if (!imagePath) return;
    // Find the card by path and trigger analysis
    const allCards = getAllCards();
    const card = allCards.find(c => c.data?.path === imagePath);
    if (card) {
      analyzeCard(card);
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
  initHomeScreen(homeScreen, loading, {
    openProject: (path, loadingEl) => openProject(path, loadingEl),
    setStatus,
  });

  // Statusbar File menu
  const fileBtn = document.getElementById('statusbar-file-btn');
  const fileDropdown = document.getElementById('statusbar-file-dropdown');
  if (fileBtn && fileDropdown) {
    fileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = fileDropdown.classList.toggle('open');
      fileBtn.classList.toggle('active', isOpen);
    });
    // Close on outside click
    window.addEventListener('click', () => {
      fileDropdown.classList.remove('open');
      fileBtn.classList.remove('active');
    });
    document.getElementById('sb-open-folder')?.addEventListener('click', () => {
      fileDropdown.classList.remove('open');
      fileBtn.classList.remove('active');
      if (window.__deco_openFolder) window.__deco_openFolder();
    });
    document.getElementById('sb-new-project')?.addEventListener('click', () => {
      fileDropdown.classList.remove('open');
      fileBtn.classList.remove('active');
      if (window.__deco_newProject) window.__deco_newProject();
    });
  }
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

main().catch(console.error);
