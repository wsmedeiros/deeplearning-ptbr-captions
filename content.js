(function () {
  // --- State ---
  const CACHE = new Map();
  const INFLIGHT = new Set();
  const CUE_STATE = new WeakMap(); // element -> { original: string, translated: string }
  let cueObs = null, bodyObs = null, currentRoot = null, active = false;
  let prefetchedTrack = null;

  // --- Constants ---
  const SOURCE_LANGUAGE = 'en';
  const TARGET_LANGUAGE = 'pt-BR';
  const MAX_CHARS = 42;
  const BATCH_SIZE = 10;

  // --- Translation ---
  async function translateBatch(lines) {
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${SOURCE_LANGUAGE}&tl=${TARGET_LANGUAGE}&dt=t&q=${encodeURIComponent(lines.join('\n'))}`;
      const data = await (await fetch(url)).json();
      const results = data[0].reduce((s, c) => s + (c[0] ?? ''), '').split('\n');
      lines.forEach((o, i) => CACHE.set(o, results[i]?.trim() || o));
    } catch (e) {
      console.warn('[PT-BR] Falha na tradução:', e);
    }
  }

  async function batchTranslateLines(lines) {
    const batches = [];
    for (let i = 0; i < lines.length; i += BATCH_SIZE) batches.push(lines.slice(i, i + BATCH_SIZE));
    await Promise.allSettled(batches.map(translateBatch));
  }

  // --- Prefetch strategies ---
  async function prefetchFromTrack() {
    const track = document.querySelector('video track[kind="subtitles"]');
    if (!track?.src || track.src === prefetchedTrack) return;
    prefetchedTrack = track.src;

    try {
      const text = await (await fetch(track.src)).text();
      const lines = [...new Set(
        text.split('\n')
          .map(l => l.trim())
          .filter(l => l && !l.startsWith('WEBVTT') && !l.startsWith('NOTE')
                    && !/^\d+$/.test(l) && !/^\d{2}:\d{2}/.test(l) && !l.startsWith('X-'))
          .map(l => l.replace(/<[^>]+>/g, '').replace(/\n+/g, ' ').trim())
          .filter(Boolean)
      )];
      if (lines.length) await batchTranslateLines(lines);
    } catch (e) {
      console.warn('[PT-BR] Falha ao buscar trilha de legendas:', e);
    }
  }

  async function prefetchFromNextData() {
    try {
      const queries = JSON.parse(document.getElementById('__NEXT_DATA__')?.textContent || '{}')
        ?.props?.pageProps?.trpcState?.json?.queries ?? [];
      for (const entry of queries) {
        const captions = entry?.state?.data?.captions;
        if (Array.isArray(captions) && captions.length) {
          const lines = [...new Set(captions.map(x => x.text.replace(/\n+/g, ' ').trim()).filter(Boolean))];
          await batchTranslateLines(lines);
          return;
        }
      }
    } catch (e) {
      console.warn('[PT-BR] Falha ao ler __NEXT_DATA__:', e);
    }
  }

  // --- DOM helpers ---
  function fixedWrap(text) {
    if (text.length <= MAX_CHARS) return text;
    const mid = Math.floor(text.length / 2);
    let left = text.lastIndexOf(' ', mid);
    let right = text.indexOf(' ', mid);
    if (left < 0) left = right;
    if (right < 0) right = left;
    const split = (mid - left) <= (right - mid) ? left : right;
    if (split < 0) return text;
    return text.slice(0, split) + '\n' + text.slice(split + 1);
  }

  function applyCue(c) {
    const text = c.textContent.trim().replace(/\n+/g, ' ');
    if (!text) return;

    const state = CUE_STATE.get(c);
    if (state?.translated === text) return;

    if (state) CUE_STATE.delete(c);

    const key = text;

    if (CACHE.has(key)) {
      const translated = CACHE.get(key);
      CUE_STATE.set(c, { original: key, translated });
      c.textContent = fixedWrap(translated);
      return;
    }

    c.style.visibility = 'hidden';
    if (INFLIGHT.has(key)) return;
    INFLIGHT.add(key);

    translateBatch([key]).then(() => {
      INFLIGHT.delete(key);
      document.querySelectorAll('[data-part="cue"]').forEach(el => {
        const elText = el.textContent.trim().replace(/\n+/g, ' ');
        if (elText === key && CACHE.has(key)) {
          const translated = CACHE.get(key);
          CUE_STATE.set(el, { original: key, translated });
          el.textContent = fixedWrap(translated);
          el.style.visibility = '';
        }
      });
    });
  }

  // --- Observers ---
  function attachObserver(root) {
    if (root === currentRoot) return;
    cueObs?.disconnect();
    currentRoot = root;
    cueObs = new MutationObserver(mutations => {
      const seen = new Set();
      for (const { addedNodes, target } of mutations) {
        [target, ...addedNodes].forEach(node => {
          if (node.nodeType !== 1) node = node.parentElement;
          if (!node) return;
          (node.matches('[data-part="cue"]') ? [node] : [...node.querySelectorAll('[data-part="cue"]')])
            .filter(c => !seen.has(c) && seen.add(c))
            .forEach(applyCue);
        });
      }
    });
    cueObs.observe(root, { childList: true, subtree: true });
    root.querySelectorAll('[data-part="cue"]').forEach(applyCue);
  }

  function watchForTrackChanges() {
    new MutationObserver(() => {
      const track = document.querySelector('video track[kind="subtitles"]');
      // Let prefetchFromTrack manage its own guard via prefetchedTrack
      if (track?.src && track.src !== prefetchedTrack) prefetchFromTrack();
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
  }

  // --- Lifecycle ---
  async function activate() {
    if (active) return;
    active = true;

    await Promise.allSettled([prefetchFromTrack(), prefetchFromNextData()]);

    const root = document.querySelector('.vds-captions');
    if (!root) { console.warn('[PT-BR] .vds-captions não encontrado'); return; }
    attachObserver(root);

    bodyObs = new MutationObserver(() => {
      const r = document.querySelector('.vds-captions');
      if (r && r !== currentRoot) prefetchFromTrack().then(() => attachObserver(r));
    });
    bodyObs.observe(document.body, { childList: true, subtree: true });

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

    watchForTrackChanges();
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
    prefetchedTrack = null;

    document.querySelectorAll('[data-part="cue"]').forEach(c => {
      c.style.visibility = '';
      const state = CUE_STATE.get(c);
      if (state) {
        c.textContent = state.original;
        CUE_STATE.delete(c);
      }
    });
    console.log('[PT-BR Caption Translator] desativado');
  }

  // --- Message listener ---
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
