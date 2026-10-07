// Núcleo das ferramentas para IAs (MCP, API local e testes chamam ESTE arquivo; a tela usa os
// mesmos módulos por baixo: audio-atlas/library, audio-atlas/pixabay, renomeador).
//
// Ferramentas de áudio: mesmos nomes, parâmetros e campos de saída do Audio Atlas antigo
// (search_audio, download_audio, list_categories, search_library).
//
// Pasta do banco de sons: NUNCA fixa no código. Ordem:
//   1. a pasta escolhida nas Configurações (no PC do Cristian, a do Google Drive em G:);
//      se a UNIDADE não existir (Google Drive fechado) → erro claro, nunca cria em outro lugar;
//      se só a pasta não existir ainda → cria.
//   2. nenhuma escolhida (PC novo) → cria Documentos\Noctis Studio\Banco de sons, salva nas
//      Configurações e devolve `notice` dizendo onde criou e por quê.
//
// Renomeador: só dentro das "Pastas liberadas para IAs"; preview obrigatório (previewId) antes de
// aplicar; nunca sobrescreve, nunca move entre pastas, nunca apaga; desfazer pelo histórico.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const erro = (code, message, extra = {}) => Object.assign(new Error(message), { code, ...extra });
const TIPOS = ['music', 'sfx'];
const DURACOES = ['short', 'medium', 'long'];
const ORDENS = ['relevance', 'latest'];
const PREVIEW_MS = 30 * 60 * 1000;
const MAX_LINHAS_RESPOSTA = 500;
const INVALIDOS_NOME = /[\\/:*?"<>|\u0000-\u001f]/;

function criarNucleo({ lib, pixabay, translate, ren, config, dataDir, documentsDir, unidadeExiste = (u) => fs.existsSync(u), agora = () => Date.now() }) {
  // pixabay pode ser uma função (carregado sob demanda: no modo MCP sem janela ele não existe).
  const px = () => (typeof pixabay === 'function' ? pixabay() : pixabay);
  const pastaPreviews = path.join(dataDir, 'ia', 'previews');
  // Só grava o state.json do Audio Atlas quando a raiz muda de fato.
  const usarRaiz = (r) => { if (lib.getState().config.root !== r) lib.setConfig({ root: r }); };

  // ---------------------------------------------------------------- pasta do banco de sons
  function pastaPadrao() { return path.join(documentsDir, 'Noctis Studio', 'Banco de sons'); }

  function verificarUnidade(raiz) {
    const unidade = path.parse(path.resolve(raiz)).root;
    if (unidade && !unidadeExiste(unidade)) {
      throw erro('NO_ROOT', `A pasta do banco de sons está em "${raiz}", mas a unidade ${unidade.replace(/[\\/]+$/, '')} não está disponível agora (o Google Drive está aberto e conectado?). Não vou criar a pasta em outro lugar: abra o Google Drive ou escolha outra pasta em Noctis Studio > Configurações.`);
    }
  }

  // Garante a pasta raiz. Devolve { root, notice? }.
  function garantirRaiz() {
    const cfg = config.get();
    let raiz = String(cfg.audioAtlas?.root || '').trim();
    let notice;
    if (raiz) {
      verificarUnidade(raiz);
      if (!fs.existsSync(raiz)) {
        try { fs.mkdirSync(raiz, { recursive: true }); } catch (e) { throw erro('NO_ROOT', `Não consegui criar a pasta do banco de sons "${raiz}": ${e.message}`); }
        notice = `A pasta do banco de sons escolhida nas Configurações ("${raiz}") ainda não existia, então eu criei.`;
      }
    } else {
      raiz = pastaPadrao();
      fs.mkdirSync(raiz, { recursive: true });
      config.set({ audioAtlas: { root: raiz } });
      notice = `Ainda não havia uma pasta de banco de sons escolhida neste computador, então criei "${raiz}" (na pasta Documentos) para guardar os áudios. Avise o usuário. Para usar outra pasta: Noctis Studio > Conectar IA > Pastas, ou peça ao usuário e use set_sound_folder.`;
    }
    usarRaiz(raiz);
    return { root: raiz, notice };
  }
  const comAviso = (obj, notice) => (notice ? { ...obj, notice } : obj);

  // ---------------------------------------------------------------- áudio (Audio Atlas)
  function texto(v, nome, { obrigatorio = true } = {}) {
    if (v === undefined || v === null || v === '') { if (obrigatorio) throw erro('USAGE', `Informe "${nome}".`); return ''; }
    if (typeof v !== 'string') throw erro('USAGE', `"${nome}" deve ser texto.`);
    return v.trim();
  }
  function enumOpc(v, nome, lista) {
    if (v === undefined || v === null || v === '') return undefined;
    if (!lista.includes(v)) throw erro('USAGE', `"${nome}" deve ser ${lista.map((x) => `"${x}"`).join(' ou ')}.`);
    return v;
  }
  function tipo(v) {
    if (v === 'sound-effects') return 'sfx';
    if (!TIPOS.includes(v)) throw erro('USAGE', '"type" deve ser "music" ou "sfx".');
    return v;
  }

  async function search_audio(a = {}) {
    const raw = texto(a.query, 'query');
    if (!raw) throw erro('USAGE', 'Informe o termo: ex. "dark ambient".');
    const type = tipo(a.type);
    const duration = enumOpc(a.duration, 'duration', DURACOES);
    const order = enumOpc(a.order, 'order', ORDENS);
    const limit = Math.max(1, Math.min(60, Math.floor(Number(a.limit)) || 20)); // como o Audio Atlas: ajusta em vez de recusar
    // A raiz só é necessária para marcar "downloaded"; se não houver, não cria nada aqui.
    const raiz = String(config.get().audioAtlas?.root || '').trim();
    if (raiz) { try { verificarUnidade(raiz); usarRaiz(raiz); } catch { usarRaiz(''); } }
    const tr = await translate(raw);
    const results = [];
    let page = 1;
    let pages = 1;
    do { // páginas de 20 itens; busca mais páginas (com o intervalo educado) só se o limit pedir.
      const r = await px().search({ type, query: tr.english, page, order, duration }, { waveforms: false });
      results.push(...r.items);
      pages = r.pages;
      page++;
    } while (results.length < limit && page <= pages && page <= 5);
    const done = lib.downloadedIds();
    return {
      query: raw, searchedAs: tr.english, translated: tr.translated, type,
      results: results.slice(0, limit).map((i) => ({
        id: i.id, title: i.title, author: i.author, duration: i.duration, tags: i.tags,
        pageUrl: i.pageUrl, genre: i.genre || undefined, contentId: i.contentId, downloaded: done.has(i.id),
      })),
    };
  }

  async function download_audio(a = {}) {
    const id = String(a.id ?? '').trim();
    if (!/^\d+$/.test(id)) throw erro('USAGE', 'Informe o ID numérico do Pixabay (ex.: "382724").');
    const type = tipo(a.type);
    const categoria = a.category === undefined || a.category === null ? '' : texto(a.category, 'category', { obrigatorio: false });
    const { notice } = garantirRaiz();
    const already = lib.findDownloaded(id);
    if (already) return comAviso({ ok: true, duplicate: true, id, path: already.localPath, category: already.category }, notice);
    const item = await px().getItem(id, type);
    const cat = categoria || lib.suggestCategory(item).name;
    const r = await lib.download(item, cat, { userAgent: px().userAgent(), throttle: px().polite });
    return comAviso({ ok: true, duplicate: r.duplicate, id, title: item.title, category: r.entry.category, newFolder: !!r.newFolder, path: r.path }, notice);
  }

  function list_categories() {
    const { root, notice } = garantirRaiz();
    return comAviso({ root, categories: lib.categories() }, notice);
  }

  function search_library(a = {}) {
    const q = a.query === undefined || a.query === null ? '' : texto(a.query, 'query', { obrigatorio: false });
    const { notice } = garantirRaiz();
    const items = lib.library(q);
    return comAviso({ query: q, count: items.length, results: items.map(({ fileUrl, ...i }) => i) }, notice);
  }

  // Escolher a pasta do banco de sons (só quando o usuário pedir). Cria se não existir.
  function set_sound_folder(a = {}) {
    const p = texto(a.path, 'path');
    if (!path.isAbsolute(p)) throw erro('USAGE', 'Use um caminho absoluto (ex.: "D:\\Sons\\Banco").');
    if (p.split(/[\\/]+/).includes('..')) throw erro('USAGE', 'O caminho não pode conter "..".');
    verificarUnidade(p);
    const existia = fs.existsSync(p);
    if (existia && !fs.statSync(p).isDirectory()) throw erro('USAGE', 'Esse caminho é um arquivo, não uma pasta.');
    if (!existia) fs.mkdirSync(p, { recursive: true });
    const antes = String(config.get().audioAtlas?.root || '');
    config.set({ audioAtlas: { root: p } });
    usarRaiz(p);
    return {
      ok: true, root: p, created: !existia, previousRoot: antes || null,
      notice: `${existia ? 'Passei a usar' : 'Criei e passei a usar'} "${p}" como pasta do banco de sons. ${antes ? `A anterior ("${antes}") continua intacta, nada foi movido ou apagado.` : ''} Avise o usuário.`.trim(),
    };
  }

  // ---------------------------------------------------------------- renomeador
  const pastasLiberadas = () => (config.get().ia?.pastasRenomear || []).filter((x) => typeof x === 'string' && x.trim());
  const real = (p) => { try { return fs.realpathSync.native ? fs.realpathSync.native(p) : fs.realpathSync(p); } catch { return null; } };
  const ncase = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);
  const dentro = (filho, pai) => { const f = ncase(filho); const pp = ncase(pai); return f === pp || f.startsWith(pp.endsWith(path.sep) ? pp : pp + path.sep); };

  function list_rename_folders() {
    const folders = pastasLiberadas().map((p) => ({ path: p, exists: fs.existsSync(p) }));
    return folders.length ? { folders } : { folders, notice: 'Nenhuma pasta liberada para IAs. Peça ao usuário para liberar em Noctis Studio > Conectar IA > "Pastas liberadas para IAs" (ou Configurações).' };
  }

  // A pasta tem de estar DENTRO de uma pasta liberada, sem "..", sem atalho/link.
  function verificarPasta(folder) {
    const f = texto(folder, 'folder');
    if (!path.isAbsolute(f)) throw erro('USAGE', '"folder" deve ser um caminho absoluto.');
    if (f.split(/[\\/]+/).includes('..')) throw erro('FOLDER_NOT_ALLOWED', 'Caminhos com ".." não são permitidos.');
    let st;
    try { st = fs.lstatSync(f); } catch { throw erro('NOT_FOUND', `Pasta não encontrada: ${f}`); }
    if (st.isSymbolicLink()) throw erro('FOLDER_NOT_ALLOWED', 'Atalhos/links simbólicos não são permitidos.');
    if (!st.isDirectory()) throw erro('USAGE', '"folder" não é uma pasta.');
    const r = real(f);
    const ok = pastasLiberadas().some((lib_) => { const rl = real(lib_); return rl && r && dentro(r, rl); });
    if (!ok) throw erro('FOLDER_NOT_ALLOWED', `A pasta "${f}" não está entre as "Pastas liberadas para IAs". Peça ao usuário para liberá-la no Noctis Studio (Conectar IA).`);
    return r;
  }

  const ACOES = {
    substituir: (a) => { campo(a, 'termo'); campoNome(a, 'novo', true); modo(a); },
    remover: (a) => { campo(a, 'termo'); modo(a); },
    prefixo: (a) => campoNome(a, 'texto'),
    sufixo: (a) => campoNome(a, 'texto'),
    numerar: (a) => { campoNome(a, 'formato'); if (a.inicio !== undefined && !Number.isInteger(Number(a.inicio))) throw erro('USAGE', '"inicio" deve ser inteiro.'); },
    caixa: (a) => { if (!['min', 'mai', 'tit'].includes(a.modo)) throw erro('USAGE', 'caixa: "modo" deve ser "min", "mai" ou "tit".'); },
    limpar: () => {},
  };
  function campo(a, k) { if (typeof a[k] !== 'string' || !a[k]) throw erro('USAGE', `${a.tipo}: informe "${k}".`); }
  function campoNome(a, k, vazioOk = false) {
    if (typeof a[k] !== 'string' || (!vazioOk && !a[k])) throw erro('USAGE', `${a.tipo}: informe "${k}".`);
    if (INVALIDOS_NOME.test(a[k]) || a[k].includes('..')) throw erro('USAGE', `${a.tipo}: "${k}" tem caracteres não permitidos em nome de arquivo (\\ / : * ? " < > | ou ..).`);
  }
  function modo(a) { if (a.modo !== undefined && !['termo', 'prefixo', 'sufixo'].includes(a.modo)) throw erro('USAGE', `${a.tipo}: "modo" deve ser "termo", "prefixo" ou "sufixo".`); }
  function validarAcoes(acoes) {
    if (!Array.isArray(acoes) || !acoes.length || acoes.length > 20) throw erro('USAGE', '"actions" deve ser uma lista com 1 a 20 ações.');
    return acoes.map((x) => {
      if (!x || typeof x !== 'object' || !ACOES[x.tipo]) throw erro('USAGE', `Ação inválida. Tipos aceitos: ${Object.keys(ACOES).join(', ')}.`);
      const a = { ...x, modo: x.modo ?? (['substituir', 'remover'].includes(x.tipo) ? 'termo' : x.modo) };
      ACOES[a.tipo](a);
      return a;
    });
  }

  function calcular(folder, acoes, recursive, extensions) {
    const linhas = ren.gerarPrevia(ren.listar(folder, !!recursive, extensions || ''), acoes, folder);
    for (const l of linhas) {
      if (l.status === 'muda' && (path.dirname(l.para) !== path.dirname(l.de) || INVALIDOS_NOME.test(l.novo))) { l.status = 'conflito'; l.motivo = 'o novo nome mudaria o arquivo de pasta'; }
    }
    return linhas;
  }
  const relDe = (folder, p) => path.relative(folder, p);

  function preview_rename(a = {}) {
    const folder = verificarPasta(a.folder);
    const acoes = validarAcoes(a.actions);
    const recursive = a.recursive === true;
    const extensions = a.extensions === undefined ? '' : texto(a.extensions, 'extensions', { obrigatorio: false });
    const linhas = calcular(folder, acoes, recursive, extensions);
    const previewId = crypto.randomBytes(12).toString('hex');
    const expira = agora() + PREVIEW_MS;
    fs.mkdirSync(pastaPreviews, { recursive: true });
    fs.writeFileSync(path.join(pastaPreviews, `${previewId}.json`), JSON.stringify({ previewId, folder, acoes, recursive, extensions, expira, linhas: linhas.map((l) => ({ de: l.de, para: l.para, status: l.status })) }));
    const mudam = linhas.filter((l) => l.status === 'muda');
    const conflitos = linhas.filter((l) => l.status === 'conflito');
    return {
      previewId, folder, expiresAt: new Date(expira).toISOString(),
      total: linhas.length, unchanged: linhas.length - mudam.length - conflitos.length,
      changes: mudam.slice(0, MAX_LINHAS_RESPOSTA).map((l) => ({ de: relDe(folder, l.de), para: relDe(folder, l.para) })),
      conflicts: conflitos.slice(0, MAX_LINHAS_RESPOSTA).map((l) => ({ de: relDe(folder, l.de), para: relDe(folder, l.para), motivo: l.motivo })),
      truncated: mudam.length > MAX_LINHAS_RESPOSTA || conflitos.length > MAX_LINHAS_RESPOSTA,
      next: conflitos.length ? 'Há conflitos: ajuste as ações e gere outra prévia. apply_rename recusa prévias com conflito.' : 'Mostre esta lista ao usuário e só chame apply_rename com este previewId depois que ele aprovar.',
    };
  }

  function lerPreview(previewId) {
    const id = String(previewId || '');
    if (!/^[a-f0-9]{24}$/.test(id)) throw erro('USAGE', 'Informe o "previewId" devolvido por preview_rename.');
    const arq = path.join(pastaPreviews, `${id}.json`);
    let p;
    try { p = JSON.parse(fs.readFileSync(arq, 'utf8')); } catch { throw erro('NOT_FOUND', 'Prévia não encontrada (já aplicada ou nunca gerada). Gere outra com preview_rename.'); }
    if (agora() > p.expira) { try { fs.unlinkSync(arq); } catch { /* ok */ } throw erro('PREVIEW_EXPIRED', 'Esta prévia expirou (30 min). Gere outra com preview_rename e mostre ao usuário de novo.'); }
    return { p, arq };
  }

  function apply_rename(a = {}) {
    const { p, arq } = lerPreview(a.previewId);
    const folder = verificarPasta(p.folder);
    const linhas = calcular(folder, p.acoes, p.recursive, p.extensions);
    const igual = linhas.length === p.linhas.length && linhas.every((l, i) => l.de === p.linhas[i].de && l.para === p.linhas[i].para && l.status === p.linhas[i].status);
    if (!igual) throw erro('PREVIEW_STALE', 'Os arquivos da pasta mudaram desde a prévia. Gere outra com preview_rename e mostre ao usuário de novo.');
    if (linhas.some((l) => l.status === 'conflito')) throw erro('HAS_CONFLICTS', 'A prévia tem conflitos; nada foi alterado. Ajuste as ações e gere outra prévia.');
    const n = linhas.filter((l) => l.status === 'muda').length;
    if (!n) { try { fs.unlinkSync(arq); } catch { /* ok */ } return { ok: true, renamed: 0, folder, operationId: null }; }
    try { ren.aplicar(linhas, folder); } catch (e) { throw e.code === 'EEXIST' ? erro('CONFLICT', `${e.message}. Nada foi alterado (o renomeador nunca sobrescreve).`) : e; }
    try { fs.unlinkSync(arq); } catch { /* ok */ }
    const ult = ren.ultimoLog();
    return { ok: true, renamed: n, folder, operationId: ult ? path.basename(ult[0], '.json') : null };
  }

  function undo_rename(a = {}) {
    const op = String(a.operationId || '');
    if (!/^[\w.-]{6,64}$/.test(op)) throw erro('USAGE', 'Informe o "operationId" devolvido por apply_rename.');
    const ult = ren.ultimoLog();
    if (!ult) throw erro('NOT_FOUND', 'Não há operação de renomeação para desfazer.');
    const atual = path.basename(ult[0], '.json');
    if (atual !== op) throw erro('CONFLICT', `Só dá para desfazer a operação mais recente ainda não desfeita (${atual}).`);
    verificarPasta(ult[1].pasta);
    const log = ren.desfazerUltima();
    return { ok: true, operationId: op, restored: log.arquivos.length, folder: log.pasta };
  }

  return {
    search_audio, download_audio, list_categories, search_library, set_sound_folder,
    list_rename_folders, preview_rename, apply_rename, undo_rename,
    _interno: { garantirRaiz, verificarPasta, pastaPadrao },
  };
}

module.exports = { criarNucleo };
