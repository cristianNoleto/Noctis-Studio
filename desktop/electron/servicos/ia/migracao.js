// Migração dos apps antigos (Audio Atlas e Renomeador) para o Noctis Studio.
//   • Só LÊ os arquivos antigos (nunca altera nem apaga). Antes de importar, guarda uma cópia
//     em <userData>/migracao/<data>/.
//   • Pode rodar quantas vezes quiser (idempotente): não duplica favoritos, histórico nem logs, e
//     não troca a pasta do banco de sons se o Noctis Studio já tiver uma.
//   • O catálogo (catalogo-pixabay.json) mora na própria pasta do banco de sons, então continua
//     valendo assim que a pasta é a mesma; depois a pasta é reindexada (contagem dos áudios).
const fs = require('fs');
const os = require('os');
const path = require('path');

function lerJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }

function origens({ appData, localAppData }) {
  const home = os.homedir();
  appData = appData || process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
  localAppData = localAppData || process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  return {
    audioAtlas: [path.join(appData, 'Audio Atlas', 'state.json'), path.join(appData, 'audio-atlas', 'state.json')],
    renomeador: [
      path.join(localAppData, 'Programs', 'Renomeador', 'historico'),
      path.join(appData, 'Renomeador', 'historico'),
      path.join(localAppData, 'Renomeador', 'historico'),
    ],
  };
}

function migrar({ dataDir, store, lib, historicoDir, appData, localAppData, unidadeExiste = (u) => fs.existsSync(u), agora = new Date() }) {
  const o = origens({ appData, localAppData });
  const pastaBackup = path.join(dataDir, 'migracao', agora.toISOString().slice(0, 10));
  const backup = (origem, nome) => {
    const destino = path.join(pastaBackup, nome);
    if (fs.existsSync(destino)) return destino;
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.cpSync(origem, destino, { recursive: true });
    return destino;
  };
  const rel = { audioAtlas: null, renomeador: null, bancoDeSons: null };

  // ---- Audio Atlas
  const arqAA = o.audioAtlas.find((p) => fs.existsSync(p));
  const velho = arqAA && lerJson(arqAA);
  if (velho) {
    const r = { origem: arqAA, backup: backup(arqAA, 'audio-atlas-state.json'), pasta: null, favoritos: 0, historico: 0 };
    const cfg = store.get().audioAtlas || {};
    const raizVelha = String(velho.config?.root || '').trim();
    if (!cfg.root && raizVelha) { store.set({ audioAtlas: { root: raizVelha } }); r.pasta = raizVelha; }
    if (velho.config?.intervalMs && (!cfg.intervalMs || cfg.intervalMs === 1500)) store.set({ audioAtlas: { intervalMs: Math.max(500, Number(velho.config.intervalMs) || 1500) } });
    const st = lib.getState();
    const favIds = new Set(st.favorites.map((f) => String(f.id)));
    for (const f of velho.favorites || []) if (f && f.id != null && !favIds.has(String(f.id))) { st.favorites.push(f); favIds.add(String(f.id)); r.favoritos++; }
    const chaves = new Set(st.history.map((h) => `${h.type}|${h.query}`));
    for (const h of velho.history || []) if (h && h.query && !chaves.has(`${h.type}|${h.query}`)) { st.history.push(h); chaves.add(`${h.type}|${h.query}`); r.historico++; }
    st.history = st.history.sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 50);
    lib.setConfig({}); // grava o state.json do Noctis
    rel.audioAtlas = r;
  }

  // ---- Renomeador (histórico de operações para "Desfazer")
  const dirRen = o.renomeador.find((p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } });
  if (dirRen) {
    const r = { origem: dirRen, backup: backup(dirRen, 'renomeador-historico'), copiados: 0, jaExistiam: 0 };
    fs.mkdirSync(historicoDir, { recursive: true });
    for (const nome of fs.readdirSync(dirRen).filter((n) => n.endsWith('.json'))) {
      const destino = path.join(historicoDir, nome);
      if (fs.existsSync(destino)) { r.jaExistiam++; continue; }
      const log = lerJson(path.join(dirRen, nome));
      if (!log || !Array.isArray(log.arquivos)) continue;
      fs.copyFileSync(path.join(dirRen, nome), destino);
      r.copiados++;
    }
    rel.renomeador = r;
  }

  // ---- Reindexar a pasta do banco de sons (só leitura)
  const raiz = String(store.get().audioAtlas?.root || '');
  if (raiz) {
    const unidade = path.parse(path.resolve(raiz)).root;
    if (unidade && !unidadeExiste(unidade)) rel.bancoDeSons = { root: raiz, disponivel: false, aviso: `A unidade ${unidade.replace(/[\\/]+$/, '')} não está montada agora (Google Drive fechado?). A pasta será usada assim que ela voltar.` };
    else if (!fs.existsSync(raiz)) rel.bancoDeSons = { root: raiz, disponivel: false, aviso: 'A pasta ainda não existe; será criada no primeiro download.' };
    else {
      if (lib.getState().config.root !== raiz) lib.setConfig({ root: raiz });
      rel.bancoDeSons = { root: raiz, disponivel: true, audios: lib.library('').length, noCatalogo: lib.readCatalog().length };
    }
  }

  const achouAlgo = !!(rel.audioAtlas || rel.renomeador);
  rel.podeDesinstalar = achouAlgo;
  rel.mensagem = achouAlgo
    ? 'Dados dos apps antigos importados (os originais não foram alterados). Depois de testar a conexão das IAs com o Noctis Studio, você pode desinstalar o Audio Atlas e o Renomeador antigos.'
    : 'Nenhum dado dos apps antigos encontrado neste computador.';
  store.set({ migracao: { ultima: agora.toISOString(), audioAtlas: !!rel.audioAtlas, renomeador: !!rel.renomeador } });
  return rel;
}

module.exports = { migrar, origens };
