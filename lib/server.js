import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, watch } from 'node:fs';
import { join, extname } from 'node:path';
import { renderBoard, loadMetadata } from './generator.js';

const MIME_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.html': 'text/html',
  '.json': 'application/json',
  '.js': 'text/javascript',
  '.css': 'text/css',
};

// SSE livereload script injected before </body>
const LIVERELOAD_SCRIPT = `
<script>
(function() {
  const es = new EventSource('/__livereload');
  es.onmessage = () => location.reload();
  es.onerror = () => setTimeout(() => location.reload(), 2000);
})();
</script>`;

/**
 * Start a local dev server for a RefBoard project.
 * @param {object} opts
 * @param {string} opts.projectDir - Project root directory
 * @param {number} [opts.port=3000] - Port number
 * @param {object} [opts.config] - Project config from refboard.json
 * @param {function} [opts.log] - Logging function
 * @returns {Promise<import('node:http').Server>}
 */
export function startServer({ projectDir, port = 3000, config = {}, log = () => {} }) {
  // SSE clients for livereload
  const sseClients = new Set();

  function notifyReload() {
    for (const res of sseClients) {
      res.write('data: reload\n\n');
    }
  }

  // Find image directories
  function findImageDir() {
    const candidates = [
      join(projectDir, 'images'),
      join(projectDir, 'raw'),
      projectDir,
    ];
    for (const dir of candidates) {
      if (existsSync(dir)) return dir;
    }
    return projectDir;
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    const pathname = decodeURIComponent(url.pathname);

    // SSE livereload endpoint
    if (pathname === '/__livereload') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      res.write('data: connected\n\n');
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }

    // Serve images from /images/
    if (pathname.startsWith('/images/')) {
      const filename = pathname.slice('/images/'.length);
      // Search in known image directories
      const candidates = [
        join(projectDir, 'images', filename),
        join(projectDir, 'raw', filename),
        join(projectDir, filename),
      ];
      for (const filePath of candidates) {
        if (existsSync(filePath)) {
          const ext = extname(filePath).toLowerCase();
          const mime = MIME_TYPES[ext] || 'application/octet-stream';
          const stat = statSync(filePath);
          res.writeHead(200, {
            'Content-Type': mime,
            'Content-Length': stat.size,
            'Cache-Control': 'public, max-age=60',
          });
          res.end(readFileSync(filePath));
          return;
        }
      }
      res.writeHead(404);
      res.end('Image not found');
      return;
    }

    // Board page (root or /board)
    if (pathname === '/' || pathname === '/board') {
      try {
        const result = renderBoard({
          inputDir: projectDir,
          title: config.title,
          imageBaseUrl: '/images/',
          homeUrl: '/',
          config,
        });

        // Inject livereload script
        const html = result.html.replace('</body>', LIVERELOAD_SCRIPT + '</body>');

        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache',
        });
        res.end(html);
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`Error rendering board: ${e.message}`);
      }
      return;
    }

    // API: get metadata
    if (pathname === '/api/metadata') {
      const metadata = loadMetadata(projectDir);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(metadata, null, 2));
      return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  });

  // Watch for changes and notify livereload clients
  const watchPaths = [
    join(projectDir, 'metadata.json'),
  ];
  const imagesDir = join(projectDir, 'images');
  if (existsSync(imagesDir)) watchPaths.push(imagesDir);

  const watchers = [];
  for (const wp of watchPaths) {
    if (existsSync(wp)) {
      let debounce;
      const watcher = watch(wp, () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          log(`  [reload] Change detected`);
          notifyReload();
        }, 300);
      });
      watchers.push(watcher);
    }
  }

  server.on('close', () => {
    for (const w of watchers) w.close();
    for (const client of sseClients) client.end();
  });

  return new Promise((resolve, reject) => {
    server.listen(port, () => {
      log(`  Server: http://localhost:${port}`);
      log(`  Livereload: enabled`);
      log(`  Press Ctrl+C to stop\n`);
      resolve(server);
    });
    server.on('error', reject);
  });
}
