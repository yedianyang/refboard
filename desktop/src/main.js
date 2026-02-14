// RefBoard 2.0 — Main entry point
// Initializes the PixiJS canvas, AI panels, and wires up the UI shell

import { initCanvas, loadProject, fitAll, setUIElements, onCardSelect } from './canvas.js';
import { initPanels, showMetadata, openSettings } from './panels.js';

async function main() {
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

  // Initialize AI panels
  initPanels({
    onAccept: (card, analysis) => {
      const statusText = document.getElementById('status-text');
      if (statusText) {
        const tagCount = analysis.tags?.length || 0;
        statusText.textContent = `Accepted ${tagCount} tags for ${card.data.name}`;
      }
    },
  });

  // Card selection -> open metadata panel
  onCardSelect((card) => {
    showMetadata(card);
  });

  // Settings button
  settingsBtn.addEventListener('click', () => openSettings());

  // Open project button
  openBtn.addEventListener('click', async () => {
    const dirPath = projectPath.value.trim();
    if (!dirPath) return;

    loading.style.display = 'block';
    loading.textContent = 'Scanning images...';

    try {
      const result = await loadProject(dirPath);
      if (result) {
        loading.textContent = `Loaded ${result.loaded} images`;
        setTimeout(() => { loading.style.display = 'none'; }, 2000);
      }
    } catch (err) {
      loading.textContent = `Error: ${err}`;
      loading.style.color = '#e74c3c';
    }
  });

  // Fit all button
  fitBtn.addEventListener('click', () => fitAll());

  // Auto-load art-deco project for testing
  const testPath = '~/.openclaw/workspace/visual-refs/art-deco-power';
  const home = await getHomePath();
  if (home) {
    const resolved = testPath.replace('~', home);
    projectPath.value = resolved;
  }
}

async function getHomePath() {
  try {
    // Use Tauri's env to get home dir
    const { homeDir } = await import('@tauri-apps/api/path');
    return await homeDir();
  } catch {
    // Fallback for dev outside Tauri
    return null;
  }
}

main().catch(console.error);
