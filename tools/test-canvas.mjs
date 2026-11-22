// The Gemini Canvas test copy (canvas/nano-chat-canvas.html), outside Canvas:  node tools/test-canvas.mjs
// Canvas itself cannot be run here, so its side is a stand-in: a fetch that answers Google's API address the way
// the Canvas page is reported to. What this checks is the copy's own side: the request it sends, falling back
// from a model name that is refused, the frame check, and getting by with no Nano and no IndexedDB.
import { launch } from './nano-harness.mjs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
const root = path.resolve(import.meta.dirname, '..');
const built = spawnSync(process.execPath, [path.join(root, 'tools/build-canvas.mjs')], { encoding: 'utf8' });
if (built.status) { console.log(built.stderr); process.exit(1); }
console.log(built.stdout.trim());
const shots = path.join(root, 'captures'); fs.mkdirSync(shots, { recursive: true });
const b = await launch({ root });
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + String(extra).replace(/\s+/g, ' ').slice(0, 400) : ''}`); };
const J = v => JSON.stringify(v);
const PAGE = '/canvas/nano-chat-canvas.html';
try {
  await b.goto(PAGE);
  await b.waitFor('window.NC && NC.engine.ready', { timeout: 180000 });
  check('the copy starts with real Nano', true);
  check('the coach is on, with the no-key Gemini', await b.eval(`NC.settings.coach.mode === 'ask' && NC.settings.coach.provider === 'canvas'`));
  check('the header has a Frame check button', await b.eval(`!!document.querySelector('#frameCheck')`));
  await b.eval(`NC.setParts({ ...NC.defaultParts(true), calculator: false })`);
  await b.eval(`NC.send('What is 17.5% of 83,946.20?')`);
  check('a reply offers “Ask the coach” with no key given', await b.eval(`[...document.querySelectorAll('.msg.bot:last-child .tool')].some(x => /Ask the coach/.test(x.textContent))`));

  // Outside Canvas the real service must refuse the empty key, and the copy must say so plainly.
  const msg = await b.eval(`(async () => { try { await NC.askCoach('Reply with JSON.', 'Say {"ok":true}'); return 'answered?!'; } catch (e) { return e.message; } })()`);
  check('outside Canvas, Google refuses the empty key and the copy says why', /outside Gemini Canvas/.test(msg), msg);

  // A stand-in for the Canvas page: refuses the first model name, answers the second.
  await b.eval(`(() => {
    const real = window.fetch; window.calls = [];
    window.fetch = async (url, init) => {
      url = String(url);
      if (!/generativelanguage\\.googleapis\\.com/.test(url)) return real(url, init);
      const body = JSON.parse(init.body), model = decodeURIComponent((url.match(/models\\/([^:]+):/) || [])[1] || ''), ask = JSON.stringify(body.contents);
      window.calls.push({ url, model, headers: init.headers, signal: 'signal' in init, keys: Object.keys(init).sort().join(','), body });
      if (model !== 'gemini-2.5-flash-preview-09-2025') return new Response(JSON.stringify({ error: { message: 'models/' + model + ' is not found' } }), { status: 404 });
      const reply = NC.state.chat.turns.at(-1).text, quote = (reply.match(/[\\d,.]{5,}/) || [reply.slice(0, 12)])[0];
      const text = /pong/.test(ask) ? 'pong' : /"ok/.test(ask) ? '{"ok":true}' : body.tools ? 'Chrome 157 is the newest stable version.'
        : JSON.stringify({ verdict: 'wrong', summary: 'The percentage is not right.', hint: 'Check it with a real calculator.', problems: [{ quote, why: 'This is not 17.5% of 83,946.20.' }], cause: 'The calculator part was off.', experiment: 'Switch the calculator on and ask again.', part: 'calculator' });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, ...(body.tools ? { groundingMetadata: { webSearchQueries: ['chrome stable'] } } : {}) }] }), { status: 200 });
    };
  })()`);
  await b.eval(`NC.settings.coach.quiz = false; (() => { const x = [...document.querySelectorAll('.msg.bot:last-child .tool')].find(x => /Ask the coach/.test(x.textContent)); x.click(); })()`);
  await b.waitFor(`(() => { const c = NC.state.chat.turns.at(-1).coach; return c && c.state !== 'loading'; })()`, { timeout: 20000 });
  const c = await b.eval(`NC.state.chat.turns.at(-1).coach`), calls = await b.eval('window.calls');
  check('the coach’s review arrives through the no-key call', c.state === 'done' && c.verdict === 'wrong', J(c).slice(0, 300));
  check('the address is Google’s, with an empty key', calls.every(k => /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/[^/]+:generateContent\?key=$/.test(k.url)), calls[0].url);
  check('no key header and no signal are sent', calls.every(k => !k.signal && !Object.keys(k.headers).some(h => /key|authorization/i.test(h))), J(calls[0].headers) + ' ' + calls[0].keys);
  check('a refused model name falls through to the next', calls[0].model === 'gemini-3-flash-preview' && calls[1].model === 'gemini-2.5-flash-preview-09-2025' && calls.length === 2, calls.map(k => k.model).join(', '));
  check('the request carries instructions and asks for JSON', !!calls[1].body.systemInstruction && calls[1].body.generationConfig.responseMimeType === 'application/json');
  await b.eval(`window.calls.length = 0; NC.askCoach('Reply with JSON.', 'Say {"ok":true}')`);
  check('the model that answered is remembered', J(await b.eval('window.calls.map(k => k.model)')) === J(['gemini-2.5-flash-preview-09-2025']));
  check('search can go through the no-key Gemini', await b.eval(`(async () => { NC.settings.provider = 'ai'; window.calls.length = 0; try { await NC.aiSearch('Forth Bridge'); } catch {} NC.settings.provider = 'wikipedia'; return window.calls.length === 1 && !!window.calls[0].body.tools; })()`));
  check('a stopped request ends at once', await b.eval(`(async () => { const a = new AbortController(); const p = NC.canvasCall('gemini-2.5-flash-preview-09-2025', { contents: [] }, a.signal).catch(e => e.name); a.abort(); return (await p) === 'AbortError'; })()`));

  // Settings: no key box for this choice.
  await b.eval(`NC.showSettings()`);
  check('Settings shows no key box for the no-key coach', await b.eval(`!document.querySelector('#coachKey') && /No key is needed/.test(document.querySelector('#dBody').textContent) && document.querySelector('#coachProv').value === 'canvas' && !document.querySelector('#provAi').disabled`));
  await b.eval(`document.querySelector('#coachProv').value = 'anthropic'; document.querySelector('#coachProv').dispatchEvent(new Event('change'))`);
  check('and still shows one for the others', await b.eval(`!!document.querySelector('#coachKey')`));
  await b.eval(`document.querySelector('#coachProv').value = 'canvas'; document.querySelector('#coachProv').dispatchEvent(new Event('change')); document.querySelector('#dlg').close()`);

  // The frame check, with the stand-in answering.
  await b.eval(`NC.canvas.model = ''; document.querySelector('#frameCheck').click()`);
  await b.waitFor(`/In short/.test((document.querySelector('#frameReport') || {}).value || '')`, { timeout: 60000 });
  const report = await b.eval(`document.querySelector('#frameReport').value`);
  console.log('\n' + report.replace(/^/gm, '  ') + '\n');
  check('the frame check reports Nano running', /\[yes\] Gemini Nano: running in this page/.test(report));
  check('it tries each model name and finds the one that answers', /\[no\] Gemini with no key, as gemini-3-flash-preview/.test(report) && /\[yes\] Gemini with no key, as gemini-2\.5-flash-preview-09-2025/.test(report) && /Gemini with no key works \(gemini-2\.5-flash-preview-09-2025\)/.test(report));
  check('it tries JSON answers and Google Search', /\[yes\] …with instructions and a JSON answer/.test(report) && /\[yes\] …with Google Search/.test(report));
  check('it reports storage and the web', /\[yes\] Settings and notes can be saved/.test(report) && /\[yes\] Chats can be saved/.test(report) && /\[yes\] Wikipedia can be searched/.test(report));
  check('the report can be copied', await b.eval(`(() => { const x = [...document.querySelectorAll('#dBody button')].find(x => /Copy the report/.test(x.textContent)); x.click(); return /Copied|Ctrl\\+C/.test(document.querySelector('#dBody').textContent); })()`));
  await b.screenshot(path.join(shots, 'canvas-check.png'));
  await b.eval(`document.querySelector('#dlg').close()`);

  // A frame with no Nano and no IndexedDB, as Canvas may turn out to be.
  const broken = await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `delete self.LanguageModel; Object.defineProperty(self, 'indexedDB', { get() { throw new DOMException('The operation is insecure.', 'SecurityError'); } });` });
  await b.goto(PAGE);
  await b.waitFor(`window.NC && NC.state.door && NC.state.door.kind === 'none'`, { timeout: 20000 });
  check('with no Nano, the door offers the frame check', await b.eval(`[...document.querySelectorAll('.door button')].some(x => /Check what this frame allows/.test(x.textContent))`));
  check('with no IndexedDB, chats fall back to memory', await b.eval(`(async () => { await NC.state.chat && 0; return NC.dbState.dead === true; })()`), await b.eval('NC.dbState.why'));
  await b.eval(`[...document.querySelectorAll('.door button')].find(x => /Check what this frame allows/.test(x.textContent)).click()`);
  await b.waitFor(`/In short/.test((document.querySelector('#frameReport') || {}).value || '')`, { timeout: 60000 });
  const r2 = await b.eval(`document.querySelector('#frameReport').value`);
  console.log('\n' + r2.replace(/^/gm, '  ') + '\n');
  check('the frame check says Nano is missing and chats are not saved', /\[no\] Gemini Nano/.test(r2) && /\[no\] Chats can be saved/.test(r2) && /Nano does not work in this frame; Gemini with no key does not work/.test(r2));
  await b.screenshot(path.join(shots, 'canvas-no-nano.png'));
  await b.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: broken.identifier });

  // The copy inside a frame like Canvas's: another origin, the same sandbox and "allow" that Canvas gives (read from
  // gemini.google.com on 22 November 2026), and a stand-in for Canvas's no-key answer that exists only in the frame.
  const frameSrv = http.createServer((req, res) => fs.readFile(path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)), (err, data) => err ? res.writeHead(404).end() : res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(data)));
  await new Promise(r => frameSrv.listen(0, '127.0.0.1', r));
  const frameOrigin = `http://127.0.0.1:${frameSrv.address().port}`;
  fs.writeFileSync(path.join(shots, 'canvas-host.html'), `<!doctype html><meta charset="utf-8"><title>Stand-in for Gemini</title><body style="margin:0"><iframe style="border:0;width:100vw;height:100vh" sandbox="allow-pointer-lock allow-popups allow-forms allow-popups-to-escape-sandbox allow-downloads allow-same-origin allow-scripts" allow="xr-spatial-tracking; web-share" src="${frameOrigin}${PAGE}"></iframe>`);
  const ctxs = []; b.on('Runtime.executionContextCreated', p => ctxs.push(p.context));
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `if (self !== top) { const real = window.fetch; window.bridgeCalls = []; window.fetch = async (url, init) => { url = String(url); if (!/generativelanguage\\.googleapis\\.com/.test(url)) return real(url, init); const ask = String(init.body); window.bridgeCalls.push(url); return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: /pong/.test(ask) ? 'pong' : '{"ok":true}' }] } }] }), { status: 200 }); }; }` });
  await b.goto('/captures/canvas-host.html');
  const t0 = Date.now(); let ctx;
  while (!(ctx = ctxs.findLast(c => c.origin === frameOrigin && c.auxData && c.auxData.isDefault)) && Date.now() - t0 < 10000) await new Promise(r => setTimeout(r, 200));
  const fe = async expression => { const r = await b.send('Runtime.evaluate', { expression, contextId: ctx.id, awaitPromise: true, returnByValue: true, userGesture: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  const fwait = async (expression, timeout = 180000) => { const t = Date.now(); for (;;) { const v = await fe(expression); if (v) return v; if (Date.now() - t > timeout) throw new Error('timed out waiting in the frame for: ' + expression); await new Promise(r => setTimeout(r, 400)); } };
  await fwait(`window.NC && NC.state.door && NC.state.door.kind !== undefined && !!document.querySelector('.door')`, 20000);
  check('in a frame like Canvas’s, Chrome refuses the model', await fe(`(document.permissionsPolicy || document.featurePolicy).allowsFeature('language-model') === false && NC.state.door.kind === 'none'`), await fe(`JSON.stringify(NC.state.door)`));
  check('and the door offers a tab of its own', await fe(`!!document.querySelector('#ownTab')`));
  await fe(`document.querySelector('#ownTab').click()`);
  const st = await fwait(`['ready', 'nonano', 'blocked', 'failed', 'lost', 'closed'].includes(NC.own.state) && NC.own.state`);
  check('the tab opens and Nano starts in it', st === 'ready', st + ' ' + await fe(`NC.own.why`));
  if (st === 'ready') {
    check('that tab is on its own, and allowed the model', await fe(`(w => w.top === w && w.NC.POPPED === true && (w.document.permissionsPolicy || w.document.featurePolicy).allowsFeature('language-model'))(NC.own.w)`), await fe(`NC.own.w.location.href + ' ' + NC.own.w.origin`));
    const said = await fe(`(async () => { const n = NC.own.w.NC; await n.send('Say hello in exactly three words.'); const t = n.state.chat.turns.at(-1); return t.text || ('ERROR ' + t.error); })()`);
    check('real Nano answers there', !!said && !/^ERROR/.test(said), said);
    check('its no-key request goes through the page that opened it', await fe(`(async () => { const before = window.bridgeCalls.length, t = await NC.own.w.NC.askCoach('Reply with JSON.', 'Say {"ok":true}'); return t === '{"ok":true}' && window.bridgeCalls.length === before + 1; })()`));
    check('its chats are saved', await fe(`NC.own.w.NC.dbState.dead === false && NC.own.w.NC.state.chats.length > 0`));
    check('the frame says where the app went', /running in the other tab/.test(await fe(`document.querySelector('#ownState').textContent`)));
    const r3 = await fe(`NC.own.w.NC.frameCheck()`);
    console.log('\n' + r3.replace(/^/gm, '  ') + '\n');
    check('the frame check in that tab reports Nano and the route through Canvas', /in a tab of its own/.test(r3) && /\[yes\] Gemini Nano: running/.test(r3) && /\[yes\] Gemini with no key, through the Canvas page/.test(r3));
    await fe(`NC.own.w.close()`);
  }
  frameSrv.close();
  check('no page errors', b.errors.length === 0, b.errors.join(' | '));
} catch (e) { check('the run finished', false, e.stack || e); }
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
