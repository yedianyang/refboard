// Deco 2.0 — Home Screen
// Project list, new project dialog, grid/list toggle, context menu

import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

export async function getHomePath() {
  try {
    const { homeDir } = await import('@tauri-apps/api/path');
    return await homeDir();
  } catch {
    return null;
  }
}

/**
 * Initialize the home screen UI.
 * @param {HTMLElement} homeScreen - The #home-screen element
 * @param {HTMLElement} loading - The loading indicator element
 * @param {object} deps - Dependencies injected from main.js
 * @param {function} deps.openProject - Function to open a project by path
 * @param {function} deps.setStatus - Function to set status bar text
 */
export async function initHomeScreen(homeScreen, loading, deps) {
  if (!homeScreen) return;

  const { openProject, setStatus } = deps;

  const gridEl = document.getElementById('home-project-list');
  const openBtn = document.getElementById('open-folder-btn');
  const newBtn = null; // New Project is now a card in the grid

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

      // New Project card — always first in grid
      const newProjectCard = `
        <button class="home-project-card home-new-project-card" id="home-new-card">
          <div class="home-project-thumb">
            <span class="home-new-project-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg></span>
          </div>
          <div class="home-project-info">
            <div class="home-project-name">Create Board</div>
          </div>
        </button>`;

      if (projects.length > 0) {
        gridEl.innerHTML = newProjectCard + projects.map((p) => {
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
        gridEl.querySelectorAll('.home-project-card[data-path]').forEach((card) => {
          card.addEventListener('click', () => {
            const path = card.dataset.path;
            openProject(path, loading);
          });
        });

        // Lazy-load thumbnail mosaics for each project card
        for (const card of gridEl.querySelectorAll('.home-project-card[data-path]')) {
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
        gridEl.innerHTML = newProjectCard;
      }

      // Wire New Project card click → show dialog
      const newCard = gridEl.querySelector('#home-new-card');
      if (newCard) {
        newCard.addEventListener('click', () => {
          const dlg = document.getElementById('new-project-dialog');
          if (dlg) {
            dlg.classList.add('open');
            const nameInput = document.getElementById('new-project-name');
            if (nameInput) { nameInput.value = ''; nameInput.focus(); }
            const preview = document.getElementById('new-project-path-preview');
            if (preview) preview.textContent = '~/Documents/Deco/';
          }
        });
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

  // Attach context menu to project cards (skip New Project card)
  gridEl.addEventListener('contextmenu', (e) => {
    const card = e.target.closest('.home-project-card[data-path]');
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

  // New project dialog wiring
  const newDialog = document.getElementById('new-project-dialog');
  const newNameInput = document.getElementById('new-project-name');
  const newPreview = document.getElementById('new-project-path-preview');
  const newCancelBtn = document.getElementById('new-project-cancel-btn');
  const newCreateBtn = document.getElementById('new-project-create-btn');

  if (newDialog) {
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
          let base;
          try {
            const { documentDir } = await import('@tauri-apps/api/path');
            base = await documentDir();
          } catch {
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

  // Expose openFolder for use by statusbar File menu
  window.__deco_openFolder = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ directory: true, title: 'Open Image Folder' });
      if (selected) openProject(selected, loading);
    } catch (err) {
      console.error('[Dialog] Open folder failed:', err);
    }
  };
  window.__deco_newProject = () => {
    const dlg = document.getElementById('new-project-dialog');
    if (dlg) {
      dlg.classList.add('open');
      const nameInput = document.getElementById('new-project-name');
      if (nameInput) { nameInput.value = ''; nameInput.focus(); }
      const preview = document.getElementById('new-project-path-preview');
      if (preview) preview.textContent = '~/Documents/Deco/';
    }
  };
}
