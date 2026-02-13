#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { resolve, join, basename, dirname } from 'node:path';
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, readdirSync, watch } from 'node:fs';
import { generateBoard, findImages, autoLayout } from '../lib/generator.js';

const args = process.argv.slice(2);
const command = args[0];

const commands = {
  init: initProject,
  add: addImage,
  import: importImages,
  build: buildBoard,
  watch: watchProject,
  list: listItems,
  remove: removeItem,
  meta: editMeta,
  help: showHelp,
};

if (!command || command.startsWith('-')) {
  await legacyBuild();
} else if (commands[command]) {
  await commands[command](args.slice(1));
} else {
  console.error(`Unknown command: ${command}`);
  showHelp();
  process.exit(1);
}

// ============ Commands ============

async function initProject(args) {
  const dir = args[0] || '.';
  const targetDir = resolve(dir);
  const configPath = join(targetDir, 'refboard.json');
  
  if (existsSync(configPath)) {
    console.error('Project already exists');
    process.exit(1);
  }
  
  mkdirSync(join(targetDir, 'images'), { recursive: true });
  
  const config = {
    name: basename(targetDir),
    title: basename(targetDir).replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    description: '',
    output: 'board.html',
    layout: { maxCols: 4 }
  };
  writeFileSync(configPath, JSON.stringify(config, null, 2));
  
  const metadata = { board: { title: config.title, description: '' }, items: [] };
  writeFileSync(join(targetDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
  
  console.log(`✓ Created RefBoard project: ${targetDir}`);
  console.log(`
Commands:
  refboard add <image>       Add single image
  refboard import <folder>   Import all images from folder
  refboard build             Generate board.html
  refboard watch             Watch for changes and auto-build
`);
}

async function addImage(args) {
  const projectDir = findProject();
  if (!projectDir) exit('Not in a RefBoard project');
  
  if (!args.length) exit('Usage: refboard add <image> [--title "..."] [--artist "..."] [--tags "a,b,c"]');
  
  const imagePath = resolve(args[0]);
  if (!existsSync(imagePath)) exit(`File not found: ${imagePath}`);
  
  // Parse options
  const opts = parseOptions(args.slice(1));
  const filename = basename(imagePath);
  const destPath = join(projectDir, 'images', filename);
  
  if (existsSync(destPath)) {
    console.log(`⚠ Image exists: ${filename}`);
    return;
  }
  
  copyFileSync(imagePath, destPath);
  
  // Update metadata
  const metaPath = join(projectDir, 'metadata.json');
  const metadata = JSON.parse(readFileSync(metaPath, 'utf-8'));
  
  const item = {
    file: filename,
    title: opts.title || '',
    artist: opts.artist || '',
    year: opts.year || '',
    description: opts.desc || '',
    tags: opts.tags ? opts.tags.split(',').map(t => t.trim()) : [],
  };
  
  metadata.items.push(item);
  writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
  
  console.log(`✓ Added: ${filename}`);
}

async function importImages(args) {
  const projectDir = findProject();
  if (!projectDir) exit('Not in a RefBoard project');
  
  const sourceDir = resolve(args[0] || '.');
  if (!existsSync(sourceDir)) exit(`Folder not found: ${sourceDir}`);
  
  const opts = parseOptions(args.slice(1));
  const extensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'];
  
  const files = readdirSync(sourceDir).filter(f => 
    extensions.includes(f.toLowerCase().slice(f.lastIndexOf('.')))
  );
  
  if (!files.length) {
    console.log('No images found');
    return;
  }
  
  const metaPath = join(projectDir, 'metadata.json');
  const metadata = JSON.parse(readFileSync(metaPath, 'utf-8'));
  const existingFiles = new Set(metadata.items.map(i => i.file));
  
  let added = 0;
  for (const file of files) {
    if (existingFiles.has(file)) continue;
    
    const src = join(sourceDir, file);
    const dest = join(projectDir, 'images', file);
    
    if (!existsSync(dest)) {
      copyFileSync(src, dest);
    }
    
    metadata.items.push({
      file,
      title: '',
      artist: '',
      tags: opts.tags ? opts.tags.split(',').map(t => t.trim()) : [],
    });
    
    added++;
    console.log(`  + ${file}`);
  }
  
  writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
  console.log(`\n✓ Imported ${added} images`);
  
  // Auto-build if requested
  if (opts.build !== false) {
    console.log('\nBuilding...');
    await buildBoard([]);
  }
}

async function buildBoard(args) {
  const projectDir = findProject();
  const opts = parseOptions(args);
  
  // Support both project mode and legacy mode
  if (projectDir) {
    const config = loadConfig(projectDir);
    const outputPath = resolve(projectDir, opts.output || config.output || 'board.html');
    
    console.log(`RefBoard build`);
    console.log(`  Project: ${config.name || basename(projectDir)}`);
    
    const result = await generateBoard({
      inputDir: projectDir,
      outputFile: outputPath,
      title: config.title,
      embedImages: opts.embed || false,
      config,
    });
    
    console.log(`  Items: ${result.itemCount}`);
    console.log(`\n✓ ${outputPath}`);
  } else {
    await legacyBuild();
  }
}

async function watchProject(args) {
  const projectDir = findProject();
  if (!projectDir) exit('Not in a RefBoard project');
  
  console.log('Watching for changes...');
  console.log('Press Ctrl+C to stop\n');
  
  let buildTimeout;
  const rebuild = () => {
    clearTimeout(buildTimeout);
    buildTimeout = setTimeout(async () => {
      console.log(`[${new Date().toLocaleTimeString()}] Rebuilding...`);
      await buildBoard([]);
    }, 500);
  };
  
  // Watch images folder
  const imagesDir = join(projectDir, 'images');
  if (existsSync(imagesDir)) {
    watch(imagesDir, rebuild);
  }
  
  // Watch metadata
  watch(join(projectDir, 'metadata.json'), rebuild);
  
  // Initial build
  await buildBoard([]);
}

async function listItems(args) {
  const projectDir = findProject();
  if (!projectDir) exit('Not in a RefBoard project');
  
  const metadata = JSON.parse(readFileSync(join(projectDir, 'metadata.json'), 'utf-8'));
  
  console.log(`\n${metadata.board?.title || 'RefBoard'}\n${'─'.repeat(40)}`);
  
  metadata.items.forEach((item, i) => {
    const tags = item.tags?.length ? ` [${item.tags.join(', ')}]` : '';
    const title = item.title || item.file;
    const artist = item.artist ? ` — ${item.artist}` : '';
    console.log(`${String(i + 1).padStart(2)}. ${title}${artist}${tags}`);
  });
  
  console.log(`\nTotal: ${metadata.items.length} items`);
}

async function removeItem(args) {
  const projectDir = findProject();
  if (!projectDir) exit('Not in a RefBoard project');
  
  if (!args[0]) exit('Usage: refboard remove <index|filename>');
  
  const metaPath = join(projectDir, 'metadata.json');
  const metadata = JSON.parse(readFileSync(metaPath, 'utf-8'));
  
  const target = args[0];
  let index = parseInt(target) - 1;
  
  if (isNaN(index)) {
    index = metadata.items.findIndex(i => i.file === target);
  }
  
  if (index < 0 || index >= metadata.items.length) {
    exit('Item not found');
  }
  
  const removed = metadata.items.splice(index, 1)[0];
  writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
  
  console.log(`✓ Removed: ${removed.file}`);
}

async function editMeta(args) {
  const projectDir = findProject();
  if (!projectDir) exit('Not in a RefBoard project');
  
  if (!args[0]) exit('Usage: refboard meta <index|filename> [--title "..."] [--artist "..."]');
  
  const metaPath = join(projectDir, 'metadata.json');
  const metadata = JSON.parse(readFileSync(metaPath, 'utf-8'));
  
  const target = args[0];
  let index = parseInt(target) - 1;
  
  if (isNaN(index)) {
    index = metadata.items.findIndex(i => i.file === target);
  }
  
  if (index < 0 || index >= metadata.items.length) {
    exit('Item not found');
  }
  
  const opts = parseOptions(args.slice(1));
  const item = metadata.items[index];
  
  if (opts.title !== undefined) item.title = opts.title;
  if (opts.artist !== undefined) item.artist = opts.artist;
  if (opts.year !== undefined) item.year = opts.year;
  if (opts.desc !== undefined) item.description = opts.desc;
  if (opts.tags !== undefined) item.tags = opts.tags.split(',').map(t => t.trim());
  if (opts.context !== undefined) item.context = opts.context;
  if (opts.influences !== undefined) item.influences = opts.influences;
  
  writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
  
  console.log(`✓ Updated: ${item.file}`);
  console.log(JSON.stringify(item, null, 2));
}

async function legacyBuild() {
  const options = {
    input: { type: 'string', short: 'i', default: '.' },
    output: { type: 'string', short: 'o', default: 'board.html' },
    title: { type: 'string', short: 't', default: 'Reference Board' },
    embed: { type: 'boolean', short: 'e', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  };
  
  const { values } = parseArgs({ options, allowPositionals: true });
  if (values.help) { showHelp(); return; }
  
  const inputDir = resolve(values.input);
  const outputFile = resolve(values.output);
  
  if (!existsSync(inputDir)) exit(`Not found: ${inputDir}`);
  
  console.log(`RefBoard`);
  console.log(`  Input: ${inputDir}`);
  
  const result = await generateBoard({
    inputDir,
    outputFile,
    title: values.title,
    embedImages: values.embed,
  });
  
  console.log(`  Items: ${result.itemCount}`);
  console.log(`\n✓ ${outputFile}`);
}

function showHelp() {
  console.log(`
RefBoard - Visual reference board generator

COMMANDS
  refboard init [dir]              Create new project
  refboard add <image> [opts]      Add single image
  refboard import <folder> [opts]  Import folder of images
  refboard build [opts]            Generate HTML board
  refboard watch                   Watch and auto-rebuild
  refboard list                    List all items
  refboard remove <n|file>         Remove item
  refboard meta <n|file> [opts]    Edit item metadata

OPTIONS
  --title "..."     Item/board title
  --artist "..."    Artist name
  --year "..."      Year
  --desc "..."      Description
  --tags "a,b,c"    Tags (comma-separated)
  --context "..."   Historical context
  --embed           Embed images as base64
  --output, -o      Output file

LEGACY MODE (no project)
  refboard -i <folder> -o board.html -t "Title"

EXAMPLES
  refboard init my-refs
  refboard add photo.jpg --title "Sculpture" --artist "Unknown" --tags "bronze,1920s"
  refboard import ~/Downloads/refs --tags "inspiration"
  refboard build --embed
  refboard meta 1 --title "Updated Title"

Project structure:
  project/
    refboard.json     Config
    metadata.json     Item data
    images/           Image files
    board.html        Output
`);
}

// ============ Helpers ============

function findProject() {
  let dir = process.cwd();
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, 'refboard.json'))) return dir;
    dir = dirname(dir);
  }
  return null;
}

function loadConfig(dir) {
  const path = join(dir, 'refboard.json');
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf-8')) : {};
}

function parseOptions(args) {
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const val = args[i + 1];
      if (val && !val.startsWith('--')) {
        opts[key] = val;
        i++;
      } else {
        opts[key] = true;
      }
    }
  }
  return opts;
}

function exit(msg) {
  console.error(`Error: ${msg}`);
  process.exit(1);
}
