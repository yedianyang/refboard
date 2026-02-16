// Deco 2.0 — Search & Similarity
// Search bar, tag filter sidebar, search results panel, find-similar action

import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';

// ============================================================
// State
// ============================================================

let currentProjectPath = null;
let allTags = [];           // TagCount[] from backend
let activeTagFilters = new Set();
let searchResults = [];     // SearchResult[] from last search
let onFilterCallback = null;   // (matchingPaths: string[] | null) => void
let onFindSimilarCallback = null; // (results: SearchResult[]) => void
let searchDebounceTimer = null;

// ============================================================
// Init
// ============================================================

/**
 * Initialize search module.
 * @param {object} opts
 * @param {function} opts.onFilter - Called with array of matching image paths (or null to clear filter)
 * @param {function} opts.onFindSimilar - Called with similarity results
 */
export function initSearch({ onFilter, onFindSimilar } = {}) {
  onFilterCallback = onFilter || null;
  onFindSimilarCallback = onFindSimilar || null;
  setupSearchBar();
  setupTagSidebar();
  setupResultsPanel();
}

/**
 * Set the current project path and index it for search.
 * Call this after loading a project.
 */
export async function setProject(projectPath) {
  currentProjectPath = projectPath;
  activeTagFilters.clear();

  try {
    // Index project images in SQLite
    await invoke('cmd_index_project', { projectPath });
    // Load tags for sidebar
    await refreshTags();
  } catch (err) {
    console.warn('Search indexing failed:', err);
  }
}

/**
 * Update search index metadata for a single image (after AI analysis).
 */
export async function updateSearchMetadata(card) {
  if (!currentProjectPath) return;

  try {
    await invoke('cmd_update_search_metadata', {
      projectPath: currentProjectPath,
      metadata: {
        imagePath: card.data.path,
        name: card.data.name,
        description: card.data.description || null,
        tags: card.data.tags || [],
        style: card.data.style || [],
        mood: card.data.mood || [],
        colors: card.data.colors || [],
        era: card.data.era || null,
      },
    });
    // Refresh tags after metadata update
    await refreshTags();
  } catch (err) {
    console.warn('Search metadata update failed:', err);
  }
}

// ============================================================
// Search Bar
// ============================================================

function setupSearchBar() {
  const input = document.getElementById('search-input');
  if (!input) return;

  input.addEventListener('input', () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      performSearch(input.value.trim());
    }, 250);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      input.value = '';
      clearSearch();
      input.blur();
    }
    if (e.key === 'Enter') {
      clearTimeout(searchDebounceTimer);
      performSearch(input.value.trim());
    }
  });

  // Clear button
  const clearBtn = document.getElementById('search-clear-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      input.value = '';
      clearSearch();
    });
  }
}

async function performSearch(query) {
  if (!currentProjectPath || !query) {
    clearSearch();
    return;
  }

  try {
    searchResults = await invoke('cmd_search_text', {
      projectPath: currentProjectPath,
      query,
      limit: 50,
    });

    renderSearchResults(searchResults);
    showResultsPanel(true);

    // Notify canvas to highlight matching cards
    if (onFilterCallback) {
      const paths = searchResults.map((r) => r.imagePath);
      onFilterCallback(paths);
    }
  } catch (err) {
    console.warn('Search failed:', err);
    clearSearch();
  }
}

function clearSearch() {
  searchResults = [];
  renderSearchResults([]);
  showResultsPanel(false);
  if (onFilterCallback) {
    onFilterCallback(null); // Clear filter
  }
}

// ============================================================
// Tag Filter Sidebar
// ============================================================

function setupTagSidebar() {
  // Tag sidebar toggle button
  const tagBtn = document.getElementById('tag-sidebar-btn');
  if (tagBtn) {
    tagBtn.addEventListener('click', () => {
      toggleTagSidebar();
    });
  }
}

async function refreshTags() {
  if (!currentProjectPath) return;

  try {
    allTags = await invoke('cmd_get_all_tags', {
      projectPath: currentProjectPath,
    });
    renderTagSidebar(allTags);
  } catch (err) {
    console.warn('Tag refresh failed:', err);
    allTags = [];
  }
}

function renderTagSidebar(tags) {
  const container = document.getElementById('tag-list');
  if (!container) return;
  container.innerHTML = '';

  if (tags.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'tag-empty';
    empty.textContent = 'No tags yet. Analyze images to generate tags.';
    container.appendChild(empty);
    return;
  }

  // "Clear filters" button
  if (activeTagFilters.size > 0) {
    const clearItem = document.createElement('button');
    clearItem.className = 'tag-item tag-clear';
    clearItem.textContent = 'Clear filters';
    clearItem.addEventListener('click', () => {
      activeTagFilters.clear();
      renderTagSidebar(allTags);
      if (onFilterCallback) onFilterCallback(null);
    });
    container.appendChild(clearItem);
  }

  tags.forEach(({ tag, count }) => {
    const item = document.createElement('button');
    item.className = 'tag-item';
    if (activeTagFilters.has(tag)) {
      item.classList.add('active');
    }

    const label = document.createElement('span');
    label.className = 'tag-label';
    label.textContent = tag;

    const badge = document.createElement('span');
    badge.className = 'tag-count';
    badge.textContent = count;

    item.appendChild(label);
    item.appendChild(badge);

    item.addEventListener('click', () => toggleTagFilter(tag));
    container.appendChild(item);
  });
}

async function toggleTagFilter(tag) {
  if (activeTagFilters.has(tag)) {
    activeTagFilters.delete(tag);
  } else {
    activeTagFilters.add(tag);
  }

  renderTagSidebar(allTags);

  if (activeTagFilters.size === 0) {
    if (onFilterCallback) onFilterCallback(null);
    return;
  }

  // Get intersection of images matching ALL active tags
  if (!currentProjectPath) return;

  try {
    const tagArrays = await Promise.all(
      Array.from(activeTagFilters).map((t) =>
        invoke('cmd_filter_by_tag', { projectPath: currentProjectPath, tag: t })
      )
    );

    // Intersection of all tag results
    let matchingPaths = null;
    for (const paths of tagArrays) {
      const pathSet = new Set(paths);
      if (matchingPaths === null) {
        matchingPaths = pathSet;
      } else {
        matchingPaths = new Set([...matchingPaths].filter((p) => pathSet.has(p)));
      }
    }

    if (onFilterCallback) {
      onFilterCallback(matchingPaths ? Array.from(matchingPaths) : []);
    }
  } catch (err) {
    console.warn('Tag filter failed:', err);
  }
}

function toggleTagSidebar() {
  const sidebar = document.getElementById('tag-sidebar');
  if (sidebar) {
    sidebar.classList.toggle('open');
    const btn = document.getElementById('tag-sidebar-btn');
    if (btn) btn.classList.toggle('active');
  }
}

/** Programmatically show/hide the tag sidebar. */
export function showTagSidebar(show) {
  const sidebar = document.getElementById('tag-sidebar');
  const btn = document.getElementById('tag-sidebar-btn');
  if (sidebar) {
    if (show) {
      sidebar.classList.add('open');
      if (btn) btn.classList.add('active');
    } else {
      sidebar.classList.remove('open');
      if (btn) btn.classList.remove('active');
    }
  }
}

// ============================================================
// Search Results Panel
// ============================================================

function setupResultsPanel() {
  const closeBtn = document.getElementById('results-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      const input = document.getElementById('search-input');
      if (input) input.value = '';
      clearSearch();
    });
  }
}

function renderSearchResults(results) {
  const container = document.getElementById('results-list');
  if (!container) return;
  container.innerHTML = '';

  const countEl = document.getElementById('results-count');
  if (countEl) {
    countEl.textContent = results.length > 0
      ? `${results.length} result${results.length !== 1 ? 's' : ''}`
      : '';
  }

  results.forEach((result) => {
    const item = document.createElement('div');
    item.className = 'result-item';
    item.dataset.path = result.imagePath;

    const thumb = document.createElement('img');
    thumb.className = 'result-thumb';
    thumb.src = convertFileSrc(result.imagePath);
    thumb.alt = result.name;
    thumb.loading = 'lazy';

    const info = document.createElement('div');
    info.className = 'result-info';

    const name = document.createElement('div');
    name.className = 'result-name';
    name.textContent = result.name;

    const desc = document.createElement('div');
    desc.className = 'result-desc';
    desc.textContent = result.description || '';

    const tags = document.createElement('div');
    tags.className = 'result-tags';
    (result.tags || []).slice(0, 5).forEach((t) => {
      const chip = document.createElement('span');
      chip.className = 'result-tag';
      chip.textContent = t;
      tags.appendChild(chip);
    });

    info.appendChild(name);
    if (result.description) info.appendChild(desc);
    if (result.tags?.length) info.appendChild(tags);

    item.appendChild(thumb);
    item.appendChild(info);

    // Click to scroll to card on canvas
    item.addEventListener('click', () => {
      // Emit custom event for canvas to handle
      window.dispatchEvent(
        new CustomEvent('deco:scroll-to-card', {
          detail: { path: result.imagePath },
        })
      );
    });

    container.appendChild(item);
  });
}

function showResultsPanel(show) {
  const panel = document.getElementById('search-results-panel');
  if (panel) {
    if (show && searchResults.length > 0) {
      panel.classList.add('open');
    } else {
      panel.classList.remove('open');
    }
  }
}

// ============================================================
// Find Similar
// ============================================================

/**
 * Find images similar to the given card.
 * Uses embeddings if available, falls back to tag similarity.
 */
export async function findSimilar(card) {
  if (!currentProjectPath || !card?.data?.path) return;

  const statusEl = document.getElementById('status-text');
  if (statusEl) statusEl.textContent = 'Finding similar images...';

  try {
    const results = await invoke('cmd_find_similar', {
      projectPath: currentProjectPath,
      imagePath: card.data.path,
      limit: 10,
    });

    if (results.length === 0) {
      if (statusEl) statusEl.textContent = 'No similar images found. Analyze more images first.';
      return;
    }

    // Show results in the search results panel
    searchResults = results;
    const countEl = document.getElementById('results-count');
    if (countEl) countEl.textContent = `${results.length} similar`;
    renderSearchResults(results);
    showResultsPanel(true);

    // Highlight matching cards on canvas
    if (onFilterCallback) {
      const paths = [card.data.path, ...results.map((r) => r.imagePath)];
      onFilterCallback(paths);
    }

    if (onFindSimilarCallback) {
      onFindSimilarCallback(results);
    }

    if (statusEl) statusEl.textContent = `Found ${results.length} similar images`;
  } catch (err) {
    if (statusEl) statusEl.textContent = 'Find similar failed: ' + err;
    console.warn('Find similar failed:', err);
  }
}

// ============================================================
// Public Getters
// ============================================================

export function getActiveFilters() { return activeTagFilters; }
export function getAllTags() { return allTags; }
export function getSearchResults() { return searchResults; }
