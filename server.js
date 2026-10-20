'use strict';

const http = require('node:http');

const PORT = Number(process.env.PORT) || 8100;

const server = http.createServer((req, res) => {
  // A client aborting mid-request emits 'error' on req/res; unhandled it
  // would kill the process. Bodies are never read, so malformed payloads
  // can't reach any parsing code.
  req.on('error', () => {});
  res.on('error', () => {});

  const { pathname } = new URL(req.url, 'http://localhost');

  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, () => {
  console.log(`listening on port ${PORT}`);
});
