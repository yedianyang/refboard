#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { resolve, join, basename } from 'node:path';
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { generateBoard } from '../lib/generator.js';

const args = process.argv.slice(2);
const command = args[0];

// Commands
const commands = {
  init: initProject,
  add: addImage,
  build: buildBoard,
  help: showHelp,
};

// Default to build if no command or if first arg looks like an option
if (!command || command.startsWith('-')) {
  // Legacy mode: direct build with options
  await legacyBuild();
} else if (commands[command]) {
  await commands[command](args.slice(1));
} else {
  console.error(`Unknown command: ${command}`);
  console.log('Run "refboard help" for usage');
  process.exit(1);
}

async function initProject(args) {
  const dir = args[0] || '.';
  const targetDir = resolve(dir);
  const configPath = join(targetDir, 'refboard.json');
  
  if (existsSync(configPath)) {
    console.error('Project already initialized (refboard.json exists)');
    process.exit(1);
  }
  
  // Create directories
  mkdirSync(join(targetDir, 'images'), { recursive: true });
  
  // Create config
  const config = {
    name: basename(targetDir),
    title: 'My Reference Board',
    description: '',
    output: 'board.html',
  };
  writeFileSync(configPath, JSON.stringify(config, null, 2));
  
  // Create empty metadata
  const metadata = {
    board: {
      title: config.title,
      description: config.description,
    },
    items: [],
  };
  writeFileSync(join(targetDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
  
  console.log(`✓ Initialized RefBoard project in ${targetDir}`);
  console.log(`
Next steps:
  1. Add images:     refboard add <image-file>
  2. Edit metadata:  Edit metadata.json to add descriptions
  3. Build board:    refboard build
`);
}

async function addImage(args) {
  if (args.length === 0) {
    console.error('Usage: refboard add <image-file> [--title "Title"] [--artist "Artist"]');
    process.exit(1);
  }
  
  // Find project root (look for refboard.json)
  let projectDir = process.cwd();
  while (!existsSync(join(projectDir, 'refboard.json'))) {
    const parent = resolve(projectDir, '..');
    if (parent === projectDir) {
      console.error('Not in a RefBoard project. Run "refboard init" first.');
      process.exit(1);
    }
    projectDir = parent;
  }
  
  // Parse args
  const imagePath = resolve(args[0]);
  let title = '';
  let artist = '';
  let tags = [];
  
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--title' && args[i + 1]) {
      title = args[++i];
    } else if (args[i] === '--artist' && args[i + 1]) {
      artist = args[++i];
    } else if (args[i] === '--tags' && args[i + 1]) {
      tags = args[++i].split(',').map(t => t.trim());
    }
  }
  
  if (!existsSync(imagePath)) {
    console.error(`Image not found: ${imagePath}`);
    process.exit(1);
  }
  
  // Copy image to images/
  const filename = basename(imagePath);
  const destPath = join(projectDir, 'images', filename);
  
  if (existsSync(destPath)) {
    console.error(`Image already exists: images/${filename}`);
    process.exit(1);
  }
  
  copyFileSync(imagePath, destPath);
  
  // Update metadata
  const metadataPath = join(projectDir, 'metadata.json');
  const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8'));
  
  metadata.items.push({
    file: filename,
    title: title || '',
    artist: artist || '',
    year: '',
    description: '',
    context: '',
    influences: '',
    tags: tags,
  });
  
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  
  console.log(`✓ Added: images/${filename}`);
  if (title || artist) {
    console.log(`  Title: ${title || '(none)'}`);
    console.log(`  Artist: ${artist || '(none)'}`);
  }
  console.log(`\nEdit metadata.json to add more details.`);
}

async function buildBoard(args) {
  // Find project root
  let projectDir = process.cwd();
  while (!existsSync(join(projectDir, 'refboard.json'))) {
    const parent = resolve(projectDir, '..');
    if (parent === projectDir) {
      // Not in a project, fall back to legacy mode
      await legacyBuild();
      return;
    }
    projectDir = parent;
  }
  
  // Load config
  const config = JSON.parse(readFileSync(join(projectDir, 'refboard.json'), 'utf-8'));
  
  // Parse args for overrides
  let embed = false;
  let output = config.output || 'board.html';
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--embed' || args[i] === '-e') {
      embed = true;
    } else if ((args[i] === '--output' || args[i] === '-o') && args[i + 1]) {
      output = args[++i];
    }
  }
  
  const outputPath = resolve(projectDir, output);
  
  console.log(`RefBoard - Building reference board`);
  console.log(`  Project: ${config.name || basename(projectDir)}`);
  console.log(`  Output:  ${outputPath}`);
  
  try {
    await generateBoard({
      inputDir: projectDir,
      outputFile: outputPath,
      title: config.title || 'Reference Board',
      embedImages: embed,
    });
    console.log(`\n✓ Board generated: ${outputPath}`);
  } catch (err) {
    console.error(`\nError: ${err.message}`);
    process.exit(1);
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
  
  if (values.help) {
    showHelp();
    return;
  }
  
  const inputDir = resolve(values.input);
  const outputFile = resolve(values.output);
  
  if (!existsSync(inputDir)) {
    console.error(`Error: Input directory not found: ${inputDir}`);
    process.exit(1);
  }
  
  console.log(`RefBoard - Generating visual reference board`);
  console.log(`  Input:  ${inputDir}`);
  console.log(`  Output: ${outputFile}`);
  
  try {
    await generateBoard({
      inputDir,
      outputFile,
      title: values.title,
      embedImages: values.embed,
    });
    console.log(`\n✓ Board generated: ${outputFile}`);
  } catch (err) {
    console.error(`\nError: ${err.message}`);
    process.exit(1);
  }
}

function showHelp() {
  console.log(`
RefBoard - Visual reference board generator

Commands:
  refboard init [dir]           Initialize a new project
  refboard add <image> [opts]   Add an image to the project
  refboard build [opts]         Build the reference board
  refboard help                 Show this help

Init:
  refboard init                 Initialize in current directory
  refboard init ./my-project    Initialize in specified directory

Add:
  refboard add photo.jpg
  refboard add photo.jpg --title "Artwork" --artist "Name"
  refboard add photo.jpg --tags "art-deco,sculpture"

Build:
  refboard build                Build using project config
  refboard build --embed        Embed images as base64
  refboard build -o out.html    Custom output file

Legacy mode (no project):
  refboard -i ./folder -o board.html
  refboard -i ./refs -t "My Board" --embed

Project structure:
  my-project/
    refboard.json       Project config
    metadata.json       Image metadata
    images/             Image files
    board.html          Generated output

More info: https://github.com/jingxiguo/refboard
`);
}
