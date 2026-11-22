// SVG pictures, saving a chat as a web page, and voice, against the real Gemini Nano.
// Headless Chrome has no microphone or loudspeaker, so Chrome's speech recognition and speech output are
// replaced by stand-ins here: what is checked is this page's side of them.
//   node tools/test-extras.mjs
import { launch } from './nano-harness.mjs';
import path from 'node:path';
import fs from 'node:fs';
const root = path.resolve(import.meta.dirname, '..');
const shots = path.join(root, 'captures'); fs.mkdirSync(shots, { recursive: true });
const b = await launch({ root });
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + String(extra).replace(/\s+/g, ' ').slice(0, 320) : ''}`); };
const J = v => JSON.stringify(v);
const ask = async text => {
  const t0 = Date.now(), r = await b.eval(`(async () => { await NC.send(${J(text)}); const t = NC.state.chat.turns.at(-1); return { text: t.text, error: t.error || null, steps: (t.steps || []).map(s => ({ tool: s.tool, status: s.status })) }; })()`);
  console.log(`\n> ${text}\n  [${((Date.now() - t0) / 1000).toFixed(1)}s; ${r.steps.map(s => s.tool).join(', ') || 'no tools'}]\n  ${r.text.replace(/\n/g, '\n  ').slice(0, 500)}${r.error ? '\n  ERROR ' + r.error : ''}`);
  return r;
};
// Stand-ins for the microphone and the loudspeaker, in place before the page's own script runs.
await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.fakeSR = { local: 'available', started: 0, last: null, installs: 0 };
  class FakeSR {
    static async available(o) { return window.fakeSR.local; }
    static async install(o) { window.fakeSR.installs++; window.fakeSR.local = 'available'; return true; }
    start() { window.fakeSR.started++; window.fakeSR.last = this; }
    stop() { setTimeout(() => this.onend && this.onend(), 0); }
    hear(words, final) { this.onresult && this.onresult({ results: [Object.assign([{ transcript: words }], { isFinal: !!final })] }); }
    fail(error) { this.onerror && this.onerror({ error }); this.onend && this.onend(); }
  }
  window.SpeechRecognition = FakeSR; window.webkitSpeechRecognition = FakeSR;
  window.spoken = []; window.cancels = 0;
  const voices = [{ name: 'Test Voice', voiceURI: 'test-voice', lang: 'en-US', localService: true }, { name: 'Cloud Voice', voiceURI: 'cloud-voice', lang: 'en-GB', localService: false }];
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { getVoices: () => voices, speak: u => window.spoken.push(u), cancel: () => { window.cancels++; }, onvoiceschanged: null } });
  window.SpeechSynthesisUtterance = function (text) { this.text = text; };
` });
try {
  await b.goto('/index.html?start=full');
  await b.waitFor('window.NC && NC.engine.ready', { timeout: 180000 });

  // ── SVG ──
  const star = '<svg width="100" height="100">\n  <polygon points="50,5 20,95 95,30 5,30 90,95" fill="yellow" stroke="black" stroke-width="2"/>\n</svg>';
  const drawn = async text => b.eval(`(async () => { const d = document.createElement('div'); d.innerHTML = NC.md(${J(text)}); document.body.append(d); const img = d.querySelector('.svgview img'); let ok = null, w = 0;
    if (img) { ok = await new Promise(r => { if (img.complete && img.naturalWidth) r(true); img.onload = () => r(true); img.onerror = () => r(false); setTimeout(() => r(img.naturalWidth > 0), 3000); }); w = img.naturalWidth; }
    const out = { img: !!img, ok, w, code: (d.querySelector('details.svgcode code') || {}).textContent || '', pre: d.querySelectorAll('pre').length, save: !!d.querySelector('.svgbar a[download]'), text: d.textContent.slice(0, 200), src: img ? decodeURIComponent(img.src) : '' }; d.remove(); return out; })()`);
  let d = await drawn('Here is a star:\n\n```\n' + star + '\n```\nEnjoy!');
  check('SVG in a code block is drawn as a picture (even without xmlns)', d.img && d.ok === true && d.w === 100, J({ ok: d.ok, w: d.w }));
  check('the code stays a click away, and the picture can be saved', d.code.includes('<polygon') && d.save && /Here is a star/.test(d.text) && /Enjoy/.test(d.text), d.text);
  d = await drawn('```svg\n' + star + '\n```');
  check('a block labelled svg works too', d.img && d.ok === true);
  d = await drawn('Sure:\n' + star + '\nDone.');
  check('SVG written straight into the reply is drawn', d.img && d.ok === true && /Done/.test(d.text));
  d = await drawn('```xml\n<svg width="50" height="50" onload="alert(1)"><script>alert(2)</script><circle cx="25" cy="25" r="20" onclick="alert(3)"/><a href="javascript:alert(4)"><rect width="5" height="5"/></a><foreignObject><b>x</b></foreignObject></svg>\n```');
  check('scripts and event handlers are taken out of the picture', d.img && d.ok === true && !/script|onload|onclick|javascript:|foreignObject/i.test(d.src) && /circle/.test(d.src), d.src);
  d = await drawn('```\n<svg width="100" height="100"><polygon points="50,5 20,95"\n```');
  check('unfinished SVG is left as code', !d.img && d.pre === 1);
  d = await drawn('```\n<svg width="100"><rect width="10" height="10"></svg>\n```');
  check('SVG that does not parse is left as code', !d.img && d.pre === 1);
  d = await drawn('Use the `<svg>` tag to start and `</svg>` to end.');
  check('talking about the svg tag draws nothing', !d.img && /Use the/.test(d.text));
  d = await drawn('```js\nconst x = 1 < 2;\n```');
  check('other code blocks are unchanged', !d.img && d.pre === 1);

  let r = await ask('can you create the SVG that will display a star');
  check('asking for an SVG does not search the web', !r.steps.some(s => s.tool === 'web_search'), r.steps.map(s => s.tool).join(','));
  check('Nano’s SVG is drawn in the reply', /<svg/i.test(r.text) && await b.eval(`!!document.querySelector('.msg.bot:last-child .svgview img')`), r.text);
  await b.eval(`new Promise(r => setTimeout(r, 500))`);
  check('and the picture really loads', await b.eval(`(() => { const i = document.querySelector('.msg.bot:last-child .svgview img'); return !!i && i.naturalWidth > 0; })()`));
  await b.screenshot(path.join(shots, 'svg.png'));
  await b.eval(`NC.setPart('markdown', false)`);
  check('with Formatting off, the SVG is shown as raw text', await b.eval(`!document.querySelector('.msg.bot:last-child .svgview') && !!document.querySelector('.msg.bot:last-child .body.raw')`));
  await b.eval(`NC.setPart('markdown', true)`);
  r = await ask('Draw me a simple red circle.');
  check('“draw me…” gets SVG without being told to use it', /<svg/i.test(r.text) && await b.eval(`!!document.querySelector('.msg.bot:last-child .svgview img')`), r.text);

  // ── saving the chat ──
  await ask('What is an 18% tip on a $64.50 bill?');
  check('the Save button shows once there is a chat', await b.eval(`!document.querySelector('#saveChat').hidden`));
  const saved = await b.eval(`(() => { let got = null; const orig = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) got = { name: this.download, href: this.href }; else orig.call(this); };
    try { document.querySelector('#saveChat').click(); } finally { HTMLAnchorElement.prototype.click = orig; } const s = NC.saveChat.last; return got; })()`);
  check('Save offers an .html file named after the chat', saved && /\.html$/.test(saved.name) && /^blob:/.test(saved.href), J(saved));
  const out = await b.eval(`(() => { const orig = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () {}; try { return NC.saveChat(); } finally { HTMLAnchorElement.prototype.click = orig; } })()`);
  fs.writeFileSync(path.join(shots, out.name), out.html);
  check('the file is a whole page with a title and a favicon', /^<!doctype html>/.test(out.html) && /<title>[^<]+ · Nano Chat<\/title>/.test(out.html) && /<link rel="icon" href="data:image\/svg\+xml/.test(out.html) && /<style>/.test(out.html) && !/<script/i.test(out.html), out.html.slice(0, 200));
  check('it holds the messages, the tool chips, and the picture', out.html.includes('create the SVG that will display a star') && out.html.includes('11.61') && /class="step/.test(out.html) && /class="svgview"/.test(out.html) && /64\.50 \* 0\.18/.test(out.html));
  check('it has no buttons or leftover controls', !/<button/i.test(out.html) && !/Try again…/.test(out.html) && !/Read aloud/.test(out.html));
  // open the saved file by itself and look at it
  await b.send('Page.navigate', { url: 'file:///' + path.join(shots, out.name).replace(/\\/g, '/') });
  await b.eval(`new Promise(r => setTimeout(r, 800))`);
  const page = await b.eval(`({ title: document.title, h1: document.querySelector('.saved h1').textContent, msgs: document.querySelectorAll('.msg').length, img: [...document.querySelectorAll('.svgview img')].every(i => i.naturalWidth > 0), n: document.querySelectorAll('.svgview img').length, scroll: document.documentElement.scrollHeight > innerHeight, chip: (() => { const x = document.querySelector('details.step'); x.open = true; return x.querySelector('pre') ? x.querySelector('pre').offsetHeight > 0 : false; })() })`);
  check('opened alone, the saved page shows the conversation', page.msgs === 6 && page.n >= 1 && page.img && page.chip && /Nano Chat/.test(page.title), J(page));
  await b.screenshot(path.join(shots, 'saved.png'));
  await b.screenshot(path.join(shots, 'saved-dark.png'), { dark: true });

  // ── voice ──
  await b.goto('/index.html');
  await b.waitFor('window.NC && NC.engine.ready', { timeout: 180000 });
  await b.eval(`NC.newChat()`);
  check('no microphone button until it is switched on', await b.eval(`document.querySelector('#micBtn').hidden`));
  await b.eval(`NC.showSettings()`);
  check('settings offer the voice choices and list the voices', await b.eval(`/Show a microphone button/.test(document.querySelector('#dBody').textContent) && document.querySelectorAll('#voiceSel option').length === 2 && /Cloud Voice \\(online\\)/.test(document.querySelector('#voiceSel').textContent)`), await b.eval(`document.querySelector('#voiceSel').textContent`));
  await b.screenshot(path.join(shots, 'settings-voice.png'), { h: 1700 });
  await b.eval(`[...document.querySelectorAll('#dBody label.radio')].find(l => /Show a microphone button/.test(l.textContent)).querySelector('input').click(); document.querySelector('#dlg').close()`);
  check('switching it on shows the button', await b.eval(`!document.querySelector('#micBtn').hidden && NC.settings.voice.input === true`));
  await b.eval(`document.querySelector('#micBtn').click()`);
  await b.waitFor(`NC.mic.on`, { timeout: 5000 });
  check('listening asks Chrome to recognize speech on this computer', await b.eval(`window.fakeSR.last.processLocally === true && window.fakeSR.last.lang === 'en-US' && /stays on this computer/.test(document.querySelector('#hint').textContent) && document.querySelector('#micBtn').classList.contains('live')`), await b.eval(`document.querySelector('#hint').textContent`));
  await b.eval(`window.fakeSR.last.hear('what is twelve times', false)`);
  check('the words appear in the message box as they are heard', (await b.eval(`document.querySelector('#input').value`)) === 'what is twelve times');
  await b.eval(`(async () => { window.fakeSR.last.hear('What is 12 times 12?', true); window.fakeSR.last.stop(); await new Promise(r => setTimeout(r, 300)); while (NC.state.busy) await new Promise(r => setTimeout(r, 200)); })()`);
  r = await b.eval(`({ user: NC.state.chat.turns.at(-2).text, bot: NC.state.chat.turns.at(-1).text, on: NC.mic.on, box: document.querySelector('#input').value })`);
  check('when the speaker stops, the message is sent and answered', r.user === 'What is 12 times 12?' && /144/.test(r.bot) && !r.on && r.box === '', J(r));
  await b.eval(`NC.settings.voice.auto = false; document.querySelector('#micBtn').click()`);
  await b.waitFor(`NC.mic.on`, { timeout: 5000 });
  await b.eval(`(async () => { window.fakeSR.last.hear('hold this thought', true); window.fakeSR.last.stop(); await new Promise(r => setTimeout(r, 200)); })()`);
  check('with auto-send off, the words wait in the box', (await b.eval(`document.querySelector('#input').value`)) === 'hold this thought' && (await b.eval(`NC.state.chat.turns.length`)) === 2);
  await b.eval(`document.querySelector('#input').value = ''; window.fakeSR.local = 'unavailable'; document.querySelector('#micBtn').click()`);
  await b.eval(`new Promise(r => setTimeout(r, 300))`);
  check('with no on-device recognition, it does not listen unless online recognition is allowed', await b.eval(`!NC.mic.on && /allow its online speech recognition/.test(document.querySelector('#hint').textContent)`), await b.eval(`document.querySelector('#hint').textContent`));
  await b.eval(`NC.settings.voice.online = true; document.querySelector('#micBtn').click()`);
  await b.waitFor(`NC.mic.on`, { timeout: 5000 });
  check('when allowed, it listens and says the voice goes to Google', await b.eval(`window.fakeSR.last.processLocally !== true && /sends your voice to Google/.test(document.querySelector('#hint').textContent)`), await b.eval(`document.querySelector('#hint').textContent`));
  await b.eval(`window.fakeSR.last.fail('not-allowed')`);
  check('a refused microphone is reported plainly', await b.eval(`!NC.mic.on && /not allowed to use the microphone/.test(document.querySelector('#hint').textContent)`), await b.eval(`document.querySelector('#hint').textContent`));
  await b.eval(`window.fakeSR.local = 'downloadable'; NC.settings.voice.online = false; document.querySelector('#micBtn').click()`);
  await b.waitFor(`NC.mic.on`, { timeout: 5000 });
  check('a missing on-device speech pack is installed first', await b.eval(`window.fakeSR.installs === 1 && window.fakeSR.last.processLocally === true`));
  await b.eval(`window.fakeSR.last.stop()`); await b.eval(`new Promise(r => setTimeout(r, 100))`);

  // reading aloud
  const say = await b.eval(`NC.speakable({ text: '## Tip\\n\\nThe tip is **$11.61** [1].\\n\\n- one\\n- two\\n\\n\`\`\`js\\nlet x = 1;\\n\`\`\`\\n\\n| a | b |\\n|---|---|\\n| 1 | 2 |\\n\\n\`\`\`\\n<svg width="10" height="10"><rect width="5" height="5"/></svg>\\n\`\`\`' })`);
  check('reading aloud skips code, tables, pictures and citation marks', say === 'Tip The tip is $11.61. one two', say);
  check('each reply has a Read aloud button', await b.eval(`[...document.querySelectorAll('.msg.bot .tool')].some(x => /Read aloud/.test(x.textContent))`));
  await b.eval(`window.spoken = []; [...document.querySelectorAll('.msg.bot:last-child .tool')].find(x => /Read aloud/.test(x.textContent)).click()`);
  r = await b.eval(`({ n: window.spoken.length, text: window.spoken.map(u => u.text).join(''), voice: window.spoken[0] && window.spoken[0].voice && window.spoken[0].voice.voiceURI, label: [...document.querySelectorAll('.msg.bot:last-child .tool')].map(x => x.textContent).join('|') })`);
  check('Read aloud speaks the reply with a voice from this computer', r.n >= 1 && /144/.test(r.text) && r.voice === 'test-voice' && /Stop reading/.test(r.label), J(r));
  await b.eval(`window.spoken.at(-1).onend()`);
  check('when it finishes, the button goes back', await b.eval(`[...document.querySelectorAll('.msg.bot:last-child .tool')].some(x => /Read aloud/.test(x.textContent)) && NC.tts.id === null`));
  await b.eval(`NC.settings.voice.output = true; window.spoken = []`);
  r = await ask('What is the capital of France? One short sentence.');
  check('“read every reply aloud” speaks a new reply by itself', await b.eval(`window.spoken.length >= 1 && /Paris/.test(window.spoken.map(u => u.text).join(''))`), await b.eval(`window.spoken.map(u => u.text).join('')`));
  const c0 = await b.eval(`window.cancels`);
  await ask('Thanks!');
  check('sending a new message stops the reading', (await b.eval(`window.cancels`)) > c0);
  const long = await b.eval(`(() => { window.spoken = []; NC.speak({ id: 'x', text: 'This is a sentence about something fairly ordinary. '.repeat(20) }); return window.spoken.map(u => u.text.length); })()`);
  check('long replies are spoken in short pieces', long.length > 3 && long.every(n => n < 260), J(long));
  await b.eval(`NC.settings.voice = { input: false, auto: true, online: false, output: false, voice: '', rate: 1 }; NC.stopSpeaking()`);
  check('no page errors', b.errors.length === 0, b.errors.join(' | '));
} catch (e) { fail++; console.log('FAIL  crashed: ' + (e.stack || e)); console.log(b.log.slice(-10).join('\n')); console.log(b.errors.join('\n')); }
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
