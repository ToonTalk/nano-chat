// Draws a fixed sample of questions with ChatGPT's recorded answers from HC3, the Human ChatGPT Comparison Corpus
// (Guo et al., 2023, arXiv 2301.07597; CC BY-SA 4.0; huggingface.co/datasets/Hello-SimpleAI/HC3).
// Its ChatGPT answers were collected in December 2022 and January 2023, from the first ChatGPT (GPT-3.5).
//   node tools/recorded-fetch.mjs          writes captures/recorded-sample.json
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'captures'); fs.mkdirSync(out, { recursive: true });
const WANT = { open_qa: 10, reddit_eli5: 10, wiki_csai: 5, finance: 5 };
const KIND = { open_qa: 'a fact question (WikiQA)', reddit_eli5: 'an "explain like I\'m five" question (Reddit)', wiki_csai: 'a computer science term (Wikipedia)', finance: 'a money question (FiQA)' };
// a small seeded generator, so that the same sample is drawn every time
let seed = 20221130;                                  // the day ChatGPT was released
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
// The corpus was saved with its accented letters garbled (UTF-8 read as Windows-1252). Put them back where that is certain.
const mend = s => { try { if (!/[ÃÂâ]/.test(s)) return s; const b = Buffer.from(s, 'latin1'); const t = new TextDecoder('utf-8', { fatal: true }).decode(b); return t; } catch { return s; } };
const sample = [];
for (const [config, n] of Object.entries(WANT)) {
  const total = (await (await fetch(`https://datasets-server.huggingface.co/rows?dataset=Hello-SimpleAI/HC3&config=${config}&split=train&offset=0&length=1`)).json()).num_rows_total;
  const seen = new Set(); let got = 0, tries = 0;
  while (got < n && tries++ < 400) {
    const at = Math.floor(rnd() * total); if (seen.has(at)) continue; seen.add(at);
    let j = null;
    for (let k = 0; k < 4 && !j; k++) { const r = await fetch(`https://datasets-server.huggingface.co/rows?dataset=Hello-SimpleAI/HC3&config=${config}&split=train&offset=${at}&length=1`); if (r.ok) j = await r.json(); else await new Promise(res => setTimeout(res, 1500 * (k + 1))); }
    const row = j && j.rows && j.rows[0] && j.rows[0].row; if (!row) continue;
    const q = mend((row.question || '').trim()), gpt = (row.chatgpt_answers || []).map(a => mend(a.trim())).filter(Boolean)[0], human = (row.human_answers || []).map(a => mend(a.trim())).filter(Boolean)[0];
    // keep questions that stand on their own and answers of a readable length
    if (!q || !gpt || !human || q.length < 12 || q.length > 320 || gpt.length < 80 || gpt.length > 3000) continue;
    sample.push({ id: `${config}-${row.id}`, config, kind: KIND[config], question: q, gpt35: gpt, human: human.slice(0, 3000) }); got++;
    console.log(`${config} #${at}: ${q.slice(0, 90)}`);
  }
}
fs.writeFileSync(path.join(out, 'recorded-sample.json'), JSON.stringify({ source: 'HC3 (Hello-SimpleAI/HC3), CC BY-SA 4.0, arXiv 2301.07597', drawn: new Date().toISOString().slice(0, 10), sample }, null, 1));
console.log(`\n${sample.length} questions written to captures/recorded-sample.json`);
