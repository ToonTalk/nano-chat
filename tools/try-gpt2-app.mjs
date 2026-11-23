// The whole page running on GPT-2 instead of Gemini Nano: the same probes with every part off, then with every part on.
//   node tools/try-gpt2-app.mjs [gpt2|gpt2-medium|gpt2-large|gpt2-xl] [script|none]
// Writes captures/gpt2-app-<model>.json and two screenshots. Needs the network (the weights come from Hugging Face).
import path from 'node:path';
import fs from 'node:fs';
import { launch } from './nano-harness.mjs';
const root = path.resolve(import.meta.dirname, '..');
const shots = path.join(root, 'captures'); fs.mkdirSync(shots, { recursive: true });
const key = process.argv[2] || 'gpt2', frame = process.argv[3] || 'script';
const b = await launch({ root, withModel: false });
const out = { model: key, frame, runs: {} };
const ask = async text => {
  const t0 = Date.now();
  const r = await b.eval(`(async () => { await NC.send(${JSON.stringify(text)}); const t = NC.state.chat.turns.at(-1);
    return { text: t.text, model: t.model || null, byPage: !!t.byPage, error: t.error || null, note: t.note || null, steps: t.steps.map(s => ({ tool: s.tool, input: s.input, status: s.status, how: s.how || '' })), sources: t.sources.length, usage: NC.engine.usage() }; })()`);
  r.q = text; r.s = +((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n> ${text}\n  [${r.s}s; ${r.byPage ? 'answered by the page; ' : ''}tools: ${r.steps.map(s => `${s.tool}(${s.input})${s.status === 'ok' ? '' : ' FAILED'}`).join(', ') || 'none'}; usage ${r.usage}]\n  ${r.text.replace(/\n/g, '\n  ').slice(0, 600)}${r.error ? '\n  ERROR ' + r.error : ''}${r.note ? '\n  NOTE ' + r.note : ''}`);
  return r;
};
const PROBES = ['Hello! Who are you?', 'What is 17% of 2,340?', 'What is an 18% tip on a $64.50 bill?', 'Who designed the Eiffel Tower, and when was it finished?',
  'Remember that my bike lock code is 4821', 'What is my bike lock code?', 'Write a two-line poem about rain.', 'What is today\'s date?'];
try {
  await b.goto(`/index.html?model=${key}&frame=${frame}&start=bare`);
  await b.waitFor(`window.NC && NC.state.door && NC.state.door.kind === 'download'`, { timeout: 60000 });
  out.door = await b.eval(`document.querySelector('.door').innerText`);
  console.log('front door:\n' + out.door);
  const t0 = Date.now();
  await b.eval('NC.start(true), 1');
  await b.waitFor('NC.engine.ready', { timeout: 600000 });
  out.loadS = +((Date.now() - t0) / 1000).toFixed(1); out.hint = await b.eval(`document.querySelector('#hint').textContent`);
  out.window = await b.eval('NC.engine.W');
  console.log(`ready after ${out.loadS}s; window ${out.window}; hint: ${out.hint}`);
  for (const [name, full] of [['bare', false], ['full', true]]) {
    await b.eval(`(NC.setParts(NC.defaultParts(${full})), NC.notes = [], NC.newChat(), 1)`);
    console.log(`\n================ every part ${full ? 'ON' : 'OFF'} ================`);
    if (full) console.log('system prompt tokens:', await b.eval('NC.alt.count(NC.systemPrompt(NC.state.chat))'));
    out.runs[name] = [];
    for (const q of PROBES) out.runs[name].push(await ask(q));
    await b.screenshot(path.join(shots, `gpt2-${key}-${name}.png`));
  }
  out.stats = await b.eval('JSON.stringify(NC.alt.stats)').then(JSON.parse);
  console.log('\nstats', JSON.stringify(out.stats), await b.eval("JSON.stringify(NC.alt.rates())"));
  out.warnings = b.log.filter(l => /^\[(warning|error)\]/.test(l)).slice(0, 40); out.errors = b.errors;
  console.log('\nconsole warnings/errors:', out.warnings.length, 'exceptions:', b.errors.length); out.warnings.slice(0, 8).forEach(l => console.log('  ' + l.slice(0, 200)));
} catch (e) { console.error('FAILED', e.message); console.log(b.log.slice(-15).join('\n')); console.log(b.errors.join('\n')); process.exitCode = 1; }
finally { fs.writeFileSync(path.join(shots, `gpt2-app-${key}.json`), JSON.stringify(out, null, 1)); await b.close(); }
