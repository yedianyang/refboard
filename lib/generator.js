import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, basename, extname, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = join(__dirname, '..', 'templates', 'board.html');

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'];

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
    '.avif': 'image/avif',
  };
  return mimes[ext] || 'image/jpeg';
}

function toBase64DataUrl(filePath) {
  const data = readFileSync(filePath);
  const mime = getMimeType(filePath);
  return `data:${mime};base64,${data.toString('base64')}`;
}

function getImageDimensions(filePath) {
  // Simple dimension detection for common formats
  try {
    const buffer = readFileSync(filePath);
    
    // PNG
    if (buffer[0] === 0x89 && buffer[1] === 0x50) {
      return {
        width: buffer.readUInt32BE(16),
        height: buffer.readUInt32BE(20)
      };
    }
    
    // JPEG
    if (buffer[0] === 0xff && buffer[1] === 0xd8) {
      let offset = 2;
      while (offset < buffer.length) {
        if (buffer[offset] !== 0xff) break;
        const marker = buffer[offset + 1];
        if (marker === 0xc0 || marker === 0xc2) {
          return {
            height: buffer.readUInt16BE(offset + 5),
            width: buffer.readUInt16BE(offset + 7)
          };
        }
        offset += 2 + buffer.readUInt16BE(offset + 2);
      }
    }
  } catch (e) {}
  
  return { width: 300, height: 400 }; // Default
}

function generateBoardId(title) {
  return createHash('md5').update(title || 'board').digest('hex').slice(0, 12);
}

function findImages(inputDir) {
  const images = [];
  const searched = new Set();
  
  const possibleDirs = [
    join(inputDir, 'images'),
    join(inputDir, 'raw'),
    inputDir,
  ];
  
  for (const dir of possibleDirs) {
    if (searched.has(dir) || !existsSync(dir)) continue;
    searched.add(dir);
    
    try {
      const files = readdirSync(dir);
      for (const file of files) {
        if (isImageFile(file)) {
          const filePath = join(dir, file);
          const existing = images.find(img => img.filename === file);
          if (!existing) {
            const dims = getImageDimensions(filePath);
            const stats = statSync(filePath);
            images.push({
              path: filePath,
              filename: file,
              width: dims.width,
              height: dims.height,
              size: stats.size,
              mtime: stats.mtime.toISOString(),
            });
          }
        }
      }
    } catch (e) {}
  }
  
  // Sort by filename for consistent ordering
  images.sort((a, b) => a.filename.localeCompare(b.filename));
  
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

function autoLayout(items, options = {}) {
  const {
    startX = 80,
    startY = 80,
    cardWidth = 280,
    cardHeight = 380,
    gapX = 60,
    gapY = 50,
    maxCols = 4,
  } = options;
  
  // Calculate optimal columns based on item count
  const cols = Math.min(maxCols, Math.ceil(Math.sqrt(items.length * 1.2)));
  
  return items.map((item, index) => {
    // Use existing position if set, otherwise auto-layout
    if (item.x !== undefined && item.y !== undefined) {
      return item;
    }
    
    const col = index % cols;
    const row = Math.floor(index / cols);
    
    return {
      ...item,
      x: startX + col * (cardWidth + gapX),
      y: startY + row * (cardHeight + gapY),
    };
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function generateBoard({ inputDir, outputFile, title, embedImages, config = {} }) {
  const template = readFileSync(TEMPLATE_PATH, 'utf-8');
  
  const images = findImages(inputDir);
  if (images.length === 0) {
    throw new Error('No images found in input directory');
  }
  console.log(`  Found ${images.length} images`);
  
  const metadata = loadMetadata(inputDir);
  const metadataMap = new Map();
  for (const item of metadata.items || []) {
    if (item.file) {
      metadataMap.set(item.file, item);
    }
  }
  
  // Collect all tags
  const allTags = new Set();
  for (const item of metadata.items || []) {
    for (const tag of item.tags || []) {
      allTags.add(tag);
    }
  }
  
  // Build items
  let items = images.map((img, index) => {
    const meta = metadataMap.get(img.filename) || {};
    const src = embedImages 
      ? toBase64DataUrl(img.path)
      : relative(dirname(outputFile), img.path);
    
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
      group: meta.group || '',
      x: meta.x,
      y: meta.y,
      width: img.width,
      height: img.height,
    };
  });
  
  // Auto-layout items without positions
  items = autoLayout(items, config.layout);
  
  // Board metadata
  const boardTitle = metadata.board?.title || title;
  const boardDescription = metadata.board?.description || '';
  const boardId = generateBoardId(boardTitle);
  
  // Generate cards HTML
  const itemsHtml = items.map(item => `
      <div class="card" data-id="${item.id}" data-group="${escapeHtml(item.group)}" style="left: ${item.x}px; top: ${item.y}px;">
        <div class="card-image">
          <img src="${item.src}" alt="${escapeHtml(item.title || item.filename)}" loading="lazy">
        </div>
        <div class="card-content">
          ${item.title ? `<div class="card-title">${escapeHtml(item.title)}</div>` : `<div class="card-title card-filename">${escapeHtml(item.filename)}</div>`}
          ${item.artist ? `<div class="card-artist">${escapeHtml(item.artist)}${item.year ? ` · ${escapeHtml(item.year)}` : ''}</div>` : ''}
          ${item.description ? `<div class="card-description">${escapeHtml(item.description)}</div>` : ''}
          ${item.tags.length ? `<div class="card-tags">${item.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
        </div>
      </div>`).join('\n');
  
  // Items data JSON
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
    group: item.group,
    x: item.x,
    y: item.y,
  })));
  
  // Tags filter HTML
  const tagsArray = Array.from(allTags).sort();
  
  // Replace placeholders
  let html = template
    .replaceAll('{{TITLE}}', escapeHtml(boardTitle))
    .replaceAll('{{DESCRIPTION}}', escapeHtml(boardDescription))
    .replaceAll('{{ITEMS}}', itemsHtml)
    .replaceAll('{{ITEMS_DATA}}', itemsDataJson)
    .replaceAll('{{TAGS_DATA}}', JSON.stringify(tagsArray))
    .replaceAll('{{BOARD_ID}}', boardId)
    .replaceAll('{{ITEM_COUNT}}', items.length.toString())
    .replaceAll('{{GENERATED_AT}}', new Date().toISOString());
  
  writeFileSync(outputFile, html, 'utf-8');
  
  return { itemCount: items.length, boardId };
}

export { findImages, loadMetadata, autoLayout };
