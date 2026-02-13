#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { resolve, join, basename, dirname } from 'node:path';
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, readdirSync, watch, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { generateBoard, findImages, autoLayout, loadMetadata, savePositions, loadPositions } from '../lib/generator.js';
import { generateDashboard, addRecentProject, scanProjects } from '../lib/dashboard.js';
import { AIProvider } from '../lib/ai-provider.js';

const args = process.argv.slice(2);

// Global --quiet / -q flag
const quiet = args.includes('-q') || args.includes('--quiet');
function log(msg) { if (!quiet) console.log(msg); }

const filteredArgs = args.filter(a => a !== '-q' && a !== '--quiet');
const command = filteredArgs[0];

const commands = {
  init: initProject,
  add: addImage,
  import: importImages,
  build: buildBoard,
  watch: watchProject,
  list: listItems,
  remove: removeItem,
  meta: editMeta,
  status: statusCommand,
  home: generateHome,
  analyze: analyzeCommand,
  'auto-tag': autoTagCommand,
  search: searchCommand,
  ask: askCommand,
  config: configCommand,
  agent: agentCommand,
  serve: serveCommand,
  'save-positions': savePositionsCommand,
  help: showHelp,
};

if (!command || command.startsWith('-')) {
  await legacyBuild();
} else if (commands[command]) {
  await commands[command](filteredArgs.slice(1));
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
  
  log(`✓ Created RefBoard project: ${targetDir}`);
  log(`
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
    log(`⚠ Image exists: ${filename}`);
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
  
  log(`✓ Added: ${filename}`);
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
    log('No images found');
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
    log(`  + ${file}`);
  }

  writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
  log(`\n✓ Imported ${added} images`);

  // Auto-build if requested
  if (opts.build !== false) {
    log('\nBuilding...');
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

    if (!opts.json) {
      log(`RefBoard build`);
      log(`  Project: ${config.name || basename(projectDir)}`);
    }

    const result = await generateBoard({
      inputDir: projectDir,
      outputFile: outputPath,
      title: config.title,
      embedImages: opts.embed || false,
      config,
    });

    if (opts.json) {
      console.log(JSON.stringify({ success: true, itemCount: result.itemCount, output: outputPath }));
    } else {
      log(`  Items: ${result.itemCount}`);
      log(`\n✓ ${outputPath}`);
    }
    
    // Add to recent projects
    addRecentProject(projectDir, config.title);
  } else {
    await legacyBuild();
  }
}

async function watchProject(args) {
  const projectDir = findProject();
  if (!projectDir) exit('Not in a RefBoard project');
  
  log('Watching for changes...');
  log('Press Ctrl+C to stop\n');

  let buildTimeout;
  const rebuild = () => {
    clearTimeout(buildTimeout);
    buildTimeout = setTimeout(async () => {
      log(`[${new Date().toLocaleTimeString()}] Rebuilding...`);
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

  const opts = parseOptions(args);
  const metadata = JSON.parse(readFileSync(join(projectDir, 'metadata.json'), 'utf-8'));

  if (opts.json) {
    console.log(JSON.stringify(metadata.items));
    return;
  }

  log(`\n${metadata.board?.title || 'RefBoard'}\n${'─'.repeat(40)}`);

  metadata.items.forEach((item, i) => {
    const tags = item.tags?.length ? ` [${item.tags.join(', ')}]` : '';
    const title = item.title || item.file;
    const artist = item.artist ? ` — ${item.artist}` : '';
    log(`${String(i + 1).padStart(2)}. ${title}${artist}${tags}`);
  });

  log(`\nTotal: ${metadata.items.length} items`);
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
  
  log(`✓ Removed: ${removed.file}`);
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

  if (opts.json) {
    console.log(JSON.stringify(item));
  } else {
    log(`✓ Updated: ${item.file}`);
    log(JSON.stringify(item, null, 2));
  }
}

async function statusCommand(args) {
  const projectDir = findProject();
  if (!projectDir) exit('Not in a RefBoard project');

  const opts = parseOptions(args);
  const config = loadConfig(projectDir);
  const metaPath = join(projectDir, 'metadata.json');
  const metadata = JSON.parse(readFileSync(metaPath, 'utf-8'));

  const tagCounts = {};
  for (const item of metadata.items) {
    for (const tag of item.tags || []) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }

  const boardPath = join(projectDir, config.output || 'board.html');
  const lastBuild = existsSync(boardPath) ? statSync(boardPath).mtime.toISOString() : null;

  const statusData = {
    name: config.name || basename(projectDir),
    title: config.title || metadata.board?.title || '',
    itemCount: metadata.items.length,
    tags: tagCounts,
    lastBuild,
    path: projectDir,
  };

  if (opts.json) {
    console.log(JSON.stringify(statusData));
  } else {
    log(`RefBoard Status`);
    log(`  Name:       ${statusData.name}`);
    log(`  Title:      ${statusData.title}`);
    log(`  Items:      ${statusData.itemCount}`);
    log(`  Path:       ${statusData.path}`);
    log(`  Last build: ${statusData.lastBuild || 'never'}`);
    const tagEntries = Object.entries(tagCounts);
    if (tagEntries.length) {
      log(`  Tags:       ${tagEntries.map(([t, c]) => `${t}(${c})`).join(', ')}`);
    }
  }
}

async function generateHome(args) {
  const opts = parseOptions(args);
  const outputFile = resolve(opts.output || join(homedir(), '.refboard', 'home.html'));
  
  // Default scan directories (include .openclaw workspace for AI-managed projects)
  const scanDirs = opts.scan
    ? opts.scan.split(',').map(d => resolve(d.trim()))
    : [
        join(homedir(), 'Projects'),
        join(homedir(), 'Documents'),
        join(homedir(), '.openclaw', 'workspace'),
        process.cwd(),
      ].filter(d => existsSync(d));
  
  log('RefBoard Home');
  log('  Scanning: ' + scanDirs.join(', '));

  const result = generateDashboard({
    outputFile,
    scanDirs,
    title: 'RefBoard',
  });

  log(`  Found ${result.projectCount} projects`);
  log(`\n✓ ${outputFile}`);

  // Auto-open if requested
  if (opts.open !== false) {
    const { exec } = await import('node:child_process');
    const cmd = process.platform === 'darwin' ? 'open'
              : process.platform === 'win32' ? 'start ""'
              : 'xdg-open';
    exec(`${cmd} "${outputFile}"`);
  }
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
  
  log(`RefBoard`);
  log(`  Input: ${inputDir}`);

  const result = await generateBoard({
    inputDir,
    outputFile,
    title: values.title,
    embedImages: values.embed,
  });

  log(`  Items: ${result.itemCount}`);
  log(`\n✓ ${outputFile}`);
}

// ============ AI Commands ============

async function analyzeCommand(args) {
  const projectDir = findProject();
  if (!projectDir) exit('Not in a RefBoard project');

  if (!args[0]) exit('Usage: refboard analyze <image> [--provider <name>] [--prompt "..."]');

  const opts = parseOptions(args.slice(1));
  const imagePath = resolve(args[0]);
  if (!existsSync(imagePath)) exit(`File not found: ${imagePath}`);

  const ai = AIProvider.fromProjectDir(projectDir);
  const provider = ai.getProvider(opts.provider);

  log(`Analyzing: ${basename(imagePath)}`);
  const result = await provider.analyzeImage(imagePath, opts.prompt);

  if (opts.json) {
    console.log(JSON.stringify(result));
  } else {
    log(`\nDescription: ${result.description}`);
    if (result.tags?.length) log(`Tags: ${result.tags.join(', ')}`);
  }
}

async function autoTagCommand(args) {
  const projectDir = findProject();
  if (!projectDir) exit('Not in a RefBoard project');

  const opts = parseOptions(args);
  const ai = AIProvider.fromProjectDir(projectDir);
  const provider = ai.getProvider(opts.provider);

  const metaPath = join(projectDir, 'metadata.json');
  const metadata = JSON.parse(readFileSync(metaPath, 'utf-8'));
  const images = findImages(projectDir);

  let count = 0;
  for (const img of images) {
    const item = metadata.items.find(i => i.file === img.filename);
    if (!opts.all && item?.tags?.length) continue;

    log(`Analyzing: ${img.filename}...`);
    try {
      const result = await provider.analyzeImage(img.path);
      if (item) {
        if (result.tags?.length) item.tags = [...new Set([...(item.tags || []), ...result.tags])];
        if (result.description && !item.description) item.description = result.description;
      } else {
        metadata.items.push({
          file: img.filename,
          tags: result.tags || [],
          description: result.description || '',
        });
      }
      count++;
    } catch (e) {
      log(`  Warning: ${e.message}`);
    }
  }

  writeFileSync(metaPath, JSON.stringify(metadata, null, 2));

  if (opts.json) {
    console.log(JSON.stringify({ success: true, analyzed: count }));
  } else {
    log(`\n✓ Analyzed ${count} images`);
  }
}

async function searchCommand(args) {
  const projectDir = findProject();
  if (!projectDir) exit('Not in a RefBoard project');

  const opts = parseOptions(args);

  if (opts.similar) {
    const ai = AIProvider.fromProjectDir(projectDir);
    const provider = ai.getProvider(opts.provider);
    const targetPath = resolve(opts.similar);
    if (!existsSync(targetPath)) exit(`File not found: ${targetPath}`);

    log(`Searching for images similar to: ${basename(targetPath)}`);
    log('(Embedding-based search requires pre-computed embeddings)');
  } else {
    const query = args.filter(a => !a.startsWith('--')).join(' ').toLowerCase();
    if (!query) exit('Usage: refboard search <query> or refboard search --similar <image>');

    const metadata = JSON.parse(readFileSync(join(projectDir, 'metadata.json'), 'utf-8'));
    const results = metadata.items.filter(item => {
      const text = [item.file, item.title, item.artist, item.description, ...(item.tags || [])].join(' ').toLowerCase();
      return text.includes(query);
    });

    if (opts.json) {
      console.log(JSON.stringify(results));
    } else if (!results.length) {
      log('No matches found');
    } else {
      log(`Found ${results.length} match(es):\n`);
      results.forEach((item, i) => {
        const tags = item.tags?.length ? ` [${item.tags.join(', ')}]` : '';
        log(`  ${i + 1}. ${item.title || item.file}${tags}`);
      });
    }
  }
}

async function askCommand(args) {
  const projectDir = findProject();
  if (!projectDir) exit('Not in a RefBoard project');

  const question = args.filter(a => !a.startsWith('--')).join(' ');
  if (!question) exit('Usage: refboard ask "your question about the board"');

  const opts = parseOptions(args);
  const ai = AIProvider.fromProjectDir(projectDir);
  const provider = ai.getProvider(opts.provider);

  const metadata = JSON.parse(readFileSync(join(projectDir, 'metadata.json'), 'utf-8'));
  const context = metadata.items.map(item =>
    `- ${item.title || item.file}${item.artist ? ` by ${item.artist}` : ''}${item.tags?.length ? ` [${item.tags.join(', ')}]` : ''}${item.description ? `: ${item.description}` : ''}`
  ).join('\n');

  const messages = [
    { role: 'system', content: `You are a helpful assistant analyzing a visual reference board called "${metadata.board?.title || 'RefBoard'}". Here are the items on the board:\n\n${context}` },
    { role: 'user', content: question },
  ];

  log('Thinking...\n');
  const answer = await provider.chat(messages);

  if (opts.json) {
    console.log(JSON.stringify({ answer }));
  } else {
    log(answer);
  }
}

async function configCommand(args) {
  const projectDir = findProject();
  if (!projectDir) exit('Not in a RefBoard project');

  const configPath = join(projectDir, 'refboard.json');
  const config = loadConfig(projectDir);

  if (!args.length) {
    console.log(JSON.stringify(config, null, 2));
    return;
  }

  const key = args[0];
  const value = args[1];

  if (!value) {
    const parts = key.split('.');
    let obj = config;
    for (const p of parts) obj = obj?.[p];
    console.log(obj !== undefined ? JSON.stringify(obj) : 'undefined');
    return;
  }

  const parts = key.split('.');
  let obj = config;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!obj[parts[i]] || typeof obj[parts[i]] !== 'object') obj[parts[i]] = {};
    obj = obj[parts[i]];
  }

  try {
    obj[parts[parts.length - 1]] = JSON.parse(value);
  } catch {
    obj[parts[parts.length - 1]] = value;
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2));
  log(`✓ Set ${key} = ${value}`);
}

async function agentCommand(args) {
  const projectDir = findProject();
  if (!projectDir) exit('Not in a RefBoard project');

  const subCmd = args[0];
  const subArgs = args.slice(1);
  const opts = parseOptions(subArgs);

  switch (subCmd) {
    case 'add': {
      if (!subArgs[0]) exit('Usage: refboard agent add <image> [--analyze]');
      await addImage(subArgs);
      if (opts.analyze) {
        await analyzeCommand([subArgs[0]]);
      }
      break;
    }
    case 'layout': {
      const metadata = JSON.parse(readFileSync(join(projectDir, 'metadata.json'), 'utf-8'));
      const images = findImages(projectDir);
      let layoutItems = images.map(img => ({ filename: img.filename, x: undefined, y: undefined }));
      layoutItems = autoLayout(layoutItems);

      for (const li of layoutItems) {
        const item = metadata.items.find(i => i.file === li.filename);
        if (item) {
          item.x = li.x;
          item.y = li.y;
        }
      }

      writeFileSync(join(projectDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
      log(`✓ Re-laid out ${layoutItems.length} items`);
      break;
    }
    case 'export': {
      const metadata = JSON.parse(readFileSync(join(projectDir, 'metadata.json'), 'utf-8'));
      console.log(JSON.stringify(metadata, null, 2));
      break;
    }
    default:
      exit('Usage: refboard agent <add|layout|export> [options]');
  }
}

async function savePositionsCommand(args) {
  const projectDir = findProject();
  if (!projectDir) exit('Not in a RefBoard project');

  const opts = parseOptions(args);
  let positionsData;

  if (opts.file) {
    positionsData = JSON.parse(readFileSync(resolve(opts.file), 'utf-8'));
  } else {
    // Read from stdin
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    positionsData = JSON.parse(Buffer.concat(chunks).toString());
  }

  savePositions(projectDir, positionsData);

  if (opts.json) {
    console.log(JSON.stringify({ success: true }));
  } else {
    log('✓ Positions saved to metadata.json');
  }
}

async function serveCommand(args) {
  const projectDir = findProject();
  if (!projectDir) exit('Not in a RefBoard project');

  const opts = parseOptions(args);
  const config = loadConfig(projectDir);
  const port = parseInt(opts.port) || 3000;

  log(`RefBoard serve`);
  log(`  Project: ${config.name || basename(projectDir)}`);

  const { startServer } = await import('../lib/server.js');
  await startServer({ projectDir, port, config, log });
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
  refboard status                  Show project status summary
  refboard home [opts]             Open project dashboard
  refboard serve [--port 3000]     Start local dev server with livereload

AI COMMANDS
  refboard analyze <image>         Analyze image with AI
  refboard auto-tag [--all]        Auto-generate tags for images
  refboard search <query>          Search items by text
  refboard search --similar <img>  Find similar images
  refboard ask "question"          Ask AI about the board
  refboard config [key] [value]    Get/set project config
  refboard save-positions [opts]   Save drag positions to metadata

AGENT COMMANDS
  refboard agent add <image>       Add image (with --analyze)
  refboard agent layout            Re-layout all items
  refboard agent export            Export board data as JSON

OPTIONS
  --title "..."     Item/board title
  --artist "..."    Artist name
  --year "..."      Year
  --desc "..."      Description
  --tags "a,b,c"    Tags (comma-separated)
  --context "..."   Historical context
  --embed           Embed images as base64
  --output, -o      Output file
  --json            Output as machine-readable JSON
  --provider <name> AI provider (openclaw/openai/anthropic/minimax/google)
  --file <path>     Input file (for save-positions)
  -q, --quiet       Suppress decorative output

LEGACY MODE (no project)
  refboard -i <folder> -o board.html -t "Title"

EXAMPLES
  refboard init my-refs
  refboard add photo.jpg --title "Sculpture" --tags "bronze,1920s"
  refboard import ~/Downloads/refs --tags "inspiration"
  refboard build --embed
  refboard analyze photo.jpg --json
  refboard auto-tag --all
  refboard search "art deco"
  refboard ask "What are the common themes?"
  refboard config ai.provider openai
  refboard save-positions --file positions.json
  refboard agent export --format json

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
