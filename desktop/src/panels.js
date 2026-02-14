// RefBoard 2.0 — AI Panels & Settings
// Suggestion panel, metadata panel, and settings dialog
// Wired to Rust backend via Tauri IPC: analyze_image, get_ai_config, set_ai_config, check_ollama

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { convertFileSrc } from '@tauri-apps/api/core';

// ============================================================
// State
// ============================================================

let activePanel = null; // 'suggestion' | 'metadata' | null
let currentCard = null; // The card object currently displayed
let currentAnalysis = null; // Latest AI analysis result
let onAcceptCallback = null; // Called when user accepts suggestions
let onFindSimilarCallback = null; // Called when user clicks "Find Similar"

// Provider default models
const PROVIDER_MODELS = {
  anthropic: ['claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001'],
  openai: ['gpt-4o', 'gpt-4o-mini'],
  ollama: ['llava', 'llava:13b', 'llava:34b', 'bakllava'],
};

const PROVIDER_LABELS = {
  anthropic: 'Claude (Anthropic)',
  openai: 'GPT-4o (OpenAI)',
  ollama: 'Ollama (Local)',
};

// ============================================================
// Panel Container
// ============================================================

/** Initialize all panel DOM and event listeners. Call once at startup. */
export function initPanels({ onAccept, onFindSimilar } = {}) {
  onAcceptCallback = onAccept || null;
  onFindSimilarCallback = onFindSimilar || null;
  setupPanelEvents();
  setupSettingsEvents();
  setupKeyboardShortcuts();
  listenForAIEvents();
}

function setupKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (document.getElementById('settings-dialog').classList.contains('open')) {
        closeSettings();
      } else if (activePanel) {
        closePanel();
      }
    }
  });
}

// ============================================================
// Right Panel (shared container for suggestion + metadata)
// ============================================================

function openPanel(type) {
  const panel = document.getElementById('right-panel');
  const suggestionView = document.getElementById('suggestion-view');
  const metadataView = document.getElementById('metadata-view');

  if (type === 'suggestion') {
    suggestionView.style.display = 'flex';
    metadataView.style.display = 'none';
  } else {
    suggestionView.style.display = 'none';
    metadataView.style.display = 'flex';
  }

  panel.classList.add('open');
  activePanel = type;
}

export function closePanel() {
  const panel = document.getElementById('right-panel');
  panel.classList.remove('open');
  activePanel = null;
  currentCard = null;
  currentAnalysis = null;
}

// ============================================================
// Suggestion Panel
// ============================================================

/**
 * Show the suggestion panel with AI analysis results.
 * @param {object} card - The canvas card object
 * @param {object} analysis - AnalysisResult from Rust backend
 */
export function showSuggestions(card, analysis) {
  currentCard = card;
  currentAnalysis = analysis;

  // Thumbnail
  const thumb = document.getElementById('suggestion-thumb');
  thumb.src = convertFileSrc(card.data.path);
  thumb.alt = card.data.name;

  // Description
  document.getElementById('suggestion-desc').textContent =
    analysis.description || 'No description generated.';

  // Tags
  renderChips('suggestion-tags', analysis.tags || [], true);

  // Style keywords
  renderChips('suggestion-styles', analysis.style || [], false);

  // Mood
  renderChips('suggestion-moods', analysis.mood || [], false);

  // Colors
  renderColorSwatches('suggestion-colors', analysis.colors || []);

  // Era
  const eraEl = document.getElementById('suggestion-era');
  if (analysis.era) {
    eraEl.textContent = analysis.era;
    eraEl.parentElement.style.display = 'flex';
  } else {
    eraEl.parentElement.style.display = 'none';
  }

  openPanel('suggestion');
}

function renderChips(containerId, items, editable) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  items.forEach((text) => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.dataset.value = text;

    const label = document.createElement('span');
    label.className = 'chip-label';
    label.textContent = text;
    chip.appendChild(label);

    if (editable) {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'chip-remove';
      removeBtn.textContent = '\u00d7';
      removeBtn.title = 'Remove';
      removeBtn.addEventListener('click', () => chip.remove());
      chip.appendChild(removeBtn);
    }

    container.appendChild(chip);
  });

  // Add input for new tags (only for editable tag fields)
  if (editable) {
    const addBtn = document.createElement('button');
    addBtn.className = 'chip chip-add';
    addBtn.textContent = '+ Add';
    addBtn.addEventListener('click', () => {
      const input = document.createElement('input');
      input.className = 'chip-input';
      input.type = 'text';
      input.placeholder = 'tag...';
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && input.value.trim()) {
          const val = input.value.trim().toLowerCase().replace(/\s+/g, '-');
          input.replaceWith(createChip(val, true));
        } else if (e.key === 'Escape') {
          input.remove();
        }
      });
      input.addEventListener('blur', () => {
        if (input.value.trim()) {
          const val = input.value.trim().toLowerCase().replace(/\s+/g, '-');
          input.replaceWith(createChip(val, true));
        } else {
          input.remove();
        }
      });
      addBtn.before(input);
      input.focus();
    });
    container.appendChild(addBtn);
  }
}

function createChip(text, editable) {
  const chip = document.createElement('span');
  chip.className = 'chip';
  chip.dataset.value = text;

  const label = document.createElement('span');
  label.className = 'chip-label';
  label.textContent = text;
  chip.appendChild(label);

  if (editable) {
    const removeBtn = document.createElement('button');
    removeBtn.className = 'chip-remove';
    removeBtn.textContent = '\u00d7';
    removeBtn.addEventListener('click', () => chip.remove());
    chip.appendChild(removeBtn);
  }

  return chip;
}

function renderColorSwatches(containerId, colors) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  colors.forEach((hex) => {
    const swatch = document.createElement('span');
    swatch.className = 'color-swatch';
    swatch.style.backgroundColor = hex;
    swatch.title = hex;
    container.appendChild(swatch);
  });
}

/** Collect accepted tags from the suggestion panel chip editor. */
function getAcceptedTags() {
  const container = document.getElementById('suggestion-tags');
  const chips = container.querySelectorAll('.chip:not(.chip-add)');
  return Array.from(chips).map((c) => c.dataset.value);
}

function setupPanelEvents() {
  // Accept All button
  document.getElementById('accept-all-btn')?.addEventListener('click', () => {
    if (!currentCard || !currentAnalysis) return;
    const tags = getAcceptedTags();
    acceptSuggestions({ ...currentAnalysis, tags });
  });

  // Dismiss button
  document.getElementById('dismiss-suggestions-btn')?.addEventListener('click', () => {
    closePanel();
  });

  // Metadata panel: Analyze button
  document.getElementById('meta-analyze-btn')?.addEventListener('click', () => {
    if (!currentCard) return;
    analyzeCard(currentCard);
  });

  // Find Similar button (metadata panel)
  document.getElementById('meta-similar-btn')?.addEventListener('click', () => {
    if (!currentCard || !onFindSimilarCallback) return;
    onFindSimilarCallback(currentCard);
  });

  // Close panel button
  document.querySelectorAll('.panel-close-btn').forEach((btn) => {
    btn.addEventListener('click', closePanel);
  });
}

async function acceptSuggestions(analysis) {
  if (!currentCard) return;

  // Merge analysis into card data
  currentCard.data.description = analysis.description;
  currentCard.data.tags = analysis.tags;
  currentCard.data.style = analysis.style;
  currentCard.data.mood = analysis.mood;
  currentCard.data.colors = analysis.colors;
  currentCard.data.era = analysis.era;

  // Notify callback
  if (onAcceptCallback) {
    onAcceptCallback(currentCard, analysis);
  }

  closePanel();
}

// ============================================================
// Metadata Panel
// ============================================================

/**
 * Show the metadata panel for a card.
 * @param {object} card - The canvas card object
 */
export function showMetadata(card) {
  currentCard = card;

  // Thumbnail
  const thumb = document.getElementById('meta-thumb');
  thumb.src = convertFileSrc(card.data.path);
  thumb.alt = card.data.name;

  // Filename
  document.getElementById('meta-filename').textContent = card.data.name;

  // File size
  const sizeKB = card.data.sizeBytes
    ? `${(card.data.sizeBytes / 1024).toFixed(1)} KB`
    : '';
  document.getElementById('meta-filesize').textContent = sizeKB;

  // Description (editable)
  const descInput = document.getElementById('meta-desc-input');
  descInput.value = card.data.description || '';

  // Tags (editable chips)
  renderChips('meta-tags', card.data.tags || [], true);

  // Style
  renderChips('meta-styles', card.data.style || [], false);

  // Colors
  renderColorSwatches('meta-colors', card.data.colors || []);

  // Era
  const eraEl = document.getElementById('meta-era');
  if (card.data.era) {
    eraEl.textContent = card.data.era;
    eraEl.parentElement.style.display = 'flex';
  } else {
    eraEl.parentElement.style.display = 'none';
  }

  openPanel('metadata');
}

// ============================================================
// AI Analysis
// ============================================================

let analyzing = false;

/**
 * Trigger AI analysis for a card.
 * @param {object} card - The canvas card object
 */
export async function analyzeCard(card) {
  if (analyzing) return;
  analyzing = true;

  showAnalysisLoading(true);

  try {
    const config = await invoke('get_ai_config');

    // Collect existing tags from all cards for context-aware tagging
    const existingTags = collectAllTags();

    const result = await invoke('analyze_image', {
      imagePath: card.data.path,
      providerConfig: config,
      existingTags,
    });

    showSuggestions(card, result);
  } catch (err) {
    showAnalysisError(err.toString());
  } finally {
    analyzing = false;
    showAnalysisLoading(false);
  }
}

function collectAllTags() {
  // Imported cards may have tags — collect unique set
  const tags = new Set();
  // Access allCards via the canvas module if available
  // For now, return empty — will be wired later
  return Array.from(tags);
}

function showAnalysisLoading(show) {
  const spinner = document.getElementById('analysis-spinner');
  if (spinner) {
    spinner.style.display = show ? 'flex' : 'none';
  }
}

function showAnalysisError(message) {
  const el = document.getElementById('analysis-error');
  if (el) {
    el.textContent = message;
    el.style.display = 'block';
    setTimeout(() => {
      el.style.display = 'none';
    }, 5000);
  }
}

// Listen for Tauri AI events
function listenForAIEvents() {
  listen('ai:analysis:start', (event) => {
    const statusText = document.getElementById('status-text');
    if (statusText) {
      statusText.textContent = `Analyzing: ${event.payload.split('/').pop()}`;
    }
  }).catch(() => {});

  listen('ai:analysis:complete', () => {
    const statusText = document.getElementById('status-text');
    if (statusText) statusText.textContent = 'Analysis complete';
  }).catch(() => {});

  listen('ai:analysis:error', (event) => {
    const statusText = document.getElementById('status-text');
    if (statusText) statusText.textContent = `AI Error: ${event.payload}`;
  }).catch(() => {});
}

// ============================================================
// Settings Dialog
// ============================================================

export function openSettings() {
  const dialog = document.getElementById('settings-dialog');
  dialog.classList.add('open');
  loadSettingsFromBackend();
}

export function closeSettings() {
  const dialog = document.getElementById('settings-dialog');
  dialog.classList.remove('open');
}

async function loadSettingsFromBackend() {
  try {
    const config = await invoke('get_ai_config');
    populateSettings(config);
  } catch (err) {
    populateSettings({
      provider: 'anthropic',
      apiKey: null,
      endpoint: 'https://api.anthropic.com/v1',
      model: null,
    });
  }
}

function populateSettings(config) {
  const providerSelect = document.getElementById('settings-provider');
  providerSelect.value = config.provider || 'anthropic';

  document.getElementById('settings-api-key').value = config.apiKey || '';
  document.getElementById('settings-endpoint').value = config.endpoint || '';

  updateModelOptions(config.provider || 'anthropic', config.model);
  updateProviderFields(config.provider || 'anthropic');
}

function updateModelOptions(provider, selectedModel) {
  const modelSelect = document.getElementById('settings-model');
  modelSelect.innerHTML = '';

  const models = PROVIDER_MODELS[provider] || [];
  models.forEach((m) => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    if (m === selectedModel) opt.selected = true;
    modelSelect.appendChild(opt);
  });
}

function updateProviderFields(provider) {
  const apiKeyGroup = document.getElementById('settings-api-key-group');
  const endpointGroup = document.getElementById('settings-endpoint-group');

  if (provider === 'ollama') {
    apiKeyGroup.style.display = 'none';
    endpointGroup.style.display = 'flex';
    document.getElementById('settings-endpoint').placeholder = 'http://localhost:11434';
  } else {
    apiKeyGroup.style.display = 'flex';
    endpointGroup.style.display = 'none';
  }
}

function setupSettingsEvents() {
  // Provider change
  document.getElementById('settings-provider')?.addEventListener('change', (e) => {
    const provider = e.target.value;
    updateModelOptions(provider, null);
    updateProviderFields(provider);
  });

  // Save button
  document.getElementById('settings-save-btn')?.addEventListener('click', async () => {
    await saveSettings();
  });

  // Cancel button
  document.getElementById('settings-cancel-btn')?.addEventListener('click', () => {
    closeSettings();
  });

  // Test connection button
  document.getElementById('settings-test-btn')?.addEventListener('click', async () => {
    await testConnection();
  });

  // Backdrop click closes dialog
  document.getElementById('settings-dialog')?.addEventListener('click', (e) => {
    if (e.target.id === 'settings-dialog') {
      closeSettings();
    }
  });
}

async function saveSettings() {
  const provider = document.getElementById('settings-provider').value;
  const apiKey = document.getElementById('settings-api-key').value.trim();
  const endpoint = document.getElementById('settings-endpoint').value.trim();
  const model = document.getElementById('settings-model').value;

  const config = {
    provider,
    apiKey: apiKey || null,
    endpoint: endpoint || defaultEndpoint(provider),
    model: model || null,
  };

  const statusEl = document.getElementById('settings-status');

  try {
    await invoke('set_ai_config', { config });
    statusEl.textContent = 'Settings saved.';
    statusEl.className = 'settings-status success';
    setTimeout(() => closeSettings(), 1000);
  } catch (err) {
    statusEl.textContent = `Error: ${err}`;
    statusEl.className = 'settings-status error';
  }
}

function defaultEndpoint(provider) {
  if (provider === 'anthropic') return 'https://api.anthropic.com/v1';
  if (provider === 'openai') return 'https://api.openai.com/v1';
  return 'http://localhost:11434';
}

async function testConnection() {
  const provider = document.getElementById('settings-provider').value;
  const statusEl = document.getElementById('settings-status');
  statusEl.textContent = 'Testing...';
  statusEl.className = 'settings-status';

  try {
    if (provider === 'ollama') {
      const ok = await invoke('check_ollama');
      if (ok) {
        statusEl.textContent = 'Ollama is running.';
        statusEl.className = 'settings-status success';
      } else {
        statusEl.textContent = 'Ollama not reachable at localhost:11434.';
        statusEl.className = 'settings-status error';
      }
    } else {
      // For cloud providers, just verify the API key is set
      const apiKey = document.getElementById('settings-api-key').value.trim();
      if (apiKey) {
        statusEl.textContent = `API key set for ${PROVIDER_LABELS[provider]}.`;
        statusEl.className = 'settings-status success';
      } else {
        statusEl.textContent = 'No API key provided.';
        statusEl.className = 'settings-status error';
      }
    }
  } catch (err) {
    statusEl.textContent = `Error: ${err}`;
    statusEl.className = 'settings-status error';
  }
}
