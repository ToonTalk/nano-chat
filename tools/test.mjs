// End-to-end check against the real Gemini Nano in headless Chrome.
//   node tools/test.mjs            the quick run: calculator unit checks, tools, notes
//   node tools/test.mjs long       also a long conversation in a pretend-small window: summaries, contents, recall
import { launch } from './nano-harness.mjs';
import path from 'node:path';
import fs from 'node:fs';
const root = path.resolve(import.meta.dirname, '..');
const shots = path.join(root, 'captures'); fs.mkdirSync(shots, { recursive: true });
const mode = process.argv[2] || 'quick';
const b = await launch({ root });
let pass = 0, fail = 0, fakes = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); };
const ask = async (text) => {
  const t0 = Date.now();
  const r = await b.eval(`(async () => { await NC.send(${JSON.stringify(text)}); const t = NC.state.chat.turns.at(-1);
    return { text: t.text, error: t.error || null, steps: t.steps.map(s => ({ tool: s.tool, input: s.input, status: s.status, label: s.label, how: s.how || '', ev: (s.evidence || '').slice(0, 300) })), sources: t.sources.length, usage: NC.engine.usage(), segs: NC.state.chat.segments.length }; })()`);
  r.s = ((Date.now() - t0) / 1000).toFixed(1);
  if (/Information gathered|Search results for "|<<<|^Calculator:|The app looked this up/m.test(r.text)) fakes++;
  console.log(`\n> ${text}\n  [${r.s}s; tools: ${r.steps.map(s => `${s.tool}(${s.input})${s.status === 'ok' ? '' : ' FAILED ' + s.label}`).join(', ') || 'none'}; usage ${r.usage}; segments ${r.segs}]\n  ${r.text.replace(/\n/g, '\n  ').slice(0, 700)}${r.error ? '\n  ERROR ' + r.error : ''}`);
  return r;
};
const used = (r, tool) => r.steps.some(s => s.tool === tool && s.status === 'ok');
try {
  await b.goto(mode === 'long' ? '/index.html?window=1500' : '/index.html');
  await b.waitFor('window.NC && NC.engine.ready', { timeout: 180000 });
  console.log('window', await b.eval('NC.engine.W'), 'real', await b.eval('NC.engine.realW'));

  // calculator, no model involved
  const calcs = [['0.17 * 2340', '397.8'], ['17% of 2,340', '397.8'], ['80 + 10%', '88'], ['2^10', '1,024'], ['(1200 - 950) / 950 * 100', '26.3157894737'], ['sqrt(2) * 10', '14.1421356237'],
    ['5!', '120'], ['10 mod 3', '1'], ['0.1 + 0.2', '0.3'], ['daysBetween(2026-11-22, 2026-12-25)', '33'], ['weekday(2026-12-25)', 'Friday'], ['addDays(2026-11-22, 40)', '2027-01-01 (a Friday)'], ['2(3+4)', '14'], ['-2^2', '-4'], ['1000 * 1.05^10', '1,628.89462678'], ['3 x 4', '12'], ['12 divided by 4 plus 1', '4']];
  for (const [e, want] of calcs) { const got = await b.eval(`(() => { try { return NC.calc(${JSON.stringify(e)}).text; } catch (e) { return 'ERR ' + e.message; } })()`); check(`calc ${e}`, got === want, got === want ? '' : `got ${got}, wanted ${want}`); }
  check('calc rejects junk', (await b.eval(`(() => { try { NC.calc('2 + banana'); return 'no error'; } catch (e) { return 'ERR'; } })()`)) === 'ERR');
  const html = await b.eval(`NC.md('# Hi\\n\\nSome **bold** and *it* and \`code\` [1].\\n\\n- a\\n- b\\n\\n1. x\\n2. y\\n\\n| a | b |\\n|---|---|\\n| 1 | 2 |\\n\\n\`\`\`js\\nlet x = 1 < 2;\\n\`\`\`\\n<script>alert(1)</scr' + 'ipt>', [{ title: 'T', url: 'https://example.com/?a=1&b=2' }])`);
  check('markdown renders and escapes', /<h1>Hi<\/h1>/.test(html) && /<strong>bold<\/strong>/.test(html) && /<ul><li>a<\/li><li>b<\/li><\/ul>/.test(html) && /<ol><li>x<\/li><li>y<\/li><\/ol>/.test(html) && /<table>/.test(html) && /1 &lt; 2/.test(html) && !/<script>/.test(html) && /class="cite"/.test(html), html.replace(/\n/g, ' ').slice(0, 400));

  if (mode === 'quick') {
    let r = await ask('Hello!');
    check('greeting uses no tool', r.steps.length === 0 && r.text.length > 0);
    r = await ask('12 * (3 + 4)');
    check('pure arithmetic skips the model', used(r, 'calculator') && r.text === '**84**');
    r = await ask('What is an 18% tip on a $64.50 bill?');
    check('word problem uses the calculator', used(r, 'calculator') && /11\.61/.test(r.text));
    r = await ask('How many days until Christmas?');
    { const n = new Date(), days = Math.round((Date.UTC(n.getFullYear() + (n.getMonth() === 11 && n.getDate() > 25 ? 1 : 0), 11, 25) - Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())) / 864e5);      // counted here, so the check is right on any day
      check('date math uses the calculator', used(r, 'calculator') && r.text.includes(String(days)), 'expected ' + days); }
    r = await ask('Who designed the Eiffel Tower, and when was it finished?');
    check('fact question searches', used(r, 'web_search') && r.sources > 0 && /1889/.test(r.text));
    await b.screenshot(path.join(shots, 'search.png'));
    r = await ask('And how tall is it?');
    check('follow-up search resolves "it"', used(r, 'web_search') && /eiffel/i.test(r.steps.find(s => s.tool === 'web_search').input), r.steps.map(s => s.input).join('|'));
    r = await ask('Remember that my bike lock code is 4821');
    check('remember saves a note', used(r, 'save_note') && (await b.eval('NC.notes.length')) === 1 && /4821/.test(await b.eval('NC.notes[0].body')), await b.eval('JSON.stringify(NC.notes)'));
    r = await ask('Write a two-line poem about rain.');
    check('creative request uses no tool', r.steps.length === 0);
    r = await ask('What is my bike lock code?');
    check('note is used in a later answer', /4821/.test(r.text));
    r = await ask('Summarize https://en.wikipedia.org/wiki/Ada_Lovelace in three sentences.');
    check('pasted link is read', used(r, 'read_page') && /lovelace|ada/i.test(r.text), r.steps.map(s => s.label + ' / ' + s.how).join('|'));
    await b.screenshot(path.join(shots, 'chat.png'));
    await b.screenshot(path.join(shots, 'chat-dark.png'), { dark: true });
    // a new chat still knows the note
    await b.eval(`document.querySelector('#newChat').click()`);
    r = await ask("What's the code for my bike lock?");
    check('notes carry over to a new chat', /4821/.test(r.text));
    await b.eval(`document.querySelector('#meter').click()`); await b.screenshot(path.join(shots, 'memory.png'));
    await b.eval(`document.querySelector('#dClose').click(); document.querySelector('#openNotes').click()`); await b.screenshot(path.join(shots, 'notes.png'));
    await b.eval(`document.querySelector('#dClose').click(); document.querySelector('#openSettings').click()`); await b.screenshot(path.join(shots, 'settings.png'));
    // does it also work opened straight from the disk, with no server?
    await b.send('Page.navigate', { url: 'file:///' + path.join(root, 'index.html').replace(/\\/g, '/') });
    try { await b.waitFor('window.NC && (NC.engine.ready || (NC.state.door && NC.state.door.kind !== "loading" && NC.state.door.kind !== "checking"))', { timeout: 90000 }); } catch {}
    const f = await b.eval('JSON.stringify({ ready: NC.engine.ready, door: NC.state.door })');
    console.log('FILE URL', f);
    if (JSON.parse(f).ready) { r = await ask('What is the capital of France? One word.'); check('works from a file:// address', /paris/i.test(r.text)); }
  } else {
    const convo = [
      "I'm planning a week in Lisbon in May with my partner Priya. Our budget is 1,800 euros in total.",
      'We want to stay in the Alfama district. Our hotel is called Casa do Fado and costs 95 euros a night.',
      'Priya is vegetarian, so suggest three typical Portuguese dishes she could eat.',
      "Let's change the subject. I'm also teaching my nephew Tomas chess. He is 9 and loves the Sicilian Defense.",
      'What is a good first chess opening principle to teach him?',
      'Different topic again: my sourdough starter is named Clint Yeastwood and I feed it every 12 hours with rye flour.',
      'Give me one tip for a more sour loaf.',
      'Now tell me a fun fact about octopuses.',
      'And one about honeybees.',
    ];
    for (const m of convo) await ask(m);
    const segs = await b.eval('NC.state.chat.segments');
    console.log('\nCONTENTS', JSON.stringify(segs, null, 1));
    check('older messages were summarized into contents entries', segs.length >= 1 && segs.every(s => s.title && s.gist));
    check('usage stays inside the pretend window', (await b.eval('NC.engine.usage()')) < 1500, String(await b.eval('NC.engine.usage()')));
    await b.screenshot(path.join(shots, 'long.png'));
    check('no reply contains invented tool output', fakes === 0, `${fakes} replies did`);
    // each way of looking back starts from the same saved state, so earlier test answers can't help
    const snap = await b.eval('JSON.stringify(NC.state.chat)');
    for (const rm of ['both', 'contents', 'keywords']) {
      await b.eval(`(() => { const s = JSON.parse(${JSON.stringify(snap)}), c = NC.state.chat; c.turns = s.turns; c.segments = s.segments; c.compactedUpTo = s.compactedUpTo; c.seenFrom = s.seenFrom; NC.engine.dirty = true; NC.settings.recall = ${JSON.stringify(rm)}; })()`);
      const r1 = await ask('What was the name of our hotel in Lisbon, and what did it cost per night?');
      check(`[${rm}] recalls the hotel`, /casa do fado/i.test(r1.text) && /95/.test(r1.text), r1.steps.map(s => s.tool + ': ' + s.how).join('|'));
      const r2 = await ask("Remind me what my nephew's favorite chess opening is.");
      check(`[${rm}] recalls the opening`, /sicilian/i.test(r2.text), r2.steps.map(s => s.tool + ': ' + s.how).join('|'));
    }
    await b.eval(`document.querySelector('#openContents').click()`); await b.screenshot(path.join(shots, 'contents.png'));
    await b.eval(`document.querySelector('#dClose').click(); document.querySelector('#meter').click()`); await b.screenshot(path.join(shots, 'memory-long.png'));
    // reload: the session is rebuilt from what was saved
    await b.goto('/index.html?window=1500');
    await b.waitFor('window.NC && NC.engine.ready', { timeout: 180000 });
    check('conversation survives a reload', (await b.eval('NC.state.chat.turns.length')) >= convo.length * 2 && (await b.eval('NC.state.chat.segments.length')) === (await b.eval('NC.state.chat.segments.length')));
    const r3 = await ask('What did I name my sourdough starter?');
    check('after reload it still knows the starter', /clint/i.test(r3.text), r3.steps.map(s => s.tool + ': ' + s.how).join('|'));
    // more notes than fit: titles only in the prompt, and the right one is opened
    await b.eval(`NC.notes = [
      { id: 'a', title: 'Wifi password', body: 'The home wifi network is called Burrow and its password is plum-tractor-88.', pinned: false },
      { id: 'b', title: 'Car details', body: 'The car is a blue 2019 Toyota Yaris, registration KX19 ABC, and its insurance renews on March 3.', pinned: false },
      { id: 'c', title: 'Dentist', body: 'Dr. Okafor at Oak Lane Dental, phone 01865 555 0142. Next checkup is on February 11 at 9:30.', pinned: false },
      { id: 'd', title: 'Allergies', body: 'Priya is allergic to walnuts and I am allergic to penicillin. Tomas dislikes mushrooms.', pinned: false },
      { id: 'e', title: 'Book list', body: 'To read: Godel Escher Bach, Mindstorms, The Society of Mind, and Turtle Geometry.', pinned: false }].map(n => ({ ...n, body: n.body + ' ' + 'This note was written during the spring clean of the old paper notebook, and nothing in this sentence matters. '.repeat(2) }))`);
    check('with too many notes, only some are in view', (await b.eval(`(() => { const s = NC.systemPrompt(NC.state.chat); return /Other saved notes, by title only/.test(s) && /plum-tractor-88/.test(s) && !/March 3/.test(s) && !/Okafor/.test(s); })()`)));
    const r4 = await ask('What is my wifi password?');
    check('a note in view is answered without a tool', r4.steps.length === 0 && /plum-tractor-88/.test(r4.text), r4.steps.map(s => s.label).join('|'));
    const r5 = await ask('When does the car insurance renew?');
    check('a note out of view is opened when needed', used(r5, 'read_note') && /march 3/i.test(r5.text), r5.steps.map(s => s.label).join('|'));
    const r5b = await ask("What's my dentist's phone number?");
    check('a personal question opens the matching note', used(r5b, 'read_note') && /555 0142/.test(r5b.text), r5b.steps.map(s => s.label).join('|'));
    // a long pasted text is digested by side sessions
    const longText = Array.from({ length: 30 }, (x, i) => 'Section ' + (i + 1) + '. The village of Marlow Green held its yearly fair. ' + (i === 17 ? 'This year the prize for the largest pumpkin went to Edith Vane, whose pumpkin weighed 412 kilograms. ' : 'Stalls sold jam, cheese and woollen hats, and the brass band played until dusk. ') + 'Children ran three-legged races on the green while the vicar judged the cakes.').join('\\n\\n');
    const r6 = await b.eval('(async () => { await NC.send("Who won the pumpkin prize, and how heavy was the pumpkin?", [{ name: "Fair report", text: ' + JSON.stringify(longText) + ' }]); const t = NC.state.chat.turns.at(-1); return { text: t.text, steps: t.steps.map(s => s.label + " / " + (s.how || "")) }; })()');
    console.log('\n> [attachment] pumpkin\n  ' + r6.text + '\n  ' + r6.steps.join('|'));
    check('an attached long text is searched for the answer', /edith vane/i.test(r6.text) && /412/.test(r6.text));
    const r7 = await b.eval('(async () => { await NC.send("Summarize this.", [{ name: "Fair report", text: ' + JSON.stringify(longText) + ' }]); const t = NC.state.chat.turns.at(-1); return { text: t.text, steps: t.steps.map(s => s.label + " / " + (s.how || "")) }; })()');
    console.log('\n> [attachment] summarize\n  ' + r7.text + '\n  ' + r7.steps.join('|'));
    check('a long text is summarized in parts', /parts by side sessions/.test(r7.steps.join('|')) && /fair/i.test(r7.text));
  }
} catch (e) { fail++; console.log('TEST CRASHED', e.stack || e); }
if (b.errors.length) { fail++; console.log('PAGE ERRORS', b.errors); }
const warn = b.log.filter(l => /^\[(error|warning)\]/.test(l)); if (warn.length) console.log('CONSOLE', warn.slice(-15));
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
