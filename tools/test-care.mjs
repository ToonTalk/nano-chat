// Looking after a shared computer, and asking the coach a question of your own:
// deleting one chat, all chats, all notes or everything; keeping keys only for this tab; the coach's question box at the hint stage.
//   node tools/test-care.mjs
import { launch } from './nano-harness.mjs';
import path from 'node:path';
import fs from 'node:fs';
const root = path.resolve(import.meta.dirname, '..');
const shots = path.join(root, 'captures'); fs.mkdirSync(shots, { recursive: true });
const b = await launch({ root, height: 980 });
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + String(extra).replace(/\s+/g, ' ').slice(0, 300) : ''}`); };
const ready = async () => { await b.goto('/index.html'); await b.waitFor('window.NC && NC.engine.ready', { timeout: 180000 }); };
const saved = () => b.eval(`localStorage.getItem('nanochat.settings') || ''`);
const pause = ms => new Promise(r => setTimeout(r, ms));
// three made-up chats and two notes, put straight into the page's storage
const fill = () => b.eval(`(async () => { for (const [i, t] of ['Lisbon trip', 'Chess for Tomas', 'Sourdough'].entries()) { const c = { id: 'c' + i, title: t, created: Date.now(), updated: Date.now() + i, turns: [{ id: 'u' + i, role: 'user', text: 'About ' + t }, { id: 'b' + i, role: 'assistant', text: 'Here is something about ' + t + '.', steps: [], sources: [], ms: 5 }], segments: [], compactedUpTo: 0 }; NC.state.chats.push(c); await NC.db.put(c); }
  NC.notes = [{ id: 'n1', title: 'Bike lock', body: 'The code is 4821.' }, { id: 'n2', title: 'Sister', body: 'Her birthday is March 9.' }]; NC.ui.chats(); return NC.state.chats.filter(c => c.turns.length).length; })()`);
try {
  await ready();
  check('three chats and two notes to start with', (await fill()) === 3 && (await b.eval('NC.notes.length')) === 2);

  // one chat, with a question first
  await b.eval(`[...document.querySelectorAll('#chatList .chatItem')].find(n => /Sourdough/.test(n.textContent)).querySelector('.del').click()`);
  check('deleting a chat asks first, in the page', await b.eval(`document.querySelector('#dlg').open && /Delete this chat/.test(document.querySelector('#dTitle').textContent) && /Sourdough/.test(document.querySelector('#dBody').textContent)`));
  await b.eval(`document.querySelector('#sureNo').click()`); await pause(200);
  check('“No, keep it” keeps it', (await b.eval(`NC.state.chats.some(c => c.title === 'Sourdough')`)) && !(await b.eval(`document.querySelector('#dlg').open`)));
  await b.eval(`[...document.querySelectorAll('#chatList .chatItem')].find(n => /Sourdough/.test(n.textContent)).querySelector('.del').click()`);
  await b.eval(`document.querySelector('#sureYes').click()`); await pause(400);
  check('“Delete it” removes it from the page and from storage', !(await b.eval(`NC.state.chats.some(c => c.title === 'Sourdough')`)) && !(await b.eval(`NC.db.all().then(a => a.some(c => c.title === 'Sourdough'))`)));

  // Settings: what this browser keeps
  await b.eval(`NC.showSettings()`);
  check('Settings says what this browser keeps', /There are 2 chats and 2 notes/.test(await b.eval(`document.querySelector('#dBody').textContent`)), await b.eval(`(document.querySelector('#wipe') || {}).previousElementSibling.textContent`));
  await b.eval(`document.querySelector('#wipe').scrollIntoView({ block: 'center' })`); await b.screenshot(path.join(shots, 'care-settings.png'));
  await b.eval(`document.querySelector('#wipeNotes').click()`);
  check('deleting all notes asks first', /Delete every note/.test(await b.eval(`document.querySelector('#dTitle').textContent`)));
  await b.eval(`document.querySelector('#sureYes').click()`); await pause(300);
  check('all notes are gone, chats are not', (await b.eval('NC.notes.length')) === 0 && (await b.eval(`JSON.parse(localStorage.getItem('nanochat.notes')).length`)) === 0 && (await b.eval(`NC.state.chats.filter(c => c.turns.length).length`)) === 2);
  await b.eval(`NC.showSettings(); document.querySelector('#wipeChats').click()`);
  await b.eval(`document.querySelector('#sureYes').click()`); await pause(500);
  check('all chats are gone from the page and from storage', (await b.eval(`NC.state.chats.filter(c => c.turns.length).length`)) === 0 && (await b.eval(`NC.db.all().then(a => a.filter(c => c.turns.length).length)`)) === 0 && (await b.eval(`document.querySelectorAll('#chatList .chatItem').length`)) <= 1);

  // keys: kept by default, or only for this tab
  await b.eval(`NC.showSettings(); const m = document.querySelector('#coachMode'); m.value = 'ask'; m.dispatchEvent(new Event('change'))`);
  await b.eval(`(() => { const k = document.querySelector('#coachKey'); k.value = 'made-up-key-123'; k.dispatchEvent(new Event('input')); return 1; })()`);
  check('a key is kept in this browser unless asked otherwise', /made-up-key-123/.test(await saved()) && (await b.eval(`sessionStorage.getItem('nanochat.keys')`)) == null);
  check('beside the key there is a box to keep it for this tab only', (await b.eval(`document.querySelectorAll('.keyKeep input').length`)) >= 1 && /Keep keys only until this tab is closed/.test(await b.eval(`document.querySelector('#dBody').textContent`)));
  await b.eval(`document.querySelector('.keyKeep input').click()`);
  check('ticked, the key leaves the saved settings and stays with the tab', !/made-up-key-123/.test(await saved()) && /made-up-key-123/.test(await b.eval(`sessionStorage.getItem('nanochat.keys') || ''`)) && (await b.eval(`NC.settings.coach.keys.anthropic`)) === 'made-up-key-123');
  check('the key box still shows it, and the note says it is not saved', (await b.eval(`document.querySelector('#coachKey').value`)) === 'made-up-key-123' && /not saved in this browser/.test(await b.eval(`document.querySelector('.keyKeep').textContent`)));
  await b.eval(`(() => { const k = document.querySelector('#coachKey'); k.value = 'made-up-key-456'; k.dispatchEvent(new Event('input')); return 1; })()`);
  check('a key typed afterwards is not saved either', !/made-up-key/.test(await saved()) && /456/.test(await b.eval(`sessionStorage.getItem('nanochat.keys')`)));
  await ready();
  check('reloading the tab keeps the key', (await b.eval(`NC.settings.coach.keys.anthropic`)) === 'made-up-key-456' && (await b.eval(`NC.settings.sessionKeys`)) === true);
  await b.eval(`sessionStorage.clear()`); await ready();                    // what closing the tab does
  check('closing the tab forgets the key, and the choice is remembered', !(await b.eval(`NC.settings.coach.keys.anthropic`)) && (await b.eval(`NC.settings.sessionKeys`)) === true && !/made-up-key/.test(await saved()));
  await b.eval(`NC.showSettings(); document.querySelector('.keyKeep input').click()`);
  await b.eval(`(() => { const k = document.querySelector('#coachKey'); k.value = 'made-up-key-789'; k.dispatchEvent(new Event('input')); return 1; })()`);
  check('unticked, keys are kept in the browser again', /made-up-key-789/.test(await saved()) && (await b.eval(`sessionStorage.getItem('nanochat.keys')`)) == null);
  await b.eval(`document.querySelector('#dlg').close()`);

  // the coach: a question of your own at the hint stage
  await b.eval(`askAI = async (system, msgs) => { window.lastCoachMsgs = msgs; return 'Yes, the French is natural, apart from one stiff phrase.'; }`);
  await b.eval(`(async () => { const c = { id: 'cc', title: 'French', created: Date.now(), updated: Date.now(), turns: [{ id: 'cu', role: 'user', text: 'Translate that into French.' }, { id: 'cb', role: 'assistant', text: 'Voulez-vous que je continue ?', steps: [], sources: [], ms: 5,
    coach: { state: 'done', n: 1, guess: 'right', verdict: 'minor', summary: 'The French is fluent but carries over a false claim.', hint: 'Look at the earlier answer.', problems: [], cause: '', experiment: '', part: '', answers: [], by: 'Claude' } }], segments: [], compactedUpTo: 0 };
    NC.state.chats.push(c); await NC.db.put(c); NC.state.chat = c; NC.ui.chats(); NC.ui.thread(); return 1; })()`);
  const box = () => b.eval(`(() => { const c = document.querySelector('.msg.bot:last-child .coach'); return c ? { text: c.textContent, input: !!c.querySelector('.ask input'), placeholder: (c.querySelector('.ask input') || {}).placeholder || '', show: [...c.querySelectorAll('button')].some(x => /Show what the coach found/.test(x.textContent)) } : null; })()`);
  let s = await box();
  check('with the hint, there is a box for a question of your own', s && s.show && s.input && /ask the coach your own question/i.test(s.placeholder), JSON.stringify(s));
  await b.screenshot(path.join(shots, 'care-hint.png'));
  await b.eval(`(() => { const f = document.querySelector('.msg.bot:last-child .coach .ask'); f.querySelector('input').value = 'Is the translation any good?'; f.requestSubmit(); return 1; })()`);
  await b.waitFor(`!NC.state.chat.turns.at(-1).coach.busy`, { timeout: 20000 });
  s = await box();
  check('the question is answered there, with the coach’s findings still unopened', s.show && /Is the translation any good\?/.test(s.text) && /the French is natural/.test(s.text) && !/carries over a false claim/.test(s.text), s.text);
  check('the coach was sent the question', /Is the translation any good\?/.test(await b.eval(`JSON.stringify(window.lastCoachMsgs)`)));
  await b.eval(`[...document.querySelectorAll('.msg.bot:last-child .coach button')].find(x => /Show what the coach found/.test(x.textContent)).click()`);
  s = await box();
  check('opening the findings keeps the conversation', /carries over a false claim/.test(s.text) && /the French is natural/.test(s.text) && /Say more to the coach/.test(s.placeholder), s.text);

  // everything
  await b.eval(`NC.notes = [{ id: 'n3', title: 'A note', body: 'To be deleted.' }]; NC.setTold('briefing', 'You are a pirate.'); NC.showSettings(); document.querySelector('#wipeAll').click()`);
  check('deleting everything asks first and names the keys', /keys you typed in/.test(await b.eval(`document.querySelector('#dBody').textContent`)));
  await b.eval(`document.querySelector('#sureYes').click()`);
  await pause(1500); await b.waitFor('window.NC && NC.engine.ready', { timeout: 180000 });
  check('afterwards the page starts as on a first visit', (await b.eval(`NC.state.chats.filter(c => c.turns.length).length`)) === 0 && (await b.eval('NC.notes.length')) === 0 && (await b.eval(`NC.settings.coach.mode`)) === 'off' && !(await b.eval(`NC.toldEdited()`)) && !/made-up-key|pirate/.test((await saved()) + (await b.eval(`localStorage.getItem('nanochat.notes') || ''`))) && (await b.eval(`NC.db.all().then(a => a.filter(c => c.turns.length).length)`)) === 0);
  check('no page errors', b.errors.length === 0, b.errors.join(' | '));
} catch (e) { fail++; console.error('FAILED', e.message); console.log(b.log.slice(-10).join('\n')); }
finally { console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exitCode = fail ? 1 : 0; }
