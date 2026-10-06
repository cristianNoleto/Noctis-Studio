// IPC do Audio Atlas (mesmo comportamento do app original: janela oculta para o Pixabay,
// fila educada, tradução PT/ES→EN, pasta automática, catálogo JSON/CSV).
const path = require('path');
const { shell } = require('electron');
const lib = require('../servicos/audio-atlas/library');
const pixabay = require('../servicos/audio-atlas/pixabay');
const { translate } = require('../servicos/audio-atlas/translate');

module.exports = function registrar(ctx) {
  lib.init(path.join(ctx.dataDir, 'audio-atlas'));
  const sync = (s) => {
    const cfg = s.audioAtlas || {};
    lib.setConfig({ root: cfg.root || '', intervalMs: cfg.intervalMs || 1500 });
    pixabay.setInterval(cfg.intervalMs || 1500);
  };
  sync(ctx.store.get());
  ctx.onSettings.push(sync);

  const h = ctx.handle;
  h('aa:state', () => ({ ...lib.getState(), categories: lib.categories(), downloaded: [...lib.downloadedIds()] }));
  h('aa:search', async (opts) => {
    const tr = await translate(opts.query);
    const r = await pixabay.search({ ...opts, query: tr.english });
    if (opts.query.trim() && opts.page === 1) lib.addHistory({ query: opts.query.trim(), type: opts.type, at: Date.now() });
    return { ...r, translation: tr, downloaded: [...lib.downloadedIds()] };
  });
  h('aa:suggestCategory', (item) => lib.suggestCategory(item));
  h('aa:categories', () => lib.categories());
  h('aa:download', async (item, category) => {
    const send = (p) => ctx.send('aa:progress', { id: item.id, p });
    const r = await lib.download(item, category, { userAgent: pixabay.userAgent(), onProgress: send, throttle: pixabay.polite });
    if (!r.duplicate) ctx.log.success(`Audio Atlas: baixado ${path.basename(r.path)} → ${category}`);
    return r;
  });
  h('aa:library', (q) => lib.library(q));
  h('aa:favorite', (item) => lib.toggleFavorite(item));
  h('aa:clearHistory', () => { lib.getState().history = []; lib.setConfig({}); return []; });
  h('aa:openPage', (url) => { if (/^https:\/\/pixabay\.com\//.test(url)) shell.openExternal(url); return true; });
};
