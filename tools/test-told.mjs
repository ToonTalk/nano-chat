// The instructions the page gives Nano can be read and rewritten in Settings. Checked against the real Gemini Nano.
//   node tools/test-told.mjs
import { launch } from './nano-harness.mjs';
import path from 'node:path';
import fs from 'node:fs';
const root = path.resolve(import.meta.dirname, '..');
const shots = path.join(root, 'captures'); fs.mkdirSync(shots, { recursive: true });
const b = await launch({ root, height: 980 });
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + String(extra).replace(/\s+/g, ' ').slice(0, 300) : ''}`); };
// what the page said before any of this could be edited, word for word
const WAS = `You are a friendly, helpful assistant called Nano. You run entirely on the user's own computer, inside Chrome, as the small on-device model Gemini Nano.
Keep answers clear and fairly short. You may use Markdown.
You are a small model, so be honest: when you are not sure, say so instead of guessing, and never make up sources, links or quotations.
You are unreliable at arithmetic. State a calculated number only when it has been given to you; otherwise say what would need working out.
For reference, today's date is DATE.
Sometimes a message arrives together with facts the app has looked up for you (a calculation, search results, a note, part of a document). Trust those over your own memory and copy numbers from them exactly. You cannot look anything up yourself, so never write out calculator output or search results of your own.
The user can attach pictures and sound recordings, and they are given to you with the message. You can see those pictures and hear those recordings. When asked what you see or hear, say what is in them, and never say that you cannot see or hear.`;      // the last line is there on computers where Chrome lets Nano take pictures and sound
const PIRATE = 'You are a pirate called Captain Byte. Answer in one short sentence and always end with the word Arr!';
const type = (id, text) => b.eval(`(() => { const t = document.querySelector('#${id}'); t.value = ${JSON.stringify(text)}; t.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
const sys = () => b.eval(`NC.systemPrompt(NC.state.chat)`);
const ask = text => b.eval(`(async () => { await NC.send(${JSON.stringify(text)}); const t = NC.state.chat.turns.at(-1); return { text: t.text, told: t.told || null, id: t.id }; })()`);
try {
  await b.goto('/index.html');
  await b.waitFor('window.NC && NC.engine.ready', { timeout: 180000 });
  const today = await b.eval(`new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })`);
  check('untouched, Nano is told exactly what it was told before', (await sys()) === WAS.replace('DATE', today), await sys());

  await b.eval(`NC.showSettings()`);
  check('Settings shows the briefing in a box', (await b.eval(`document.querySelector('#toldBriefing').value`)) === WAS.split('\n').slice(0, 3).join('\n'));
  check('and says the words are the page’s', /These are the page’s own words/.test(await b.eval(`document.querySelector('.toldState').textContent`)) && !(await b.eval(`!!document.querySelector('#toldReset')`)));
  check('the other parts’ lines are there to open', (await b.eval(`['toldCalculator', 'toldDate', 'toldTools', 'toldMedia'].every(id => document.querySelector('#' + id).value.length > 20)`)) && /\{date\}/.test(await b.eval(`document.querySelector('#toldDate').value`)));
  await b.screenshot(path.join(shots, 'told-settings.png'));

  await type('toldBriefing', PIRATE);
  const s1 = await sys();
  check('a rewritten briefing replaces the page’s', s1.startsWith(PIRATE + '\nYou are unreliable at arithmetic') && !/friendly, helpful assistant/.test(s1), s1);
  check('Settings says the words are now the learner’s, and offers the way back', /Your own words are in use/.test(await b.eval(`document.querySelector('.toldState').textContent`)) && (await b.eval(`!!document.querySelector('#toldReset')`)));
  check('the word-for-word view follows the typing', (await b.eval(`document.querySelector('.toldMore pre').textContent`)) === s1);
  check('the conversation’s session is marked to be rebuilt', await b.eval(`NC.engine.dirty === true`));
  await type('toldDate', 'It is {date} today, matey.');
  check('{date} is filled in with today’s date', (await sys()).includes(`It is ${today} today, matey.`));
  await b.eval(`document.querySelector('#dlg').close()`);

  let r = await ask('Who are you?');
  console.log('\n> Who are you?\n  ' + r.text.replace(/\n/g, '\n  ').slice(0, 300));
  check('real Nano follows the rewritten instructions', /arr|captain byte|pirate/i.test(r.text), r.text);
  check('the reply keeps the instructions it was given', r.told && r.told.briefing === PIRATE && /matey/.test(r.told.date));
  check('and says so under it', /your own instructions/.test(await b.eval(`document.querySelector('.msg.bot:last-child .told').textContent`)), await b.eval(`(document.querySelector('.msg.bot:last-child .told') || {}).textContent || 'no line'`));
  check('the memory view shows what Nano was really given', await b.eval(`(NC.engine.lastSystem || '').startsWith(${JSON.stringify(PIRATE)})`));
  const cp = await b.eval(`NC.coachPrompt(NC.state.chat, NC.state.chat.turns.at(-1))`);
  check('the coach is told the instructions were rewritten, and how', /THE LEARNER REWROTE THE INSTRUCTIONS/.test(cp) && cp.includes(PIRATE), cp.slice(cp.indexOf('THE LEARNER REWROTE'), cp.indexOf('THE LEARNER REWROTE') + 300));
  await b.screenshot(path.join(shots, 'told-reply.png'));

  // it survives a reload
  await b.goto('/index.html');
  await b.waitFor('window.NC && NC.engine.ready', { timeout: 180000 });
  check('the rewritten instructions are still there after a reload', (await b.eval(`NC.told('briefing')`)) === PIRATE && (await sys()).startsWith(PIRATE));

  // with the part off, none of it is said
  await b.eval(`NC.setPart('instructions', false)`);
  check('with the Instructions part off, none of it reaches Nano', !/pirate/i.test(await sys()) && !/matey/.test(await sys()), await sys());
  await b.eval(`NC.showSettings()`);
  check('and Settings says so', /switched off, so at the moment Nano is told none of this/.test(await b.eval(`document.querySelector('#dBody').textContent`)));
  await b.eval(`NC.setPart('instructions', true); NC.showSettings()`);

  // an emptied briefing means no briefing, and the other lines stay
  await type('toldBriefing', '');
  check('an emptied box means no briefing, with the other lines kept', (await sys()).startsWith('You are unreliable at arithmetic'), (await sys()).slice(0, 120));

  // back to the page's words
  await b.eval(`document.querySelector('#toldReset').click()`);
  check('“Back to the page’s words” restores every piece', (await sys()) === WAS.replace('DATE', today) && (await b.eval(`Object.keys(NC.settings.told).length`)) === 0 && (await b.eval(`document.querySelector('#toldBriefing').value`)) === WAS.split('\n').slice(0, 3).join('\n') && !(await b.eval(`NC.toldEdited()`)));
  await b.eval(`document.querySelector('#dlg').close(); NC.newChat()`);
  r = await ask('Who are you?');
  console.log('\n> Who are you?   (the page’s words again)\n  ' + r.text.replace(/\n/g, '\n  ').slice(0, 300));
  check('Nano is itself again, and the reply carries no mark', /nano/i.test(r.text) && !r.told && !(await b.eval(`!!document.querySelector('.msg.bot:last-child .told')`)), r.text);
  check('no page errors', b.errors.length === 0, b.errors.join(' | '));
} catch (e) { fail++; console.error('FAILED', e.message); console.log(b.log.slice(-10).join('\n')); }
finally { console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exitCode = fail ? 1 : 0; }
