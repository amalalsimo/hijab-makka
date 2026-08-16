import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, 'public');
const port = Number(process.env.PORT || 3000);

const types = {
  '.html':'text/html; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.js':'application/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8',
  '.webmanifest':'application/manifest+json; charset=utf-8',
  '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml',
  '.webp':'image/webp','.ico':'image/x-icon','.xml':'application/xml; charset=utf-8',
  '.txt':'text/plain; charset=utf-8'
};

const send = (file, res) => fs.readFile(file, (err, data) => {
  if (err) { res.writeHead(404); return res.end('Not found'); }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    'content-type': types[ext] || 'application/octet-stream',
    'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=86400'
  });
  res.end(data);
});

http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, {'content-type':'application/json; charset=utf-8'});
    return res.end(JSON.stringify({ok:true, service:'hijab-makka-store'}));
  }

  const clean = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = clean === '/' ? path.join(root, 'index.html') : path.join(root, clean.replace(/^\/+/, ''));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end('Forbidden'); }

  fs.stat(file, (err, stat) => {
    if (!err && stat.isFile()) return send(file, res);
    // SPA-like fallback preserves product query URLs and future client-side routes.
    send(path.join(root, 'index.html'), res);
  });
}).listen(port, '0.0.0.0', () => console.log(`HIJAB MAKKAH listening on :${port}`));
