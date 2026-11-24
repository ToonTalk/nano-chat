// Nano Chat in Microsoft Edge, whose Prompt API runs Microsoft's own model, Aion Instruct. Checks the names the page uses,
// that pictures are refused (Edge 158 gives the model text only), the start screen in an Edge without the Prompt API flag,
// and a few real answers. Headless Edge on throwaway profiles in the OS temp folder, never the user's own Edge profile.
// The profile with the flag on is kept (%TEMP%\nano-chat-edge-profile), so the model (about 1.2 GB) downloads only once.
//   node tools/test-edge.mjs
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const root = path.resolve(import.meta.dirname, '..');
const shots = path.join(root, 'captures'); fs.mkdirSync(shots, { recursive: true });
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const webPort = await freePort();
const server = http.createServer((req, res) => { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; const f = path.join(root, p); if (!f.startsWith(root)) { res.writeHead(403).end(); return; } fs.readFile(f, (e, d) => { if (e) { res.writeHead(404).end(); return; } res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream', 'cache-control': 'no-store' }); res.end(d); }); });
await new Promise(r => server.listen(webPort, '127.0.0.1', r));
const page = `http://127.0.0.1:${webPort}/index.html`;
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + String(extra).replace(/\s+/g, ' ').slice(0, 300) : ''}`); };

async function open(profile) {
  const port = await freePort();
  const proc = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 100 && !target; i++) { await new Promise(r => setTimeout(r, 200)); try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); } catch {} }
  if (!target) throw new Error('Edge did not start');
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const pend = new Map(); const errors = [];
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async x => { const r = (await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true, userGesture: true })).result; return r?.exceptionDetails ? 'THREW ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) : r?.result?.value; };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1180, height: 820, deviceScaleFactor: 1, mobile: false });
  const shot = async f => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(shots, f), Buffer.from(r.result.data, 'base64')); };
  // Edge can leave its helper processes running after the main one is killed, so stop every Edge process on this profile.
  const close = async () => { try { ws.close(); } catch {} proc.kill(); await new Promise(r => setTimeout(r, 1000));
    spawnSync('powershell', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${profile}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`], { stdio: 'ignore' }); };
  return { send, ev, shot, close, errors };
}
const until = async (b, x, ms = 180000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await b.ev(x); if (v && !String(v).startsWith('THREW')) return v; await new Promise(r => setTimeout(r, 400)); } return false; };

// 1. An Edge without the Prompt API flag: the start screen says how to switch it on
const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'nano-chat-edge-bare-'));
{
  const b = await open(bare);
  await b.send('Page.navigate', { url: page });
  await until(b, `window.NC && NC.state.door && NC.state.door.kind === 'none'`, 30000);
  const door = await b.ev(`document.querySelector('.door')?.innerText || ''`);
  check('without the flag, the start screen says how to switch it on', /edge:\/\/flags/.test(door) && /Prompt API/.test(door) && /Aion Instruct/.test(door), door);
  check('the footer names Aion Instruct', /Aion Instruct/.test(await b.ev(`$('#hint').textContent`)));
  await b.shot('edge-door.png');
  check('no page errors without the flag', !b.errors.length, b.errors.join(' | '));
  await b.close();
}
for (let i = 0; i < 8; i++) { try { fs.rmSync(bare, { recursive: true, force: true }); break; } catch { await new Promise(r => setTimeout(r, 500)); } }

// 2. An Edge with the flag on and the model
const profile = path.join(os.tmpdir(), 'nano-chat-edge-profile');
fs.mkdirSync(profile, { recursive: true });
const lsFile = path.join(profile, 'Local State');
const ls = fs.existsSync(lsFile) ? JSON.parse(fs.readFileSync(lsFile, 'utf8')) : {};
ls.browser = ls.browser || {}; ls.browser.enabled_labs_experiments = ['edge-prompt-api@1'];
fs.writeFileSync(lsFile, JSON.stringify(ls));
{
  const b = await open(profile);
  await b.send('Page.navigate', { url: page });
  await until(b, `window.NC && (NC.engine.ready || (NC.state.door && NC.state.door.kind === 'download'))`, 60000);
  if (await b.ev(`NC.state.door && NC.state.door.kind === 'download'`)) { console.log('  (downloading Aion Instruct, about 1.2 GB)'); await b.ev('NC.start(true)'); }
  check('the model starts', !!(await until(b, 'NC.engine.ready', 600000)));
  await b.ev('NC.notes = []; NC.newChat()');          // the kept profile may hold notes from an earlier run
  check('the page names Aion and Edge', await b.ev(`$('#hint').textContent.includes('Aion Instruct') && $('#meter').title.includes('Aion')`));
  check('Edge reports its own memory size', (await b.ev('NC.engine.realW')) > 1000 && (await b.ev('NC.engine.realW')) !== 9216, String(await b.ev('NC.engine.realW')));
  check('pictures and sound are off here', (await b.ev('NC.engine.media')) === false);
  const sys = await b.ev('NC.systemPrompt(NC.state.chat)');
  check('the instructions name Aion and Edge, not Nano', /called Aion\./.test(sys) && /inside Edge/.test(sys) && !/Nano/.test(sys), sys.slice(0, 200));
  const ask = async q => b.ev(`(async () => { await NC.send(${JSON.stringify(q)}); const t = NC.state.chat.turns.at(-1); return { text: t.text, error: t.error || null, tools: t.steps.map(s => s.tool) }; })()`);
  const r1 = await ask('Hi! Who are you, and where do you run?');
  check('it calls itself Aion, not Nano', /Aion/.test(r1.text) && !/Nano/.test(r1.text), r1.text);
  const r2 = await ask('What is 1234 times 5678?');
  check('the calculator works', /7,006,652|7006652/.test(r2.text) && r2.tools.includes('calculator'), r2.text);
  // Aion's tool choices differ from Nano's, so this asks in several fresh chats and reports how often the note was saved.
  const TRIES = +(process.env.EDGE_NOTE_TRIES || 3); let saved = 0, said = '';
  for (let k = 0; k < TRIES; k++) { await b.ev('NC.notes = []; NC.newChat()'); const r = await ask('Please remember that my bike lock code is 4821.'); if (r.tools.includes('save_note') && (await b.ev('NC.notes.some(n => /4821/.test(n.body))'))) saved++; else said = r.text; }
  console.log(`  the note was saved in ${saved} of ${TRIES} fresh chats${said ? '; otherwise it said: ' + said : ''}`);
  check('a note is saved (at least once)', saved > 0);
  if (!(await b.ev('NC.notes.length'))) await b.ev(`NC.notes = [{ id: 'n1', title: 'Bike lock code', body: 'My bike lock code is 4821.', at: Date.now() }]`);
  await b.ev('NC.newChat()');
  const r4 = await ask('What is my bike lock code?');
  check('and used', /4821/.test(r4.text), r4.text);
  await b.ev(`(async () => { const c = document.createElement('canvas'); c.width = 64; c.height = 64; const blob = await new Promise(r => c.toBlob(r, 'image/png')); await NC.addFile(new File([blob], 'x.png', { type: 'image/png' })); })()`);
  check('a picture is refused, with a note', (await b.ev('NC.state.media.length')) === 0 && (await b.ev(`document.body.innerText.includes('takes only text')`)));
  await b.ev('NC.showParts()'); await new Promise(r => setTimeout(r, 300));
  check('the Parts panel says Edge gives text only', await b.ev(`/Here Edge gives Aion text only/.test($('#dBody').innerText) && /By itself Aion Instruct/.test($('#dBody').innerText)`));
  await b.shot('edge-parts.png');
  await b.ev(`$('#dlg').close()`); await b.shot('edge-chat.png');
  check('no page errors with the model', !b.errors.length, b.errors.join(' | '));
  await b.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
server.close();
process.exit(fail ? 1 : 0);
