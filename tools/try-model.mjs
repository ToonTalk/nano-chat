// Does an open model run in a page at all, and how fast? Loads open-models.js by itself in headless Chrome.
//   node tools/try-model.mjs [gemma-270m|qwen-0.6b|smollm2-360m|gpt2|...] [wasm|webgpu] [dtype]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './nano-harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const key = process.argv[2] || 'gemma-270m', device = process.argv[3] || 'wasm', dtype = process.argv[4] || '';
const b = await launch({ root, withModel: false });
const SCHEMA = { type: 'object', properties: { tool: { type: 'string', enum: ['answer', 'calculator', 'web_search'] }, input: { type: 'string' }, title: { type: 'string' } }, required: ['tool', 'input', 'title'], additionalProperties: false };
const ROUTER = `You are the tool chooser for a chat assistant. Read the user's latest message and choose the ONE tool the assistant needs next, or "answer" if it needs none. Reply with JSON like {"tool": "...", "input": "...", "title": "..."}. Use "" for a field the tool does not need.
- answer: no tool. For greetings, chat, opinions, writing and explaining ideas.
- calculator: for any arithmetic. "input" is a math expression, for example 0.17 * 2340.
- web_search: for facts about particular people, places and works. "input" is a short keyword query. "title" is the main subject.`;
try {
  await b.goto('/tools/model-blank.html');
  const gpu = await b.eval(`(async () => { if (!navigator.gpu) return 'no navigator.gpu'; const a = await navigator.gpu.requestAdapter(); if (!a) return 'no adapter'; return JSON.stringify({ vendor: a.info && a.info.vendor, arch: a.info && a.info.architecture, f16: a.features.has('shader-f16') }); })()`);
  console.log('graphics:', gpu, '| threads:', await b.eval('navigator.hardwareConcurrency'), '| isolated:', await b.eval('self.crossOriginIsolated'));
  await b.eval(`(async () => { self.G = NanoChatAlt.make(${JSON.stringify(key)}, { device: ${JSON.stringify(device)}, dtype: ${JSON.stringify(dtype)} }); self.S = await G.LM.create({ initialPrompts: [{ role: 'system', content: 'You are a friendly, helpful assistant called Nano. Keep answers clear and fairly short.' }] }); self.R = await G.LM.create({ initialPrompts: [{ role: 'system', content: ${JSON.stringify(ROUTER)} }] }); return 1; })()`);
  console.log('loaded', await b.eval('JSON.stringify({ name: G.info.name, dtype: G.info.dtype, device: G.info.device, megabytes: G.info.megabytes, loadMs: G.stats.loadMs })'));
  if (G_chat(await b.eval('G.info.frame'))) {
    for (const q of ['Hello! Who are you?', 'What is the capital of France?', 'Write a two-line poem about rain.']) {
      const r = JSON.parse(await b.eval(`(async () => { const c = await S.clone(); const text = await c.prompt(${JSON.stringify(q)}); return JSON.stringify({ text, last: c.last }); })()`));
      console.log(`\n> ${q}\n  ${r.text.replace(/\n/g, '\n  ').slice(0, 400)}\n  [read ${r.last.promptTokens} tokens in ${r.last.readMs} ms; wrote ${r.last.newTokens} in ${r.last.ms - r.last.readMs} ms]`);
    }
    for (const q of ["what's 8% sales tax on $249.99?", 'thanks, that helps!', 'how tall is the Burj Khalifa', 'Write a limerick about my cat']) {
      const r = JSON.parse(await b.eval(`(async () => { const c = await R.clone(); const text = await c.prompt(${JSON.stringify(q)}, { responseConstraint: ${JSON.stringify(SCHEMA)} }); return JSON.stringify({ text, raw: c.raw, last: c.last }); })()`));
      console.log(`\n> [choose a tool] ${q}\n  ${r.text || '(nothing that fits the shape; it wrote: ' + JSON.stringify(r.raw) + ')'}\n  [read ${r.last.promptTokens} tokens in ${r.last.readMs} ms; wrote ${r.last.newTokens} in ${r.last.ms - r.last.readMs} ms]`);
    }
  }
  console.log('\nrates (tokens a second):', await b.eval('JSON.stringify(G.rates())'), 'stats:', await b.eval('JSON.stringify(G.stats)'));
} catch (e) { console.error('FAILED', e.message.slice(0, 600)); console.log(b.log.slice(-12).join('\n').slice(0, 2500)); console.log(b.errors.join('\n').slice(0, 1500)); process.exitCode = 1; }
finally { await b.close(); }
function G_chat(frame) { return frame === 'chat'; }
