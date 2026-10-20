'use strict';

const test = require('node:test');
const { spawn } = require('node:child_process');
const http = require('node:http');
const assert = require('node:assert');

const PORT = 18111;

let child;

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: PORT, method, path },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() })
        );
      }
    );
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

async function waitForServer() {
  const deadline = Date.now() + 2000;
  for (;;) {
    try {
      await request('GET', '/health');
      return;
    } catch {
      if (Date.now() > deadline) throw new Error('server did not start within 2s');
      await new Promise((r) => setTimeout(r, 50));
    }
  }
}

test.before(async () => {
  child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  });
  await waitForServer();
});

test.after(() => {
  if (child) child.kill();
});

test('GET /health returns 200 with ok:true', async () => {
  const res = await request('GET', '/health');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(JSON.parse(res.body).ok, true);
});

test('unknown path returns a non-5xx status', async () => {
  const res = await request('GET', '/definitely-not-a-path');
  assert.ok(res.status >= 400 && res.status < 500, `status was ${res.status}`);
});

test('server survives a malformed POST body', async () => {
  const res = await request('POST', '/health', '{not json');
  assert.ok(Number.isInteger(res.status));
  const after = await request('GET', '/health');
  assert.strictEqual(after.status, 200);
  assert.strictEqual(JSON.parse(after.body).ok, true);
});
