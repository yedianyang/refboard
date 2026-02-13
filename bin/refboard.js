#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { generateBoard } from '../lib/generator.js';

const options = {
  input: { type: 'string', short: 'i', default: '.' },
  output: { type: 'string', short: 'o', default: 'board.html' },
  title: { type: 'string', short: 't', default: 'Reference Board' },
  embed: { type: 'boolean', short: 'e', default: false },
  help: { type: 'boolean', short: 'h', default: false },
};

const { values } = parseArgs({ options, allowPositionals: true });

if (values.help) {
  console.log(`
RefBoard - Visual reference board generator

Usage:
  refboard [options]

Options:
  -i, --input <dir>    Input directory with images and metadata.json (default: .)
  -o, --output <file>  Output HTML file (default: board.html)
  -t, --title <title>  Board title (default: "Reference Board")
  -e, --embed          Embed images as base64 (larger file, fully portable)
  -h, --help           Show this help

Directory structure:
  input/
    images/           # Image files (jpg, png, webp)
    metadata.json     # Image metadata (optional)

Metadata format:
  {
    "items": [
      {
        "file": "image1.jpg",
        "title": "Artwork Title",
        "artist": "Artist Name",
        "year": "1925",
        "description": "Description text",
        "tags": ["art-deco", "sculpture"]
      }
    ],
    "board": {
      "title": "My Mood Board",
      "description": "Board description"
    }
  }

Examples:
  refboard -i ./my-refs -o mood-board.html
  refboard -i ./project --embed -t "Art Deco References"
`);
  process.exit(0);
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
