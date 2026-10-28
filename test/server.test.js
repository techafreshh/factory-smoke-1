'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

const zlib = require('node:zlib');

const PORT = 18111;

const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: 'ignore',
});

function request(method, requestPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: PORT, method, path: requestPath, headers },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () =>
          resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() })
        );
      }
    );
    req.on('error', reject);
    req.end(body);
  });
}

function rawRequest(raw) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(PORT, '127.0.0.1');
    let responded = false;
    sock.on('connect', () => sock.write(raw));
    sock.on('data', (chunk) => {
      responded = true;
      sock.destroy();
      resolve(chunk.toString());
    });
    sock.on('error', (err) => {
      if (!responded) reject(err);
    });
    sock.on('close', () => {
      if (!responded) reject(new Error('connection closed without a response'));
    });
    sock.setTimeout(2000, () => {
      if (!responded) reject(new Error('raw request timed out'));
      sock.destroy();
    });
  });
}

async function waitForPort() {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const connected = await new Promise((resolve) => {
      const sock = net.connect(PORT, '127.0.0.1');
      sock.on('connect', () => {
        sock.destroy();
        resolve(true);
      });
      sock.on('error', () => resolve(false));
    });
    if (connected) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`server did not listen on port ${PORT} within 2s`);
}

before(() => waitForPort());
after(() => child.kill());

test('GET /health returns 200 with JSON body ok:true', async () => {
  const res = await request('GET', '/health');
  assert.equal(res.status, 200);
  assert.equal(JSON.parse(res.body).ok, true);
});

test('POST /decompress with gzip body returns 200 and decompressed text', async () => {
  const gzipped = zlib.gzipSync('hello smoke');
  const res = await request('POST', '/decompress', gzipped, { 'Content-Encoding': 'gzip' });
  assert.equal(res.status, 200);
  assert.equal(res.body, 'hello smoke');
});

test('POST /decompress with gzip body and no Content-Encoding header still returns 200', async () => {
  const gzipped = zlib.gzipSync('hello smoke');
  const res = await request('POST', '/decompress', gzipped);
  assert.equal(res.status, 200);
  assert.equal(res.body, 'hello smoke');
});

test('POST /decompress with non-gzip body returns 400 bad gzip', async () => {
  const res = await request('POST', '/decompress', 'not gzip');
  assert.equal(res.status, 400);
  assert.equal(res.body, 'bad gzip');
});

test('POST /decompress with empty body returns 400 bad gzip', async () => {
  const res = await request('POST', '/decompress', '');
  assert.equal(res.status, 400);
  assert.equal(res.body, 'bad gzip');
});

test('server survives a malformed body to /decompress and health stays ok', async () => {
  const res = await request('POST', '/decompress', Buffer.from([0x1f, 0x8b, 0x00, 0x00]));
  assert.equal(res.status, 400);
  assert.equal(res.body, 'bad gzip');

  const health = await request('GET', '/health');
  assert.equal(health.status, 200);
  assert.equal(JSON.parse(health.body).ok, true);
});

test('GET /definitely-not-a-path returns a non-5xx status', async () => {
  const res = await request('GET', '/definitely-not-a-path');
  assert.ok(res.status >= 400 && res.status < 500, `expected 4xx, got ${res.status}`);
});

test('GET /health, GET /health, GET / sequence: each within 2s, none 5xx', async () => {
  for (const p of ['/health', '/health', '/']) {
    const startedAt = Date.now();
    const res = await request('GET', p);
    const elapsed = Date.now() - startedAt;
    assert.ok(res.status < 500, `expected non-5xx for ${p}, got ${res.status}`);
    assert.ok(elapsed < 2000, `GET ${p} took ${elapsed}ms`);
  }
});

test('server survives a malformed POST body to /health', async () => {
  const res = await request('POST', '/health', '{not json');
  assert.ok(Number.isInteger(res.status), 'expected a complete response');
});

test('after malformed request, GET /health still returns 200 ok:true', async () => {
  const res = await request('GET', '/health');
  assert.equal(res.status, 200);
  assert.equal(JSON.parse(res.body).ok, true);
});

test('POST {"truncated to any path answers within 2s and health stays ok', async () => {
  for (const p of ['/', '/definitely-not-a-path', '/health']) {
    const startedAt = Date.now();
    const res = await request('POST', p, '{"truncated');
    const elapsed = Date.now() - startedAt;
    assert.ok(Number.isInteger(res.status), `expected a complete response for ${p}`);
    assert.ok(elapsed < 2000, `POST ${p} took ${elapsed}ms`);

    const health = await request('GET', '/health');
    assert.equal(health.status, 200);
    assert.equal(JSON.parse(health.body).ok, true);
  }
});

test('2MB junk body gets a complete response and health stays ok', async () => {
  const buf = Buffer.alloc(2 * 1024 * 1024);
  for (let i = 0; i < buf.length; i++) buf[i] = (i * 31 + 7) & 0xff;
  const res = await request('POST', '/', buf);
  assert.ok(Number.isInteger(res.status), 'expected a complete response');

  const health = await request('GET', '/health');
  assert.equal(health.status, 200);
  assert.equal(JSON.parse(health.body).ok, true);
});

test('arbitrary bytes (NULs, invalid UTF-8) get a complete response and health stays ok', async () => {
  const buf = Buffer.alloc(4096);
  for (let i = 0; i < buf.length; i++) buf[i] = i % 256;
  const res = await request('POST', '/definitely-not-a-path', buf);
  assert.ok(Number.isInteger(res.status), 'expected a complete response');

  const health = await request('GET', '/health');
  assert.equal(health.status, 200);
  assert.equal(JSON.parse(health.body).ok, true);
});

test('sustained burst of abusive bodies across paths never breaks health', async () => {
  const paths = ['/', '/definitely-not-a-path', '/health', '/decompress'];
  const bodies = [
    '{"truncated',
    'plain junk, not json at all',
    Buffer.from([0, 255, 1, 254, 0, 128, 129, 200, 0]),
  ];
  for (let i = 0; i < 50; i++) {
    const res = await request('POST', paths[i % paths.length], bodies[i % bodies.length]);
    assert.ok(Number.isInteger(res.status), `expected a complete response on iteration ${i}`);
  }

  const health = await request('GET', '/health');
  assert.equal(health.status, 200);
  assert.equal(JSON.parse(health.body).ok, true);
});

test('backslash request target gets 404 and the process survives', async () => {
  // Sent over a raw socket: this target crashes an unguarded URL parse.
  const res = await rawRequest('GET /\\ HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n');
  assert.ok(/^HTTP\/1\.[01] 404/.test(res), `expected 404, got: ${res.split('\r\n')[0]}`);

  const health = await request('GET', '/health');
  assert.equal(health.status, 200);
  assert.equal(JSON.parse(health.body).ok, true);
});
