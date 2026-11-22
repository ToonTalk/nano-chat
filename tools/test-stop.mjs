// Does the Stop button stop a reply, during the answer and during a tool, and does the chat carry on afterward?
//   node tools/test-stop.mjs
import { launch } from './nano-harness.mjs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const b = await launch({ root });
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); };
const type = text => b.eval(`(() => { const i = document.querySelector('#input'); i.value = ${JSON.stringify(text)}; i.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#sendBtn').click(); })()`);
const last = () => b.eval(`(() => { const t = NC.state.chat.turns.at(-1); return { role: t.role, text: t.text, stopped: !!t.stopped, error: t.error || null, steps: (t.steps || []).length }; })()`);
try {
  await b.goto('/index.html');
  await b.waitFor('window.NC && NC.engine.ready', { timeout: 180000 });

  // 1. stop in the middle of a long answer
  await type('Write a 400-word story about a lighthouse keeper and a whale.');
  await b.waitFor(`NC.state.busy && document.querySelector('#sendBtn').textContent === 'Stop' && (NC.state.chat.turns.at(-1).text || '').length > 80`, { timeout: 60000, every: 100 });
  const before = (await last()).text.length;
  await b.eval(`document.querySelector('#sendBtn').click()`);
  await b.waitFor('!NC.state.busy', { timeout: 30000, every: 100 });
  let t = await last();
  check('stopping mid-answer ends the turn', t.stopped && !t.error, JSON.stringify({ stopped: t.stopped, error: t.error }));
  check('the partial reply is kept', t.text.length >= before && t.text.length < 2200, `${before} → ${t.text.length} characters`);
  check('the page says Stopped', await b.eval(`!!document.querySelector('.stopped')`));
  check('the button is Send again', (await b.eval(`document.querySelector('#sendBtn').textContent`)) === 'Send');

  // 2. the chat carries on, and still knows what came before
  await type('What animal was in the story you started?');
  await b.waitFor('!NC.state.busy && NC.state.chat.turns.at(-1).role === "assistant" && NC.state.chat.turns.length === 4', { timeout: 90000 });
  t = await last();
  check('a later message is answered', !t.stopped && !t.error && t.text.length > 0, t.text.slice(0, 160));
  check('it remembers the stopped exchange', /whale/i.test(t.text), t.text.slice(0, 160));

  // 3. stop while a tool is still working
  await type('Who painted The Night Watch, and in what year?');
  await b.waitFor(`NC.state.busy && document.querySelector('#sendBtn').textContent === 'Stop'`, { timeout: 30000, every: 50 });
  await new Promise(r => setTimeout(r, 900));
  await b.eval(`document.querySelector('#sendBtn').click()`);
  await b.waitFor('!NC.state.busy', { timeout: 30000, every: 100 });
  t = await last();
  check('stopping during the lookup ends the turn', t.stopped && !t.error, JSON.stringify(t).slice(0, 200));

  // 4. and once more a normal message works
  await type('12 * (3 + 4)');
  await b.waitFor('!NC.state.busy && NC.state.chat.turns.length === 8', { timeout: 60000 });
  t = await last();
  check('the chat still works after that', t.text === '**84**', t.text);
  check('no page errors', b.errors.length === 0, b.errors.join(' | ').slice(0, 300));
} catch (e) { fail++; console.log('FAIL  crashed: ' + (e.stack || e)); console.log(b.log.slice(-8).join('\n')); }
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
