// Ponte segura entre a interface e o processo principal. A interface só chama
// canais com prefixos conhecidos; cada chamada volta como { ok, data } ou { ok:false, error }.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const PREFIXOS = ['app:', 'auth:', 'settings:', 'logs:', 'sys:', 'ren:', 'aa:', 'creator:', 'accounts:', 'srt:', 'chat:', 'ia:', 'studio:'];
const EVENTOS = new Set(['log', 'auth', 'aa:progress', 'app:close-request', 'creator:update', 'accounts:update', 'srt:progress', 'chat:event', 'settings', 'app:update', 'app:navigate', 'ia:estado']);

contextBridge.exposeInMainWorld('noctis', {
  platform: process.platform,
  async invoke(canal, ...args) {
    if (!PREFIXOS.some((p) => canal.startsWith(p))) throw new Error(`Canal não permitido: ${canal}`);
    const r = await ipcRenderer.invoke(canal, ...args);
    if (!r || !r.ok) throw Object.assign(new Error(r?.error || 'Erro desconhecido'), { code: r?.code });
    return r.data;
  },
  on(evento, fn) {
    if (!EVENTOS.has(evento)) throw new Error(`Evento não permitido: ${evento}`);
    const h = (_e, d) => fn(d);
    ipcRenderer.on(evento, h);
    return () => ipcRenderer.removeListener(evento, h);
  },
  pathOf(file) {
    try { return webUtils.getPathForFile(file); } catch { return null; }
  },
});
