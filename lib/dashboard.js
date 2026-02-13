import { readFileSync, writeFileSync, readdirSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, basename, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = join(__dirname, '..', 'templates', 'dashboard.html');
const CONFIG_DIR = join(homedir(), '.refboard');
const RECENT_FILE = join(CONFIG_DIR, 'recent.json');

// Ensure config directory exists
if (!existsSync(CONFIG_DIR)) {
  mkdirSync(CONFIG_DIR, { recursive: true });
}

export function getRecentProjects() {
  if (!existsSync(RECENT_FILE)) return [];
  try {
    const data = JSON.parse(readFileSync(RECENT_FILE, 'utf-8'));
    // Filter out non-existent projects
    return data.filter(p => existsSync(p.path));
  } catch {
    return [];
  }
}

export function addRecentProject(projectPath, title) {
  const recent = getRecentProjects();
  const absPath = resolve(projectPath);
  
  // Remove if already exists
  const filtered = recent.filter(p => p.path !== absPath);
  
  // Add to front
  filtered.unshift({
    path: absPath,
    title: title || basename(absPath),
    openedAt: Date.now(),
  });
  
  // Keep only last 20
  const trimmed = filtered.slice(0, 20);
  
  writeFileSync(RECENT_FILE, JSON.stringify(trimmed, null, 2));
}

export function scanProjects(rootDir, maxDepth = 2) {
  const projects = [];
  
  function scan(dir, depth) {
    if (depth > maxDepth) return;
    
    try {
      const configPath = join(dir, 'refboard.json');
      if (existsSync(configPath)) {
        const config = JSON.parse(readFileSync(configPath, 'utf-8'));
        const metaPath = join(dir, 'metadata.json');
        let itemCount = 0;
        let thumbnail = null;
        
        if (existsSync(metaPath)) {
          const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
          itemCount = meta.items?.length || 0;
          
          // Get first image as thumbnail
          if (meta.items?.[0]?.file) {
            const imgPath = join(dir, 'images', meta.items[0].file);
            if (existsSync(imgPath)) {
              thumbnail = imgPath;
            }
          }
        }
        
        const stats = statSync(configPath);
        
        projects.push({
          path: dir,
          name: config.name || basename(dir),
          title: config.title || basename(dir),
          description: config.description || '',
          itemCount,
          thumbnail,
          modifiedAt: stats.mtime.toISOString(),
          boardPath: existsSync(join(dir, 'board.html')) ? join(dir, 'board.html') : null,
        });
        return; // Don't scan subdirectories of a project
      }
      
      // Scan subdirectories
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          scan(join(dir, entry.name), depth + 1);
        }
      }
    } catch (e) {
      // Skip inaccessible directories
    }
  }
  
  scan(rootDir, 0);
  return projects;
}

export function generateDashboard({ outputFile, scanDirs = [], title = 'RefBoard' }) {
  const template = readFileSync(TEMPLATE_PATH, 'utf-8');
  
  // Get recent projects
  const recent = getRecentProjects();
  
  // Scan directories for projects
  const scanned = [];
  for (const dir of scanDirs) {
    if (existsSync(dir)) {
      scanned.push(...scanProjects(dir));
    }
  }
  
  // Deduplicate
  const allPaths = new Set();
  const projects = [];
  
  for (const p of [...recent, ...scanned]) {
    if (!allPaths.has(p.path)) {
      allPaths.add(p.path);
      projects.push(p);
    }
  }
  
  // Sort by modified date
  projects.sort((a, b) => {
    const aTime = a.openedAt || new Date(a.modifiedAt).getTime();
    const bTime = b.openedAt || new Date(b.modifiedAt).getTime();
    return bTime - aTime;
  });
  
  const html = template
    .replaceAll('{{TITLE}}', title)
    .replaceAll('{{PROJECTS_DATA}}', JSON.stringify(projects))
    .replaceAll('{{RECENT_DATA}}', JSON.stringify(recent.slice(0, 5)))
    .replaceAll('{{GENERATED_AT}}', new Date().toISOString());
  
  writeFileSync(outputFile, html, 'utf-8');
  
  return { projectCount: projects.length };
}
