// The pieces that tools/build-artifact.mjs adds to index.html to make the Claude artifact copy.
// Each piece starts at a "//#piece name" line. This file is not loaded by anything as it stands.

//#piece source
// ── Artifact copy ── Chrome does not let an artifact's frame use its built-in model, but the frame may open a tab
// for some viewers, and that tab is allowed the model. So the page keeps itself as it arrived, to write into such a
// tab. POPPED is true in that tab. Claude (the coach) and saving a file are capabilities of the artifact's frame,
// so the tab asks the frame to do those for it, through the NC_* functions below, which run in the frame's own window.
// (Claude refuses options made in the tab's window: "options must be a plain object".)
const SOURCE = (() => { try { const d = document.documentElement.cloneNode(true), me = document.currentScript; for (const s of d.querySelectorAll('script')) if (!me || s.textContent !== me.textContent) s.remove(); return '<!doctype html>\n' + d.outerHTML; } catch { return ''; } })();
const POPPED = (() => { try { return !!(window.opener && window.opener !== window && window.opener.NC_FRAME); } catch { return false; } })();
if (!POPPED) {
  window.NC_FRAME = true;
  const use = name => self.claude && self.claude.use ? self.claude.use(name) : Promise.resolve(null);
  // One request to Claude, on the viewer's own Claude account. `turns` are {role, content}; the answer is plain data.
  // `images` are pictures as data: addresses; they are made into files here, in this window, as Claude requires.
  window.NC_ASK = async (turns, tier, signal, images) => {
    const sample = await use('sample');
    if (!sample) throw { code: 'unavailable', message: 'Claude is not offered to this artifact here.' };
    const ctl = new AbortController();
    if (signal) { if (signal.aborted) ctl.abort(); else signal.addEventListener('abort', () => ctl.abort(), { once: true }); }
    const input = Array.from(turns, t => ({ role: String(t.role) === 'assistant' ? 'assistant' : 'user', content: String(t.content) }));
    const opts = { modelTier: ['quick', 'default', 'complex'].includes(String(tier)) ? String(tier) : 'default', cache: false, signal: ctl.signal };
    const files = Array.from(images || [], d => { d = String(d); const bin = atob(d.slice(d.indexOf(',') + 1)), u = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k); return new Blob([u], { type: (/^data:([^;,]+)/.exec(d) || [])[1] || 'image/jpeg' }); });
    if (files.length) opts.images = files;
    const r = await sample(input, opts);
    return { text: String(r.text), truncated: !!r.truncated };
  };
  // Saving a file goes through the artifact: the viewer confirms it in the artifact's own tab.
  window.NC_SAVE = async (filename, data) => {
    const downloads = await use('downloads');
    if (!downloads) throw { code: 'unavailable', message: 'Saving is not offered to this artifact here.' };
    const r = await downloads.save({ filename: String(filename), data: String(data) });
    return { status: String(r.status) };
  };
  // Whether the viewer has let this artifact use Claude, and a way to ask now, before the first review needs it.
  window.NC_PERMISSION = async ask => {
    const p = await use('permissions');
    if (!p) return 'unavailable';
    return String(ask ? (await p.request(['sample'])).sample : await p.state('sample'));
  };
}

//#piece gone
// ── Artifact copy ── An artifact may not reach other sites, and the tab it opens inherits that rule. So the two parts
// that fetch from the web are shown, but cannot be switched on.
const GONE = {
  search: 'Not in this copy. A Claude artifact may not reach other websites, so ' + NANO + ' cannot search the web here.',
  links: 'Not in this copy. A Claude artifact may not reach other websites, so links cannot be fetched here.',
};

//#piece coach
// ── Artifact copy: the coach is Claude, on the viewer's own Claude account ──
// Claude has no separate place for standing instructions here, so they open the first message.
async function artifactAsk(system, msgs, { json = true, signal } = {}) {
  const host = POPPED ? window.opener : window;
  if (POPPED && (!host || host.closed)) throw new Error('the artifact’s tab, which this one was opened from, is closed, and the coach’s requests go through it');
  if (!host.NC_ASK) throw new Error('this page cannot reach Claude');
  const turns = msgs.map((m, k) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: (k ? '' : system + '\n\n') + m.text }));
  if (json) turns[turns.length - 1].content += '\n\nReply with the JSON object only.';
  const images = msgs.flatMap(m => m.images || []);      // Claude is shown them with the last message
  try { return (await host.NC_ASK(turns, (settings.coach.models.artifact || '').trim() || 'default', signal, images)).text; }
  catch (e) {
    const code = e && e.code, msg = String(e && e.message || e || '');
    if (code === 'cancelled') throw new DOMException('Stopped', 'AbortError');
    throw new Error({
      not_granted: 'this artifact has not been allowed to use Claude. In the artifact’s tab, use “Let the coach use Claude”, or the artifact’s Permissions menu',
      sampling_disabled: 'Claude is not available to this account',
      session_expired: 'you need to sign in to Claude again, in the artifact’s tab',
      rate_limited: 'Claude says to wait: too many requests, or your Claude usage limit has been reached. Try again later',
      refused: 'Claude declined to review this',
      unavailable: 'Claude is not offered to this artifact for you',
      images_unavailable: 'Claude cannot be sent pictures from this artifact here. In Settings, untick “Let the coach see pictures I attach”',
      image_rejected: 'Claude would not take one of the pictures',
    }[code] || (/held/i.test(msg) ? 'the request waited for permission to use Claude, in the artifact’s tab, and gave up. Allow it there, then ask the coach again' : `Claude could not answer (${code || msg.slice(0, 120)})`));
  }
}

//#piece save
// ── Artifact copy: saving a chat goes through the artifact, which asks the viewer in its own tab ──
function artifactSave(name, html) {
  const host = POPPED ? window.opener : window;
  let p;
  try { if (!host || host.closed || !host.NC_SAVE) throw new Error('closed'); p = host.NC_SAVE(name, html); }
  catch { flash('The artifact’s tab, which this one was opened from, is closed, so the chat cannot be saved from here.'); return; }
  flash(POPPED ? 'Switch to the artifact’s tab to confirm where the chat is saved.' : 'Confirm where the chat is saved.');
  p.then(() => flash(`Saved as ${name}.`), e => flash(e && e.code === 'declined' ? 'The chat was not saved.' : `The chat could not be saved here (${e && (e.code || e.message) || 'no reason given'}).`));
}

//#piece owntab
// ── Artifact copy: a tab of its own ──
const own = { w: null, state: '', why: '', permission: '' };
function artifactFramed() { try { return self !== top; } catch { return true; } }
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
async function readPermission(ask) {
  try { own.permission = await window.NC_PERMISSION(!!ask); } catch { own.permission = 'unavailable'; }
  if (!engine.ready) ui.thread();
}
function artifactDoor() {
  const site = el('a', { href: 'https://toontalk.github.io/nano-chat/', target: '_blank', rel: 'noopener' }, 'toontalk.github.io/nano-chat');
  const says = { open: 'Opened. ' + NANO + ' is starting in the new tab…', ready: 'Nano Chat is running in the other tab. Keep this tab open: the coach’s requests to Claude go through it.', download: 'The other tab is waiting for you to start the model’s download.',
    nonano: 'The new tab opened, but ' + BROWSER + '’s built-in model is not available there either.' + (EDGE ? ' In Edge it has to be switched on first: open edge://flags, find “Prompt API”, set it to Enabled, and restart Edge.' : ' This computer or browser may not run it.'), failed: 'The new tab could not be filled: ' + own.why, closed: 'The other tab was closed.', lost: 'The other tab can no longer be reached from here.' };
  if (own.permission === '') { own.permission = '…'; readPermission(false); }
  const coach = { granted: 'Claude is allowed. Each review counts toward your Claude usage limits.', prompt: 'Claude asks your permission the first time. You can give it now, so that the first review does not wait on it.',
    denied: 'Claude is not allowed for this artifact. You can change that in the artifact’s Permissions menu.', unavailable: 'Claude is not offered to this artifact for you, so the coach will not work.', '…': '' }[own.permission] || '';
  return el('div', { class: 'door' }, el('h2', null, 'Nano Chat opens in a tab of its own'),
    el('p', null, EDGE ? 'Nano Chat talks to the small model a browser runs on your own computer, here Aion Instruct, Microsoft’s model in Edge. (In Chrome it is Gemini Nano.) A Claude artifact’s frame may not use that model, but a tab the artifact opens may.'
      : 'Nano Chat talks to the small model a browser runs on your own computer, here Gemini Nano, the model built into Chrome. (In Microsoft Edge it is Aion Instruct.) Chrome does not let a Claude artifact’s frame use that model, but a tab the artifact opens may.'),
    el('button', { class: 'big', id: 'ownTab', onclick: openOwnTab }, 'Open Nano Chat in its own tab'),
    own.state === 'blocked' ? el('p', { class: 'count', id: 'ownState' }, 'This artifact was not allowed to open a tab. Claude lets an artifact do that only for some viewers, who are signed in to Claude in the same organization as the artifact’s owner. Each browser keeps its own sign-ins, so check that this one is signed in to Claude. The full app, which needs no artifact, is at ', site, '.')
      : own.state ? el('p', { class: 'count', id: 'ownState' }, says[own.state]) : null,
    el('p', null, el('b', null, 'The coach'), ' is Claude, on your own Claude account, so it needs no key. ', el('span', { id: 'coachPermission' }, coach), ' ',
      own.permission === 'prompt' ? el('button', { class: 'plain', id: 'allowCoach', onclick: () => readPermission(true) }, 'Let the coach use Claude') : null),
    el('p', { class: 'count' }, 'What this copy cannot do: search the web or read links, because a Claude artifact may not reach other websites. Your chats and notes are kept in this browser. The full app is at ', site.cloneNode(true), '.'),
    EDGE ? el('ul', null, el('li', null, 'In Edge it needs version 158 or newer with its “Prompt API” setting switched on in edge://flags, on Windows 10 or 11, macOS 13.3 or newer, or (from Edge 159) Linux.'), el('li', null, 'The computer needs about 20 GB of free disk space and a graphics card with 3 GB of memory. Pictures and sound are not offered in Edge yet.'))
      : el('ul', null, el('li', null, 'It needs Chrome 148 or newer on a Windows, Mac or Linux computer, or a Chromebook Plus, or Microsoft Edge 158 or newer with its “Prompt API” setting switched on.'), el('li', null, 'The computer needs about 22 GB of free disk space, and either a graphics card with more than 4 GB of memory or 16 GB of RAM.')));
}
