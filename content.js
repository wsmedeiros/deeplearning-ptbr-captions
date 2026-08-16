(function () {
  const CACHE = new Map(), INFLIGHT = new Set();
  let cueObs = null, bodyObs = null, currentRoot = null, active = false;

  async function translateBatch(lines) {
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=pt-BR&dt=t&q=${encodeURIComponent(lines.join('\n'))}`;
      const data = await (await fetch(url)).json();
      const results = data[0].reduce((s, c) => s + (c[0] ?? ''), '').split('\n');
      lines.forEach((o, i) => CACHE.set(o, results[i]?.trim() || o));
    } catch (e) {}
  }

  function extractCaptions() {
    const el = document.getElementById('__NEXT_DATA__');
    if (!el) return [];
    try {
      const q = JSON.parse(el.textContent)?.props?.pageProps?.trpcState?.json?.queries ?? [];
      for (const e of q) {
        const c = e?.state?.data?.captions;
        if (Array.isArray(c) && c.length)
          return [...new Set(c.map(x => x.text.replace(/\n+/g, ' ').trim()).filter(Boolean))];
      }
    } catch (e) {}
    return [];
  }

  function applyCue(c) {
    const s = c.textContent.trim().replace(/\n+/g, ' ');
    if (!s || s === c._pt) return;
    if (CACHE.has(s)) { c.textContent = CACHE.get(s); c._pt = CACHE.get(s); return; }
    if (INFLIGHT.has(s)) return;
    INFLIGHT.add(s);
    translateBatch([s]).then(() => {
      INFLIGHT.delete(s);
      document.querySelectorAll('[data-part="cue"]').forEach(el => {
        const t = el.textContent.trim().replace(/\n+/g, ' ');
        if (t === s && CACHE.has(s)) { el.textContent = CACHE.get(s); el._pt = CACHE.get(s); }
      });
    });
  }

  function attachObserver(root) {
    if (root === currentRoot) return;
    cueObs?.disconnect();
    currentRoot = root;
    cueObs = new MutationObserver(ms => {
      const seen = new Set();
      for (const { addedNodes: a, target: t } of ms) [t, ...a].forEach(n => {
        if (n.nodeType !== 1) n = n.parentElement;
        if (!n) return;
        (n.matches('[data-part="cue"]') ? [n] : [...n.querySelectorAll('[data-part="cue"]')])
          .filter(c => !seen.has(c) && seen.add(c)).forEach(applyCue);
      });
    });
    cueObs.observe(root, { childList: true, subtree: true });
    root.querySelectorAll('[data-part="cue"]').forEach(applyCue);
  }

  async function activate() {
    if (active) return;
    active = true;

    const root = document.querySelector('.vds-captions');
    if (!root) { console.warn('[PT-BR] .vds-captions não encontrado'); return; }

    const texts = extractCaptions();
    if (texts.length) {
      const B = 10, batches = [];
      for (let i = 0; i < texts.length; i += B) batches.push(texts.slice(i, i + B));
      await Promise.allSettled(batches.map(translateBatch));
    }

    attachObserver(root);

    // Reconecta quando o player é recriado (troca de vídeo)
    bodyObs = new MutationObserver(() => {
      const r = document.querySelector('.vds-captions');
      if (r && r !== currentRoot) attachObserver(r);
    });
    bodyObs.observe(document.body, { childList: true, subtree: true });

    // Detecta navegação SPA
    let lastUrl = location.href;
    function onNav() {
      if (location.href === lastUrl) return;
      lastUrl = location.href;
      currentRoot = null;
      cueObs?.disconnect();
    }
    ['pushState', 'replaceState'].forEach(k => {
      const orig = history[k].bind(history);
      history[k] = (...a) => { orig(...a); onNav(); };
    });
    window.addEventListener('popstate', onNav);

    console.log('[PT-BR Caption Translator] ativado ✓');
  }

  function deactivate() {
    if (!active) return;
    active = false;
    cueObs?.disconnect();
    bodyObs?.disconnect();
    cueObs = null;
    bodyObs = null;
    currentRoot = null;

    // Restaura textos originais que estiverem visíveis
    document.querySelectorAll('[data-part="cue"]').forEach(c => {
      if (c._pt) { c.textContent = c._pt; c._pt = null; }
    });

    console.log('[PT-BR Caption Translator] desativado');
  }

  // Escuta mensagens do popup
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'activate') {
      activate().then(() => sendResponse({ ok: true }));
      return true;
    }
    if (msg.action === 'deactivate') {
      deactivate();
      sendResponse({ ok: true });
    }
    if (msg.action === 'getStatus') {
      sendResponse({ active });
    }
  });
})();
