'use strict';

const http = require('node:http');
const PORT = Number(process.env.PORT) || 8100;

const server = http.createServer((req, res) => {
  // No-op error listeners: a client aborting mid-request must not kill the process.
  req.on('error', () => {});
  res.on('error', () => {});

  // The body is never read, so malformed request bodies cannot reach any parsing code.
  const pathname = new URL(req.url, 'http://localhost').pathname;

  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, () => console.log(`listening on port ${PORT}`));
