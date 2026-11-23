// Pictures and sound: attaching, taking a photo, recording, what Nano is given, the part's switch, Nano's own description,
// what the coach gets, saving and reloading. On the real Gemini Nano. Chrome is started with a stand-in camera and
// microphone (a test pattern and beeps), so no real ones are needed.
//   node tools/test-media.mjs
import { launch } from './nano-harness.mjs';
import path from 'node:path';
import fs from 'node:fs';
const root = path.resolve(import.meta.dirname, '..');
const shots = path.join(root, 'captures'); fs.mkdirSync(shots, { recursive: true });
const wav = fs.readFileSync(path.join(import.meta.dirname, 'test-speech.wav')).toString('base64');      // "The capital of Sweden is Stockholm. My bike lock code is four eight two one."
const b = await launch({ root, height: 980, flags: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + String(extra).replace(/\s+/g, ' ').slice(0, 320) : ''}`); };
const pause = ms => new Promise(r => setTimeout(r, ms));
const ready = async (q = '') => { await b.goto('/index.html' + q); await b.waitFor('window.NC && NC.engine.ready', { timeout: 180000 }); };
// a picture with two shapes and some writing, and the spoken recording, made into the page's own kind of attachment
const makePic = (w = 640, h = 400) => b.eval(`(async () => { const c = document.createElement('canvas'); c.width = ${w}; c.height = ${h}; const g = c.getContext('2d'); g.scale(${w} / 640, ${h} / 400); g.fillStyle = '#fff'; g.fillRect(0, 0, 640, 400); g.fillStyle = '#d22'; g.beginPath(); g.arc(160, 220, 90, 0, 7); g.fill(); g.fillStyle = '#26c'; g.fillRect(340, 130, 200, 180); g.fillStyle = '#000'; g.font = 'bold 40px sans-serif'; g.fillText('BIKE CODE 4821', 150, 70);
  const blob = await new Promise(r => c.toBlob(r, 'image/png')); self.PIC = await NC.pictureFrom(blob, 'shapes.png'); self.PICFILE = new File([blob], 'shapes.png', { type: 'image/png' }); return { kind: PIC.kind, type: PIC.type, w: PIC.w, h: PIC.h, head: PIC.data.slice(0, 23) }; })()`);
const makeSound = () => b.eval(`(async () => { const bin = atob(${JSON.stringify(wav)}), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); self.SOUNDFILE = new File([u], 'speech.wav', { type: 'audio/wav' }); self.SOUND = await NC.recordingFrom(SOUNDFILE, 'speech.wav'); return { kind: SOUND.kind, type: SOUND.type, secs: SOUND.secs, head: SOUND.data.slice(0, 22), kb: Math.round(SOUND.data.length / 1024) }; })()`);
const ask = async (text, media = '[]') => { const t0 = Date.now(); const r = await b.eval(`(async () => { await NC.send(${JSON.stringify(text)}, [], ${media}); const t = NC.state.chat.turns.at(-1), u = NC.state.chat.turns.at(-2); return { text: t.text, error: t.error || null, steps: t.steps.map(s => s.tool), media: (u.media || []).map(m => m.kind), usage: NC.engine.usage() }; })()`);
  console.log(`\n> ${text}${media !== '[]' ? '   [with ' + media + ']' : ''}\n  [${((Date.now() - t0) / 1000).toFixed(1)}s; usage ${r.usage}]  ${r.text.replace(/\n/g, ' ').slice(0, 260)}${r.error ? '  ERROR ' + r.error : ''}`); return r; };
try {
  await ready('?start=full');
  check('on this computer Chrome lets Nano take pictures and sound', await b.eval('NC.engine.media === true'));
  check('“Pictures and sound” is one of the parts', (await b.eval(`document.querySelector('#partsCount').textContent`)) === '14/14' && await b.eval(`NC.settings.features.media === true`));

  // making the attachments
  let p = await makePic();
  check('a picture is kept as a JPEG data address', p.kind === 'image' && p.type === 'image/jpeg' && p.head === 'data:image/jpeg;base64,' && p.w === 640 && p.h === 400, JSON.stringify(p));
  p = await makePic(2000, 1250);
  check('a large picture is made smaller', p.w === 1024 && p.h === 640, JSON.stringify(p));
  await makePic();
  const s = await makeSound();
  check('a recording is kept as 16 kHz mono sound', s.kind === 'audio' && s.type === 'audio/wav' && s.secs > 4 && s.secs < 12 && s.head === 'data:audio/wav;base64,', JSON.stringify(s));

  // a picture
  let r = await ask('What is written in this picture? Answer with the words only.', '[PIC]');
  check('Nano reads the writing in an attached picture', /4821/.test(r.text) && !r.error, r.text);
  check('no tool was chosen for it', r.steps.length === 0);
  check('the picture is shown in the message', await b.eval(`(() => { const i = document.querySelector('.msg.user .pic'); return !!i && i.src.startsWith('data:image/jpeg') && i.naturalWidth === 640; })()`));
  check('the memory count includes the picture', r.usage > 250, String(r.usage));
  r = await ask('What color is the circle in it?');
  check('a follow-up question about the picture works', /red/i.test(r.text), r.text);
  check('and is answered from the picture, with no search', r.steps.length === 0 && !/\[\d\]/.test(r.text), r.steps.join() + ' ' + r.text);
  await b.waitFor(`NC.state.chat.turns[0].media[0].desc != null`, { timeout: 60000 });
  const desc = await b.eval(`NC.state.chat.turns[0].media[0].desc`);
  console.log('\n  what Nano made of the picture: ' + desc + '\n');
  check('afterwards Nano puts the picture into words', desc.length > 20 && /circle|square|4821|bike/i.test(desc), desc);
  check('and the learner can read that under the picture', /What Nano made of this picture/.test(await b.eval(`document.querySelector('.msg.user .saw').textContent`)) && (await b.eval(`document.querySelector('.msg.user .saw').textContent`)).includes(desc.slice(0, 30)));
  await b.eval(`document.querySelector('.msg.user .saw').open = true`); await b.screenshot(path.join(shots, 'media-picture.png'));
  await b.eval(`NC.engine.dirty = true`);
  r = await ask('Which shape is on the right of the picture?');
  check('when the session is made again, the picture goes with it', /square|rectangle/i.test(r.text), r.text);
  r = await ask('Who designed the Eiffel Tower?');
  check('a question about something else is still looked up', r.steps.includes('web_search') && /Eiffel/i.test(r.text), r.steps.join() + ' ' + r.text);

  // a recording in a chat that already has a picture: Nano used to say it cannot hear, while quoting the recording
  r = await ask('what do you hear?', '[SOUND]');
  check('asked what it hears, after a picture, Nano says what is in the recording', /Stockholm/i.test(r.text) && !/(do not|don.t|cannot|can.t|unable to) hear|text-based|only process/i.test(r.text), r.text);
  check('the message tells Nano in words what is attached', /^\[Attached to this message: a sound recording, which you can hear\.\]\n/.test(await b.eval(`NC.contentOf(NC.state.chat.turns.at(-2), true)[0].value`)) && /You can see those pictures and hear those recordings/.test(await b.eval(`NC.systemPrompt(NC.state.chat)`)));
  // a recording
  await b.eval(`NC.newChat()`);
  r = await ask('What is the bike lock code in this recording? Answer with the number only.', '[SOUND]');
  check('Nano hears an attached recording', /4821|four,? eight,? two,? one/i.test(r.text) && !r.error, r.text);
  check('the recording can be played in the message', await b.eval(`(() => { const a = document.querySelector('.msg.user audio'); return !!a && a.src.startsWith('data:audio/wav'); })()`));
  await b.waitFor(`NC.state.chat.turns[0].media[0].desc != null`, { timeout: 60000 });
  check('Nano writes down what was said', /Stockholm/i.test(await b.eval(`NC.state.chat.turns[0].media[0].desc`)), await b.eval(`NC.state.chat.turns[0].media[0].desc`));

  // a picture and a recording together, and a picture with no words
  await b.eval(`NC.newChat()`);
  r = await ask('Does the number in the picture match the number spoken in the recording? Start your answer with yes or no.', '[PIC, SOUND]');
  check('a picture and a recording can go in one message', r.media.join() === 'image,audio' && !r.error && r.text.length > 1, r.text);
  await b.eval(`NC.newChat()`);
  r = await ask('', '[PIC]');
  check('a picture sent with no words is described', !r.error && /circle|square|bike|4821|shape/i.test(r.text), r.text);

  // the part switched off
  await b.eval(`NC.setPart('media', false); NC.newChat()`);
  r = await ask('What is written in this picture? Answer with the words only.', '[PIC]');
  check('with the part off Nano is not given the picture', !/4821/.test(r.text), r.text);
  check('it was told only that a picture was attached', /You cannot see it/.test(await b.eval(`NC.contentOf(NC.state.chat.turns.at(-2), false)`)) && typeof (await b.eval(`NC.contentOf(NC.state.chat.turns.at(-2), false)`)) === 'string');
  const nudge = await b.eval(`(document.querySelector('.msg.bot:last-child .nudge') || {}).textContent || ''`);
  check('the page offers a try with the part on', /Pictures and sound/.test(nudge), nudge);
  await b.eval(`(async () => { const t = NC.state.chat.turns.at(-1); await NC.rerun(t.id, { ...t.f, media: true }); })()`);
  const again = await b.eval(`NC.state.chat.turns.at(-1).variants[0].text`);
  check('and that try reads the picture', /4821/.test(again), again);
  // a try changes nothing else: the page says so, and offers to carry on from the try
  const goes = await b.eval(`(document.querySelector('.msg.bot:last-child .goes') || {}).textContent || ''`);
  check('the page says that a try does not change the chat', /A try does not change the chat/.test(goes) && /Pictures and sound/.test(goes), goes);
  await b.eval(`document.querySelector('.msg.bot:last-child .carry').click()`);
  check('“Carry on from this answer, with these parts” makes the try the answer and switches the part on', await b.eval(`NC.settings.features.media === true && /4821/.test(NC.state.chat.turns.at(-1).text) && !document.querySelector('.msg.bot:last-child .goes')`));
  r = await ask('What color is the circle in the picture?');
  check('and the next question is answered from the picture', /red/i.test(r.text), r.text);
  // a later question about a picture Nano was never given
  await b.eval(`NC.setPart('media', false); NC.newChat()`);
  await ask('What is written in this picture? Answer with the words only.', '[PIC]');
  r = await ask('What color is the circle in the picture?');
  const later = await b.eval(`(document.querySelector('.msg.bot:last-child .nudge') || {}).textContent || ''`);
  check('a follow-up about a picture Nano was not given points at the part too', /Pictures and sound/.test(later), later || r.text);
  await b.eval(`(async () => { const t = NC.state.chat.turns.at(-1); await NC.rerun(t.id, { ...t.f, media: true }); })()`);
  check('and a try with the part on answers it, though an earlier answer said it could not see', /red/i.test(await b.eval(`NC.state.chat.turns.at(-1).variants[0].text`)), await b.eval(`NC.state.chat.turns.at(-1).variants[0].text`));
  // at the paperclip, with the part off
  await b.eval(`NC.newChat(); NC.state.media = [PIC]; NC.ui.atts()`);
  check('attaching a picture with the part off says what Nano will get', /switched off, so Nano will be told only that this was attached/.test(await b.eval(`(document.querySelector('#mediaOff') || {}).textContent || ''`)));
  await b.eval(`document.querySelector('#mediaOff button').click()`);
  check('and “Switch it on” does', await b.eval(`NC.settings.features.media === true && !document.querySelector('#mediaOff') && NC.state.media.length === 1`));
  await b.eval(`NC.state.media = []; NC.ui.atts()`);
  await b.eval(`NC.setPart('media', true)`);

  // the paperclip
  await b.eval(`NC.newChat(); document.querySelector('#attachBtn').click()`);
  check('the paperclip offers a file, a photo or a recording', await b.eval(`[...document.querySelectorAll('#attMenu button')].map(x => x.id).join() === 'attFile,attPhoto,attRecord'`));
  await b.screenshot(path.join(shots, 'media-menu.png'));
  await b.eval(`document.querySelector('#scroll').click()`); await pause(100);
  check('a click elsewhere closes the menu', !(await b.eval(`!!document.querySelector('#attMenu')`)));
  await b.eval(`(async () => { await NC.addFile(PICFILE); await NC.addFile(SOUNDFILE); await NC.addFile(new File(['hello there'], 'note.txt', { type: 'text/plain' })); })()`);
  check('files are sorted into pictures, sounds and text', await b.eval(`NC.state.media.map(m => m.kind).join() === 'image,audio' && NC.state.atts.length === 1 && !!document.querySelector('#attRow .thumb') && /speech\\.wav · \\d+ seconds/.test(document.querySelector('#attRow').textContent) && !document.querySelector('#sendBtn').disabled`), await b.eval(`document.querySelector('#attRow').textContent`));
  await b.eval(`[...document.querySelectorAll('#attRow .att button')].forEach(x => x.click()); [...document.querySelectorAll('#attRow .att button')].forEach(x => x.click()); [...document.querySelectorAll('#attRow .att button')].forEach(x => x.click())`);
  check('each can be taken off again', await b.eval(`NC.state.media.length === 0 && NC.state.atts.length === 0 && document.querySelector('#sendBtn').disabled`));
  await b.eval(`(() => { const d = new DataTransfer(); d.items.add(PICFILE); const e = new ClipboardEvent('paste', { clipboardData: d, bubbles: true, cancelable: true }); document.querySelector('#input').dispatchEvent(e); })()`);
  await b.waitFor(`NC.state.media.length === 1`, { timeout: 10000 });
  check('a picture can be pasted into the message box', await b.eval(`NC.state.media[0].name === 'Pasted picture'`));
  await b.eval(`NC.state.media = []; NC.ui.atts()`);

  // the camera and the microphone (Chrome's stand-ins)
  await b.eval(`document.querySelector('#attachBtn').click(); document.querySelector('#attPhoto').click()`);
  await b.waitFor(`document.querySelector('#camTake') && !document.querySelector('#camTake').disabled && document.querySelector('video.cam').videoWidth > 0`, { timeout: 20000 });
  check('“Take a photo” shows what the camera sees', await b.eval(`document.querySelector('#dTitle').textContent === 'Take a photo' && /stays on this computer/.test(document.querySelector('#dBody').textContent)`));
  await b.eval(`document.querySelector('#camTake').click()`);
  check('after taking it, the photo can be used or taken again', await b.eval(`!document.querySelector('#camUse').hidden && !document.querySelector('#camAgain').hidden && document.querySelector('#camTake').hidden && !document.querySelector('img.cam').hidden`));
  await b.screenshot(path.join(shots, 'media-camera.png'));
  await b.eval(`document.querySelector('#camUse').click()`);
  await b.waitFor(`NC.state.media.length === 1`, { timeout: 10000 });
  check('the photo is attached to the message, and the camera is let go', await b.eval(`NC.state.media[0].kind === 'image' && NC.state.media[0].name === 'Photo' && NC.state.media[0].w > 0 && !document.querySelector('#dlg').open`));
  await b.eval(`document.querySelector('#attachBtn').click(); document.querySelector('#attRecord').click()`);
  await b.waitFor(`document.querySelector('#recGo') && !document.querySelector('#recGo').disabled`, { timeout: 20000 });
  await b.eval(`document.querySelector('#recGo').click()`); await pause(2600);
  check('while recording, a clock runs and “Stop” is offered', await b.eval(`!document.querySelector('#recEnd').hidden && document.querySelector('#recGo').hidden && /0:0[1-3]/.test(document.querySelector('#recClock').textContent)`), await b.eval(`document.querySelector('#recClock').textContent`));
  await b.eval(`document.querySelector('#recEnd').click()`);
  await b.waitFor(`!document.querySelector('#recUse').hidden`, { timeout: 20000 });
  check('afterwards the recording can be played, used or made again', await b.eval(`!document.querySelector('#recPlay').hidden && document.querySelector('#recPlay').src.startsWith('data:audio/wav') && /Record again/.test(document.querySelector('#recGo').textContent)`));
  await b.screenshot(path.join(shots, 'media-record.png'));
  await b.eval(`document.querySelector('#recUse').click()`);
  check('the recording is attached to the message', await b.eval(`NC.state.media.length === 2 && NC.state.media[1].kind === 'audio' && NC.state.media[1].secs >= 1.5 && NC.state.media[1].secs < 6 && !document.querySelector('#dlg').open`), await b.eval(`JSON.stringify(NC.state.media.map(m => [m.kind, m.secs || m.w]))`));
  await b.eval(`document.querySelector('#input').value = 'Say in a few words what you see and hear.'; document.querySelector('#sendBtn').click()`);
  await b.waitFor(`!NC.state.busy && NC.state.chat.turns.length === 2`, { timeout: 120000 });
  r = await b.eval(`({ text: NC.state.chat.turns[1].text, error: NC.state.chat.turns[1].error || null, kinds: NC.state.chat.turns[0].media.map(m => m.kind).join() })`);
  console.log('\n> Say in a few words what you see and hear.   [a photo and a recording from the stand-in devices]\n  ' + r.text.replace(/\n/g, ' ').slice(0, 260) + '\n');
  check('a photo and a recording made here are sent with the message', r.kinds === 'image,audio' && !r.error && r.text.length > 5 && await b.eval(`NC.state.media.length === 0`), r.error || r.text);
  // a camera that is refused
  await b.eval(`navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('no', 'NotAllowedError')); NC.takePhoto()`); await pause(300);
  check('a refused camera is explained, with another way offered', /camera was not allowed/.test(await b.eval(`document.querySelector('#dBody').textContent`)) && /from a file/.test(await b.eval(`document.querySelector('#dBody').textContent`)));
  await b.eval(`document.querySelector('#dlg').close()`);

  // saving, and coming back later
  await b.eval(`NC.newChat()`);
  await ask('What is written in this picture? Answer with the words only.', '[PIC]');
  await b.waitFor(`NC.state.chat.turns[0].media[0].desc != null`, { timeout: 60000 });
  const saved = await b.eval(`(() => { const orig = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () {}; try { return NC.saveChat().html; } finally { HTMLAnchorElement.prototype.click = orig; } })()`);
  check('a saved chat carries its pictures', /<img class="pic" src="data:image\/jpeg;base64,/.test(saved) && !/<script/i.test(saved));
  // what the coach gets
  await b.eval(`Object.assign(NC.settings.coach, { mode: 'ask', provider: 'anthropic', keys: { anthropic: 'made-up' }, pictures: false })`);
  let cp = await b.eval(`NC.coachPrompt(NC.state.chat, NC.state.chat.turns[1])`);
  check('the coach is told of the picture and given Nano’s description, not the picture', /The learner attached a picture, “shapes\.png”\. The model was given it\. You cannot see it\./.test(cp) && /What the model itself made of it/.test(cp) && (await b.eval(`NC.coachImages(NC.state.chat, NC.state.chat.turns[1]).length`)) === 0, cp.slice(cp.indexOf('The learner attached'), cp.indexOf('The learner attached') + 260));
  await b.eval(`NC.showSettings()`);
  check('Settings has a switch for letting the coach see pictures, off to begin with', await b.eval(`!!document.querySelector('#coachPics') && !document.querySelector('#coachPics').checked && /Recordings are never sent/.test(document.querySelector('#dBody').textContent)`));
  await b.eval(`document.querySelector('#coachPics').click(); document.querySelector('#dlg').close()`);
  cp = await b.eval(`NC.coachPrompt(NC.state.chat, NC.state.chat.turns[1])`);
  check('switched on, the coach is told the picture is attached', (await b.eval(`NC.settings.coach.pictures`)) === true && /It is attached to this message, so you can look at it yourself/.test(cp) && (await b.eval(`NC.coachImages(NC.state.chat, NC.state.chat.turns[1])[0].startsWith('data:image/jpeg')`)));
  const sent = await b.eval(`(async () => { const real = window.fetch, out = {}; const reply = { anthropic: { content: [{ type: 'text', text: 'ok' }] }, gemini: { candidates: [{ content: { parts: [{ text: 'ok' }] } }] }, openai: { choices: [{ message: { content: 'ok' } }] } };
    for (const who of ['anthropic', 'gemini', 'openai']) { NC.settings.coach.provider = who; NC.settings.coach.keys[who] = 'made-up'; window.fetch = async (url, init) => { out[who] = JSON.parse(init.body); return new Response(JSON.stringify(reply[who]), { status: 200, headers: { 'content-type': 'application/json' } }); }; await NC.askAI('s', [{ role: 'user', text: 'Look.', images: [PIC.data] }], {}); }
    window.fetch = real; NC.settings.coach.provider = 'anthropic';
    return { a: out.anthropic.messages[0].content.map(c => c.type).join() + ' ' + out.anthropic.messages[0].content[0].source.media_type, g: Object.keys(out.gemini.contents[0].parts[0]).join() + ' ' + out.gemini.contents[0].parts[0].inlineData.mimeType, o: out.openai.messages[1].content.map(c => c.type).join() }; })()`);
  check('each company is sent the picture in its own form', sent.a === 'image,text image/jpeg' && sent.g === 'inlineData image/jpeg' && sent.o === 'text,image_url', JSON.stringify(sent));
  await b.eval(`NC.settings.coach.mode = 'off'; NC.settings.coach.pictures = false`);
  // a reload
  const id = await b.eval(`NC.state.chat.id`);
  await ready();
  check('after a reload the chat still has its picture', await b.eval(`NC.state.chat.id === ${JSON.stringify(id)} && NC.state.chat.turns[0].media[0].data.startsWith('data:image/jpeg') && !!document.querySelector('.msg.user .pic')`));
  r = await ask('What color is the square in the picture?');
  check('and Nano can still be asked about it', /blue/i.test(r.text), r.text);
  check('no page errors', b.errors.length === 0, b.errors.join(' | '));
} catch (e) { fail++; console.error('FAILED', e.message); console.log(b.log.slice(-12).join('\n')); console.log(b.errors.join('\n')); }
finally { console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exitCode = fail ? 1 : 0; }
