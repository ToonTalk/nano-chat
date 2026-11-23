// "More about this" in the parts panel and in Settings.
//   node tools/test-explain.mjs
import { launch } from './nano-harness.mjs';
import path from 'node:path';
import fs from 'node:fs';
const root = path.resolve(import.meta.dirname, '..');
const shots = path.join(root, 'captures'); fs.mkdirSync(shots, { recursive: true });
const b = await launch({ root, height: 980 });
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + String(extra).replace(/\s+/g, ' ').slice(0, 320) : ''}`); };
const dlg = () => b.eval(`document.querySelector('#dBody').innerText`);
const partRow = name => `[...document.querySelectorAll('#dlg .part')].find(r => r.querySelector('b').textContent === ${JSON.stringify(name)})`;
try {
  await b.goto('/index.html?start=full');
  await b.waitFor('window.NC && NC.engine.ready', { timeout: 180000 });

  // the parts panel
  await b.eval(`NC.showParts()`);
  check('every part offers “More about this”', (await b.eval(`document.querySelectorAll('#dlg .part .moreBtn').length`)) === 14);
  check('closed, a part shows one short line', (await b.eval(`${partRow('Looking back')}.querySelectorAll('small').length`)) === 1 && /finds those old messages and shows them to Nano again/.test(await b.eval(`${partRow('Looking back')}.innerText`)));
  await b.eval(`${partRow('Looking back')}.querySelector('.moreBtn').click()`);
  let t = await b.eval(`${partRow('Looking back')}.innerText`);
  check('opened, “Looking back” is explained with an example, and both states', /name of your hotel/.test(t) && /They stay saved in this browser/.test(t) && /On: /.test(t) && /Off: Once old messages no longer fit/.test(t) && /Less/.test(t), t);
  check('opening it does not flip the switch', await b.eval(`NC.settings.features.recall === true && ${partRow('Looking back')}.querySelector('input').checked`));
  await b.screenshot(path.join(shots, 'explain-parts.png'));
  await b.eval(`${partRow('Calculator')}.querySelector('.moreBtn').click()`);
  check('two can be open at once', (await b.eval(`document.querySelectorAll('#dlg .part .moreTxt').length`)) === 2 && /does not calculate/.test(await dlg()));
  await b.eval(`${partRow('Looking back')}.querySelector('input').click()`);
  t = await b.eval(`${partRow('Looking back')}.innerText`);
  check('switching the part keeps its explanation open', (await b.eval(`NC.settings.features.recall`)) === false && /name of your hotel/.test(t) && /^Looking back\s*Once old messages no longer fit/.test(t.replace(/\n+/g, ' ')), t);
  await b.eval(`${partRow('Looking back')}.querySelector('input').click(); ${partRow('Looking back')}.querySelector('.moreBtn').click()`);
  check('“Less” closes it', !/name of your hotel/.test(await dlg()));
  check('every part has a longer explanation of some length', await b.eval(`(() => { const rows = [...document.querySelectorAll('#dlg .part')].filter(r => r.querySelector('.moreBtn')); rows.forEach(r => { if (!r.querySelector('.moreTxt')) r.querySelector('.moreBtn').click(); }); return [...document.querySelectorAll('#dlg .part .moreTxt')].every(m => m.textContent.length > 200) && document.querySelectorAll('#dlg .part .moreTxt').length === 14; })()`));

  // Settings
  await b.eval(`NC.showSettings()`);
  check('Settings has “More about this” for searching, looking back, the reader and the coach', (await b.eval(`document.querySelectorAll('#dlg details.about').length`)) === 4);
  check('they are closed to begin with', await b.eval(`[...document.querySelectorAll('#dlg details.about')].every(d => !d.open)`));
  await b.eval(`[...document.querySelectorAll('#dlg details.about')].forEach(d => d.open = true)`);
  t = await dlg();
  check('they say what each choice is for', /a few search words, not your whole message/.test(t) && /with no model involved/.test(t) && /stops one web page from reading another/.test(t) && /nothing is sent to any company while it is off/.test(t));
  await b.eval(`document.querySelector('#recallSel').scrollIntoView({ block: 'center' })`); await b.screenshot(path.join(shots, 'explain-settings.png'));
  await b.eval(`document.querySelector('#dlg').close()`);

  check('no page errors', b.errors.length === 0, b.errors.join(' | '));
} catch (e) { fail++; console.error('FAILED', e.message); console.log(b.log.slice(-10).join('\n')); console.log(b.errors.join('\n')); }
finally { console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exitCode = fail ? 1 : 0; }
