// An experiment: Nano Chat on GPT-2 (OpenAI, 2019) instead of Gemini Nano.
// Open the page with ?model=gpt2 and this file is loaded. It gives GPT-2 the same face that
// Chrome gives Gemini Nano (create, prompt, promptStreaming, clone, append), so that the rest
// of the page, every part included, runs unchanged on a model from 2019.
//
// GPT-2 was never trained to hold a conversation: it only continues text. So this file lays
// each conversation out as a script ("User: ... Assistant: ...") and lets GPT-2 write on from
// "Assistant:", stopping it when it starts a line for the user. ?frame=none leaves that out
// and hands GPT-2 the bare words.
//
// The model runs in this browser, through transformers.js. The library comes from jsDelivr and
// the weights from Hugging Face; no part of a conversation is sent anywhere.
(() => {
  const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2';
  const MODELS = {
    'gpt2': { repo: 'onnx-community/gpt2-ONNX', name: 'GPT-2 small', params: '124 million', mb: { q8: 280, fp16: 249 }, date: 'February 2019' },
    'gpt2-medium': { repo: 'onnx-community/gpt2-medium-ONNX', name: 'GPT-2 medium', params: '355 million', mb: { q8: 562, fp16: 710 }, date: 'May 2019' },
    'gpt2-large': { repo: 'onnx-community/gpt2-large-ONNX', name: 'GPT-2 large', params: '774 million', mb: { q8: 1034, fp16: 1549 }, date: 'August 2019' },
    'gpt2-xl': { repo: 'onnx-community/gpt2-xl-ONNX', name: 'GPT-2 XL', params: '1.5 billion', mb: { q8: 1884 }, date: 'November 2019' },
  };
  const WINDOW = 1024;                 // all that any GPT-2 can hold, prompt and reply together
  const REPLY = 150;                   // tokens kept for the reply
  const STOPS = ['\nUser:', '\nAssistant:', '\nUSER:', '\nuser:'];

  const abortError = () => new DOMException('The request was stopped.', 'AbortError');
  let chain = Promise.resolve();       // one generation at a time: the model cannot run two at once
  const inTurn = fn => { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; };

  function make(key, opts = {}) {
    const info = MODELS[key];
    if (!info) return null;
    const frame = opts.frame === 'none' ? 'none' : 'script';
    const want = opts.device === 'webgpu' ? 'webgpu' : 'wasm';
    const dtype = opts.dtype || (want === 'webgpu' && info.mb.fp16 ? 'fp16' : 'q8');
    const file = `onnx/model${dtype === 'q8' ? '_quantized' : '_' + dtype}.onnx`;
    let lib = null, tok = null, model = null, loading = null;
    const stats = { key, dtype, device: want, loadMs: 0, calls: 0, tokens: 0, ms: 0, overflow: 0 };

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
        stats.loadMs = Math.round(performance.now() - t0);
        if (onProgress) onProgress(1);
      })().catch(e => { loading = null; throw e; }));
    }
    const count = text => text ? tok.encode(text).length : 0;

    // One continuation of `prompt`. Text is passed to onText as it is written. Ends at a stop string, at the model's
    // own end-of-text, at `max` tokens, or when the signal fires.
    async function generate(prompt, { signal, onText, max = REPLY, stops = STOPS } = {}) {
      if (signal && signal.aborted) throw abortError();
      const t0 = performance.now();
      let ids = tok.encode(prompt);
      // GPT-2 cannot take more than its window. What does not fit is cut from the start, as the oldest text.
      const room = WINDOW - max;
      let cut = 0;
      if (ids.length > room) { cut = ids.length - room; ids = ids.slice(cut); stats.overflow++; }
      const input_ids = new lib.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]);
      const attention_mask = new lib.Tensor('int64', new BigInt64Array(ids.length).fill(1n), [1, ids.length]);
      const stopper = new lib.InterruptableStoppingCriteria();
      const onAbort = () => stopper.interrupt();
      if (signal) signal.addEventListener('abort', onAbort);
      let acc = '', sent = 0, n = 0, ended = false;
      const flush = final => {
        let end = acc.length, hit = -1;
        for (const s of stops) { const i = acc.indexOf(s); if (i >= 0 && (hit < 0 || i < hit)) hit = i; }
        if (hit >= 0) { end = hit; ended = true; stopper.interrupt(); }
        else if (!final) {                       // hold back an ending that might be the start of a stop string
          for (const s of stops) for (let k = Math.min(s.length - 1, acc.length); k > 0; k--) if (acc.endsWith(s.slice(0, k))) { end = Math.min(end, acc.length - k); break; }
        }
        if (end > sent) { const piece = acc.slice(sent, end); sent = end; if (onText) onText(piece); }
      };
      const streamer = new lib.TextStreamer(tok, { skip_prompt: true, skip_special_tokens: true,
        token_callback_function: () => { n++; },
        callback_function: text => { if (!ended) { acc += text; flush(false); } } });
      try {
        // No repetition penalty: it counts every word already in the conversation, so a long conversation turned replies into word salad.
        await model.generate({ input_ids, attention_mask, max_new_tokens: max, do_sample: true, temperature: 0.7, top_k: 40, top_p: 0.95,
          streamer, stopping_criteria: stopper });
      } finally { if (signal) signal.removeEventListener('abort', onAbort); }
      if (signal && signal.aborted) throw abortError();
      if (!ended) flush(true);
      stats.calls++; stats.tokens += n; stats.ms += performance.now() - t0;
      return { text: acc.slice(0, sent), cut, promptTokens: ids.length, newTokens: n, ms: Math.round(performance.now() - t0) };
    }

    class Session extends EventTarget {
      constructor(sys, msgs) { super(); this.sys = sys || ''; this.msgs = msgs || []; this.dead = false; this.last = null; }
      get contextWindow() { return WINDOW; }
      get inputQuota() { return WINDOW; }
      get contextUsage() { return count(this.script()); }
      get inputUsage() { return this.contextUsage; }
      // The conversation as the text GPT-2 is asked to continue.
      script(next) {
        const all = next == null ? this.msgs : [...this.msgs, { role: 'user', content: next }];
        if (frame === 'none') return [this.sys, ...all.map(m => m.content)].filter(Boolean).join('\n\n');
        const lines = all.map(m => (m.role === 'assistant' ? 'Assistant: ' : 'User: ') + m.content).join('\n');
        return (this.sys ? this.sys + '\n\n' : '') + lines + (next == null ? '' : '\nAssistant:');
      }
      async measureContextUsage(text) { return count(typeof text === 'string' ? text : JSON.stringify(text)); }
      async clone({ signal } = {}) { if (signal && signal.aborted) throw abortError(); return new Session(this.sys, this.msgs.map(m => ({ ...m }))); }
      async append(msgs) { for (const m of msgs) this.msgs.push({ role: m.role, content: String(m.content) }); }
      destroy() { this.dead = true; }
      async run(text, signal, onText) {
        if (this.dead) throw new DOMException('This session was destroyed.', 'InvalidStateError');
        const r = await inTurn(() => generate(this.script(text), { signal, onText, stops: frame === 'none' ? [] : STOPS }));
        this.last = r;
        if (r.cut) this.dispatchEvent(new Event('contextoverflow'));
        const reply = r.text.trim();
        this.msgs.push({ role: 'user', content: text }, { role: 'assistant', content: reply });
        return reply;
      }
      // GPT-2 has no way to be held to a JSON shape, so a responseConstraint is ignored. (Chrome enforces it for Nano.)
      prompt(text, { signal } = {}) { return this.run(text, signal, null); }
      promptStreaming(text, { signal } = {}) {
        const self_ = this;
        return (async function* () {
          const q = []; let wake = null, done = false, err = null, first = true;
          const ring = () => { if (wake) { const w = wake; wake = null; w(); } };
          self_.run(text, signal, piece => { q.push(piece); ring(); }).then(() => { done = true; ring(); }, e => { err = e; done = true; ring(); });
          for (;;) {
            if (q.length) { let piece = q.shift(); if (first) { piece = piece.replace(/^\s+/, ''); if (!piece) continue; first = false; } yield piece; }
            else if (done) break;
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
    return { LM, info: { ...info, key, frame, dtype, device: want, megabytes: info.mb[dtype] || info.mb.q8, window: WINDOW }, stats, generate: (p, o) => load().then(() => inTurn(() => generate(p, o))), count: t => count(t), load };
  }
  self.NanoChatAlt = { MODELS, make };
})();
