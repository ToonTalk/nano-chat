// What does this Chrome's Prompt API look like, and which search services can a page call?
import { launch } from './nano-harness.mjs';
import path from 'node:path';
import fs from 'node:fs';
const root = path.resolve(import.meta.dirname, '..');
if (!fs.existsSync(path.join(root, 'blank.html'))) fs.writeFileSync(path.join(root, 'blank.html'), '<!doctype html><title>probe</title>');
const b = await launch({ root });
const out = {};
try {
  await b.goto('/blank.html');
  out.surface = await b.eval(`(async () => {
    if (!('LanguageModel' in self)) return 'no LanguageModel';
    const r = { statics: Object.getOwnPropertyNames(LanguageModel), proto: Object.getOwnPropertyNames(LanguageModel.prototype) };
    const opts = { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] };
    r.availability = await LanguageModel.availability(opts);
    try { r.params = LanguageModel.params ? await LanguageModel.params() : 'no params()'; } catch (e) { r.params = 'ERR ' + e.message; }
    const t0 = performance.now();
    const s = await LanguageModel.create({ ...opts, initialPrompts: [{ role: 'system', content: 'You are a concise assistant.' }] });
    r.createMs = Math.round(performance.now() - t0);
    r.window = { contextWindow: s.contextWindow, contextUsage: s.contextUsage, inputQuota: s.inputQuota, inputUsage: s.inputUsage };
    r.samplingMode = s.samplingMode; r.temperature = s.temperature; r.topK = s.topK;
    const t1 = performance.now();
    let chunks = [];
    for await (const c of s.promptStreaming('Say hello in exactly five words.')) chunks.push(c);
    r.streamMs = Math.round(performance.now() - t1); r.chunks = chunks.slice(0, 8); r.nChunks = chunks.length;
    r.usageAfter = s.contextUsage ?? s.inputUsage;
    const measure = s.measureContextUsage ? 'measureContextUsage' : (s.measureInputUsage ? 'measureInputUsage' : null);
    r.measureName = measure;
    if (measure) r.measure1000chars = await s[measure]('The quick brown fox jumps over the lazy dog. '.repeat(22));
    // structured decision
    const schema = { type: 'object', properties: { tool: { type: 'string', enum: ['none', 'calculator', 'search'] }, input: { type: 'string' } }, required: ['tool', 'input'], additionalProperties: false };
    const c = await s.clone();
    const t2 = performance.now();
    r.decision = await c.prompt('Which tool is needed for: "what is 17% of 2,340?" Reply as JSON.', { responseConstraint: schema });
    r.decisionMs = Math.round(performance.now() - t2);
    c.destroy();
    // append
    try { await s.append([{ role: 'user', content: 'My favorite color is teal.' }, { role: 'assistant', content: 'Noted.' }]); r.append = 'ok, usage ' + (s.contextUsage ?? s.inputUsage); } catch (e) { r.append = 'ERR ' + e.name + ' ' + e.message; }
    // temperature on the web?
    try { const t = await LanguageModel.create({ ...opts, temperature: 0.2, topK: 3 }); r.tempCreate = 'ok ' + t.temperature + '/' + t.topK; t.destroy(); } catch (e) { r.tempCreate = 'ERR ' + e.name + ' ' + e.message; }
    try { const t = await LanguageModel.create({ ...opts, samplingMode: 'most-predictable' }); r.samplingCreate = 'ok ' + t.samplingMode; t.destroy(); } catch (e) { r.samplingCreate = 'ERR ' + e.name + ' ' + e.message; }
    try { const t = await LanguageModel.create({ ...opts, tools: [{ name: 'add', description: 'adds', inputSchema: { type: 'object', properties: {} }, execute: async () => '4' }] }); r.toolsCreate = 'accepted (may be ignored)'; t.destroy(); } catch (e) { r.toolsCreate = 'ERR ' + e.name + ' ' + e.message; }
    r.others = ['Summarizer', 'Writer', 'Rewriter', 'Translator', 'LanguageDetector', 'Proofreader'].filter(n => n in self);
    s.destroy();
    return r;
  })()`);

  const tryFetch = (label, url, init) => b.eval(`(async () => {
    try { const r = await fetch(${JSON.stringify(url)}, ${JSON.stringify(init || {})}); const t = await r.text(); return ${JSON.stringify(label)} + ': HTTP ' + r.status + ' readable, ' + t.length + ' chars: ' + t.slice(0, 160).replace(/\\s+/g, ' '); }
    catch (e) { return ${JSON.stringify(label)} + ': BLOCKED ' + e.message; }
  })()`);
  out.cors = [];
  const tests = [
    ['wikipedia search', 'https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=tallest+mountain&format=json&origin=*'],
    ['wikipedia extract', 'https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&exintro=1&titles=Mount_Everest&format=json&origin=*'],
    ['wikipedia rest summary', 'https://en.wikipedia.org/api/rest_v1/page/summary/Mount_Everest'],
    ['duckduckgo instant', 'https://api.duckduckgo.com/?q=mount+everest&format=json&no_html=1'],
    ['tavily (fake key)', 'https://api.tavily.com/search', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer tvly-fake' }, body: JSON.stringify({ query: 'test' }) }],
    ['brave (fake key)', 'https://api.search.brave.com/res/v1/web/search?q=test', { headers: { 'X-Subscription-Token': 'fake', accept: 'application/json' } }],
    ['serper (fake key)', 'https://google.serper.dev/search', { method: 'POST', headers: { 'content-type': 'application/json', 'X-API-KEY': 'fake' }, body: JSON.stringify({ q: 'test' }) }],
    ['google cse (fake key)', 'https://www.googleapis.com/customsearch/v1?key=fake&cx=fake&q=test'],
    ['exa (fake key)', 'https://api.exa.ai/search', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'fake' }, body: JSON.stringify({ query: 'test' }) }],
    ['jina reader', 'https://r.jina.ai/https://example.com'],
  ];
  for (const [l, u, i] of tests) out.cors.push(await tryFetch(l, u, i));
} catch (e) { out.error = String(e.stack || e); }
out.log = b.log.slice(-10); out.errors = b.errors;
console.log(JSON.stringify(out, null, 2));
await b.close();
process.exit(0);
