// RefBoard 2.0 — AI Panels & Settings
// Suggestion panel, metadata panel, and settings dialog
// Wired to Rust backend via Tauri IPC: analyze_image, get_ai_config, set_ai_config, check_ollama

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { convertFileSrc } from '@tauri-apps/api/core';
import { loadWebConfig, saveWebConfig } from './collection.js';
import { icon } from './icons.js';

// ============================================================
// State
// ============================================================

let activePanel = null; // 'suggestion' | 'metadata' | null
let currentCard = null; // The card object currently displayed
let currentAnalysis = null; // Latest AI analysis result
let onAcceptCallback = null; // Called when user accepts suggestions
let onFindSimilarCallback = null; // Called when user clicks "Find Similar"
let onFindOnlineCallback = null; // Called when user clicks "Find Online"
let _getAllCards = null; // Injected from main.js
let batchCancelled = false; // Batch analysis cancel flag

// Provider presets — frontend dropdown value → backend provider + defaults
const PROVIDER_PRESETS = {
  openai:     { backend: 'openai',    baseUrl: 'https://api.openai.com/v1',                          model: 'gpt-4o-mini',                    label: 'OpenAI',            needsKey: true  },
  openrouter: { backend: 'openai',    baseUrl: 'https://openrouter.ai/api/v1',                       model: 'google/gemini-2.0-flash',         label: 'OpenRouter',        needsKey: true  },
  anthropic:  { backend: 'anthropic', baseUrl: 'https://api.anthropic.com',                          model: 'claude-3-5-haiku-latest',         label: 'Claude (Anthropic)', needsKey: true  },
  ollama:     { backend: 'ollama',    baseUrl: 'http://localhost:11434/v1',                           model: 'llava:13b',                       label: 'Ollama (Local)',    needsKey: false },
  google:     { backend: 'openai',    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',   model: 'gemini-2.0-flash',                label: 'Google AI',         needsKey: true  },
  moonshot:   { backend: 'openai',    baseUrl: 'https://api.moonshot.cn/v1',                         model: 'moonshot-v1-8k-vision-preview',   label: 'Moonshot',          needsKey: true  },
  deepseek:   { backend: 'openai',    baseUrl: 'https://api.deepseek.com/v1',                        model: 'deepseek-chat',                   label: 'DeepSeek',          needsKey: true  },
};

// ============================================================
// Panel Container
// ============================================================

/** Initialize all panel DOM and event listeners. Call once at startup. */
export function initPanels({ onAccept, onFindSimilar, onFindOnline, getAllCards } = {}) {
  onAcceptCallback = onAccept || null;
  onFindSimilarCallback = onFindSimilar || null;
  onFindOnlineCallback = onFindOnline || null;
  _getAllCards = getAllCards || null;
  setupPanelEvents();
  setupSettingsEvents();
  setupKeyboardShortcuts();
  setupBatchProgressEvents();
  listenForAIEvents();
}

function setupKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (document.getElementById('settings-page').classList.contains('open')) {
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
      removeBtn.innerHTML = icon('x', 12);
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
    removeBtn.innerHTML = icon('x', 12);
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

  // Find Online button (metadata panel)
  document.getElementById('meta-web-btn')?.addEventListener('click', () => {
    if (!currentCard || !onFindOnlineCallback) return;
    onFindOnlineCallback(currentCard);
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

  const filename = card.data?.name || card.data?.path?.split('/').pop() || 'unknown';
  console.log(`[AI] Analyzing image: ${filename}`);
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

    console.log(`[AI] Analysis complete for ${filename}`);
    showSuggestions(card, result);
  } catch (err) {
    console.log(`[AI] Analysis error: ${err}`);
    showAnalysisError(err.toString());
  } finally {
    analyzing = false;
    showAnalysisLoading(false);
  }
}

function collectAllTags() {
  const tags = new Set();
  if (_getAllCards) {
    for (const card of _getAllCards()) {
      if (card.data?.tags) card.data.tags.forEach(t => tags.add(t));
    }
  }
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

// ============================================================
// Batch Analysis
// ============================================================

/**
 * Analyze multiple cards sequentially with progress UI.
 * @param {object[]} cards - Array of canvas card objects (images only)
 * @param {function} [onSaveBoard] - Called after batch to persist board state
 */
export async function analyzeBatch(cards, onSaveBoard) {
  if (analyzing) return;
  analyzing = true;
  batchCancelled = false;

  const total = cards.length;
  let completed = 0;
  let failed = 0;

  try {
    const config = await invoke('get_ai_config');
    const existingTags = collectAllTags();

    showBatchProgress(0, total);

    for (let i = 0; i < cards.length; i++) {
      if (batchCancelled) break;

      const card = cards[i];
      const filename = card.data?.name || card.data?.path?.split('/').pop() || 'unknown';
      updateBatchProgress(i + 1, total, filename);

      try {
        const result = await invoke('analyze_image', {
          imagePath: card.data.path,
          providerConfig: config,
          existingTags,
        });

        // Merge result into card data
        card.data.description = result.description;
        card.data.tags = result.tags;
        card.data.style = result.style;
        card.data.mood = result.mood;
        card.data.colors = result.colors;
        card.data.era = result.era;

        // Add new tags to context for subsequent analyses
        if (result.tags) {
          result.tags.forEach(t => { if (!existingTags.includes(t)) existingTags.push(t); });
        }

        completed++;
      } catch (err) {
        console.error(`[AI] Batch: failed to analyze ${filename}:`, err);
        failed++;
      }
    }
  } catch (err) {
    showAnalysisError(`Batch analysis failed: ${err}`);
  } finally {
    analyzing = false;
    hideBatchProgress();

    // Show summary in status bar
    const statusText = document.getElementById('status-text');
    if (statusText) {
      if (batchCancelled) {
        statusText.textContent = `Analysis cancelled (${completed}/${total} done)`;
      } else if (failed > 0) {
        statusText.textContent = `Analyzed ${completed}/${total} images (${failed} failed)`;
      } else {
        statusText.textContent = `Analyzed ${completed} images`;
      }
    }

    if (onSaveBoard) onSaveBoard();
  }
}

function showBatchProgress(current, total) {
  const el = document.getElementById('batch-progress');
  if (!el) return;
  el.style.display = 'flex';
  updateBatchProgress(current, total);
}

function updateBatchProgress(current, total, filename) {
  const textEl = document.getElementById('batch-progress-text');
  const fillEl = document.getElementById('batch-progress-fill');
  if (textEl) {
    textEl.textContent = filename
      ? `Analyzing ${current}/${total}: ${filename}`
      : `Preparing batch analysis (${total} images)...`;
  }
  if (fillEl) {
    fillEl.style.width = total > 0 ? `${(current / total) * 100}%` : '0%';
  }
}

function hideBatchProgress() {
  const el = document.getElementById('batch-progress');
  if (el) el.style.display = 'none';
}

function setupBatchProgressEvents() {
  document.getElementById('batch-progress-cancel')?.addEventListener('click', () => {
    batchCancelled = true;
  });
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

/** Open the settings page dialog (centered modal with category nav). */
export function openSettings() {
  const page = document.getElementById('settings-page');
  page.classList.add('open');
  loadSettingsFromBackend();
}

/** Close the settings page dialog. */
export function closeSettings() {
  const page = document.getElementById('settings-page');
  page.classList.remove('open');
}


async function loadSettingsFromBackend() {
  // Load app config (includes projects_folder and models_folder)
  try {
    const appConfig = await invoke('get_app_config');
    const folderInput = document.getElementById('settings-projects-folder');
    if (folderInput) folderInput.value = appConfig.projectsFolder || '';
    const modelsInput = document.getElementById('settings-models-folder');
    if (modelsInput) modelsInput.value = appConfig.modelsFolder || '';
  } catch {}

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

  // Load web config
  try {
    const webConfig = await loadWebConfig();
    const braveKeyInput = document.getElementById('settings-brave-key');
    if (braveKeyInput) braveKeyInput.value = webConfig.braveApiKey || '';
  } catch {}

  // Load compression settings from localStorage
  loadCompressionSettings();
}

/** Detect the frontend provider key from a backend config (reverse-map by endpoint). */
function detectFrontendProvider(config) {
  const p = config.provider || 'openai';
  if (p === 'anthropic') return 'anthropic';
  if (p === 'ollama') return 'ollama';
  // For openai backend, match by endpoint URL
  const ep = (config.endpoint || '').toLowerCase();
  if (ep.includes('openrouter.ai')) return 'openrouter';
  if (ep.includes('generativelanguage.googleapis.com')) return 'google';
  if (ep.includes('moonshot.cn')) return 'moonshot';
  if (ep.includes('deepseek.com')) return 'deepseek';
  return 'openai';
}

function populateSettings(config) {
  const frontendProvider = detectFrontendProvider(config);
  const providerSelect = document.getElementById('settings-provider');
  providerSelect.value = frontendProvider;

  document.getElementById('settings-api-key').value = config.apiKey || '';
  document.getElementById('settings-endpoint').value = config.endpoint || '';
  document.getElementById('settings-model').value = config.model || '';

  updateProviderFields(frontendProvider, /* preserveValues */ true);
}

/** Update UI fields visibility and placeholders for the selected frontend provider.
 *  If preserveValues is false (default), auto-fill base URL and model with preset defaults. */
function updateProviderFields(frontendProvider, preserveValues = false) {
  const preset = PROVIDER_PRESETS[frontendProvider] || PROVIDER_PRESETS.openai;
  const apiKeyGroup = document.getElementById('settings-api-key-group');
  const endpointGroup = document.getElementById('settings-endpoint-group');
  const endpointInput = document.getElementById('settings-endpoint');
  const modelInput = document.getElementById('settings-model');

  // Show/hide API key based on provider
  apiKeyGroup.style.display = preset.needsKey ? 'flex' : 'none';
  endpointGroup.style.display = 'flex'; // Always show base URL

  // Update placeholders
  endpointInput.placeholder = preset.baseUrl;
  modelInput.placeholder = preset.model;

  // Auto-fill defaults when switching providers (not on initial load)
  if (!preserveValues) {
    endpointInput.value = preset.baseUrl;
    modelInput.value = preset.model;
  }
}

const SETTINGS_CATEGORIES = {
  general: 'General',
  ai: 'AI Provider',
  web: 'Web Collection',
  compression: 'Compression',
};

function setupSettingsEvents() {
  // Provider change — auto-fill defaults
  document.getElementById('settings-provider')?.addEventListener('change', (e) => {
    updateProviderFields(e.target.value, /* preserveValues */ false);
  });

  // API key visibility toggle
  document.getElementById('settings-key-toggle')?.addEventListener('click', () => {
    const input = document.getElementById('settings-api-key');
    const eye = document.getElementById('settings-key-eye');
    if (!input) return;
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    // Swap eye icon: open eye (visible) vs crossed-out eye (hidden)
    if (eye) {
      eye.innerHTML = isHidden
        ? '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/>'
        : '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>';
    }
  });

  // Save button
  document.getElementById('settings-save-btn')?.addEventListener('click', async () => {
    await saveSettings();
  });

  // Settings page close button
  document.getElementById('settings-page-close')?.addEventListener('click', () => {
    closeSettings();
  });

  // Settings page backdrop click
  document.getElementById('settings-page')?.addEventListener('click', (e) => {
    if (e.target.id === 'settings-page') closeSettings();
  });

  // Test connection button
  document.getElementById('settings-test-btn')?.addEventListener('click', async () => {
    await testConnection();
  });

  // Category navigation
  document.querySelectorAll('.settings-cat').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cat = btn.dataset.cat;
      // Update active state
      document.querySelectorAll('.settings-cat').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      // Show corresponding panel
      document.querySelectorAll('.settings-panel').forEach((p) => p.style.display = 'none');
      const panel = document.getElementById(`settings-panel-${cat}`);
      if (panel) panel.style.display = 'flex';
      // Update breadcrumb
      const breadcrumb = document.getElementById('settings-breadcrumb');
      if (breadcrumb) breadcrumb.textContent = `Settings \u203A ${SETTINGS_CATEGORIES[cat] || cat}`;
    });
  });

  // Compression toggle: show/hide quality options
  document.getElementById('settings-compress-toggle')?.addEventListener('change', (e) => {
    const options = document.getElementById('settings-compress-options');
    if (options) options.style.display = e.target.checked ? '' : 'none';
  });

  // Compression quality slider: update label
  document.getElementById('settings-compress-quality')?.addEventListener('input', (e) => {
    const label = document.getElementById('settings-quality-label');
    if (label) label.textContent = Math.round(e.target.value * 100) + '%';
  });

  // Browse folder button for projects folder
  document.getElementById('settings-browse-folder-btn')?.addEventListener('click', async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ directory: true, multiple: false, title: 'Choose Projects Folder' });
      if (selected) {
        const folderInput = document.getElementById('settings-projects-folder');
        if (folderInput) folderInput.value = selected;
      }
    } catch (err) {
      console.warn('Browse folder failed:', err);
    }
  });

  // Browse folder button for models folder
  document.getElementById('settings-browse-models-btn')?.addEventListener('click', async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ directory: true, multiple: false, title: 'Choose Models Folder' });
      if (selected) {
        const modelsInput = document.getElementById('settings-models-folder');
        if (modelsInput) modelsInput.value = selected;
      }
    } catch (err) {
      console.warn('Browse models folder failed:', err);
    }
  });
}

async function saveSettings() {
  const frontendProvider = document.getElementById('settings-provider').value;
  const apiKey = document.getElementById('settings-api-key').value.trim();
  const endpoint = document.getElementById('settings-endpoint').value.trim();
  const model = document.getElementById('settings-model').value.trim();
  const preset = PROVIDER_PRESETS[frontendProvider] || PROVIDER_PRESETS.openai;

  const config = {
    provider: preset.backend,
    apiKey: apiKey || null,
    endpoint: endpoint || preset.baseUrl,
    model: model || preset.model,
  };

  const statusEl = document.getElementById('settings-status');

  try {
    await invoke('set_ai_config', { config });

    // Save projects folder and models folder via app config
    const folderInput = document.getElementById('settings-projects-folder');
    const modelsInput = document.getElementById('settings-models-folder');
    const appConfig = await invoke('get_app_config');
    if (folderInput) {
      appConfig.projectsFolder = folderInput.value.trim() || null;
    }
    if (modelsInput) {
      appConfig.modelsFolder = modelsInput.value.trim() || null;
    }
    await invoke('set_app_config', { config: appConfig });

    // Save Brave API key
    const braveKey = document.getElementById('settings-brave-key')?.value.trim();
    const webConfig = await loadWebConfig();
    webConfig.braveApiKey = braveKey || null;
    await saveWebConfig(webConfig);

    // Save compression settings
    saveCompressionSettings();

    statusEl.textContent = 'Settings saved.';
    statusEl.className = 'settings-status success';
    setTimeout(() => { statusEl.textContent = ''; }, 2000);
  } catch (err) {
    statusEl.textContent = `Error: ${err}`;
    statusEl.className = 'settings-status error';
  }
}

// defaultEndpoint removed — use PROVIDER_PRESETS[provider].baseUrl instead

function loadCompressionSettings() {
  const toggle = document.getElementById('settings-compress-toggle');
  const quality = document.getElementById('settings-compress-quality');
  const qualityLabel = document.getElementById('settings-quality-label');
  const maxdim = document.getElementById('settings-compress-maxdim');
  const options = document.getElementById('settings-compress-options');

  if (toggle) {
    toggle.checked = localStorage.getItem('refboard-compress') !== 'off';
  }
  if (quality) {
    const q = parseFloat(localStorage.getItem('refboard-compress-quality') || '0.82');
    quality.value = q;
    if (qualityLabel) qualityLabel.textContent = Math.round(q * 100) + '%';
  }
  if (maxdim) {
    maxdim.value = localStorage.getItem('refboard-compress-maxdim') || '2048';
  }
  if (options && toggle) {
    options.style.display = toggle.checked ? '' : 'none';
  }
}

function saveCompressionSettings() {
  const toggle = document.getElementById('settings-compress-toggle');
  const quality = document.getElementById('settings-compress-quality');
  const maxdim = document.getElementById('settings-compress-maxdim');

  if (toggle) {
    localStorage.setItem('refboard-compress', toggle.checked ? 'on' : 'off');
  }
  if (quality) {
    localStorage.setItem('refboard-compress-quality', quality.value);
  }
  if (maxdim) {
    localStorage.setItem('refboard-compress-maxdim', maxdim.value);
  }
}

async function testConnection() {
  const frontendProvider = document.getElementById('settings-provider').value;
  const preset = PROVIDER_PRESETS[frontendProvider] || PROVIDER_PRESETS.openai;
  const statusEl = document.getElementById('settings-status');
  const testBtn = document.getElementById('settings-test-btn');
  statusEl.textContent = 'Testing connection...';
  statusEl.className = 'settings-status';
  if (testBtn) testBtn.disabled = true;

  const apiKey = document.getElementById('settings-api-key').value.trim();
  const endpoint = document.getElementById('settings-endpoint').value.trim();
  const model = document.getElementById('settings-model').value.trim();

  // Build a provider config matching the backend struct
  const providerConfig = {
    provider: preset.backend,
    apiKey: apiKey || null,
    endpoint: endpoint || preset.baseUrl,
    model: model || preset.model,
  };

  try {
    const reply = await invoke('cmd_test_ai_vision', { providerConfig });
    statusEl.textContent = `Connected — ${reply}`;
    statusEl.className = 'settings-status success';
  } catch (err) {
    statusEl.textContent = `${err}`;
    statusEl.className = 'settings-status error';
  } finally {
    if (testBtn) testBtn.disabled = false;
  }
}

// ============================================================
// Generate Image Dialog
// ============================================================

/**
 * Open the generate image dialog with optional reference images.
 * @param {object[]} selectedCards - Currently selected canvas cards
 */
export function openGenerateDialog(selectedCards = []) {
  const overlay = document.getElementById('generate-overlay');
  const refsContainer = document.getElementById('generate-refs');
  const promptInput = document.getElementById('generate-prompt');
  if (!overlay) return;

  // Populate reference image thumbnails
  refsContainer.innerHTML = '';
  selectedCards.filter(c => !c.isText && !c.isShape).forEach(card => {
    const img = document.createElement('img');
    img.src = convertFileSrc(card.data.path);
    img.className = 'generate-ref-thumb';
    img.title = card.data.name;
    refsContainer.appendChild(img);
  });

  // Pre-fill prompt placeholder with reference image descriptions
  const context = selectedCards
    .filter(c => c.data.description)
    .map(c => c.data.description)
    .join('; ');
  if (context) {
    promptInput.placeholder = `Inspired by: ${context.slice(0, 100)}...`;
  } else {
    promptInput.placeholder = 'Describe the image you want to generate...';
  }

  overlay.style.display = 'flex';
  promptInput.focus();

  // Store reference paths for submit
  overlay.dataset.refPaths = JSON.stringify(
    selectedCards.filter(c => !c.isText && !c.isShape).map(c => c.data.path)
  );
}

/** Close the generate image dialog and clear input. */
export function closeGenerateDialog() {
  const overlay = document.getElementById('generate-overlay');
  if (!overlay) return;
  overlay.style.display = 'none';
  document.getElementById('generate-prompt').value = '';
}

/**
 * Start image generation: close dialog, create placeholders, invoke backend.
 * @param {object} callbacks
 * @param {function} callbacks.onCreatePlaceholder - ({width, height, index, prompt}) => placeholder
 * @param {function} callbacks.onFillPlaceholder - (placeholder, result) => void
 * @param {function} callbacks.onFail - (placeholder, error, retryFn) => void
 * @param {string} callbacks.projectPath - Current project path
 */
export async function startGenerate({ onCreatePlaceholder, onFillPlaceholder, onFail, projectPath }) {
  const overlay = document.getElementById('generate-overlay');
  const prompt = document.getElementById('generate-prompt').value.trim();
  if (!prompt) return;

  const model = document.getElementById('generate-model').value;
  const size = document.getElementById('generate-size').value;
  const count = parseInt(document.getElementById('generate-count').value);
  const referencePaths = JSON.parse(overlay.dataset.refPaths || '[]');

  // Close dialog immediately
  closeGenerateDialog();

  // Create placeholders on canvas
  const [w, h] = size.split('x').map(Number);
  const placeholders = [];
  for (let i = 0; i < count; i++) {
    const placeholder = onCreatePlaceholder({ width: w, height: h, index: i, prompt });
    placeholders.push(placeholder);
  }

  // Call backend
  try {
    const results = await invoke('cmd_generate_image', {
      prompt,
      referencePaths,
      projectPath,
      model,
      size,
      count,
    });

    // Fill placeholders with real images
    results.forEach((result, i) => {
      if (placeholders[i]) {
        onFillPlaceholder(placeholders[i], result);
      }
    });
  } catch (err) {
    // Show error + retry on all placeholders
    placeholders.forEach(p => {
      onFail(p, err.toString(), () => {
        startGenerate({ onCreatePlaceholder, onFillPlaceholder, onFail, projectPath });
      });
    });
  }
}

/** Initialize generate dialog event listeners. Call once at startup. */
export function initGenerateDialog() {
  const overlay = document.getElementById('generate-overlay');
  if (!overlay) return;

  // Close button
  overlay.querySelector('.generate-close')?.addEventListener('click', closeGenerateDialog);
  overlay.querySelector('.generate-cancel')?.addEventListener('click', closeGenerateDialog);

  // ESC to close
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeGenerateDialog();
  });

  // Click overlay background to close
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeGenerateDialog();
  });
}
