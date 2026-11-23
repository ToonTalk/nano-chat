// Does GPT-2 run in the page at all, and how fast? Loads gpt2.js by itself in headless Chrome.
//   node tools/try-gpt2.mjs [gpt2|gpt2-medium|gpt2-large|gpt2-xl] [wasm|webgpu]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './nano-harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const key = process.argv[2] || 'gpt2', device = process.argv[3] || 'wasm';
const b = await launch({ root, withModel: false });
try {
  await b.goto('/tools/gpt2-blank.html');
  await b.eval(`(async () => { self.G = NanoChatAlt.make(${JSON.stringify(key)}, { device: ${JSON.stringify(device)} }); self.S = await G.LM.create({ initialPrompts: [] }); return 1; })()`);
  const info = await b.eval('JSON.stringify({ info: G.info, loadMs: G.stats.loadMs, gpu: !!navigator.gpu, threads: navigator.hardwareConcurrency, isolated: self.crossOriginIsolated })');
  console.log('loaded', info);
  const prompts = [
    ['bare', 'What is 17% of 2,340?'],
    ['bare', 'The capital of France is'],
    ['script', 'User: Hello! Who are you?\nAssistant:'],
    ['script', 'User: What is the capital of France?\nAssistant:'],
    ['script', 'User: What is 17% of 2,340?\nAssistant:'],
  ];
  for (const [kind, p] of prompts) {
    const r = await b.eval(`G.generate(${JSON.stringify(p)}, { max: 60, stops: ${kind === 'script' ? JSON.stringify(['\nUser:', '\nAssistant:']) : '[]'} }).then(r => JSON.stringify(r))`);
    const o = JSON.parse(r);
    console.log(`\n[${kind}] ${JSON.stringify(p)}\n  -> ${JSON.stringify(o.text)}\n  ${o.newTokens} tokens in ${o.ms} ms (${(o.newTokens / o.ms * 1000).toFixed(1)}/s), prompt ${o.promptTokens}`);
  }
  // a full window: how long does a long prompt take?
  const long = 'The quick brown fox jumps over the lazy dog. '.repeat(120);
  const r = JSON.parse(await b.eval(`G.generate(${JSON.stringify(long)}, { max: 20, stops: [] }).then(r => JSON.stringify(r))`));
  console.log(`\nfull window: prompt ${r.promptTokens} tokens (cut ${r.cut}), ${r.newTokens} new in ${r.ms} ms`);
} catch (e) { console.error('FAILED', e.message); console.log(b.log.slice(-15).join('\n')); console.log(b.errors.join('\n')); process.exitCode = 1; }
finally { await b.close(); }
