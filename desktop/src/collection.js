// RefBoard 2.0 — Web Collection
// Web search, image download, and "Find More Like" functionality
// Wired to Rust backend via Tauri IPC: cmd_web_search, cmd_find_more_like,
// cmd_download_web_image, cmd_get_web_config, cmd_set_web_config

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { icon } from './icons.js';

// ============================================================
// State
// ============================================================

let currentProjectPath = null;
let webResults = [];          // WebSearchResult[]
let downloading = new Set();  // URLs currently downloading
let onImageAddedCallback = null; // (downloadResult) => void

// ============================================================
// Init
// ============================================================

/**
 * Initialize web collection module.
 * @param {object} opts
 * @param {function} opts.onImageAdded - Called when an image is downloaded and added to project
 */
export function initCollection({ onImageAdded } = {}) {
  onImageAddedCallback = onImageAdded || null;
  setupWebSearchBar();
  setupWebPanel();
  listenForWebEvents();
}

/**
 * Set the current project path.
 */
export function setCollectionProject(projectPath) {
  currentProjectPath = projectPath;
}

// ============================================================
// Web Search
// ============================================================

function setupWebSearchBar() {
  const input = document.getElementById('web-search-input');
  if (!input) return;

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const query = input.value.trim();
      if (query) performWebSearch(query);
    }
    if (e.key === 'Escape') {
      input.value = '';
      input.blur();
    }
  });

  const searchBtn = document.getElementById('web-search-btn');
  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      const query = input.value.trim();
      if (query) performWebSearch(query);
    });
  }
}

async function performWebSearch(query) {
  const statusEl = document.getElementById('status-text');
  if (statusEl) statusEl.textContent = `Searching web: "${query}"...`;

  showWebPanel(true);
  showWebLoading(true);

  try {
    webResults = await invoke('cmd_web_search', { query });
    renderWebResults(webResults);
    if (statusEl) statusEl.textContent = `Found ${webResults.length} web results`;
  } catch (err) {
    if (statusEl) statusEl.textContent = `Web search failed: ${err}`;
    renderWebError(err.toString());
  } finally {
    showWebLoading(false);
  }
}

/**
 * Find more images like the given card using AI-generated queries.
 * @param {object} card - Canvas card object with data.path
 * @param {string} [refinement] - Optional refinement text
 */
export async function findMoreLike(card, refinement) {
  if (!card?.data?.path) return;

  const statusEl = document.getElementById('status-text');
  if (statusEl) statusEl.textContent = 'Finding similar images online...';

  showWebPanel(true);
  showWebLoading(true);

  try {
    webResults = await invoke('cmd_find_more_like', {
      imagePath: card.data.path,
      refinement: refinement || null,
    });
    renderWebResults(webResults);
    if (statusEl) statusEl.textContent = `Found ${webResults.length} similar images online`;
  } catch (err) {
    if (statusEl) statusEl.textContent = `Find more like failed: ${err}`;
    renderWebError(err.toString());
  } finally {
    showWebLoading(false);
  }
}

// ============================================================
// Web Results Panel
// ============================================================

function setupWebPanel() {
  const closeBtn = document.getElementById('web-panel-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      showWebPanel(false);
    });
  }

  // Download All button
  const downloadAllBtn = document.getElementById('web-download-all-btn');
  if (downloadAllBtn) {
    downloadAllBtn.addEventListener('click', downloadAllResults);
  }
}

function renderWebResults(results) {
  const container = document.getElementById('web-results-grid');
  if (!container) return;
  container.innerHTML = '';

  const countEl = document.getElementById('web-results-count');
  if (countEl) {
    countEl.textContent = results.length > 0
      ? `${results.length} image${results.length !== 1 ? 's' : ''}`
      : 'No results';
  }

  if (results.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'web-empty';
    empty.textContent = 'No images found. Try a different search query.';
    container.appendChild(empty);
    return;
  }

  results.forEach((result) => {
    const card = document.createElement('div');
    card.className = 'web-result-card';
    card.dataset.imageUrl = result.imageUrl;
    card.dataset.sourceUrl = result.sourceUrl;

    const img = document.createElement('img');
    img.className = 'web-result-img';
    img.src = result.thumbnailUrl;
    img.alt = result.title;
    img.loading = 'lazy';
    img.addEventListener('error', () => {
      img.src = '';
      img.alt = 'Failed to load';
      img.style.background = '#2a2a4a';
    });

    const overlay = document.createElement('div');
    overlay.className = 'web-result-overlay';

    const title = document.createElement('div');
    title.className = 'web-result-title';
    title.textContent = result.title || 'Untitled';

    const domain = document.createElement('div');
    domain.className = 'web-result-domain';
    domain.textContent = result.sourceDomain;

    const dims = document.createElement('div');
    dims.className = 'web-result-dims';
    if (result.width && result.height) {
      dims.textContent = `${result.width}\u00d7${result.height}`;
    }

    const dlBtn = document.createElement('button');
    dlBtn.className = 'web-dl-btn';
    dlBtn.innerHTML = icon('plus', 14);
    dlBtn.title = 'Download to project';
    dlBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      downloadImage(result, card);
    });

    overlay.appendChild(title);
    overlay.appendChild(domain);
    if (result.width && result.height) overlay.appendChild(dims);
    overlay.appendChild(dlBtn);

    card.appendChild(img);
    card.appendChild(overlay);
    container.appendChild(card);
  });
}

function renderWebError(message) {
  const container = document.getElementById('web-results-grid');
  if (!container) return;
  container.innerHTML = '';

  const errEl = document.createElement('div');
  errEl.className = 'web-error';

  if (message.includes('No Brave Search API key')) {
    errEl.innerHTML = `
      <p>Brave Search API key required.</p>
      <p style="font-size:11px;margin-top:6px;">
        Get a free key at <strong>brave.com/search/api</strong>,
        then add it in Settings.
      </p>
    `;
  } else {
    errEl.textContent = message;
  }

  container.appendChild(errEl);
}

function showWebPanel(show) {
  const panel = document.getElementById('web-panel');
  if (panel) {
    if (show) {
      panel.classList.add('open');
    } else {
      panel.classList.remove('open');
    }
  }
}

function showWebLoading(show) {
  const spinner = document.getElementById('web-loading');
  if (spinner) spinner.style.display = show ? 'flex' : 'none';
}

// ============================================================
// Download
// ============================================================

async function downloadImage(result, cardEl) {
  if (!currentProjectPath) return;
  if (downloading.has(result.imageUrl)) return;

  downloading.add(result.imageUrl);
  if (cardEl) cardEl.classList.add('downloading');

  const statusEl = document.getElementById('status-text');

  try {
    const dlResult = await invoke('cmd_download_web_image', {
      imageUrl: result.imageUrl,
      projectPath: currentProjectPath,
      sourceUrl: result.sourceUrl,
    });

    if (cardEl) {
      cardEl.classList.remove('downloading');
      cardEl.classList.add('downloaded');
    }

    if (statusEl) statusEl.textContent = `Downloaded: ${dlResult.name}`;

    if (onImageAddedCallback) {
      onImageAddedCallback(dlResult);
    }

    // Trigger CLIP embedding for newly downloaded image
    invoke('cmd_embed_project', { projectPath: currentProjectPath })
      .then((count) => {
        if (count > 0) console.log(`[CLIP] Embedded ${count} new images`);
      })
      .catch((err) => console.log('[CLIP] Embedding skipped:', err));
  } catch (err) {
    if (cardEl) cardEl.classList.remove('downloading');
    if (statusEl) statusEl.textContent = `Download failed: ${err}`;
  } finally {
    downloading.delete(result.imageUrl);
  }
}

async function downloadAllResults() {
  if (!currentProjectPath || webResults.length === 0) return;

  const statusEl = document.getElementById('status-text');
  if (statusEl) statusEl.textContent = `Downloading ${webResults.length} images...`;

  const cards = document.querySelectorAll('.web-result-card');
  let downloaded = 0;
  let failed = 0;

  for (let i = 0; i < webResults.length; i++) {
    const result = webResults[i];
    const cardEl = cards[i];

    if (cardEl?.classList.contains('downloaded')) continue;

    try {
      await downloadImage(result, cardEl);
      downloaded++;
    } catch {
      failed++;
    }

    if (statusEl) {
      statusEl.textContent = `Downloaded ${downloaded}/${webResults.length}${failed ? ` (${failed} failed)` : ''}`;
    }
  }

  if (statusEl) {
    statusEl.textContent = `Download complete: ${downloaded} saved${failed ? `, ${failed} failed` : ''}`;
  }

  // Trigger CLIP embedding for batch downloaded images
  if (downloaded > 0) {
    invoke('cmd_embed_project', { projectPath: currentProjectPath })
      .then((count) => {
        if (count > 0) console.log(`[CLIP] Embedded ${count} new images`);
      })
      .catch((err) => console.log('[CLIP] Embedding skipped:', err));
  }
}

// ============================================================
// Web Config (Settings integration)
// ============================================================

/**
 * Load web collection config from backend.
 */
export async function loadWebConfig() {
  try {
    return await invoke('cmd_get_web_config');
  } catch {
    return { braveApiKey: null, safeSearch: 'moderate', resultsCount: 20 };
  }
}

/**
 * Save web collection config to backend.
 */
export async function saveWebConfig(config) {
  return invoke('cmd_set_web_config', { config });
}

// ============================================================
// Tauri Event Listeners
// ============================================================

function listenForWebEvents() {
  listen('web:search:start', (event) => {
    const statusEl = document.getElementById('status-text');
    if (statusEl) statusEl.textContent = `Searching: ${event.payload}`;
  }).catch(() => {});

  listen('web:search:complete', (event) => {
    const statusEl = document.getElementById('status-text');
    if (statusEl) statusEl.textContent = `Search complete: ${event.payload} results`;
  }).catch(() => {});

  listen('web:download:start', () => {
    const statusEl = document.getElementById('status-text');
    if (statusEl) statusEl.textContent = 'Downloading image...';
  }).catch(() => {});

  listen('web:download:complete', (event) => {
    const statusEl = document.getElementById('status-text');
    if (statusEl) statusEl.textContent = `Downloaded: ${event.payload.split('/').pop()}`;
  }).catch(() => {});
}

// ============================================================
// Toggle (for sidebar button)
// ============================================================

export function toggleWebPanel() {
  const panel = document.getElementById('web-panel');
  if (panel) {
    panel.classList.toggle('open');
    const btn = document.getElementById('web-sidebar-btn');
    if (btn) btn.classList.toggle('active');
  }
}
