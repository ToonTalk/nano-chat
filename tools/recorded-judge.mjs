// Claude judges, blind, five answers to each sampled question: GPT-2's (2019) with every part of the page off and
// with every part on, ChatGPT's recorded answer from December 2022, and Gemini Nano's, bare and with every part on.
// The five are shuffled and labeled A to E, so the judge cannot tell which system wrote which.
// This costs well under a dollar: 30 calls. The key is read from ANTHROPIC_API_KEY, stays in this process and is never printed.
//   node tools/recorded-judge.mjs           judge what is not judged yet; writes captures/recorded-judged.json
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
const root = path.resolve(import.meta.dirname, '..');
const shots = path.join(root, 'captures');
const read = f => JSON.parse(fs.readFileSync(path.join(shots, f), 'utf8'));
const { sample } = read('recorded-sample.json'), nano = read('recorded-nano.json'), gpt2 = read('recorded-gpt2.json');
const file = path.join(shots, 'recorded-judged.json');
const judged = fs.existsSync(file) ? read('recorded-judged.json') : { model: 'claude-sonnet-5-5', verdicts: {}, tokens: { in: 0, out: 0 } };
const WHO = ['gpt2', 'gpt2full', 'gpt35', 'bare', 'full'];
const answerOf = (s, who) => (who === 'gpt35' ? s.gpt35 : who === 'gpt2' ? (gpt2.answers[`${s.id}|bare`] || {}).text : who === 'gpt2full' ? (gpt2.answers[`${s.id}|full`] || {}).text : (nano.answers[`${s.id}|${who}`] || {}).text) || '';
// the same shuffle every time, different for each question
const orderFor = i => { let x = (i + 1) * 2654435761 >>> 0; const a = [...WHO]; for (let k = a.length - 1; k > 0; k--) { x = (x * 1664525 + 1013904223) >>> 0; const j = x % (k + 1); [a[k], a[j]] = [a[j], a[k]]; } return a; };
const L = 'ABCDE';
const SYSTEM = `You are judging answers for a study that compares language models from different years. Five systems answered the same question; you do not know which wrote which. Judge each answer on what it says: is it correct, and does it help the person who asked? Do not reward length, confidence or polish. An answer that honestly says it does not know is better than a confident wrong one, and worse than a correct one. An answer that is not about the question at all is neither correct nor helpful. The answers were written in different years, so do not count it against an answer that a fact has changed since 2022. Some systems could look things up: a number in square brackets such as [1] is a link to a source that the system showed beside its answer. The sources are not shown to you, so neither reward nor penalize those markers; judge what the answer states.`;

let key = (process.env.ANTHROPIC_API_KEY || '').trim();
if (!key && process.platform === 'win32') key = (spawnSync('powershell', ['-NoProfile', '-Command', "[Environment]::GetEnvironmentVariable('ANTHROPIC_API_KEY','User')"], { encoding: 'utf8' }).stdout || '').trim();
if (!key) { console.log('No ANTHROPIC_API_KEY is set, so nothing was judged.'); process.exit(2); }
const scrub = t => String(t).split(key).join('[key]');
for (let i = 0; i < sample.length; i++) {
  const s = sample[i]; if (judged.verdicts[s.id]) continue;
  const order = orderFor(i), texts = order.map(w => answerOf(s, w));
  if (!nano.answers[`${s.id}|full`] || !gpt2.answers[`${s.id}|full`]) { console.log(`skipped (not answered yet): ${s.question.slice(0, 60)}`); continue; }
  const user = `The question (${s.kind}):\n${s.question}\n\nFor reference, an answer a person wrote for this question in the source data set. It may be incomplete or wrong, so use what you know as well:\n${s.human.slice(0, 1500)}\n\n` +
    order.map((w, k) => `=== Answer ${L[k]} ===\n${texts[k] ? texts[k].slice(0, 4000) : '(This system wrote nothing.)'}`).join('\n\n') +
    `\n\nReply with JSON only, in this shape:\n{"A": {"correct": 1-5, "helpful": 1-5, "problems": "what is wrong or missing, in a few words, or empty"}, "B": {...}, "C": {...}, "D": {...}, "E": {...}, "ranking": ["best", "...", "worst"], "note": "one sentence on what most separates the answers"}\n"correct": 5 = nothing wrong, 3 = a real error or a mix of right and wrong, 1 = mostly wrong, made up, or not about the question. "helpful": 5 = fully answers what was asked, 1 = no use to the asker. "ranking" holds all five letters, best first.`;
  let text = '';
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2026-10-21' },
      body: JSON.stringify({ model: judged.model, max_tokens: 4000, system: SYSTEM, messages: [{ role: 'user', content: user }] }) });
    const j = await r.json(); if (!r.ok) throw new Error(`${r.status} ${j.error ? j.error.message : ''}`);
    text = j.content.filter(c => c.type === 'text').map(c => c.text).join('');
    const v = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    if (!Array.isArray(v.ranking) || v.ranking.length !== 5 || new Set(v.ranking).size !== 5) throw new Error('the ranking does not hold five different letters');
    judged.tokens.in += j.usage.input_tokens; judged.tokens.out += j.usage.output_tokens;
    const by = {}; order.forEach((w, k) => { by[w] = { ...v[L[k]], rank: v.ranking.indexOf(L[k]) + 1 }; });
    judged.verdicts[s.id] = { order, by, note: v.note, model: j.model };
    fs.writeFileSync(file, JSON.stringify(judged, null, 1));
    console.log(`${s.question.slice(0, 50).padEnd(50)}  ` + WHO.map(w => `${w} ${by[w].correct}/${by[w].helpful} #${by[w].rank}`).join('   '));
  } catch (e) { console.log(`FAILED on "${s.question.slice(0, 50)}": ${scrub(e.message)} ${scrub(text).slice(0, 200)}`); }
}
console.log(`\n${Object.keys(judged.verdicts).length} of ${sample.length} judged. Claude (${judged.model}) used ${judged.tokens.in.toLocaleString('en-US')} input and ${judged.tokens.out.toLocaleString('en-US')} output tokens in all.`);
