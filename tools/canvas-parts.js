// The pieces that tools/build-canvas.mjs adds to index.html to make the Gemini Canvas test copy.
// Each piece starts at a "//#piece name" line. This file is not loaded by anything as it stands.

//#piece source
// ── Canvas test copy ── Gemini Canvas does not let the frame its apps run in use Chrome's built-in model, but the
// frame may open a tab, and a tab of its own is allowed. So the page keeps itself as it arrived, to write into
// such a tab. POPPED is true in that tab; its no-key requests go through the Canvas page that opened it.
const SOURCE = (() => { try { const d = document.documentElement.cloneNode(true), me = document.currentScript; for (const s of d.querySelectorAll('script')) if (!me || s.textContent !== me.textContent) s.remove(); return '<!doctype html>\n' + d.outerHTML; } catch { return ''; } })();
const POPPED = (() => { try { return !!(window.opener && window.opener !== window && window.opener.NC_FRAME); } catch { return false; } })();
if (!POPPED) window.NC_FRAME = true;

//#piece storage
// ── Canvas test copy ── If this frame has no IndexedDB (or it never answers), chats are kept in memory for this visit.
const dbState = { dead: false };
{
  const mem = new Map(), real = { all: db.all.bind(db), put: db.put.bind(db), del: db.del.bind(db) };
  const late = ms => new Promise((_, rej) => setTimeout(() => rej(new Error('IndexedDB did not answer')), ms));
  const guard = (name, alt) => async (...a) => {
    if (!dbState.dead) { try { return await Promise.race([real[name](...a), late(5000)]); } catch (e) { dbState.dead = true; dbState.why = String(e && e.message || e); console.warn('No IndexedDB in this frame; chats are kept in memory only.', e); } }
    return alt(...a);
  };
  db.all = guard('all', () => [...mem.values()]);
  db.put = guard('put', c => { mem.set(c.id, JSON.parse(JSON.stringify(c))); });
  db.del = guard('del', id => { mem.delete(id); });
}

//#piece models
// ── Canvas test copy ── Inside Gemini Canvas, a request to Google's API address with an empty key is handed by the
// Canvas page to Gemini, on the viewer's own Google account. Which model names it takes is not written down anywhere
// official, so these are tried in turn and the first one that answers is remembered.
// Tried inside Canvas on 22 November 2026: the first three answered, and the last two were refused (403).
const CANVAS_MODELS = ['gemini-3-flash-preview', 'gemini-2.5-flash-preview-09-2025', 'gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-3.5-flash'];

//#piece ask
// ── Canvas test copy: the keyless call ──
const canvas = { model: '', last: null };
async function canvasCall(model, body, signal) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=`;
  // No signal goes to fetch: Canvas passes the request to its own page as a message, and a signal cannot travel that way.
  const run = (async () => {
    let r, j = null, raw = '';
    try {
      if (POPPED && (!window.opener || window.opener.closed)) throw new Error('the Gemini tab that opened this one is closed, and requests with no key go through it');
      const ask = POPPED ? window.opener.fetch.bind(window.opener) : fetch;      // Canvas answers only its own frame
      r = await ask(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); raw = await r.text(); try { j = JSON.parse(raw); } catch {}
    }
    catch (e) { throw Object.assign(new Error('the request did not get through (' + String(e && e.message || e).slice(0, 120) + ')'), { kind: 'network' }); }
    if (!r.ok) {
      const msg = String(j && j.error && j.error.message || raw || '').replace(/\s+/g, ' ').slice(0, 180);
      throw Object.assign(new Error(`the service answered ${r.status}${msg ? ' (' + msg + ')' : ''}`), { status: r.status, kind: r.status === 401 || r.status === 403 || /api.?key|unregistered/i.test(msg) ? 'key' : 'other' });
    }
    canvas.last = j;
    const text = ((((j || {}).candidates || [])[0] || {}).content || {}).parts;
    const said = (Array.isArray(text) ? text : []).filter(p => !p.thought).map(p => p.text || '').join('');
    if (!said) throw Object.assign(new Error('it sent back nothing readable' + (raw ? ' (' + raw.replace(/\s+/g, ' ').slice(0, 120) + ')' : '')), { kind: 'empty' });
    return said;
  })();
  const waits = [run, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('no answer after 90 seconds'), { kind: 'timeout' })), 90000))];
  if (signal) waits.push(new Promise((_, rej) => { const stop = () => rej(new DOMException('Stopped', 'AbortError')); if (signal.aborted) stop(); else signal.addEventListener('abort', stop, { once: true }); }));
  return Promise.race(waits);
}
async function canvasAsk(system, msgs, { web = false, json = true, signal } = {}) {
  const body = { systemInstruction: { parts: [{ text: system }] }, contents: msgs.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text }] })) };
  if (web) body.tools = [{ google_search: {} }]; else if (json) body.generationConfig = { responseMimeType: 'application/json' };
  const chosen = (settings.coach.models.canvas || '').trim(), list = chosen ? [chosen] : canvas.model ? [canvas.model] : CANVAS_MODELS;
  let last;
  for (const m of list) {
    try { const t = await canvasCall(m, body, signal); canvas.model = m; return t; }
    catch (e) { if (e.name === 'AbortError') throw e; last = e; if (e.kind === 'network' || e.kind === 'timeout') break; }
  }
  throw last.kind === 'key' ? new Error('Gemini did not take a request without a key. That is what happens outside Gemini Canvas') : last;
}

//#piece owntab
// ── Canvas test copy: a tab of its own ──
const own = { w: null, state: '', why: '' };
function openOwnTab() {
  let w = null; try { w = window.open('', '_blank'); } catch {}          // opened inside the click, filled straight after
  if (!w) { own.state = 'blocked'; ui.thread(); return; }
  try { w.document.open(); w.document.write(SOURCE); w.document.close(); own.w = w; own.state = 'open'; }
  catch (e) { own.state = 'failed'; own.why = String(e && e.message || e); try { w.close(); } catch {} }
  ui.thread();
  const t = setInterval(() => {
    let s = own.state;
    try { const n = own.w && !own.w.closed && own.w.NC; if (!own.w || own.w.closed) s = 'closed'; else if (n && n.engine.ready) s = 'ready'; else if (n && n.state.door && n.state.door.kind === 'none') s = 'nonano'; else if (n && n.state.door && n.state.door.kind === 'download') s = 'download'; }
    catch { s = 'lost'; }
    if (s !== own.state) { own.state = s; if (!engine.ready) ui.thread(); }
    if (s === 'closed' || s === 'lost' || s === 'failed') clearInterval(t);
  }, 1000);
}
function canvasDoor() {
  let framed = false; try { framed = self !== top; } catch { framed = true; }
  const says = { open: 'Opened. Nano is starting in the new tab…', ready: 'Nano Chat is running in the other tab. Keep this tab open: the coach’s requests go through it.', download: 'The other tab is waiting for you to start the model’s download.', nonano: 'The new tab opened, but Chrome’s built-in model is not available there either.',
    blocked: 'The browser did not let a new tab open. Allow pop-ups for this page and try again.', failed: 'The new tab could not be filled: ' + own.why, closed: 'The other tab was closed.', lost: 'The other tab can no longer be reached from here.' };
  return [framed && !POPPED && SOURCE
    ? [el('p', null, 'This is the test copy for Gemini Canvas. Canvas does not let the frame its apps run in use Chrome’s built-in model, but a tab of its own can.'), el('button', { class: 'big', id: 'ownTab', onclick: openOwnTab }, 'Open Nano Chat in its own tab'), own.state ? el('p', { class: 'count', id: 'ownState' }, says[own.state]) : null]
    : el('p', null, 'This is the test copy for Gemini Canvas.' + (POPPED ? ' It is already in a tab of its own.' : '')),
    el('p', null, el('button', { class: 'plain', onclick: () => frameCheck() }, 'Check what this frame allows'))];
}

//#piece check
// ── Canvas test copy: what does this frame allow? ──
// Runs each thing the app depends on once, and writes the answers as text that can be copied out and sent back.
async function frameCheck() {
  const rows = [], list = el('ul', { style: 'padding-left:0;list-style:none;margin:0 0 12px' }), status = el('p', { class: 'sub' }, 'Checking…');
  const out = el('textarea', { readOnly: true, rows: 10, id: 'frameReport', style: 'width:100%;font:12px/1.45 ui-monospace,Consolas,monospace' });
  const text = () => ['Nano Chat frame check, ' + new Date().toISOString(), ...rows.map(r => `[${r.ok === true ? 'yes' : r.ok === false ? 'no' : '??'}] ${r.name}${r.detail ? ': ' + r.detail : ''}`)].join('\n');
  const draw = () => { list.textContent = ''; for (const r of rows) list.append(el('li', { style: 'margin:0 0 6px' }, (r.ok === true ? '✅ ' : r.ok === false ? '❌ ' : '❔ ') + r.name, r.detail ? el('small', { style: 'display:block;color:var(--muted);margin-left:26px;overflow-wrap:anywhere' }, r.detail) : null)); out.value = text(); };
  const say = (name, ok, detail = '') => { rows.push({ name, ok, detail: String(detail) }); draw(); };
  const within = (p, ms, what = 'no answer') => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} after ${ms / 1000} seconds`)), ms))]);
  const why = e => String(e && e.message || e).slice(0, 200);
  const copied = el('span', { class: 'sub', style: 'margin-left:10px' });
  const copy = el('button', { class: 'plain', onclick: () => { out.focus(); out.select(); let ok = false; try { ok = document.execCommand('copy'); } catch {} copied.textContent = ok ? 'Copied.' : 'Could not copy here. The text is selected: press Ctrl+C.'; } }, 'Copy the report');
  dialog('Frame check', el('p', { class: 'sub' }, 'This test copy checks what the frame it is running in allows: Chrome’s Gemini Nano, a request to Gemini with no key, storage, and the web.'), status, list, out, el('div', { style: 'margin-top:8px' }, copy, copied));

  // where the page is
  let framed = false; try { framed = self !== top; } catch { framed = true; }
  const above = []; try { for (const o of location.ancestorOrigins || []) above.push(o); } catch {}
  const chrome = (navigator.userAgent.match(/Chrome\/(\d+)/) || [])[1];
  say('Where this page is running', null, `${self.origin === 'null' ? 'an origin of its own with no name (sandboxed)' : self.origin}; ${POPPED ? 'in a tab of its own, opened by the Canvas page' : framed ? 'inside a frame' + (above.length ? ' of ' + above.join(' › ') : '') : 'not in a frame'}; ${chrome ? 'Chrome ' + chrome : 'not Chrome'}`);

  // what the frame is allowed
  const pol = document.permissionsPolicy || document.featurePolicy, allows = f => { try { return pol ? pol.allowsFeature(f) : null; } catch { return null; } };
  const lmAllowed = allows('language-model');
  say('The frame is allowed to use Chrome’s built-in model', lmAllowed, lmAllowed == null ? 'this browser does not say' : 'permissions policy “language-model” is ' + lmAllowed);

  // Gemini Nano
  if (!LM) say('Gemini Nano', false, 'there is no LanguageModel in this page');
  else if (engine.ready) say('Gemini Nano', true, `running in this page; its memory is ${engine.W} tokens`);
  else {
    try {
      const a = await within(LM.availability(LM_OPTS), 10000);
      say('Gemini Nano', a === 'available' ? true : a === 'unavailable' ? false : null, `Chrome says “${a}”` + (a === 'available' ? ', but it has not started in this page' + (state.door && state.door.why ? ' (' + state.door.why + ')' : '') : ''));
    } catch (e) { say('Gemini Nano', false, why(e)); }
  }

  // Gemini with no key
  status.textContent = 'Asking Gemini with no key…';
  let works = '';
  for (const m of CANVAS_MODELS) {
    const t0 = performance.now();
    try { const t = await canvasCall(m, { contents: [{ role: 'user', parts: [{ text: 'Reply with the one word: pong' }] }] }); const ok = /pong/i.test(t); if (ok && !works) works = m; say(`Gemini with no key${POPPED ? ', through the Canvas page' : ''}, as ${m}`, ok, `${ok ? 'answered' : 'answered something else: ' + t.slice(0, 60)} in ${((performance.now() - t0) / 1000).toFixed(1)} s`); }
    catch (e) { say(`Gemini with no key${POPPED ? ', through the Canvas page' : ''}, as ${m}`, false, why(e)); }
  }
  if (works) {
    canvas.model = works;
    try { const t = await canvasCall(works, { systemInstruction: { parts: [{ text: 'You answer only with JSON.' }] }, contents: [{ role: 'user', parts: [{ text: 'Reply with exactly {"ok":true}' }] }], generationConfig: { responseMimeType: 'application/json' } }); say('…with instructions and a JSON answer (what the coach needs)', JSON.parse(t.replace(/```(?:json)?/g, '').trim()).ok === true, t.slice(0, 80)); }
    catch (e) { say('…with instructions and a JSON answer (what the coach needs)', false, why(e)); }
    try { const t = await canvasCall(works, { contents: [{ role: 'user', parts: [{ text: 'Search the web: what is the newest stable version of the Chrome browser? Answer in one line.' }] }], tools: [{ google_search: {} }] }); const g = (((canvas.last || {}).candidates || [])[0] || {}).groundingMetadata; say('…with Google Search (web search through Gemini)', g ? true : null, (g ? 'searched; ' : 'answered, but nothing shows that it searched; ') + t.replace(/\s+/g, ' ').slice(0, 100)); }
    catch (e) { say('…with Google Search (web search through Gemini)', false, why(e)); }
  }

  // storage
  status.textContent = 'Checking storage and the web…';
  try { localStorage.setItem('nanochat.check', '1'); const ok = localStorage.getItem('nanochat.check') === '1'; localStorage.removeItem('nanochat.check'); say('Settings and notes can be saved (localStorage)', ok); }
  catch (e) { say('Settings and notes can be saved (localStorage)', false, why(e)); }
  if (dbState.dead) say('Chats can be saved (IndexedDB)', false, (dbState.why || 'it failed') + '; chats are kept in memory for this visit only');
  else { try { await within(db.all(), 6000); say('Chats can be saved (IndexedDB)', !dbState.dead, dbState.dead ? dbState.why : ''); } catch (e) { say('Chats can be saved (IndexedDB)', false, why(e)); } }

  // the web
  for (const [name, url] of [['Wikipedia can be searched', 'https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=aglet&srlimit=1&format=json&origin=*'], ['Pages can be read through r.jina.ai', 'https://r.jina.ai/https://example.com/']]) {
    try { const r = await within(fetch(url), 15000); say(name, r.ok, r.ok ? '' : 'answered ' + r.status); } catch (e) { say(name, false, why(e)); }
  }

  // voice and saving
  const mic = allows('microphone');
  say('Voice input', SR ? (mic === false ? false : null) : false, !SR ? 'no speech recognition here' : mic === false ? 'the frame is not allowed the microphone' : 'speech recognition exists; the microphone is asked for when you use it');
  say('Reading aloud', canSpeak ? null : false, canSpeak ? `${speechSynthesis.getVoices().length} voices listed; try “Read aloud” under a reply` : 'no speech output here');
  say('Saving a chat as a file', null, 'cannot be checked without a click: try the Save button on a chat');

  const nano = rows.find(r => r.name === 'Gemini Nano');
  rows.push({ name: 'In short', ok: null, detail: `Nano ${nano && nano.ok === true ? 'works' : nano && nano.ok === false ? 'does not work' : 'is undecided'} in this frame; Gemini with no key ${works ? 'works (' + works + ')' : 'does not work'}.` });
  draw(); status.textContent = 'Done. Copy the report and send it back.';
  if (works && !state.busy) ui.thread();
  return text();
}
$('#frameCheck').onclick = () => frameCheck();
