import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename, extname, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = join(__dirname, '..', 'templates', 'board.html');

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

function isImageFile(filename) {
  return IMAGE_EXTENSIONS.includes(extname(filename).toLowerCase());
}

function getMimeType(filename) {
  const ext = extname(filename).toLowerCase();
  const mimes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
  };
  return mimes[ext] || 'image/jpeg';
}

function toBase64DataUrl(filePath) {
  const data = readFileSync(filePath);
  const mime = getMimeType(filePath);
  return `data:${mime};base64,${data.toString('base64')}`;
}

function findImages(inputDir) {
  const images = [];
  const searched = new Set();
  
  // Priority order for image directories
  const possibleDirs = [
    join(inputDir, 'images'),  // Standard project structure
    join(inputDir, 'raw'),     // Common pattern
    inputDir,                   // Root fallback
  ];
  
  for (const dir of possibleDirs) {
    if (searched.has(dir) || !existsSync(dir)) continue;
    searched.add(dir);
    
    try {
      const files = readdirSync(dir);
      for (const file of files) {
        if (isImageFile(file)) {
          // Avoid duplicates
          const existing = images.find(img => img.filename === file);
          if (!existing) {
            images.push({
              path: join(dir, file),
              filename: file,
            });
          }
        }
      }
    } catch (e) {
      // Skip inaccessible directories
    }
  }
  
  return images;
}

function loadMetadata(inputDir) {
  const metadataPath = join(inputDir, 'metadata.json');
  if (existsSync(metadataPath)) {
    try {
      return JSON.parse(readFileSync(metadataPath, 'utf-8'));
    } catch (e) {
      console.warn(`Warning: Could not parse metadata.json: ${e.message}`);
    }
  }
  return { items: [], board: {} };
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function generateBoard({ inputDir, outputFile, title, embedImages }) {
  // Load template
  const template = readFileSync(TEMPLATE_PATH, 'utf-8');
  
  // Find images
  const images = findImages(inputDir);
  if (images.length === 0) {
    throw new Error('No images found in input directory');
  }
  console.log(`  Found ${images.length} images`);
  
  // Load metadata
  const metadata = loadMetadata(inputDir);
  const metadataMap = new Map();
  for (const item of metadata.items || []) {
    if (item.file) {
      metadataMap.set(item.file, item);
    }
  }
  
  // Get all unique tags
  const allTags = new Set();
  for (const item of metadata.items || []) {
    for (const tag of item.tags || []) {
      allTags.add(tag);
    }
  }
  
  // Build items data
  const items = images.map((img, index) => {
    const meta = metadataMap.get(img.filename) || {};
    const src = embedImages 
      ? toBase64DataUrl(img.path)
      : relative(dirname(outputFile), img.path);
    
    // Default positions - spread out in a wide grid
    const cols = Math.ceil(Math.sqrt(images.length * 2)); // More horizontal spread
    const col = index % cols;
    const row = Math.floor(index / cols);
    const defaultX = meta.x ?? (col * 420 + 100);
    const defaultY = meta.y ?? (row * 500 + 100);
    
    return {
      id: index,
      src,
      filename: img.filename,
      title: meta.title || '',
      artist: meta.artist || '',
      year: meta.year || '',
      description: meta.description || '',
      context: meta.context || '',
      influences: meta.influences || '',
      tags: meta.tags || [],
      x: defaultX,
      y: defaultY,
    };
  });
  
  // Board metadata
  const boardTitle = metadata.board?.title || title;
  const boardDescription = metadata.board?.description || '';
  
  // Generate HTML for canvas-style board
  const itemsHtml = items.map(item => `
      <div class="card" data-id="${item.id}" style="left: ${item.x}px; top: ${item.y}px;">
        <div class="card-image">
          <img src="${item.src}" alt="${escapeHtml(item.title || item.filename)}" loading="lazy">
        </div>
        <div class="card-content">
          ${item.title ? `<div class="card-title">${escapeHtml(item.title)}</div>` : ''}
          ${item.artist ? `<div class="card-artist">${escapeHtml(item.artist)}${item.year ? ` · ${escapeHtml(item.year)}` : ''}</div>` : ''}
          ${item.description ? `<div class="card-description">${escapeHtml(item.description)}</div>` : ''}
          ${item.tags.length ? `<div class="card-tags">${item.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
        </div>
      </div>`).join('\n');
  
  // Items data as JSON for interactive features
  const itemsDataJson = JSON.stringify(items.map(item => ({
    id: item.id,
    filename: item.filename,
    title: item.title,
    artist: item.artist,
    year: item.year,
    description: item.description,
    context: item.context,
    influences: item.influences,
    tags: item.tags,
  })));
  
  // Generate a board ID for localStorage
  const boardId = boardTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32) || 'default';
  
  // Replace template placeholders (use replaceAll for multiple occurrences)
  let html = template
    .replaceAll('{{TITLE}}', escapeHtml(boardTitle))
    .replaceAll('{{DESCRIPTION}}', escapeHtml(boardDescription))
    .replaceAll('{{ITEMS}}', itemsHtml)
    .replaceAll('{{ITEMS_DATA}}', itemsDataJson)
    .replaceAll('{{BOARD_ID}}', boardId)
    .replaceAll('{{ITEM_COUNT}}', items.length.toString())
    .replaceAll('{{GENERATED_AT}}', new Date().toISOString());
  
  // Write output
  writeFileSync(outputFile, html, 'utf-8');
}
