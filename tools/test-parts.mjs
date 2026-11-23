// The switches, second tries, the build-it-up start, Nano's second look and the coach, against the real Gemini Nano.
//   node tools/test-parts.mjs            everything
//   node tools/test-parts.mjs memory     only the memory parts
//   node tools/test-parts.mjs coach      only the coach (its three services are faked, except one check that they can be reached)
import { launch } from './nano-harness.mjs';
import path from 'node:path';
import fs from 'node:fs';
const root = path.resolve(import.meta.dirname, '..');
const shots = path.join(root, 'captures'); fs.mkdirSync(shots, { recursive: true });
const only = process.argv[2] || 'all';
const b = await launch({ root });
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + String(extra).replace(/\s+/g, ' ').slice(0, 300) : ''}`); };
const J = v => JSON.stringify(v);
const turn = `(t => ({ text: t.text, error: t.error || null, f: t.f, note: t.note || '', check: t.check || null, steps: (t.steps || []).map(s => ({ tool: s.tool, input: s.input, status: s.status, label: s.label })), sources: (t.sources || []).length,
  variants: (t.variants || []).map(v => ({ text: v.text, f: v.f, error: v.error || null, steps: (v.steps || []).map(s => ({ tool: s.tool, status: s.status, label: s.label })), check: v.check || null })) }))`;
const ask = async text => {
  const t0 = Date.now(), r = await b.eval(`(async () => { await NC.send(${J(text)}); return ${turn}(NC.state.chat.turns.at(-1)); })()`);
  console.log(`\n> ${text}\n  [${((Date.now() - t0) / 1000).toFixed(1)}s; ${r.steps.map(s => s.tool + (s.status === 'ok' ? '' : ' FAILED')).join(', ') || 'no tools'}]\n  ${r.text.replace(/\n/g, '\n  ').slice(0, 600)}${r.error ? '\n  ERROR ' + r.error : ''}`);
  return r;
};
const again = async (parts, times = 1) => {
  const t0 = Date.now(), r = await b.eval(`(async () => { const t = NC.state.chat.turns.at(-1); await NC.rerun(t.id, ${J(parts)} === null ? t.f : { ...t.f, ...${J(parts)} }, ${times}); return ${turn}(t); })()`);
  for (const v of r.variants.slice(-times)) console.log(`  ↻ try [${((Date.now() - t0) / 1000).toFixed(1)}s; ${v.steps.map(s => s.tool + (s.status === 'ok' ? '' : ' FAILED')).join(', ') || 'no tools'}]\n    ${v.text.replace(/\n/g, '\n    ').slice(0, 600)}${v.error ? '\n    ERROR ' + v.error : ''}`);
  return r;
};
const nudge = () => b.eval(`(() => { const c = NC.state.chat, n = NC.nudgeFor(c, c.turns.length - 1); return n ? n.k : ''; })()`);
const used = (r, tool) => r.steps.some(s => s.tool === tool && s.status === 'ok');
const fresh = () => b.eval(`NC.newChat()`);
let r;
try {
  if (only === 'all') {
    // ── the bare start ──
    await b.goto('/index.html?start=bare');
    await b.waitFor('window.NC && NC.engine.ready', { timeout: 180000 });
    check('?start=bare switches every part off', await b.eval(`NC.FEATURES.every(f => !NC.settings.features[f.k])`));
    check('and leaves the address clean', !(await b.eval('location.search')).includes('start'), await b.eval('location.href'));
    check('bare Nano is told nothing', (await b.eval(`NC.systemPrompt(NC.state.chat)`)) === '');
    check('the welcome page says so and offers things to try', await b.eval(`/bare Gemini Nano/.test(document.querySelector('.welcome').textContent) && document.querySelectorAll('.tries button').length === 4`), await b.eval(`document.querySelector('.welcome').textContent`));
    check('the header shows 0 of 14', (await b.eval(`document.querySelector('#partsCount').textContent`)) === '0/14');
    await b.screenshot(path.join(shots, 'bare.png'));

    r = await ask('Who are you, and where are you running?');
    check('bare: answers with no tools and no instructions', r.steps.length === 0 && r.text.length > 0 && !/\bNano\b/.test(r.text), r.text);
    check('bare: the page points at the missing part', (await nudge()) === 'instructions', await nudge());
    r = await again({ instructions: true });
    check('second try with Instructions on knows its name', r.variants.length === 1 && /\bNano\b/.test(r.variants[0].text), r.variants[0] && r.variants[0].text);
    check('the two answers are shown side by side', await b.eval(`document.querySelectorAll('.cmp .card').length === 2 && /Instructions on/.test(document.querySelector('.cmp').textContent)`), await b.eval(`[...document.querySelectorAll('.cap')].map(c => c.textContent).join(' | ')`));

    await fresh();
    r = await ask('What is 17.5% of 83,946.20?');
    check('bare: no calculator is used', r.steps.length === 0);
    console.log('  (the right answer is 14,690.585; bare Nano ' + (/14,?690.5/.test(r.text) ? 'got it right this time' : 'got it wrong') + ')');
    check('bare: the page points at the calculator', (await nudge()) === 'calculator', await nudge());
    r = await again({ calculator: true, nudges: true });
    check('second try with the calculator is right', /14,?690.5/.test(r.variants[0].text), r.variants[0].text);
    await b.screenshot(path.join(shots, 'compare.png'));

    await fresh();
    r = await ask('What is the date today?');
    const today = new Date(), day = String(today.getDate()), month = today.toLocaleDateString('en-US', { month: 'long' }), year = String(today.getFullYear());
    console.log('  (bare Nano ' + (r.text.includes(year) && r.text.includes(month) && new RegExp(`\\b${day}\\b`).test(r.text) ? 'somehow got the date' : 'does not know the date') + ')');
    check('bare: the page points at the date part', (await nudge()) === 'date', await nudge());
    r = await again({ date: true });
    check('second try with the date part gives today’s date', r.variants[0].text.includes(year) && r.variants[0].text.includes(month) && new RegExp(`\\b${day}(st|nd|rd|th)?\\b`).test(r.variants[0].text), r.variants[0].text);

    await fresh();
    r = await ask('How long is the Forth Bridge in Scotland, and when did it open?');
    check('bare: no search is made', r.steps.length === 0);
    check('bare: the page points at web search', (await nudge()) === 'search', await nudge());
    r = await again({ search: true });
    check('second try with search cites a source', r.variants[0].steps.some(s => s.tool === 'web_search' && s.status === 'ok') && /1890/.test(r.variants[0].text), r.variants[0].text);

    await fresh();
    r = await ask('What is this page about? https://en.wikipedia.org/?curid=376094');
    check('bare: the link is not read', r.steps.length === 0);
    check('bare: the page points at reading links', (await nudge()) === 'links', await nudge());
    r = await again({ links: true });
    check('second try reads the link', r.variants[0].steps.some(s => s.tool === 'read_page' && s.status === 'ok') && /aglet|shoelace|lace/i.test(r.variants[0].text), r.variants[0].text + ' / ' + r.variants[0].steps.map(s => s.label).join('; '));

    await fresh();
    r = await ask('Remember that my bike lock code is 4821');
    check('bare: nothing is saved', r.steps.length === 0 && (await b.eval('NC.notes.length')) === 0);
    check('bare: the page points at notes', (await nudge()) === 'notes', await nudge());
    r = await again({ notes: true });
    check('a second try does not really save a note', (await b.eval('NC.notes.length')) === 0 && r.variants[0].steps.some(s => s.tool === 'save_note' && /Would save/.test(s.label)), r.variants[0].steps.map(s => s.label).join('; '));

    await fresh();
    r = await ask('Make a small table of three planets and how many moons each has.');
    check('formatting off shows the raw characters', await b.eval(`!!document.querySelector('.msg.bot:last-child .body.raw') && !document.querySelector('.msg.bot:last-child table')`));
    const nk = await nudge();
    check('the page offers to switch formatting on', nk === 'markdown' || !/\|/.test(r.text), nk);
    await b.eval(`NC.setPart('markdown', true)`);
    check('formatting on draws it', await b.eval(`!document.querySelector('.msg.bot:last-child .body.raw') && (!/\\|.*\\|/.test(NC.state.chat.turns.at(-1).text) || !!document.querySelector('.msg.bot:last-child table'))`));

    // ── everything on, then take parts away ──
    await b.eval(`NC.setParts(NC.defaultParts(true))`);
    await fresh();
    check('everything on: the header shows 14 of 14', (await b.eval(`document.querySelector('#partsCount').textContent`)) === '14/14');
    r = await ask('What is an 18% tip on a $64.50 bill?');
    check('everything on: the calculator is used', used(r, 'calculator') && /11\.61/.test(r.text), r.text);
    check('nothing to point at when all parts are on', (await nudge()) === '');
    r = await again(null, 2);
    check('“run again” twice gives two more answers with the same parts', r.variants.length === 2 && r.variants.every(v => v.text && !v.error) && await b.eval(`document.querySelectorAll('.cmp .card').length === 3 && /same parts/.test(document.querySelector('.cmp').textContent)`), r.variants.map(v => v.text).join(' | '));
    r = await again({ calculator: false });
    check('a try without the calculator uses none', r.variants.length === 3 && !r.variants[2].steps.some(s => s.tool === 'calculator'), r.variants[2].text);
    check('second tries leave the conversation alone', (await b.eval('NC.state.chat.turns.length')) === 2);
    r = await ask('And 20% of the same bill?');
    check('the chat carries on after second tries', used(r, 'calculator') && /12\.9/.test(r.text), r.text);

    // ── Nano's second look ──
    await b.eval(`NC.setPart('selfcheck', true)`);
    await fresh();
    r = await ask('What is the capital of Australia?');
    check('second look: Nano reviews its own answer', !!r.check && typeof r.check.ok === 'boolean', J(r.check));
    check('second look is shown under the reply', await b.eval(`/second look/.test(document.querySelector('.msg.bot:last-child .check').textContent)`));
    await b.eval(`NC.setPart('selfcheck', false)`);

  }
  if (only === 'all' || only === 'memory') {
    // ── memory with and without the contents list (in a pretend-small memory) ──
    if (only === 'memory') { await b.goto('/index.html'); await b.waitFor('window.NC && NC.engine.ready', { timeout: 180000 }); }
    await b.eval(`NC.settings.smallWindow = true; NC.setParts({ ...NC.defaultParts(true), contents: false, recall: false, search: false })`);
    await fresh();
    check('the small-memory switch shrinks the window', (await b.eval('NC.engine.W')) === 1500);
    await ask('I am planning a trip to Lisbon in May with my friend Priya. We will stay at a guesthouse called Casa do Fado. Please give me a packing list of about fifteen items.');
    await ask('Tell me in about 150 words what the Alfama district of Lisbon is like.');
    await ask('Now something different: explain in about 150 words how a sailing boat can sail against the wind.');
    await ask('And in about 150 words, why is the sky blue?');
    await ask('One more: about 150 words on how bees make honey.');
    await ask('About 150 words on how volcanoes form.');
    await ask('And about 150 words on how rainbows form.');
    const mem = await b.eval(`({ from: NC.viewFrom(NC.state.chat), segs: NC.state.chat.segments.length, divider: [...document.querySelectorAll('.divider')].map(d => d.textContent).join(' | ') })`);
    check('contents list off: old messages fall out of view, with no summary', mem.from > 0 && mem.segs === 0, J(mem));
    check('the thread marks where Nano’s view now starts', /no longer sees/.test(mem.divider), mem.divider);
    r = await ask('What was the name of the guesthouse I said we would stay at earlier?');
    console.log('  (without contents or looking back, Nano ' + (/Casa do Fado/i.test(r.text) ? 'still knew' : 'did not know') + ' the guesthouse)');
    check('with the first message out of view and no memory parts, Nano no longer knows it', !/Casa do Fado/i.test(r.text), r.text);
    check('the page points at a memory part', ['contents', 'recall'].includes(await nudge()), await nudge());
    r = await again({ recall: true });
    check('a second try with looking back finds it by keywords', r.variants[0].steps.some(s => s.tool === 'recall') && /Casa do Fado/i.test(r.variants[0].text), r.variants[0].text + ' / ' + r.variants[0].steps.map(s => s.label).join('; '));
    await b.eval(`NC.setPart('contents', true)`);
    await ask('Thanks. Now about 150 words on why the sea is salty.');
    const mem2 = await b.eval(`({ from: NC.viewFrom(NC.state.chat), segs: NC.state.chat.segments.map(s => s.title), up: NC.state.chat.compactedUpTo })`);
    check('contents list back on: the fallen-out messages get summarized after all', mem2.segs.length > 0 && mem2.up > 0, J(mem2));
    await b.eval(`NC.settings.smallWindow = false; NC.setParts(NC.defaultParts(true))`);

  }
  if (only === 'all') {
    // ── the switch panel ──
    await fresh();
    await b.eval(`NC.showParts()`);
    check('the panel lists every part with a switch', (await b.eval(`document.querySelectorAll('#dlg .part input').length`)) === 16, await b.eval(`document.querySelectorAll('#dlg .part input').length`));
    await b.screenshot(path.join(shots, 'parts.png'), { h: 1400 });
    await b.eval(`document.querySelector('#dlg .part input').click()`);
    check('a switch in the panel takes effect at once', await b.eval(`NC.settings.features.instructions === false && document.querySelector('#partsCount').textContent === '13/14' && /under construction/.test(document.querySelector('.welcome').textContent)`));
    await b.eval(`document.querySelector('#dlg').close(); NC.setParts(NC.defaultParts(true))`);
    await b.goto('/index.html');
    await b.waitFor('window.NC && NC.engine.ready', { timeout: 180000 });
    check('switches survive a reload', (await b.eval(`document.querySelector('#partsCount').textContent`)) === '14/14' && await b.eval(`NC.state.chats.some(c => c.turns.some(t => (t.variants || []).length))`));
  }

  // ── the coach ──
  if (only === 'coach') { await b.goto('/index.html'); await b.waitFor('window.NC && NC.engine.ready', { timeout: 180000 }); }
  if (only === 'all' || only === 'coach') {
  await b.eval(`NC.setParts({ ...NC.defaultParts(true), calculator: false })`);
  await fresh();
  check('no coach button without a key', await (async () => { await ask('What is 4,387 × 291?'); return b.eval(`![...document.querySelectorAll('.tool')].some(x => /coach/i.test(x.textContent))`); })());
  // Can each service be reached from a page at all, with the headers this page sends? A made-up key must come back as "not accepted".
  for (const p of ['anthropic', 'gemini', 'openai']) for (const web of p === 'openai' ? [false, true] : [false]) {
    const msg = await b.eval(`(async () => { Object.assign(NC.settings.coach, { mode: 'ask', provider: ${J(p)}, search: ${web}, keys: { ${p}: 'made-up-key-for-a-reachability-check' } }); try { await NC.askCoach('Reply with JSON.', 'Say {"ok":true}'); return 'answered?!'; } catch (e) { return e.message; } })()`);
    check(`${p}${web ? ' (web search route)' : ''} can be reached from the page and refuses a made-up key`, /key was not accepted/.test(msg), msg);
  }
  { const msg = await b.eval(`(async () => { Object.assign(NC.settings.coach, { mode: 'ask', provider: 'other', url: 'https://openrouter.ai/api/v1', search: false, keys: { other: 'made-up-key-for-a-reachability-check' }, models: { other: 'openrouter/auto' } }); try { await NC.askCoach('Reply with JSON.', 'Say {"ok":true}'); return 'answered?!'; } catch (e) { return e.message; } })()`);
    check('an “Other” service (OpenRouter) can be reached from the page and refuses a made-up key', /key was not accepted/.test(msg), msg); }
  // From here the three services are faked, so that the page's side can be checked without a real key.
  await b.eval(`(() => {
    const real = window.fetch; window.coachCalls = [];
    const verdict = { verdict: 'wrong', summary: 'The multiplication is not right.', hint: 'Check the sum with a real calculator.', problems: [{ quote: '__QUOTE__', why: 'This number is not 4,387 × 291.' }], cause: 'The calculator part was off, so the model did the sum in its head.', experiment: 'Switch the calculator on and ask again.', part: 'calculator' };
    window.fetch = async (url, init) => {
      url = String(url);
      if (!/anthropic\\.com|googleapis\\.com|openai\\.com|example\\.test/.test(url)) return real(url, init);
      const body = JSON.parse(init.body), headers = init.headers; window.coachCalls.push({ url, headers, body });
      if (window.coachFail) return new Response(JSON.stringify({ error: { message: 'invalid x-api-key' } }), { status: 401 });
      if (window.coachSlow) await new Promise(r => setTimeout(r, window.coachSlow));
      const kind = /web search tool/.test(init.body) ? 'search' : /talking with you/.test(init.body) ? 'talk' : 'review';
      const reply = NC.state.chat.turns.at(-1).text, quote = (reply.match(/[\\d,]{5,}/) || [reply.slice(0, 12)])[0];
      const text = 'Here is my review.\\n\`\`\`json\\n' + JSON.stringify(window.coachGood ? { verdict: 'good', summary: 'This is right.', hint: '', problems: [], cause: 'The calculator did the sum.', experiment: 'Try a harder one.', part: '' } : (/ANSWER 2/.test(init.body) ? { ...verdict, problems: [{ n: 1, quote: '__QUOTE__', why: 'This number is not 4,387 × 291.' }], answers: [{ n: 1, verdict: 'wrong', note: 'The sum is wrong.' }, { n: 2, verdict: 'good', note: 'The calculator got it right.' }], best: 2, compare: 'The calculator made the difference.' } : verdict)).replace('__QUOTE__', quote) + '\\n\`\`\`';
      const json = /anthropic/.test(url) ? { stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text }] }
        : /googleapis/.test(url) ? { candidates: [{ content: { parts: [{ text: 'thinking…', thought: true }, { text }] } }] }
        : /responses$/.test(url) ? { output: [{ type: 'web_search_call' }, { type: 'message', content: [{ type: 'output_text', text }] }] }
        : { choices: [{ message: { content: text } }] };
      if (kind !== 'review') { const t = kind === 'talk' ? 'You are right that the number is off. What would a calculator say?' : JSON.stringify({ results: [{ title: 'Forth Bridge', url: 'https://example.org/forth-bridge', text: 'The Forth Bridge is a railway bridge in Scotland. It is 2,467 metres long and was opened on 4 March 1890.' }] }); return new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: t }] }), { status: 200, headers: { 'content-type': 'application/json' } }); }
      return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
    };
  })()`);
  const coachState = () => b.eval(`(() => { const t = NC.state.chat.turns.at(-1), n = document.querySelector('.msg.bot:last-child .coach'); return { c: t.coach || null, text: n ? n.textContent : '', marks: [...document.querySelectorAll('.msg.bot:last-child mark.flaw')].map(m => m.textContent), buttons: n ? [...n.querySelectorAll('button')].map(x => x.textContent) : [] }; })()`);
  const click = label => b.eval(`(() => { const x = [...document.querySelectorAll('.msg.bot:last-child button')].find(x => x.textContent.includes(${J(label)})); if (x) x.click(); return !!x; })()`);
  await b.eval(`Object.assign(NC.settings.coach, { mode: 'ask', provider: 'anthropic', search: false, quiz: true, keys: { anthropic: 'k', gemini: 'k', openai: 'k' }, models: {} }); NC.ui.thread()`);
  check('with a key, each reply offers “Ask the coach”', await click('Ask the coach'));
  let s = await coachState();
  check('the coach first asks what the learner thinks', /what do you think/i.test(s.text) && s.buttons.length === 4 && !/multiplication/.test(s.text), s.text);
  await click('Looks right');
  await b.waitFor(`NC.state.chat.turns.at(-1).coach.state === 'done'`, { timeout: 15000 });
  s = await coachState();
  check('after “Looks right” on a flawed reply it gives a hint, not the answer', /not so sure/.test(s.text) && /real calculator/.test(s.text) && !/not right/.test(s.text) && s.marks.length === 0, s.text);
  await click('Show what the coach found');
  s = await coachState();
  check('then it shows its verdict, the cause and what to try', /Has a problem/.test(s.text) && /multiplication is not right/.test(s.text) && /in its head/.test(s.text) && /Try again with Calculator on/.test(s.text), s.text);
  check('and marks the words it quoted in the reply', s.marks.length === 1, J(s.marks));
  const call = await b.eval(`window.coachCalls.at(-1)`);
  check('Claude is called as the API expects', call.url === 'https://api.anthropic.com/v1/messages' && call.headers['x-api-key'] === 'k' && call.headers['anthropic-version'] === '2026-10-21' && call.headers['anthropic-dangerous-direct-browser-access'] === 'true' && call.headers['anthropic-beta'] === 'server-side-fallback-2026-07-01'
    && call.body.model === 'claude-sonnet-5-5' && call.body.fallbacks === 'default' && call.body.max_tokens === 16000 && !call.body.tools && !('temperature' in call.body) && typeof call.body.system === 'string' && call.body.messages.length === 1, J({ ...call, body: { ...call.body, system: '…', messages: '…' } }));
  const sent = call.body.messages[0].content;
  check('the coach is sent the message, the reply and which parts were on', /4,387 × 291/.test(sent) && /calculator: Calculator: OFF/.test(sent) && /instructions: Instructions: ON/.test(sent) && /NANO'S REPLY/.test(sent) && /answered from its own memory/.test(sent), sent.slice(0, 400));
  await b.screenshot(path.join(shots, 'coach.png'));
  await b.eval(`document.querySelector('.msg.bot:last-child .coach details').open = true`);
  await click('Try again with Calculator on');
  await b.waitFor(`!NC.state.busy && (NC.state.chat.turns.at(-1).variants || []).length === 1`, { timeout: 60000 });
  check('the coach’s suggestion runs as a second try', /1,?276,?617/.test(await b.eval(`NC.state.chat.turns.at(-1).variants[0].text`)), await b.eval(`NC.state.chat.turns.at(-1).variants[0].text`));
  await b.screenshot(path.join(shots, 'coach-compare.png'), { h: 1000 });
  // several answers: the coach is asked again, and judges them all
  s = await coachState();
  check('after a second try, the coach says it has not seen it and offers to look at both', /has not seen the newest try/.test(s.text) && s.buttons.some(x => /all 2 answers/.test(x)), s.text);
  await click('Ask the coach about all 2 answers');
  s = await coachState();
  check('with several answers it first asks which one is best', /which answer do you think is best/.test(s.text) && s.buttons.join('|') === 'The first answer|Try 2|Not sure|I’ll say what I think…', s.buttons.join('|'));
  await click('Try 2');
  await b.waitFor(`NC.state.chat.turns.at(-1).coach.state === 'done'`, { timeout: 15000 });
  s = await coachState();
  const cnotes = await b.eval(`[...document.querySelectorAll('.msg.bot:last-child .card')].map(c => (c.querySelector('.cnote') || {}).textContent || '')`);
  check('the coach comments on every answer, inside its card', cnotes.length === 2 && /Has a problem.*sum is wrong/.test(cnotes[0]) && /Looks good.*coach’s pick.*calculator got it right/.test(cnotes[1]), J(cnotes));
  check('and says what the difference shows, and whether the learner picked the best', /You picked Try 2, and the coach agrees/.test(s.text) && /calculator made the difference/.test(s.text), s.text);
  const sent2 = (await b.eval(`window.coachCalls.at(-1)`)).body.messages[0].content;
  check('it is sent all the answers, with what was different about each', /RAN THIS MESSAGE 2 TIMES/.test(sent2) && /ANSWER 1: the first answer \(off: Calculator\)/.test(sent2) && /ANSWER 2: a later try \(Calculator on/.test(sent2) && /1,276,617/.test(sent2), sent2.slice(sent2.indexOf('THE LEARNER RAN'), sent2.indexOf('THE LEARNER RAN') + 300));
  check('quoted words are marked in the answer they came from', s.marks.length === 1 && await b.eval(`!!document.querySelector('.msg.bot:last-child .card:first-child mark.flaw') && !document.querySelector('.msg.bot:last-child .card:nth-child(2) mark.flaw')`), J(s.marks));
  await b.screenshot(path.join(shots, 'coach-compare.png'), { h: 1000 });
  // Nano itself remembers only one answer per message; a try can take its place
  const was = await b.eval(`(() => { const t = NC.state.chat.turns.at(-1); return { first: t.text, tried: t.variants[0].text }; })()`);
  await click('Continue the chat from this answer');
  const kept = await b.eval(`(() => { const t = NC.state.chat.turns.at(-1); return { text: t.text, other: t.variants[0].text, coach: !!t.coach, f: t.f.calculator, vf: t.variants[0].f.calculator, dirty: NC.engine.dirty }; })()`);
  check('“Continue the chat from this answer” swaps the try into the conversation', kept.text === was.tried && kept.other === was.first && !kept.coach && kept.f === true && kept.vf === false && kept.dirty === true, J(kept));
  await b.eval(`NC.setPart('search', false)`);
  r = await ask('What number did you just give me as the answer? Reply with just the number.');
  check('and Nano then remembers that answer, not the first one', /1,?276,?617/.test(r.text), r.text);

  // every reply, each service, the web-search routes
  for (const [p, web] of [['anthropic', true], ['gemini', false], ['gemini', true], ['openai', false], ['openai', true]]) {
    await b.eval(`Object.assign(NC.settings.coach, { mode: 'every', provider: ${J(p)}, search: ${web}, quiz: false }); window.coachGood = false; NC.setParts({ ...NC.defaultParts(true), calculator: false })`);
    await fresh();
    await ask('What is 5,219 × 388?');
    await b.waitFor(`(NC.state.chat.turns.at(-1).coach || {}).state === 'done'`, { timeout: 15000 });
    s = await coachState(); const c = await b.eval(`window.coachCalls.at(-1)`);
    const shape = p === 'anthropic' ? c.body.tools && c.body.tools[0].type === 'web_search_20260209' && c.body.tools[0].name === 'web_search'
      : p === 'gemini' ? /generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-3\.8-flash:generateContent$/.test(c.url) && c.headers['x-goog-api-key'] === 'k' && !!c.body.systemInstruction && (web ? c.body.tools[0].google_search && !c.body.generationConfig.responseMimeType : c.body.generationConfig.responseMimeType === 'application/json' && !c.body.tools)
      : web ? c.url === 'https://api.openai.com/v1/responses' && c.body.tools[0].type === 'web_search' && Array.isArray(c.body.input) && c.body.input[0].role === 'user' && c.headers.Authorization === 'Bearer k'
      : c.url === 'https://api.openai.com/v1/chat/completions' && c.body.messages.length === 2 && c.body.response_format.type === 'json_object' && c.body.model === 'gpt-6.1-sol';
    check(`“after every reply” with ${p}${web ? ' and web search' : ''}: asked without a click, shown at once when the quiz is off`, s.c && s.c.verdict === 'wrong' && /Has a problem/.test(s.text) && !!shape, J({ url: c.url, body: { ...c.body, system: undefined, messages: undefined, contents: undefined, input: undefined, instructions: undefined, systemInstruction: !!c.body.systemInstruction } }));
  }
  // the learner's own words, and a conversation with the coach
  await b.eval(`Object.assign(NC.settings.coach, { mode: 'ask', provider: 'anthropic', search: false, quiz: true }); window.coachGood = false; window.coachSlow = 1500; NC.setParts({ ...NC.defaultParts(true), calculator: false })`);
  await fresh();
  await ask('What is 6,113 × 427?');
  await click('Ask the coach');
  s = await coachState();
  check('the coach’s question has a fourth choice, to say it in your own words', s.buttons.join('|') === 'Looks right|Something is off|Not sure|I’ll say what I think…', s.buttons.join('|'));
  await click('I’ll say what I think');
  await b.eval(`(() => { const x = document.querySelector('.msg.bot:last-child .coach textarea'); x.focus(); x.value = 'I think the last digits are wrong'; })()`);
  await b.waitFor(`NC.state.chat.turns.at(-1).coach.state === 'done'`, { timeout: 15000 });
  check('what is being typed survives the coach’s answer arriving', (await b.eval(`(document.querySelector('.msg.bot:last-child .coach textarea') || {}).value`)) === 'I think the last digits are wrong' && await b.eval(`document.activeElement === document.querySelector('.msg.bot:last-child .coach textarea')`));
  await b.eval(`window.coachSlow = 0`);
  await click('Tell the coach');
  await b.waitFor(`(NC.state.chat.turns.at(-1).coach.talk || []).length === 2 && !NC.state.chat.turns.at(-1).coach.busy`, { timeout: 15000 });
  s = await coachState();
  const talk1 = await b.eval(`window.coachCalls.at(-1)`);
  check('the coach answers what the learner wrote', /You: ?I think the last digits are wrong/.test(s.text.replace(/You(?=I)/, 'You: ')) && /You are right that the number is off/.test(s.text) && /Has a problem/.test(s.text), s.text);
  check('it is sent the review material, its own review, and the learner’s view', talk1.body.messages.length === 3 && talk1.body.messages[1].role === 'assistant' && /"verdict":"wrong"/.test(talk1.body.messages[1].content) && /Before seeing your review, the learner gave their own view[\s\S]*last digits are wrong/.test(talk1.body.messages[2].content) && /talking with you/.test(talk1.body.system) && /6,113 × 427/.test(talk1.body.messages[0].content), J(talk1.body.messages.map(m => m.role + ': ' + String(m.content).slice(0, 80))));
  await b.eval(`(() => { const f = document.querySelector('.msg.bot:last-child .coach form.ask'), i = f.querySelector('input'); i.value = 'How could I check it myself?'; f.requestSubmit(); })()`);
  await b.waitFor(`(NC.state.chat.turns.at(-1).coach.talk || []).length === 4 && !NC.state.chat.turns.at(-1).coach.busy`, { timeout: 15000 });
  const talk2 = await b.eval(`window.coachCalls.at(-1)`);
  s = await coachState();
  check('the learner can go on talking with the coach about the reply', talk2.body.messages.length === 5 && talk2.body.messages[4].content === 'How could I check it myself?' && talk2.body.messages[3].role === 'assistant' && (s.text.match(/You are right that the number is off/g) || []).length === 2 && /Say more to the coach/.test(await b.eval(`document.querySelector('.msg.bot:last-child .coach form.ask input').placeholder`)), J(talk2.body.messages.map(m => m.role)));
  check('Nano does not see the conversation with the coach', !(await b.eval(`NC.engine.lastSystem + NC.state.chat.turns.map(t => t.text).join(' ')`)).includes('How could I check it myself'));
  await b.screenshot(path.join(shots, 'coach-talk.png'), { h: 900 });
  // searching through the AI whose key was given
  await b.eval(`NC.settings.provider = 'ai'; NC.settings.coach.mode = 'off'; NC.setParts(NC.defaultParts(true))`);
  await fresh();
  r = await ask('How long is the Forth Bridge in Scotland, and when did it open?');
  const sc = await b.eval(`window.coachCalls.at(-1)`);
  check('“search through the AI” asks that AI to search, and Nano answers from what it reports', used(r, 'web_search') && /through Claude/.test(r.steps.find(s => s.tool === 'web_search').label) && /1890/.test(r.text) && r.sources === 1 && sc.body.tools[0].type === 'web_search_20260209' && /Search for: /.test(sc.body.messages[0].content) && /web search tool/.test(sc.body.system), r.steps.map(s => s.label).join('; ') + ' / ' + r.text);
  await b.eval(`NC.settings.keys = {}; NC.settings.coach.keys = {}`);
  r = await ask('And how tall is the Eiffel Tower?');
  check('without a key it falls back to Wikipedia', used(r, 'web_search') && /Searched Wikipedia/.test(r.steps.find(s => s.tool === 'web_search').label), r.steps.map(s => s.label).join('; '));
  await b.eval(`NC.settings.provider = 'wikipedia'; NC.settings.coach.keys = { anthropic: 'k', gemini: 'k', openai: 'k' }`);
  // "Other": an address and a model the user types
  await b.eval(`Object.assign(NC.settings.coach, { mode: 'ask', provider: 'other', url: 'https://example.test/v1/', quiz: false, search: true, models: { other: 'my-model' } }); window.coachGood = false; NC.setParts({ ...NC.defaultParts(true), calculator: false })`);
  await fresh();
  await ask('What is 5,219 × 388?');
  await click('Ask the coach');
  await b.waitFor(`(NC.state.chat.turns.at(-1).coach || {}).state === 'done'`, { timeout: 15000 });
  s = await coachState(); const oc = await b.eval(`window.coachCalls.at(-1)`);
  check('“Other” sends the review to the typed address and model, in the OpenAI chat format', oc.url === 'https://example.test/v1/chat/completions' && oc.body.model === 'my-model' && oc.body.messages.length === 2 && !oc.headers.Authorization && !oc.body.tools && /example\.test \(my-model\)/.test(s.text) && /Has a problem/.test(s.text), J({ url: oc.url, headers: oc.headers, model: oc.body.model }) + ' ' + s.text);
  check('the footer names where the replies go', /Coach on: example\.test is sent/.test(await b.eval(`document.querySelector('#hint').textContent`)), await b.eval(`document.querySelector('#hint').textContent`));
  // a good reply, guessed right; then a refused key
  await b.eval(`Object.assign(NC.settings.coach, { mode: 'every', provider: 'anthropic', search: false, quiz: true }); window.coachGood = true; NC.setParts(NC.defaultParts(true))`);
  await fresh();
  await ask('What is 5,219 × 388?');
  s = await coachState();
  check('a plain sum answered by the page is not sent to the coach', !s.c, J(s.c));
  await ask('What is an 18% tip on a $64.50 bill?');
  await click('Looks right');
  await b.waitFor(`(NC.state.chat.turns.at(-1).coach || {}).state === 'done'`, { timeout: 15000 });
  s = await coachState();
  check('a good reply guessed right: the coach agrees, with no hint step', /the coach agrees/.test(s.text) && /Looks good/.test(s.text), s.text);
  await b.eval(`window.coachFail = true; NC.settings.coach.mode = 'ask'`);
  await ask('What is a 15% tip on $80?');
  await click('Ask the coach'); await click('Not sure');
  await b.waitFor(`(NC.state.chat.turns.at(-1).coach || {}).state === 'error'`, { timeout: 15000 });
  s = await coachState();
  check('a refused key is reported plainly, with a way to ask again', /key was not accepted/.test(s.text) && s.buttons.some(x => /Ask again/.test(x)), s.text);
  check('Nano never sees the coach', !(await b.eval(`NC.engine.lastSystem + NC.state.chat.turns.map(t => t.text).join(' ')`)).includes('The multiplication is not right'));
  await b.eval(`NC.showSettings()`);
  check('settings show the coach, its key and model, and say what is sent', await b.eval(`!!document.querySelector('#coachMode') && !!document.querySelector('#coachKey') && !!document.querySelector('#coachModelSel') && !/null|undefined/.test(document.querySelector('#dBody').textContent) && /sends data out of this app/.test(document.querySelector('#coachLeaves').textContent)`));
  check('“Where searches go” offers the AI whose key was given', await b.eval(`(() => { const x = document.querySelector('#provAi'); return !!x && !x.disabled && /through Claude/.test(x.closest('label').textContent); })()`), await b.eval(`(document.querySelector('#provAi') || { closest: () => ({ textContent: 'missing' }) }).closest('label').textContent`));
  const pick = (sel, value) => b.eval(`(() => { const x = document.querySelector(${J(sel)}); x.value = ${J(value)}; x.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  check('the model is chosen from a list that ends in “Other”', await b.eval(`(() => { const o = [...document.querySelectorAll('#coachModelSel option')].map(x => x.textContent); return o[0] === 'claude-sonnet-5-5 (suggested)' && /^Other/.test(o.at(-1)) && !document.querySelector('#coachModel'); })()`), await b.eval(`[...document.querySelectorAll('#coachModelSel option')].map(x => x.textContent).join(' | ')`));
  await pick('#coachModelSel', '*');
  check('choosing “Other” gives a box to type the model’s name', await b.eval(`!!document.querySelector('#coachModel') && document.querySelector('#coachModelSel').value === '*'`));
  await b.eval(`(() => { const x = document.querySelector('#coachModel'); x.value = 'claude-some-future-model'; x.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  check('and the typed name is the one used', (await b.eval(`NC.settings.coach.models.anthropic`)) === 'claude-some-future-model');
  await pick('#coachModelSel', 'claude-opus-5-5');
  check('picking a listed model again takes the box away', await b.eval(`!document.querySelector('#coachModel') && NC.settings.coach.models.anthropic === 'claude-opus-5-5'`));
  await pick('#coachModelSel', 'claude-sonnet-5-5');
  check('the list of AIs ends in “Other”, which asks for an address', await (async () => { const n = await b.eval(`[...document.querySelectorAll('#coachProv option')].map(x => x.textContent).join(' | ')`); await pick('#coachProv', 'other'); return /Other/.test(n.split(' | ').at(-1)) && await b.eval(`!!document.querySelector('#coachUrl') && !!document.querySelector('#coachModel') && !document.querySelector('#coachModelSel') && !/check facts on the web/.test(document.querySelector('#dBody').textContent)`); })());
  await pick('#coachProv', 'anthropic');
  await b.screenshot(path.join(shots, 'settings-coach.png'), { h: 1500 });
  check('the footer says when the coach is on', /Coach on/.test(await b.eval(`document.querySelector('#hint').textContent`)), await b.eval(`document.querySelector('#hint').textContent`));
  await b.eval(`document.querySelector('#dlg').close(); NC.settings.coach.mode = 'off'; NC.setParts(NC.defaultParts(true))`);
  }
  check('no page errors', b.errors.length === 0, b.errors.join(' | '));
} catch (e) { fail++; console.log('FAIL  crashed: ' + (e.stack || e)); console.log(b.log.slice(-10).join('\n')); console.log(b.errors.join('\n')); }
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
