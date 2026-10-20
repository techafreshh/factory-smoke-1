'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PORT = 18111;

const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: 'ignore',
});

function request(method, requestPath, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: PORT, method, path: requestPath },
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

test('GET /definitely-not-a-path returns a non-5xx status', async () => {
  const res = await request('GET', '/definitely-not-a-path');
  assert.ok(res.status >= 400 && res.status < 500, `expected 4xx, got ${res.status}`);
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
