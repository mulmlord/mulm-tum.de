// Local preview of dist/ at http://localhost:4173 (behaves like GitHub Pages).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';

const ROOT = resolve('dist');
const PORT = Number(process.env.PORT) || 4173;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};

async function resolveFile(urlPath) {
  const file = resolve(ROOT, `.${decodeURIComponent(urlPath)}`);
  if (file !== ROOT && !file.startsWith(ROOT + sep)) return null;
  const info = await stat(file).catch(() => null);
  if (!info) return null;
  return info.isDirectory() ? join(file, 'index.html') : file;
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  const file = await resolveFile(pathname);
  const body = file && (await readFile(file).catch(() => null));
  if (body) {
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    return res.end(body);
  }
  res.writeHead(404, { 'content-type': TYPES['.html'] });
  res.end(await readFile(join(ROOT, '404.html')).catch(() => 'not found'));
}).listen(PORT, '127.0.0.1', () => console.log(`preview: http://localhost:${PORT}`));
