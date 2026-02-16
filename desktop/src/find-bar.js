// Deco 2.0 — Find Bar (Cmd+F)
// macOS-style bottom search bar for filtering canvas cards by name/description/tags
// AI mode: backend FTS5 semantic search over AI-generated metadata

import { getAllCards, applyFilter, scrollToCard } from './canvas/index.js';
import { semanticSearch } from './search.js';

// ============================================================
// State
// ============================================================

let findBarEl = null;
let inputEl = null;
let countEl = null;
let aiBtn = null;
let matches = [];      // card.data.path[] of matched cards
let currentIndex = -1; // index into matches for navigation
let aiMode = false;    // AI search mode toggle
let aiDebounce = null;

// ============================================================
// Init
// ============================================================

export function initFindBar() {
  findBarEl = document.getElementById('find-bar');
  inputEl = document.getElementById('find-bar-input');
  countEl = document.getElementById('find-bar-count');
  aiBtn = document.getElementById('find-bar-ai');

  if (!inputEl) return;

  inputEl.addEventListener('input', () => {
    const query = inputEl.value.trim();
    if (aiMode) {
      clearTimeout(aiDebounce);
      aiDebounce = setTimeout(() => runAiSearch(query), 350);
    } else {
      runFilter(query);
    }
  });

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeFindBar();
      e.stopPropagation();
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (aiMode) {
        // In AI mode, Enter triggers immediate search
        clearTimeout(aiDebounce);
        runAiSearch(inputEl.value.trim());
      } else if (e.shiftKey) {
        navigateMatch(-1);
      } else {
        navigateMatch(1);
      }
    }
  });

  // AI mode toggle
  if (aiBtn) {
    aiBtn.addEventListener('click', () => {
      aiMode = !aiMode;
      aiBtn.classList.toggle('active', aiMode);
      inputEl.placeholder = aiMode ? 'Search by description, tags, mood...' : 'Find on board...';
      // Re-run with current query in new mode
      const query = inputEl.value.trim();
      if (query) {
        if (aiMode) {
          runAiSearch(query);
        } else {
          runFilter(query);
        }
      }
    });
  }

  // Close button
  const closeBtn = document.getElementById('find-bar-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeFindBar);
  }

  // Nav buttons
  const prevBtn = document.getElementById('find-bar-prev');
  const nextBtn = document.getElementById('find-bar-next');
  if (prevBtn) prevBtn.addEventListener('click', () => navigateMatch(-1));
  if (nextBtn) nextBtn.addEventListener('click', () => navigateMatch(1));
}

// ============================================================
// Open / Close
// ============================================================

export function openFindBar() {
  if (!findBarEl) return;
  findBarEl.classList.add('open');
  inputEl.focus();
  inputEl.select();
}

export function closeFindBar() {
  if (!findBarEl) return;
  findBarEl.classList.remove('open');
  inputEl.value = '';
  matches = [];
  currentIndex = -1;
  clearTimeout(aiDebounce);
  updateCount();
  applyFilter(null); // clear filter
  inputEl.blur();
}

export function isFindBarOpen() {
  return findBarEl?.classList.contains('open') ?? false;
}

// ============================================================
// Filter Logic (client-side, no backend)
// ============================================================

function runFilter(query) {
  if (!query) {
    matches = [];
    currentIndex = -1;
    updateCount();
    applyFilter(null);
    return;
  }

  const allCards = getAllCards();
  const q = query.toLowerCase();

  matches = [];
  for (const card of allCards) {
    if (card.isText || card.isShape) continue; // only filter image cards
    const d = card.data;
    const searchable = [
      d.name,
      d.description,
      ...(d.tags || []),
      ...(d.style || []),
      ...(d.mood || []),
      d.era,
    ].filter(Boolean).join(' ').toLowerCase();

    if (searchable.includes(q)) {
      matches.push(d.path);
    }
  }

  currentIndex = matches.length > 0 ? 0 : -1;
  updateCount();
  applyFilter(matches.length > 0 ? matches : []);

  // Scroll to first match
  if (matches.length > 0) {
    scrollToCard(matches[0]);
  }
}

function navigateMatch(direction) {
  if (matches.length === 0) return;
  currentIndex = (currentIndex + direction + matches.length) % matches.length;
  updateCount();
  scrollToCard(matches[currentIndex]);
}

function updateCount() {
  if (!countEl) return;
  if (matches.length === 0 && inputEl.value.trim()) {
    countEl.textContent = 'No results';
    countEl.classList.add('no-results');
  } else if (matches.length > 0) {
    countEl.textContent = `${currentIndex + 1} of ${matches.length}`;
    countEl.classList.remove('no-results');
  } else {
    countEl.textContent = '';
    countEl.classList.remove('no-results');
  }
}

// ============================================================
// AI Search (backend FTS5 over AI-generated metadata)
// ============================================================

async function runAiSearch(query) {
  if (!query) {
    matches = [];
    currentIndex = -1;
    updateCount();
    applyFilter(null);
    return;
  }

  const results = await semanticSearch(query);
  matches = results.map((r) => r.imagePath);
  currentIndex = matches.length > 0 ? 0 : -1;
  updateCount();
  applyFilter(matches.length > 0 ? matches : []);

  if (matches.length > 0) {
    scrollToCard(matches[0]);
  }
}
