// Gemini Nano answers the questions that ChatGPT answered in December 2022 (see recorded-fetch.mjs), twice each:
// as the bare model with every part off, and with every part of the page on. Then Nano is asked to judge, blind,
// between the recorded ChatGPT answer and its own, in both orders, so that a vote for "whichever came first" cancels out.
//   node tools/recorded-nano.mjs            writes captures/recorded-nano.json (picks up where an earlier run stopped)
import path from 'node:path';
import fs from 'node:fs';
import { launch } from './nano-harness.mjs';
const root = path.resolve(import.meta.dirname, '..');
const shots = path.join(root, 'captures');
const { sample } = JSON.parse(fs.readFileSync(path.join(shots, 'recorded-sample.json'), 'utf8'));
const file = path.join(shots, 'recorded-nano.json');
const done = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { answers: {}, nanoJudge: {} };
const save = () => fs.writeFileSync(file, JSON.stringify(done, null, 1));
const b = await launch({ root });
const JUDGE_SYS = 'You compare two answers to the same question. You are careful and fair, and you prefer the answer that is correct and actually answers the question. Length alone does not make an answer better.';
const SCHEMA = { type: 'object', properties: { better: { type: 'string', enum: ['A', 'B', 'same'] }, why: { type: 'string' } }, required: ['better', 'why'], additionalProperties: false };
try {
  await b.goto('/index.html');
  await b.waitFor('window.NC && NC.engine.ready', { timeout: 180000 });
  for (const [mode, full] of [['bare', false], ['full', true]]) {
    for (const s of sample) {
      const k = `${s.id}|${mode}`; if (done.answers[k] && !done.answers[k].error) continue;
      const t0 = Date.now();
      const r = await b.eval(`(async () => { NC.setParts(NC.defaultParts(${full})); NC.notes = []; NC.newChat(); await NC.send(${JSON.stringify(s.question)}); const t = NC.state.chat.turns.at(-1);
        return { text: t.text, byPage: !!t.byPage, error: t.error || null, note: t.note || null, steps: t.steps.map(x => ({ tool: x.tool, input: x.input, status: x.status })), sources: t.sources.map(x => x.title) }; })()`);
      r.s = +((Date.now() - t0) / 1000).toFixed(1); done.answers[k] = r; save();
      console.log(`[${mode}] ${s.question.slice(0, 70)}\n   ${r.s}s; tools: ${r.steps.map(x => x.tool + (x.status === 'ok' ? '' : '!')).join(', ') || 'none'}; ${r.text.length} characters${r.error ? '; ERROR ' + r.error : ''}`);
    }
  }
  // Nano as the judge
  await b.eval(`(async () => { self.JUDGE = await LanguageModel.create({ expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }], initialPrompts: [{ role: 'system', content: ${JSON.stringify(JUDGE_SYS)} }] }); return 1; })()`);
  const clip = (t, n) => t.length > n ? t.slice(0, n) + ' …' : t;
  for (const mode of ['bare', 'full']) for (const s of sample) for (const order of ['gpt-first', 'nano-first']) {
    const k = `${s.id}|${mode}|${order}`; if (done.nanoJudge[k]) continue;
    const nano = (done.answers[`${s.id}|${mode}`] || {}).text; if (!nano) continue;
    const [A, B] = order === 'gpt-first' ? [s.gpt35, nano] : [nano, s.gpt35];
    const prompt = `Question: ${s.question}\n\nAnswer A:\n${clip(A, 2600)}\n\nAnswer B:\n${clip(B, 2600)}\n\nWhich answer is better: more correct, and more helpful to the person who asked? Reply as JSON: "better" is "A", "B" or "same", and "why" is one short sentence.`;
    let v = null;
    try { v = JSON.parse(await b.eval(`(async () => { const c = await JUDGE.clone(); try { return await c.prompt(${JSON.stringify(prompt)}, { responseConstraint: ${JSON.stringify(SCHEMA)} }); } finally { c.destroy(); } })()`)); } catch (e) { v = { error: e.message.slice(0, 200) }; }
    const pick = v.better === 'same' ? 'same' : v.better === 'A' ? (order === 'gpt-first' ? 'gpt35' : 'nano') : v.better === 'B' ? (order === 'gpt-first' ? 'nano' : 'gpt35') : null;
    done.nanoJudge[k] = { ...v, pick }; save();
    console.log(`judge [${mode}, ${order}] ${s.question.slice(0, 50)} → ${pick || 'ERROR ' + v.error}`);
  }
} catch (e) { console.error('FAILED', e.message); console.log(b.log.slice(-10).join('\n')); process.exitCode = 1; }
finally { save(); await b.close(); }
