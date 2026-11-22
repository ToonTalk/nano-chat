// The coach with a real Claude key. This costs a few cents each time it runs.
// The key is read from the ANTHROPIC_API_KEY environment variable and stays in this Node process: the page is given a
// placeholder, and its requests to Claude are passed out to this script, which adds the real key and sends them.
// The key is never typed into the page and never printed.
//   node tools/test-coach-live.mjs            a single answer, then two answers compared
//   node tools/test-coach-live.mjs web        also one review with Claude's web search switched on
import { launch } from './nano-harness.mjs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
const root = path.resolve(import.meta.dirname, '..');
const shots = path.join(root, 'captures'); fs.mkdirSync(shots, { recursive: true });
let key = (process.env.ANTHROPIC_API_KEY || '').trim();
if (!key && process.platform === 'win32') key = (spawnSync('powershell', ['-NoProfile', '-Command', "[Environment]::GetEnvironmentVariable('ANTHROPIC_API_KEY','User')"], { encoding: 'utf8' }).stdout || '').trim();      // set with setx, not yet in this shell
if (!key) { console.log('No ANTHROPIC_API_KEY is set, so nothing was run.'); process.exit(2); }
const web = process.argv[2] === 'web';
const b = await launch({ root });
let pass = 0, fail = 0, calls = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + String(extra).replace(/\s+/g, ' ').slice(0, 400) : ''}`); };
const scrub = s => String(s).split(key).join('[key]');
// The page's calls to Claude come out here; the real key goes on, and the answer goes back in.
await b.send('Runtime.addBinding', { name: 'coachProxy' });
b.on('Runtime.bindingCalled', async p => {
  if (p.name !== 'coachProxy') return;
  const { id, url, headers, body } = JSON.parse(p.payload); let status = 0, text = '';
  try {
    if (!/^https:\/\/api\.anthropic\.com\//.test(url)) throw new Error('unexpected address');
    calls++;
    const r = await fetch(url, { method: 'POST', headers: { ...headers, 'x-api-key': key }, body });
    status = r.status; text = await r.text();
    try { const j = JSON.parse(text); console.log(`  [Claude answered ${status}; model ${j.model || '?'}; stop ${j.stop_reason || '?'}; tokens in ${j.usage ? j.usage.input_tokens : '?'}, out ${j.usage ? j.usage.output_tokens : '?'}${j.error ? '; error: ' + scrub(j.error.message) : ''}]`); } catch {}
  } catch (e) { text = JSON.stringify({ error: { message: scrub(e.message) } }); }
  await b.eval(`window.coachProxyDone(${id}, ${status}, ${JSON.stringify(text)})`).catch(() => {});
});
await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `
  (() => { const real = window.fetch, waiting = {}; let n = 0;
    window.coachProxyDone = (id, status, text) => { const w = waiting[id]; delete waiting[id]; if (w) status ? w.res(new Response(text, { status, headers: { 'content-type': 'application/json' } })) : w.rej(new TypeError('Failed to fetch')); };
    window.fetch = (url, init) => /^https:\\/\\/api\\.anthropic\\.com\\//.test(String(url)) ? new Promise((res, rej) => { const id = ++n; waiting[id] = { res, rej }; window.coachProxy(JSON.stringify({ id, url: String(url), headers: init.headers, body: init.body })); }) : real(url, init);
  })();` });
const coach = () => b.eval(`(() => { const c = NC.state.chat.turns.at(-1).coach; return c ? JSON.parse(JSON.stringify(c)) : null; })()`);
const show = c => console.log('  ' + JSON.stringify({ verdict: c.verdict, summary: c.summary, hint: c.hint, problems: c.problems, cause: c.cause, experiment: c.experiment, part: c.part, answers: c.answers, best: c.best, compare: c.compare, error: c.error, by: c.by }, null, 1).replace(/\n/g, '\n  '));
try {
  await b.goto('/index.html');
  await b.waitFor('window.NC && NC.engine.ready', { timeout: 180000 });
  await b.eval(`Object.assign(NC.settings.coach, { mode: 'ask', provider: 'anthropic', search: false, quiz: false, keys: { anthropic: 'the-real-key-is-kept-in-the-test' }, models: {} }); NC.setParts({ ...NC.defaultParts(true), calculator: false }); NC.newChat()`);
  const first = await b.eval(`(async () => { await NC.send('What is 17.5% of 83,946.20?'); return NC.state.chat.turns.at(-1).text; })()`);
  console.log('\n> What is 17.5% of 83,946.20?   (calculator off; the right answer is 14,690.585)\n  ' + first.replace(/\n/g, '\n  ').slice(0, 500));
  const right = /14,?690\.5/.test(first);
  await b.eval(`NC.startCoach(NC.state.chat, NC.state.chat.turns.at(-1))`);
  await b.waitFor(`(NC.state.chat.turns.at(-1).coach || {}).state !== 'loading'`, { timeout: 180000 });
  let c = await coach(); show(c);
  check('Claude reviewed the reply and the page could read its answer', c.state === 'done' && !!c.summary, c.error);
  check('its verdict matches whether the sum was right', right ? c.verdict === 'good' : c.verdict === 'wrong' || c.verdict === 'minor', `Nano was ${right ? 'right' : 'wrong'}; the coach said "${c.verdict}"`);
  if (!right) check('it points at the calculator as the part that would change things', c.part === 'calculator', c.part);
  if (!right) check('the words it quotes are found in the reply and marked', c.problems.length > 0 && (await b.eval(`document.querySelectorAll('.msg.bot:last-child mark.flaw').length`)) > 0, JSON.stringify(c.problems.map(p => p.quote)));
  await b.screenshot(path.join(shots, 'coach-live.png'));

  // two answers
  await b.eval(`(async () => { const t = NC.state.chat.turns.at(-1); await NC.rerun(t.id, { ...t.f, calculator: true }); })()`);
  console.log('\n  second try, calculator on: ' + (await b.eval(`NC.state.chat.turns.at(-1).variants[0].text`)).slice(0, 200));
  await b.eval(`NC.startCoach(NC.state.chat, NC.state.chat.turns.at(-1), true)`);
  await b.waitFor(`(NC.state.chat.turns.at(-1).coach || {}).state !== 'loading'`, { timeout: 180000 });
  c = await coach(); show(c);
  check('asked about two answers, Claude comments on both', c.state === 'done' && c.n === 2 && c.answers.length === 2 && c.answers.every(a => a.verdict && a.note), c.error || JSON.stringify(c.answers));
  check('it picks the calculator’s answer and says what made the difference', c.best === 2 && /calculator/i.test(c.compare), `best ${c.best}: ${c.compare}`);
  check('each card shows the coach’s comment', (await b.eval(`document.querySelectorAll('.msg.bot:last-child .card .cnote').length`)) === 2);
  await b.eval(`(document.querySelector('.msg.bot:last-child .coach details') || {}).open = true`);
  await b.screenshot(path.join(shots, 'coach-live-compare.png'), { h: 1100 });

  // the learner's own view of a reply, then a conversation with the coach about it
  await b.eval(`NC.setParts({ ...NC.defaultParts(true), calculator: false }); NC.newChat()`);
  const again = await b.eval(`(async () => { await NC.send('What is 17.5% of 83,946.20?'); return NC.state.chat.turns.at(-1).text; })()`);
  console.log('\n> What is 17.5% of 83,946.20?   (a new chat, calculator off)\n  ' + again.replace(/\n/g, '\n  ').slice(0, 300));
  await b.eval(`NC.startCoach(NC.state.chat, NC.state.chat.turns.at(-1))`);
  await b.waitFor(`(NC.state.chat.turns.at(-1).coach || {}).state !== 'loading'`, { timeout: 180000 });
  const talkTo = async words => { await b.eval(`(() => { const t = NC.state.chat.turns.at(-1); if (!t.coach.talk) { t.coach.guess = 'own'; t.coach.view = ${JSON.stringify(words)}; } NC.coachSay(NC.state.chat, t, ${JSON.stringify(words)}); })()`); await b.waitFor(`!NC.state.chat.turns.at(-1).coach.busy`, { timeout: 180000 }); const m = await b.eval(`NC.state.chat.turns.at(-1).coach.talk.at(-1)`); console.log(`\n  You: ${words}\n  Coach: ${m.text.replace(/\n/g, '\n  ')}`); return m; };
  let m = await talkTo('I think it is right, because Nano said it calculated it and the number looks about the right size.');
  check('the coach answers the learner’s own view in plain sentences', !m.failed && m.text.length > 40 && !/^\s*\{/.test(m.text), m.text);
  m = await talkTo('How could I check it myself without a calculator?');
  check('and carries on the conversation', !m.failed && m.text.length > 40 && (await b.eval(`NC.state.chat.turns.at(-1).coach.talk.length`)) === 4, m.text);
  await b.screenshot(path.join(shots, 'coach-live-talk.png'), { h: 1100 });

  if (web) {
    // searching through the same key: Claude searches and reports, Nano writes the answer
    await b.eval(`NC.settings.provider = 'ai'; NC.setParts(NC.defaultParts(true)); NC.newChat()`);
    const sr = await b.eval(`(async () => { await NC.send('How long is the Forth Bridge in Scotland, and when did it open?'); const t = NC.state.chat.turns.at(-1); return { text: t.text, steps: t.steps.map(s => s.label + (s.how ? ' / ' + s.how : '')), sources: t.sources.map(s => s.url), ev: (t.steps.find(s => s.tool === 'web_search') || {}).evidence || '' }; })()`);
    console.log('\n> How long is the Forth Bridge in Scotland, and when did it open?   (search through Claude)\n  ' + sr.steps.join('\n  ') + '\n  ' + sr.text.replace(/\n/g, '\n  ').slice(0, 400) + '\n  sources: ' + sr.sources.join(', ') + '\n  given to Nano: ' + sr.ev.replace(/\s+/g, ' ').slice(0, 500));
    check('search through Claude brings back pages, and Nano answers from them', /through Claude/.test(sr.steps.join(' ')) && sr.sources.length > 0 && /1890/.test(sr.text), sr.steps.join('; '));
    await b.eval(`NC.settings.provider = 'wikipedia'`);
    await b.eval(`NC.settings.coach.search = true; NC.setParts({ ...NC.defaultParts(true), search: false }); NC.newChat()`);
    const said = await b.eval(`(async () => { await NC.send('Who won the most recent men’s football World Cup, and in which year?'); return NC.state.chat.turns.at(-1).text; })()`);
    console.log('\n> Who won the most recent men’s football World Cup, and in which year?   (Nano’s web search off)\n  ' + said.replace(/\n/g, '\n  ').slice(0, 400));
    await b.eval(`NC.startCoach(NC.state.chat, NC.state.chat.turns.at(-1))`);
    await b.waitFor(`(NC.state.chat.turns.at(-1).coach || {}).state !== 'loading'`, { timeout: 240000 });
    c = await coach(); show(c);
    check('with web search on, Claude still returns a review the page can read', c.state === 'done' && !!c.summary && c.web === true, c.error);
  }
  check('no page errors', b.errors.length === 0, b.errors.join(' | '));
} catch (e) { fail++; console.log('FAIL  crashed: ' + scrub(e.stack || e)); console.log(scrub(b.log.slice(-8).join('\n'))); }
console.log(`\n${pass} passed, ${fail} failed; ${calls} request${calls === 1 ? '' : 's'} sent to Claude`);
await b.close();
process.exit(fail ? 1 : 0);
