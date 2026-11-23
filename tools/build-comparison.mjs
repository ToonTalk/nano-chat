// Builds older-models.html, the report that sets Gemini Nano beside GPT-2 (2019) and the first ChatGPT (2022),
// from what the recorded-*.mjs scripts left in captures/. The prose is in tools/comparison-text.mjs.
//   node tools/build-comparison.mjs
import path from 'node:path';
import fs from 'node:fs';
import { prose } from './comparison-text.mjs';
const root = path.resolve(import.meta.dirname, '..');
const shots = path.join(root, 'captures');
const read = f => JSON.parse(fs.readFileSync(path.join(shots, f), 'utf8'));
const { sample, source } = read('recorded-sample.json'), nano = read('recorded-nano.json'), gpt2 = read('recorded-gpt2.json'), judged = read('recorded-judged.json');
const WHO = ['gpt2', 'gpt2full', 'gpt35', 'bare', 'full'];
const NAME = { gpt2: 'GPT-2 small, bare', gpt2full: 'GPT-2 small, all parts on', gpt35: 'ChatGPT, as recorded', bare: 'Gemini Nano, bare', full: 'Gemini Nano, all parts on' };
const YEAR = { gpt2: '2019', gpt2full: '2019', gpt35: '2022', bare: '2026', full: '2026' };
const lines = t => t.replace(/\\r/g, '').replace(/\\n/g, '\n').replace(/\r/g, '');
const rec = (s, who) => who === 'gpt35' ? { text: lines(s.gpt35) } : who === 'gpt2' ? gpt2.answers[`${s.id}|bare`] : who === 'gpt2full' ? gpt2.answers[`${s.id}|full`] : nano.answers[`${s.id}|${who}`];
const answerOf = (s, who) => (rec(s, who) || {}).text || '';
const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// answers are shown as written, with only the commonest Markdown turned into formatting
const show = t => !t ? '<p class="none">(It wrote nothing.)</p>' : '<div class="ans">' + esc(t.length > 6000 ? t.slice(0, 6000) + '\n[… shortened here …]' : t)
  .replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>').replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').replace(/(^|[\s(])\*([^*\s][^*\n]*?)\*(?=[\s).,;:!?]|$)/gm, '$1<i>$2</i>')
  .replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/^(\s*)[*-]\s+/gm, '$1• ') + '</div>';
// One recording in the sample is not an answer at all but a copy of the ChatGPT screen. It is shown among the examples and left out of every count.
const broken = s => /Free Research Preview/.test(s.gpt35);
const V = sample.filter(s => judged.verdicts[s.id] && !broken(s)).map(s => ({ s, v: judged.verdicts[s.id] }));
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN, f = (x, d = 1) => Number.isNaN(x) ? '–' : x.toFixed(d);
const N = V.length;

// ── the numbers ──
const stat = {}; for (const w of WHO) stat[w] = {
  correct: mean(V.map(r => r.v.by[w].correct)), helpful: mean(V.map(r => r.v.by[w].helpful)), rank: mean(V.map(r => r.v.by[w].rank)),
  first: V.filter(r => r.v.by[w].rank === 1).length, last: V.filter(r => r.v.by[w].rank === 5).length,
  right: V.filter(r => r.v.by[w].correct >= 4).length, len: Math.round(mean(sample.map(s => answerOf(s, w).length))),
  secs: w === 'gpt35' ? NaN : mean(sample.map(s => (rec(s, w) || {}).s).filter(x => x != null)) };
const above = (a, b) => V.filter(r => r.v.by[a].rank < r.v.by[b].rank).length;
const kinds = [...new Set(sample.map(s => s.config))], KIND = { open_qa: 'Fact questions', reddit_eli5: '“Explain like I’m five”', wiki_csai: 'Computing terms', finance: 'Money questions' };
const usedTool = (s, who) => ((rec(s, who) || {}).steps || []).filter(x => x.status === 'ok').map(x => x.tool);
const toolCount = who => sample.filter(s => usedTool(s, who).length).length, searchCount = who => sample.filter(s => usedTool(s, who).includes('web_search')).length;
const nj = mode => { let g = 0, n = 0, same = 0, flip = 0, first = 0, calls = 0, agree = 0, both = 0;
  for (const s of sample) { const a = nano.nanoJudge[`${s.id}|${mode}|gpt-first`], b = nano.nanoJudge[`${s.id}|${mode}|nano-first`]; if (broken(s) || !a || !b || !a.pick || !b.pick) continue;
    for (const x of [a, b]) { calls++; if (x.better === 'A') first++; }
    if (a.pick !== b.pick) { flip++; continue; } a.pick === 'gpt35' ? g++ : a.pick === 'nano' ? n++ : same++;
    const v = judged.verdicts[s.id]; if (v && a.pick !== 'same') { both++; if ((v.by.gpt35.rank < v.by[mode].rank ? 'gpt35' : 'nano') === a.pick) agree++; } }
  return { g, n, same, flip, first, calls, agree, both }; };
const J = { bare: nj('bare'), full: nj('full') };
const numbers = { N, broken: sample.filter(broken).length, mean, V, rec, answerOf, usedTool, stat, above, J, toolCount, searchCount, tokens: judged.tokens, judge: judged.model === 'claude-sonnet-5-5' ? 'Claude Sonnet 5.5' : judged.model, gpt2, f, sample, kinds };

const scoreTable = `<div class="scroll"><table><tr><th>Who answered</th><th>From</th><th>Correct<br><small>1 to 5</small></th><th>Helpful<br><small>1 to 5</small></th><th>Mostly right<br><small>correct 4 or 5</small></th><th>Ranked best</th><th>Ranked last</th><th>Usual length</th></tr>` +
  WHO.map(w => `<tr><td>${NAME[w]}</td><td>${YEAR[w]}</td><td>${f(stat[w].correct)}</td><td>${f(stat[w].helpful)}</td><td>${stat[w].right} of ${N}</td><td>${stat[w].first}</td><td>${stat[w].last}</td><td>${stat[w].len.toLocaleString('en-US')} characters</td></tr>`).join('') + `</table></div>`;
const kindTable = `<div class="scroll"><table><tr><th>Kind of question</th>${WHO.map(w => `<th>${NAME[w]}</th>`).join('')}</tr>` +
  kinds.map(c => { const rows = V.filter(r => r.s.config === c); return `<tr><td>${KIND[c]} (${rows.length})</td>${WHO.map(w => `<td>${f(mean(rows.map(r => r.v.by[w].correct)))}</td>`).join('')}</tr>`; }).join('') + `</table></div>`;
const judgeTable = `<div class="scroll"><table><tr><th>Nano compared ChatGPT’s answer with…</th><th>Chose ChatGPT both times</th><th>Chose its own both times</th><th>Said “same” both times</th><th>Changed its mind with the order</th></tr>` +
  ['bare', 'full'].map(m => `<tr><td>its own bare answer</td><td>${J[m].g}</td><td>${J[m].n}</td><td>${J[m].same}</td><td>${J[m].flip}</td></tr>`.replace('its own bare answer', m === 'bare' ? 'its own bare answer' : 'its own answer with all parts on')).join('') + `</table></div>`;

// ── the examples ──
const SHORT = { gpt2: 'bare GPT-2', gpt2full: 'GPT-2 with all parts', gpt35: 'ChatGPT', bare: 'bare Nano', full: 'Nano with all parts' };
const named = (s, text) => { const o = judged.verdicts[s.id].order, who = l => SHORT[o['ABCDE'.indexOf(l)]];
  return String(text).replace(/\b([B-E])\b(?!')/g, (m, l) => who(l)).replace(/\bA\b(?=[,;.:]| and | or | is | are | was | gives | does | has | at | alone| correctly| actually| names | explains | answers | says | provides | also | misses | adds | covers )/g, () => who('A')).replace(/^(bare|Nano with)/, m => m[0].toUpperCase() + m.slice(1)); };
const chip = (s, w) => { const b = (judged.verdicts[s.id] || {}).by; if (!b) return ''; const x = b[w]; return `<span class="chip">correct ${x.correct} · helpful ${x.helpful} · ranked ${x.rank} of 5</span>`; };
const why = (s, w) => { const b = (judged.verdicts[s.id] || {}).by; return b && b[w].problems ? `<p class="why"><b>The judge:</b> ${esc(b[w].problems)}</p>` : ''; };
const facts = (s, w) => { const r = rec(s, w) || {}, t = usedTool(s, w), bits = []; if (r.byPage) bits.push('answered by the page itself'); if (t.length) bits.push('tools: ' + t.join(', ').replace(/_/g, ' ')); if ((r.sources || []).length) bits.push('read: ' + r.sources.slice(0, 3).map(esc).join('; ')); if (r.s != null) bits.push(`${r.s} seconds`); if (r.note) bits.push(esc(r.note)); if (r.error) bits.push('error: ' + esc(r.error)); return bits.length ? `<p class="facts">${bits.join(' · ')}</p>` : ''; };
const block = (s, w) => `<h4>${NAME[w]} <small>(${YEAR[w]})</small> ${chip(s, w)}</h4>${facts(s, w)}${show(answerOf(s, w))}${why(s, w)}`;
const q = s => esc(s.question.length > 150 ? s.question.slice(0, 150) + '…' : s.question);
const gpt2Examples = sample.map((s, i) => `<details class="ex"><summary><span class="n">${i + 1}</span> ${q(s)} ${(judged.verdicts[s.id] ? `<span class="chip">${judged.verdicts[s.id].by.gpt2.correct} · ${judged.verdicts[s.id].by.gpt2full.correct}</span>` : '')}</summary>
<p class="qfull"><b>The question</b> (${esc(s.kind)}): ${esc(s.question)}</p>${block(s, 'gpt2')}${block(s, 'gpt2full')}</details>`).join('\n');
const nanoSays = s => { const out = []; for (const m of ['bare', 'full']) { const a = nano.nanoJudge[`${s.id}|${m}|gpt-first`], b = nano.nanoJudge[`${s.id}|${m}|nano-first`]; if (!a || !b) continue; const lab = m === 'bare' ? 'its bare answer' : 'its answer with all parts';
  const say = p => p === 'gpt35' ? 'ChatGPT’s' : p === 'nano' ? 'its own' : p === 'same' ? '“the same”' : 'nothing usable';
  out.push(a.pick === b.pick ? `Against ${lab}, Nano chose ${say(a.pick)} in both orders${a.why ? ` (“${esc(a.why)}”)` : ''}.` : `Against ${lab}, Nano chose ${say(a.pick)} when ChatGPT’s came first and ${say(b.pick)} when its own came first.`); }
  return out.length ? `<p class="why"><b>Nano as judge:</b> ${out.join(' ')}</p>` : ''; };
const chatExamples = sample.map((s, i) => { const v = judged.verdicts[s.id]; return `<details class="ex"><summary><span class="n">${i + 1}</span> ${q(s)} ${v ? `<span class="chip">${v.by.gpt35.correct} · ${v.by.bare.correct} · ${v.by.full.correct}</span>` : ''}</summary>
<p class="qfull"><b>The question</b> (${esc(s.kind)}): ${esc(s.question)}</p>${broken(s) ? '<p class="note">This recording is broken: the data set holds a copy of the ChatGPT screen where the answer should be. The question is left out of every count in this report.</p>' : ''}${v && v.note ? `<p class="why"><b>What separated the answers, said the judge:</b> ${esc(named(s, v.note))}</p>` : ''}
${block(s, 'gpt35')}${block(s, 'bare')}${block(s, 'full')}${nanoSays(s)}
<details class="human"><summary>The person’s answer in the data set, which the judge could consult</summary>${show(lines(s.human))}</details></details>`; }).join('\n');

const P = prose(numbers, { scoreTable, kindTable, judgeTable, NAME });
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nano beside older models</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='12' fill='%230f766e'/%3E%3Cpath fill='none' stroke='%23fff' stroke-width='5' stroke-linecap='round' d='M12 46h10M27 46h10M42 46h10'/%3E%3Ccircle cx='17' cy='40' r='4' fill='%23fff' opacity='.55'/%3E%3Ccircle cx='32' cy='30' r='6' fill='%23fff' opacity='.8'/%3E%3Ccircle cx='47' cy='20' r='8' fill='%23fff'/%3E%3C/svg%3E">
<style>
:root { --bg: #f7f6f3; --panel: #ffffff; --ink: #1f2328; --muted: #6b7280; --line: #dedbd3; --accent: #0f766e; --soft: #d9efec; --code: #f1efea; }
@media (prefers-color-scheme: dark) { :root { --bg: #17191c; --panel: #1f2226; --ink: #e7e9ec; --muted: #9aa3ad; --line: #32363c; --accent: #2dd4bf; --soft: #143b37; --code: #262a2f; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 17px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
nav { display: flex; flex-wrap: wrap; gap: 6px 18px; align-items: center; padding: 12px 20px; border-bottom: 1px solid var(--line); font-size: 15px; }
nav a { color: var(--muted); text-decoration: none; } nav a:hover, nav a.here { color: var(--ink); } nav .brand { font-weight: 650; color: var(--ink); margin-right: auto; }
main { max-width: 760px; margin: 0 auto; padding: 28px 20px 60px; }
h1 { font-size: 32px; line-height: 1.2; margin: 0 0 8px; } h2 { font-size: 22px; margin: 38px 0 8px; } h3 { font-size: 18px; margin: 26px 0 6px; }
h4 { font-size: 16px; margin: 18px 0 4px; } h4 small { color: var(--muted); font-weight: 400; }
.lead { font-size: 19px; color: var(--muted); margin: 0 0 22px; }
a { color: var(--accent); } img { max-width: 100%; border: 1px solid var(--line); border-radius: 12px; display: block; margin: 14px 0; }
code { background: var(--code); border-radius: 6px; padding: .1em .4em; font: .92em ui-monospace, Consolas, monospace; }
blockquote { margin: 14px 0; padding: 2px 16px; border-left: 3px solid var(--accent); color: var(--muted); }
.note { background: var(--soft); border-radius: 12px; padding: 10px 16px; margin: 16px 0; }
table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 15.5px; } th, td { border: 1px solid var(--line); padding: 7px 10px; text-align: left; vertical-align: top; } th { background: var(--panel); } th small { font-weight: 400; color: var(--muted); }
.scroll { overflow-x: auto; }
ol, ul { padding-left: 1.4em; } li { margin: 5px 0; }
details.ex { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; margin: 8px 0; padding: 0 14px; }
details.ex > summary { cursor: pointer; padding: 10px 0; list-style-position: outside; }
details.ex[open] { padding-bottom: 12px; } details.ex[open] > summary { border-bottom: 1px solid var(--line); margin-bottom: 8px; }
.n { display: inline-block; min-width: 1.9em; color: var(--muted); font-variant-numeric: tabular-nums; }
.chip { display: inline-block; font-size: 13px; color: var(--muted); background: var(--code); border-radius: 999px; padding: 1px 9px; margin-left: 4px; white-space: nowrap; font-weight: 400; }
.ans { white-space: pre-wrap; overflow-wrap: anywhere; border-left: 3px solid var(--line); padding: 2px 0 2px 12px; margin: 6px 0; font-size: 16px; }
.none, .facts { color: var(--muted); font-size: 14.5px; margin: 2px 0; } .why { font-size: 15px; color: var(--muted); margin: 6px 0; } .qfull { margin: 8px 0; }
details.human { margin-top: 10px; font-size: 15px; } details.human summary { cursor: pointer; color: var(--muted); }
footer { color: var(--muted); font-size: 14px; margin-top: 44px; border-top: 1px solid var(--line); padding-top: 14px; }
</style>
</head>
<body>
<nav><a class="brand" href="./">Nano Chat</a><a href="student-guide.html">For students</a><a href="teacher-guide.html">For teachers</a><a href="making-of.html">How it was made</a><a class="here" href="older-models.html">Older models</a><a href="https://github.com/ToonTalk/nano-chat">Code</a></nav>
<main>
${P.top}
<h2 id="gpt2-examples">Thirty examples: GPT-2</h2>
${P.gpt2Intro}
${gpt2Examples}
<h2 id="chatgpt-examples">Thirty examples: the first ChatGPT beside Nano</h2>
${P.chatIntro}
${chatExamples}
${P.end}
</main>
</body>
</html>
`;
fs.writeFileSync(path.join(root, 'older-models.html'), html);
console.log(`older-models.html written: ${(html.length / 1024).toFixed(0)} KB, ${N} judged questions.`);
console.log(JSON.stringify({ stat, J, tools: { nano: toolCount('full'), nanoSearch: searchCount('full'), gpt2: toolCount('gpt2full') }, above: { 'gpt35>bare': above('gpt35', 'bare'), 'gpt35>full': above('gpt35', 'full'), 'full>bare': above('full', 'bare'), 'bare>gpt2': above('bare', 'gpt2'), 'gpt2full>gpt2': above('gpt2full', 'gpt2') } }, null, 1));
