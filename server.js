'use strict';

const http = require('node:http');
const zlib = require('node:zlib');
const PORT = Number(process.env.PORT) || 8100;

// zlib.gunzip(buffer, cb) is the documented one-call gzip convenience API
// (nodejs.org/api/zlib.html, "Convenience methods", verified against v26/v22 docs).
// The legacy zlib.promises namespace was removed, and the newer decompressGzip()
// iterable API is a transform factory absent from this runtime, so the callback
// form is the newest stable one-call API available on the installed Node.

const server = http.createServer((req, res) => {
  // No-op error listeners: a client aborting mid-request must not kill the process.
  req.on('error', () => {});
  res.on('error', () => {});

  // The body is never read, so malformed request bodies cannot reach any parsing code.
  // Targets llhttp accepts but the WHATWG parser rejects (e.g. `\`) must not throw here.
  let pathname;
  try {
    pathname = new URL(req.url, 'http://localhost').pathname;
  } catch {
    pathname = null;
  }

  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (pathname === '/decompress' && req.method === 'POST') {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks);
        zlib.gunzip(body, (err, result) => {
          if (err) {
            res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('bad gzip');
            return;
          }
          res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end(result.toString('utf-8'));
        });
      } catch {
        // Synchronous zlib failures must not crash the server.
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('bad gzip');
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, () => console.log(`listening on port ${PORT}`));
