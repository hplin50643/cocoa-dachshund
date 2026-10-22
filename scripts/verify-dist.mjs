import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

// Exercise the real build below a repository-style URL, without SPA rewrites.
const root = resolve('dist');
const prefix = '/dachshund-test/';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (!pathname.startsWith(prefix)) throw new Error('outside test prefix');
    const filename = resolve(root, pathname.slice(prefix.length) || 'index.html');
    if (!filename.startsWith(root + sep)) throw new Error('outside build');
    const contents = await readFile(filename);
    response.writeHead(200, { 'Content-Type': types[extname(filename)] || 'application/octet-stream' });
    response.end(contents);
  } catch { response.writeHead(404); response.end('Not found'); }
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  const base = `http://127.0.0.1:${server.address().port}${prefix}`;
  const response = await fetch(base);
  assert.equal(response.status, 200);
  const html = await response.text();
  const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]);
  assert(references.length >= 3, 'Expected app, style, and favicon references');
  for (const reference of references) {
    assert(reference.startsWith('./'), `Asset is not relative: ${reference}`);
    assert.equal((await fetch(new URL(reference, base))).status, 200, reference);
  }
  const assets = await readdir(resolve(root, 'assets'));
  for (const asset of assets) assert.equal((await fetch(new URL(`assets/${asset}`, base))).status, 200, asset);
  console.log(`PASS: built page and ${assets.length + 1} assets load beneath ${prefix}; all HTML references are relative.`);
} finally { await new Promise(resolve => server.close(resolve)); }
