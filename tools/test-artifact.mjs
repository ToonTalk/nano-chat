// Checks the Claude artifact copy (artifact/nano-chat-artifact.html), rebuilt first, with a stand-in for the artifact
// viewer: the page is served inside the document the viewer puts around it, in a frame from another origin that is not
// allowed Chrome's built-in model, with a rule that blocks requests to other sites (as artifacts have), and with a
// stand-in `claude.use()` in that frame alone. The stand-in refuses options made in another window, as the real one
// does. Nano itself is the real Gemini Nano, in the tab the frame opens.
//   node tools/test-artifact.mjs
import { launch } from './nano-harness.mjs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
const root = path.resolve(import.meta.dirname, '..');
const shots = path.join(root, 'captures'); fs.mkdirSync(shots, { recursive: true });
const built = spawnSync(process.execPath, [path.join(root, 'tools', 'build-artifact.mjs')], { encoding: 'utf8' });
if (built.status) { console.log(built.stdout + built.stderr); process.exit(1); }
console.log(built.stdout.trim());
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + String(extra).replace(/\s+/g, ' ').slice(0, 320) : ''}`); };
const content = fs.readFileSync(path.join(root, 'artifact', 'nano-chat-artifact.html'), 'utf8');
// what the artifact viewer puts around a page
const page = `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${content}</body></html>`;
const frameSrv = http.createServer((req, res) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
  'content-security-policy': "default-src 'self' 'unsafe-inline' data: blob:; connect-src 'self' data: blob:" }).end(page));
await new Promise(r => frameSrv.listen(0, '127.0.0.1', r));
const frameOrigin = `http://127.0.0.1:${frameSrv.address().port}`;
const b = await launch({ root, height: 980 });
try {
  fs.writeFileSync(path.join(shots, 'artifact-host.html'), `<!doctype html><meta charset="utf-8"><title>Stand-in for the artifact viewer</title><body style="margin:0"><iframe style="border:0;width:100vw;height:100vh" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms" allow="clipboard-write" src="${frameOrigin}/"></iframe>`);
  const ctxs = []; b.on('Runtime.executionContextCreated', p => ctxs.push(p.context));
  // the stand-in for the viewer's runtime, in the frame only
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `if (self !== top) {
    window.claudeCalls = []; window.claudePerm = 'prompt'; window.permAsked = 0;
    const sample = async (input, opts) => {
      if (opts !== undefined && Object.getPrototypeOf(opts) !== Object.prototype) throw { code: 'invalid_request', message: 'options must be a plain object - for images pass {images}' };
      if (!(typeof input === 'string' || Array.isArray(input))) throw { code: 'invalid_request', message: 'input must be a string or a list of turns' };
      window.claudeCalls.push({ input: JSON.parse(JSON.stringify(input)), tier: opts && opts.modelTier, cache: opts && opts.cache, signal: !!(opts && opts.signal instanceof AbortSignal) });
      if (window.claudeDeny) throw { code: 'not_granted', message: 'The viewer has not allowed this artifact to use Claude.' };
      const last = Array.isArray(input) ? input[input.length - 1].content : input;
      return { text: /JSON object only/.test(last) ? '{"verdict":"wrong","summary":"The percentage is not right.","hint":"Check it another way.","problems":[],"cause":"The calculator part was off.","experiment":"Switch the calculator on.","part":"calculator"}' : 'A plain answer from the stand-in.', truncated: false, modelTierApplied: 'default' };
    };
    const permissions = { state: async () => window.claudePerm, request: async () => { window.permAsked++; window.claudePerm = 'granted'; return { sample: 'granted' }; } };
    const downloads = { save: async req => { if (Object.getPrototypeOf(req) !== Object.prototype) throw { code: 'bad_request', message: 'not a plain object' }; window.saved = { filename: req.filename, size: String(req.data).length, head: String(req.data).slice(0, 15) }; return { status: 'saved' }; } };
    window.claude = { use: async name => ({ sample, permissions, downloads })[name] || null };
  }` });
  await b.goto('/captures/artifact-host.html');
  const t0 = Date.now(); let ctx;
  while (!(ctx = ctxs.findLast(c => c.origin === frameOrigin && c.auxData && c.auxData.isDefault)) && Date.now() - t0 < 10000) await new Promise(r => setTimeout(r, 200));
  const fe = async expression => { const r = await b.send('Runtime.evaluate', { expression, contextId: ctx.id, awaitPromise: true, returnByValue: true, userGesture: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  const fwait = async (expression, timeout = 180000) => { const t = Date.now(); for (;;) { const v = await fe(expression); if (v) return v; if (Date.now() - t > timeout) throw new Error('timed out waiting in the frame for: ' + expression); await new Promise(r => setTimeout(r, 400)); } };
  await fwait(`window.NC && NC.state.door && !!document.querySelector('.door')`, 20000);

  // the frame
  check('the page is content only: no document of its own inside the viewer’s', !/<!doctype|<html|<head>|<body/i.test(content.slice(0, content.indexOf('<div id="app">'))) && /^<title>Nano Chat<\/title>/.test(content));
  check('in the artifact’s frame Chrome refuses the model', await fe(`(document.permissionsPolicy || document.featurePolicy).allowsFeature('language-model') === false && NC.state.door.kind === 'none'`));
  const door = await fe(`document.querySelector('.door').innerText`);
  check('the frame offers a tab of its own, and says what this copy cannot do', /Nano Chat opens in a tab of its own/.test(door) && /Open Nano Chat in its own tab/.test(door) && /cannot do: search the web or read links/.test(door) && !/This browser does not offer it/.test(door), door);
  await fwait(`!!document.querySelector('#allowCoach')`, 10000);
  check('it says the coach is Claude on your own account, and offers to ask for permission first', /Claude asks your permission the first time/.test(await fe(`document.querySelector('#coachPermission').textContent`)));
  await b.screenshot(path.join(shots, 'artifact-door.png'));
  await fe(`document.querySelector('#allowCoach').click()`);
  await fwait(`/Claude is allowed/.test(document.querySelector('#coachPermission').textContent)`, 10000);
  check('“Let the coach use Claude” asks once, and then says it is allowed', (await fe('window.permAsked')) === 1 && !(await fe(`!!document.querySelector('#allowCoach')`)));
  check('the web parts are not counted: 12 parts, all on', (await fe(`document.querySelector('#partsCount').textContent`)) === '12/12' && await fe(`NC.settings.features.search === false && NC.settings.features.links === false`));

  // the tab of its own
  await fe(`document.querySelector('#ownTab').click()`);
  const st = await fwait(`['ready', 'nonano', 'blocked', 'failed', 'lost', 'closed'].includes(NC.own.state) && NC.own.state`);
  check('the tab opens and Nano starts in it', st === 'ready', st + ' ' + await fe(`NC.own.why`));
  if (st === 'ready') {
    check('that tab is top-level, knows it was opened by the artifact, and is allowed the model', await fe(`(w => w.top === w && w.NC.POPPED === true && (w.document.permissionsPolicy || w.document.featurePolicy).allowsFeature('language-model'))(NC.own.w)`));
    check('the frame says where the app went', /running in the other tab/.test(await fe(`document.querySelector('#ownState').textContent`)));
    const said = await fe(`(async () => { const n = NC.own.w.NC; await n.send('Say hello in exactly three words.'); const t = n.state.chat.turns.at(-1); return t.text || ('ERROR ' + t.error); })()`);
    check('real Nano answers in the tab', !!said && !/^ERROR/.test(said), said);
    check('the tab cannot reach other sites either', await fe(`(async () => { try { await NC.own.w.fetch('https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*'); return false; } catch { return true; } })()`));
    check('web search and links cannot be switched on', await fe(`(n => { n.setPart('search', true); n.setPart('links', true); n.setParts(n.defaultParts(true)); return n.settings.features.search === false && n.settings.features.links === false; })(NC.own.w.NC)`));
    const link = await fe(`(async () => { const n = NC.own.w.NC; await n.send('What is on https://example.com/ ?'); const t = n.state.chat.turns.at(-1); return { steps: t.steps.map(s => s.tool), text: t.text.slice(0, 80) }; })()`);
    check('a link in a message is not fetched', !link.steps.includes('read_page'), JSON.stringify(link));
    await fe(`NC.own.w.NC.showParts()`);
    const panel = await fe(`NC.own.w.document.querySelector('#dBody').innerText`);
    check('the parts panel shows the two web parts as not in this copy, with their switches off', (panel.match(/Not in this copy/g) || []).length === 2 && await fe(`[...NC.own.w.document.querySelectorAll('#dlg .part input')].filter(x => x.disabled).length === 2`), (panel.match(/[^\n]*Not in this copy[^\n]*/) || [''])[0]);
    await fe(`NC.own.w.document.querySelector('#dlg').close(); NC.own.w.NC.showSettings()`);
    const set = await fe(`NC.own.w.document.querySelector('#dBody').innerText`);
    check('Settings leaves out the search services and the reader, and says why', !/Where searches go/.test(set) && !/r\.jina\.ai/.test(set) && /runs as a Claude artifact, which may not reach other websites/.test(set));
    check('the coach is Claude on your account, with no key box', /Claude, on your account/.test(await fe(`NC.own.w.document.querySelector('#coachProv').textContent`)) && await fe(`!NC.own.w.document.querySelector('#coachKey') && !NC.own.w.document.querySelector('#coachModelSel')`) && /counts toward your Claude usage limits/.test(set));
    await fe(`NC.own.w.document.querySelector('#dlg').close()`);

    // the coach, through the artifact's frame
    const before = await fe('window.claudeCalls.length');
    const coach = await fe(`(async () => { const n = NC.own.w.NC; n.setPart('calculator', false); n.settings.coach.quiz = false; await n.send('What is 17.5% of 83,946.20?'); const t = n.state.chat.turns.at(-1); await n.startCoach(n.state.chat, t); n.setPart('calculator', true); return JSON.parse(JSON.stringify(t.coach)); })()`);
    check('the coach’s review comes back through the artifact’s frame', coach.state === 'done' && coach.verdict === 'wrong' && coach.part === 'calculator' && coach.by === 'Claude, on your account', JSON.stringify(coach).slice(0, 300));
    const call = await fe('window.claudeCalls.at(-1)');
    check('Claude was asked once, with the coach’s instructions opening the first message', (await fe('window.claudeCalls.length')) === before + 1 && call.input[0].role === 'user' && /^You are the coach in Nano Chat/.test(call.input[0].content) && call.tier === 'default' && call.cache === false && call.signal, JSON.stringify({ tier: call.tier, cache: call.cache, head: call.input[0].content.slice(0, 40) }));
    const talk = await fe(`(async () => { const n = NC.own.w.NC, t = n.state.chat.turns.at(-1); await n.coachSay(n.state.chat, t, 'Why is it wrong?'); return t.coach.talk.at(-1).text; })()`);
    check('a question to the coach is answered the same way', /plain answer from the stand-in/.test(talk), talk);
    const denied = await fe(`(async () => { window.claudeDeny = true; try { await NC.own.w.NC.askCoach('Reply with JSON.', 'Say {"ok":true}'); return 'answered?!'; } catch (e) { return e.message; } finally { window.claudeDeny = false; } })()`);
    check('when Claude is not allowed, the coach says where to allow it', /has not been allowed to use Claude/.test(denied) && /artifact’s tab/.test(denied), denied);

    // saving a chat
    await fe(`NC.own.w.NC.saveChat()`);
    await fwait(`!!window.saved`, 10000);
    const saved = await fe('window.saved');
    check('saving a chat goes through the artifact, as one HTML file', /\.html$/.test(saved.filename) && saved.size > 5000 && saved.head === '<!doctype html>', JSON.stringify(saved));
    check('and the tab says where to confirm it', /Saved as|confirm where the chat is saved/i.test(await fe(`NC.own.w.document.querySelector('#hint').textContent`)), await fe(`NC.own.w.document.querySelector('#hint').textContent`));
    await b.screenshot(path.join(shots, 'artifact-frame-after.png'));
    await fe(`NC.own.w.close()`);
  }

  // a viewer for whom the artifact may not open a tab
  await fe(`window.open = () => null; NC.own.state = ''; NC.ui.thread(); document.querySelector('#ownTab').click()`);
  const blocked = await fe(`document.querySelector('#ownState').innerText`);
  check('where no tab may open, the frame says why and points to the full app', /was not allowed to open a tab/.test(blocked) && /same organization/.test(blocked) && await fe(`!!document.querySelector('#ownState a[href="https://toontalk.github.io/nano-chat/"]')`), blocked);
  check('no page errors', b.errors.length === 0, b.errors.join(' | '));
} catch (e) { check('the run finished', false, e.stack || e); }
frameSrv.close();
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
