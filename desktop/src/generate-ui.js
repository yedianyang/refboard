// Deco 2.0 — Generate Image Placeholder UI
// DOM overlays shown on the canvas during AI image generation

import { convertFileSrc } from '@tauri-apps/api/core';
import { getViewport, addImageCard } from './canvas/index.js';

/**
 * Create a DOM placeholder element overlaid on the canvas while generating.
 * @param {HTMLElement} canvasContainer - The #canvas-container element
 * @param {number} width - Requested image width
 * @param {number} height - Requested image height
 * @param {number} index - Placeholder index (for staggering position)
 * @param {string} prompt - Generation prompt text
 * @returns {object} Placeholder reference { el, worldX, worldY }
 */
export function createGeneratePlaceholder(canvasContainer, width, height, index, prompt) {
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
export async function replaceGeneratePlaceholder(placeholder, result) {
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
export function showGeneratePlaceholderError(placeholder, error, retryFn) {
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
