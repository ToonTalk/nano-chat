// Headless Chrome with the real Gemini Nano, driven over the DevTools protocol.
// The on-device model is copied (never linked) into a throwaway profile in the OS temp
// folder, so the user's own Chrome profile is not touched. Needs Node 24 (global WebSocket).
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const USER_DATA = path.join(process.env.LOCALAPPDATA, 'Google/Chrome/User Data');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

function freePort() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
    s.on('error', rej);
  });
}

function serve(root, port) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(root, p);
    if (!file.startsWith(path.resolve(root))) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404).end('not found'); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(data);
    });
  });
  return new Promise(res => server.listen(port, '127.0.0.1', () => res(server)));
}

export async function launch({ root, width = 1180, height = 820, withModel = true } = {}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nano-chat-'));
  if (withModel) {
    const src = path.join(USER_DATA, 'OptGuideOnDeviceModel');
    const r = spawnSync('robocopy', [src, path.join(profile, 'OptGuideOnDeviceModel'), '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP'], { stdio: 'ignore' });
    if (r.status >= 8) throw new Error('robocopy failed: ' + r.status);
    const ls = JSON.parse(fs.readFileSync(path.join(USER_DATA, 'Local State'), 'utf8'));
    const og = ls.optimization_guide || {};
    const out = { optimization_guide: { on_device: og.on_device, model_execution: { manifest_asset_ledger: og.model_execution?.manifest_asset_ledger } } };
    fs.writeFileSync(path.join(profile, 'Local State'), JSON.stringify(out));
  }
  const webPort = await freePort();
  const server = await serve(root, webPort);
  const dbgPort = await freePort();
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${dbgPort}`, `--user-data-dir=${profile}`,
    '--enable-features=OptimizationGuideOnDeviceModel:BypassPerfRequirement/true,PromptAPIForGeminiNano',
    `--window-size=${width},${height}`, '--no-first-run', '--no-default-browser-check', 'about:blank',
  ], { stdio: 'ignore' });

  let target;
  for (let i = 0; i < 100 && !target; i++) {
    await new Promise(r => setTimeout(r, 150));
    try {
      const list = await (await fetch(`http://127.0.0.1:${dbgPort}/json/list`)).json();
      target = list.find(t => t.type === 'page');
    } catch { /* not up yet */ }
  }
  if (!target) throw new Error('Chrome did not start');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(); const log = []; const errors = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); return; }
    if (m.method === 'Runtime.consoleAPICalled') log.push(`[${m.params.type}] ` + m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });

  const base = `http://127.0.0.1:${webPort}`;
  const api = {
    base, log, errors, send,
    async goto(p) { await send('Page.navigate', { url: base + p }); await new Promise(r => setTimeout(r, 600)); },
    // Evaluates an expression (may be async); returns its JSON-serializable value.
    async eval(expression, { userGesture = true } = {}) {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    async waitFor(expression, { timeout = 120000, every = 300 } = {}) {
      const t0 = Date.now();
      for (;;) {
        const v = await api.eval(expression);
        if (v) return v;
        if (Date.now() - t0 > timeout) throw new Error('timed out waiting for: ' + expression);
        await new Promise(r => setTimeout(r, every));
      }
    },
    async screenshot(file, { dark = false, w = width, h = height } = {}) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }] });
      await new Promise(r => setTimeout(r, 250));
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    },
    async close() {
      try { ws.close(); } catch {}
      chrome.kill();
      server.close();
      await new Promise(r => setTimeout(r, 800));
      for (let i = 0; i < 8; i++) {
        try { fs.rmSync(profile, { recursive: true, force: true }); break; } catch { await new Promise(r => setTimeout(r, 500)); }
      }
    },
  };
  return api;
}
