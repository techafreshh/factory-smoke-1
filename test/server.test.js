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

test('backslash request target gets 404 and the process survives', async () => {
  // Sent over a raw socket: this target crashes an unguarded URL parse.
  const res = await rawRequest('GET /\\ HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n');
  assert.ok(/^HTTP\/1\.[01] 404/.test(res), `expected 404, got: ${res.split('\r\n')[0]}`);

  const health = await request('GET', '/health');
  assert.equal(health.status, 200);
  assert.equal(JSON.parse(health.body).ok, true);
});
