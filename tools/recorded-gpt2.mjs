// GPT-2 (2019) answers the questions that ChatGPT answered in December 2022 (see recorded-fetch.mjs), through the
// same page as Gemini Nano: once with every part off, once with every part on. Each question gets a new chat.
//   node tools/recorded-gpt2.mjs [gpt2|gpt2-medium|gpt2-large|gpt2-xl]     writes captures/recorded-<model>.json
import path from 'node:path';
import fs from 'node:fs';
import { launch } from './nano-harness.mjs';
const root = path.resolve(import.meta.dirname, '..');
const shots = path.join(root, 'captures');
const key = process.argv[2] || 'gpt2';
const { sample } = JSON.parse(fs.readFileSync(path.join(shots, 'recorded-sample.json'), 'utf8'));
const file = path.join(shots, `recorded-${key}.json`);
const done = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { model: key, answers: {} };
const save = () => fs.writeFileSync(file, JSON.stringify(done, null, 1));
const b = await launch({ root, withModel: false });
try {
  await b.goto(`/index.html?model=${key}&start=bare`);
  await b.waitFor(`window.NC && NC.state.door && NC.state.door.kind === 'download'`, { timeout: 60000 });
  await b.eval('NC.start(true), 1');
  await b.waitFor('NC.engine.ready', { timeout: 1200000 });
  done.info = await b.eval('JSON.stringify(NC.alt.info)').then(JSON.parse);
  done.hint = await b.eval(`(NC.ui.parts(), document.querySelector('#hint').textContent)`);
  console.log('hint:', done.hint);
  for (const [mode, full] of [['bare', false], ['full', true]]) {
    for (const s of sample) {
      const k = `${s.id}|${mode}`; if (done.answers[k] && !done.answers[k].error) continue;
      const t0 = Date.now();
      const r = await b.eval(`(async () => { NC.setParts(NC.defaultParts(${full})); NC.notes = []; NC.newChat(); await NC.send(${JSON.stringify(s.question)}); const t = NC.state.chat.turns.at(-1);
        return { text: t.text, model: t.model || null, byPage: !!t.byPage, error: t.error || null, note: t.note || null, steps: t.steps.map(x => ({ tool: x.tool, input: x.input, status: x.status })), sources: t.sources.map(x => x.title) }; })()`);
      r.s = +((Date.now() - t0) / 1000).toFixed(1); done.answers[k] = r; save();
      console.log(`[${mode}] ${s.question.slice(0, 70)}\n   ${r.s}s; tools: ${r.steps.map(x => x.tool + (x.status === 'ok' ? '' : '!')).join(', ') || 'none'}; ${JSON.stringify(r.text.slice(0, 160))}${r.error ? '; ERROR ' + r.error : ''}`);
    }
  }
  done.stats = await b.eval('JSON.stringify(NC.alt.stats)').then(JSON.parse);
} catch (e) { console.error('FAILED', e.message); console.log(b.log.slice(-10).join('\n')); process.exitCode = 1; }
finally { save(); await b.close(); }
