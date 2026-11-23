// An experiment: Nano Chat on an open model in place of Gemini Nano.
// Open the page with ?model=<name> and this file is loaded. It gives the model the same face that Chrome
// gives Gemini Nano (create, prompt, promptStreaming, clone, append), so that the rest of the page, every
// part included, runs unchanged around it.
//
//   ?model=gemma-270m, qwen-0.6b, smollm2-360m    small chat models that run where Gemini Nano cannot
//   ?model=gpt2 (and -medium, -large, -xl)        GPT-2 from 2019, to see what the parts can do for an old model
//   &device=webgpu                                use the graphics card (the default is the processor alone)
//
// The chat models are given each conversation in the layout they were trained on. GPT-2 was never trained to
// hold a conversation: it only continues text. For it, each conversation is laid out as a script ("User: ...
// Assistant: ...") which it writes on from "Assistant:"; &frame=none hands it the bare words.
//
// Chrome holds Gemini Nano to a JSON shape when the page asks for one (the tool chooser depends on that).
// Nothing here can do the same, so the chat models are started off with the opening of the JSON, stopped
// when its braces close, and their answer is thrown away if it does not fit the shape asked for.
//
// The model runs in this browser, through transformers.js. The library comes from jsDelivr and the weights
// from Hugging Face; no part of a conversation is sent anywhere.
(() => {
  const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2';
  const SCRIPT = 'It only continues text and was never trained to chat.';
  // mb: the size of the download for each form of the weights (megabytes). window: tokens the page may fill.
  const MODELS = {
    'gemma-270m': { repo: 'onnx-community/gemma-3-270m-it-ONNX', name: 'Gemma 3 270M', by: 'Google', date: 'August 2025', params: '270 million', chat: true, window: 4096,
      mb: { q4: 323, q4f16: 273, q8: 545, fp16: 570 }, gen: { temperature: 1, top_k: 64, top_p: 0.95 }, about: 'It is trained to chat, and is about a tenth of the size of Gemini Nano.' },
    'smollm2-360m': { repo: 'HuggingFaceTB/SmolLM2-360M-Instruct', name: 'SmolLM2 360M', by: 'Hugging Face', date: 'November 2024', params: '360 million', chat: true, window: 4096,
      mb: { q4: 388, q4f16: 273, q8: 365, fp16: 725 }, gen: { temperature: 0.2, top_p: 0.9 }, about: 'It is trained to chat, and is about a tenth of the size of Gemini Nano.' },
    'qwen-0.6b': { repo: 'onnx-community/Qwen3-0.6B-ONNX', name: 'Qwen3 0.6B', by: 'Alibaba', date: 'April 2025', params: '600 million', chat: true, window: 4096, noThink: true,
      mb: { q4f16: 570, q8: 618, q4: 919, fp16: 1203 }, gen: { temperature: 0.7, top_k: 20, top_p: 0.8 }, about: 'It is trained to chat, and is about a fifth of the size of Gemini Nano.' },
    'gpt2': { repo: 'onnx-community/gpt2-ONNX', name: 'GPT-2 small', by: 'OpenAI', date: 'February 2019', params: '124 million', mb: { q8: 280, fp16: 249 }, about: SCRIPT },
    'gpt2-medium': { repo: 'onnx-community/gpt2-medium-ONNX', name: 'GPT-2 medium', by: 'OpenAI', date: 'May 2019', params: '355 million', mb: { q8: 562, fp16: 710 }, about: SCRIPT },
    'gpt2-large': { repo: 'onnx-community/gpt2-large-ONNX', name: 'GPT-2 large', by: 'OpenAI', date: 'August 2019', params: '774 million', mb: { q8: 1034, fp16: 1549 }, about: SCRIPT },
    'gpt2-xl': { repo: 'onnx-community/gpt2-xl-ONNX', name: 'GPT-2 XL', by: 'OpenAI', date: 'November 2019', params: '1.5 billion', mb: { q8: 1884 }, about: SCRIPT },
  };
  const STOPS = ['\nUser:', '\nAssistant:', '\nUSER:', '\nuser:'];

  const abortError = () => new DOMException('The request was stopped.', 'AbortError');
  let chain = Promise.resolve();       // one generation at a time: the model cannot run two at once
  const inTurn = fn => { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; };

  // Does a parsed reply fit the JSON shape the page asked for? (Only the kinds of shape the page uses.)
  function fits(v, s) {
    if (!s) return true;
    if (s.enum) return s.enum.includes(v);
    if (s.type === 'object') return !!v && typeof v === 'object' && !Array.isArray(v) && (s.required || []).every(k => k in v) && Object.entries(s.properties || {}).every(([k, p]) => !(k in v) || fits(v[k], p));
    if (s.type === 'array') return Array.isArray(v) && v.every(x => fits(x, s.items));
    if (s.type === 'string') return typeof v === 'string';
    if (s.type === 'integer') return Number.isInteger(v);
    if (s.type === 'number') return typeof v === 'number';
    if (s.type === 'boolean') return typeof v === 'boolean';
    return true;
  }
  // The end of the first complete {...} in a text, or -1.
  function closes(t) {
    let depth = 0, str = false, esc = false, seen = false;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (str) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') str = false; continue; }
      if (c === '"') str = true; else if (c === '{') { depth++; seen = true; } else if (c === '}') { depth--; if (seen && depth === 0) return i + 1; }
    }
    return -1;
  }

  function make(key, opts = {}) {
    const info = MODELS[key];
    if (!info) return null;
    const chat = !!info.chat, frame = chat ? 'chat' : opts.frame === 'none' ? 'none' : 'script';
    // The chat models need the graphics card to be usable (see the README); GPT-2 small is quick enough on the processor.
    const want = opts.device === 'webgpu' || opts.device === 'wasm' ? opts.device : chat && self.navigator && navigator.gpu ? 'webgpu' : 'wasm';
    const order = want === 'webgpu' ? ['q4f16', 'fp16', 'q4', 'q8'] : ['q4', 'q8', 'q4f16'];
    const dtype = opts.dtype && info.mb[opts.dtype] ? opts.dtype : order.find(d => info.mb[d]) || 'q8';
    const file = `onnx/model${dtype === 'q8' ? '_quantized' : '_' + dtype}.onnx`;
    const WINDOW = chat ? info.window : 1024;            // GPT-2 can hold no more than 1,024 tokens, prompt and reply together
    const REPLY = chat ? 600 : 150;                      // tokens kept for the reply
    let lib = null, tok = null, model = null, loading = null;
    const stats = { key, dtype, device: want, loadMs: 0, calls: 0, overflow: 0, readTokens: 0, readMs: 0, writeTokens: 0, writeMs: 0, json: 0, jsonFit: 0 };

    function load(onProgress) {
      return loading || (loading = (async () => {
        const t0 = performance.now();
        lib = await import(LIB);
        lib.env.allowLocalModels = false;
        tok = await lib.AutoTokenizer.from_pretrained(info.repo);
        model = await lib.AutoModelForCausalLM.from_pretrained(info.repo, {
          dtype, device: want,
          progress_callback: p => { if (onProgress && p.status === 'progress' && p.total && /\.onnx/.test(p.file || '')) onProgress(Math.min(.999, p.loaded / p.total)); },
        });
        END = [].concat((model.generation_config && model.generation_config.eos_token_id) ?? tok.eos_token_id ?? []).map(Number).slice(0, 1);
        stats.loadMs = Math.round(performance.now() - t0);
        if (onProgress) onProgress(1);
      })().catch(e => { loading = null; throw e; }));
    }
    const count = text => text ? tok.encode(text).length : 0;

    // One continuation of the token ids. Text is passed to onText as it is written. Ends at a stop string, at the
    // model's own end, at `max` tokens, when `done(text)` says so, or when the signal fires.
    // `allow(written)` may name the only tokens allowed next, given the tokens written so far (or null for any).
    async function generate(ids, { signal, onText, max = REPLY, stops = [], done = null, sample = true, allow = null } = {}) {
      if (signal && signal.aborted) throw abortError();
      const t0 = performance.now();
      // What does not fit the window is cut from the start, as the oldest text.
      const room = WINDOW - Math.min(max, WINDOW >> 1);
      let cut = 0;
      if (ids.length > room) { cut = ids.length - room; ids = ids.slice(cut); stats.overflow++; }
      const input_ids = new lib.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]);
      const attention_mask = new lib.Tensor('int64', new BigInt64Array(ids.length).fill(1n), [1, ids.length]);
      const stopper = new lib.InterruptableStoppingCriteria();
      const onAbort = () => stopper.interrupt();
      if (signal) signal.addEventListener('abort', onAbort);
      let acc = '', sent = 0, n = 0, ended = false, first = 0;
      const flush = final => {
        let end = acc.length, hit = -1;
        for (const s of stops) { const i = acc.indexOf(s); if (i >= 0 && (hit < 0 || i < hit)) hit = i; }
        if (hit < 0 && done) hit = done(acc);
        if (hit >= 0) { end = hit; ended = true; stopper.interrupt(); }
        else if (!final) {                       // hold back an ending that might be the start of a stop string
          for (const s of stops) for (let k = Math.min(s.length - 1, acc.length); k > 0; k--) if (acc.endsWith(s.slice(0, k))) { end = Math.min(end, acc.length - k); break; }
        }
        if (end > sent) { const piece = acc.slice(sent, end); sent = end; if (onText) onText(piece); }
      };
      const streamer = new lib.TextStreamer(tok, { skip_prompt: true, skip_special_tokens: true,
        token_callback_function: () => { if (!first) first = performance.now(); n++; },
        callback_function: text => { if (!ended) { acc += text; flush(false); } } });
      try {
        // No repetition penalty: it counts every word already in the conversation, so a long conversation turned replies into word salad.
        let logits_processor = null;
        if (allow) {
          const from = ids.length;
          class Only extends lib.LogitsProcessor {
            _call(input_ids, logits) {
              for (let i = 0; i < input_ids.length; i++) {
                const ok = allow(input_ids[i].slice(from).map(Number)); if (!ok) continue;
                const d = logits[i].data, keep = ok.map(t => d[t]); d.fill(-Infinity); ok.forEach((t, k) => { d[t] = keep[k]; });
              }
              return logits;
            }
          }
          logits_processor = new lib.LogitsProcessorList(); logits_processor.push(new Only());
        }
        await model.generate({ input_ids, attention_mask, max_new_tokens: max, ...(sample ? { do_sample: true, ...(info.gen || { temperature: 0.7, top_k: 40, top_p: 0.95 }) } : { do_sample: false }),
          streamer, stopping_criteria: stopper, ...(logits_processor ? { logits_processor } : {}) });
      } finally { if (signal) signal.removeEventListener('abort', onAbort); }
      if (signal && signal.aborted) throw abortError();
      if (!ended) flush(true);
      const t1 = performance.now();
      stats.calls++; stats.readTokens += ids.length; stats.readMs += (first || t1) - t0; stats.writeTokens += Math.max(0, n - 1); stats.writeMs += first ? t1 - first : 0;
      return { text: acc.slice(0, sent), cut, promptTokens: ids.length, newTokens: n, ms: Math.round(t1 - t0), readMs: Math.round((first || t1) - t0) };
    }
    let END = [];                         // the model's own end-of-reply token, known once it has loaded
    const think = t => t.replace(/<think>[\s\S]*?(<\/think>|$)/g, '');

    class Session extends EventTarget {
      constructor(sys, msgs) { super(); this.sys = sys || ''; this.msgs = msgs || []; this.dead = false; this.last = null; }
      get contextWindow() { return WINDOW; }
      get inputQuota() { return WINDOW; }
      get contextUsage() { return this.ids().length; }
      get inputUsage() { return this.contextUsage; }
      // The conversation as the text the model is asked to continue.
      script(next, start = '') {
        const all = next == null ? this.msgs : [...this.msgs, { role: 'user', content: next }];
        if (chat) {
          const m = [...(this.sys ? [{ role: 'system', content: this.sys }] : []), ...all];
          if (!m.length) return '';
          return tok.apply_chat_template(m, { tokenize: false, add_generation_prompt: next != null, ...(info.noThink ? { enable_thinking: false } : {}) }) + start;
        }
        if (frame === 'none') return [this.sys, ...all.map(m => m.content)].filter(Boolean).join('\n\n');
        const lines = all.map(m => (m.role === 'assistant' ? 'Assistant: ' : 'User: ') + m.content).join('\n');
        return (this.sys ? this.sys + '\n\n' : '') + lines + (next == null ? '' : '\nAssistant:');
      }
      // The chat layout brings its own start-of-text mark, so none is added for it.
      ids(next, start) { const t = this.script(next, start); return t ? tok.encode(t, chat ? { add_special_tokens: false } : {}) : []; }
      async measureContextUsage(text) { return count(typeof text === 'string' ? text : JSON.stringify(text)); }
      async clone({ signal } = {}) { if (signal && signal.aborted) throw abortError(); return new Session(this.sys, this.msgs.map(m => ({ ...m }))); }
      async append(msgs) { for (const m of msgs) this.msgs.push({ role: m.role, content: String(m.content) }); }
      destroy() { this.dead = true; }
      async run(text, signal, onText, schema) {
        if (this.dead) throw new DOMException('This session was destroyed.', 'InvalidStateError');
        let reply;
        if (schema && chat) {
          // Asked for JSON. Chrome holds Gemini Nano to the shape; here the page writes the braces and the field names itself
          // and lets the model fill in one value at a time. Each value is written without chance.
          const obj = {}, keys = schema.required || Object.keys(schema.properties || {}), t0 = performance.now(); let read = 0, wrote = 0;
          const sofar = k => '{' + Object.entries(obj).map(([a, v]) => JSON.stringify(a) + ': ' + JSON.stringify(v) + ', ').join('') + JSON.stringify(k) + ': ';
          const go = async (ids, o) => { const r = await inTurn(() => generate(ids, { signal, sample: false, ...o })); read += r.promptTokens; wrote += r.newTokens; return r; };
          for (const k of keys) {
            const p = (schema.properties || {})[k] || {}, lead = sofar(k);
            if (p.enum && p.enum.every(c => typeof c === 'string')) {
              // One of a few words (which tool, which verdict): only the tokens that spell one of them are allowed.
              const all = p.enum.map(c => this.ids(text, lead + '"' + c + '"'));
              let L = 0; while (all.every(a => L < a.length && a[L] === all[0][L])) L++;
              L = Math.min(L, ...all.map(a => a.length - 1));
              const rest = all.map(a => a.slice(L)); let picked = -1;
              await go(all[0].slice(0, L), { max: Math.max(...rest.map(r => r.length)) + 1, allow: written => {
                const full = rest.findIndex(r => r.length === written.length && r.every((t, i) => t === written[i]));
                if (full >= 0) { picked = full; return END; }
                const live = rest.filter(r => r.length > written.length && written.every((t, i) => r[i] === t));
                return live.length ? [...new Set(live.map(r => r[written.length]))] : END;
              } });
              obj[k] = p.enum[Math.max(0, picked)];
            } else if (p.type === 'array') {
              const r = await go(this.ids(text, lead + '['), { max: 60, done: acc => acc.indexOf(']') });
              let v = []; try { v = JSON.parse('[' + r.text + ']'); } catch { /* not a list after all */ }
              obj[k] = (Array.isArray(v) ? v : []).filter(x => fits(x, p.items)).slice(0, p.maxItems || 20);
            } else if (p.type === 'integer' || p.type === 'number') {
              const r = await go(this.ids(text, lead), { max: 8, done: acc => acc.search(/[,}\n]/) });
              obj[k] = p.type === 'integer' ? parseInt(r.text, 10) || 0 : parseFloat(r.text) || 0;
            } else if (p.type === 'boolean') {
              const r = await go(this.ids(text, lead), { max: 3 }); obj[k] = /^\s*true/i.test(r.text);
            } else {                                              // a string: up to the quote that closes it
              const r = await go(this.ids(text, lead + '"'), { max: 90, done: acc => { const m = /(^|[^\\])(\\\\)*"/.exec(acc); return m ? m.index + m[0].length - 1 : acc.indexOf('\n'); } });
              let v = r.text; try { v = JSON.parse('"' + r.text.replace(/[\u0000-\u001f]/g, ' ') + '"'); } catch { v = r.text.replace(/\\/g, ''); }
              obj[k] = v.trim();
            }
          }
          this.last = { promptTokens: read, newTokens: wrote, ms: Math.round(performance.now() - t0), readMs: 0, fields: keys.length };
          reply = JSON.stringify(obj); stats.json++; this.raw = reply;
          if (fits(obj, schema)) stats.jsonFit++; else reply = '';                // the page treats an empty reply as "no usable answer"
        } else {
          const r = await inTurn(() => generate(this.ids(text), { signal, onText, stops: frame === 'script' ? STOPS : [] }));
          this.last = r; reply = think(r.text).trim();
          if (r.cut) this.dispatchEvent(new Event('contextoverflow'));
        }
        this.msgs.push({ role: 'user', content: text }, { role: 'assistant', content: reply });
        return reply;
      }
      // GPT-2 cannot be held to a JSON shape at all, so for it a responseConstraint is ignored.
      prompt(text, { signal, responseConstraint } = {}) { return this.run(text, signal, null, responseConstraint); }
      promptStreaming(text, { signal } = {}) {
        const self_ = this;
        return (async function* () {
          const q = []; let wake = null, done = false, err = null, first = true, hidden = '';
          const ring = () => { if (wake) { const w = wake; wake = null; w(); } };
          self_.run(text, signal, piece => { q.push(piece); ring(); }).then(() => { done = true; ring(); }, e => { err = e; done = true; ring(); });
          for (;;) {
            if (q.length) {
              let piece = q.shift();
              if (info.noThink && (hidden || /^\s*<think>/.test(piece))) { hidden += piece; const i = hidden.indexOf('</think>'); if (i < 0) continue; piece = hidden.slice(i + 8); hidden = ''; }   // a "thinking" block is not part of the reply
              if (first) { piece = piece.replace(/^\s+/, ''); if (!piece) continue; first = false; }
              yield piece;
            } else if (done) break;
            else await new Promise(r => { wake = r; });
          }
          if (err) throw err;
        })();
      }
    }

    const LM = {
      async availability() {
        if (model) return 'available';
        try { const c = await caches.open('transformers-cache'); if (await c.match(`https://huggingface.co/${info.repo}/resolve/main/${file}`)) return 'available'; } catch { /* no cache here (a page opened from disk) */ }
        return 'downloadable';
      },
      async create(o = {}) {
        let progress = null;
        if (o.monitor) { const t = new EventTarget(); o.monitor(t); progress = p => t.dispatchEvent(Object.assign(new Event('downloadprogress'), { loaded: p, total: 1 })); }
        await load(progress);
        const init = o.initialPrompts || [];
        const sys = init.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
        return new Session(sys, init.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: String(m.content) })));
      },
    };
    const rates = () => ({ read: stats.readMs ? +(stats.readTokens / stats.readMs * 1000).toFixed(1) : null, write: stats.writeMs ? +(stats.writeTokens / stats.writeMs * 1000).toFixed(1) : null });
    return { LM, info: { ...info, key, frame, dtype, device: want, megabytes: info.mb[dtype] || info.mb.q8, window: WINDOW }, stats, rates,
      generate: (p, o) => load().then(() => inTurn(() => generate(tok.encode(p), o))), count: t => count(t), load };
  }
  self.NanoChatAlt = { MODELS, make, fits, closes };
})();
