// Renomeador — renomeia arquivos em massa. Porte fiel do app.py (Python/customtkinter):
// mesmas regras de análise, ações, conflitos, renomeação em 2 fases e histórico/desfazer.
// Nunca apaga arquivos e nunca altera a extensão.
const fs = require('fs');
const path = require('path');

const SEPS = '_- .';
const SEP_SPLIT = /([_\-\s.]+)/u;
const SEP_SPLIT_G = /[_\-\s.]+/gu;
const PALAVRA = /\p{Nd}+|[\p{L}\p{M}]+/gu;
const INVALIDOS = /[<>:"/\\|?*\x00-\x1f]/u;
const REPETIDOS = /([_\-\s.])\1+/gu;

let HIST = null; // pasta do histórico (definida pelo app; nos testes, uma pasta temporária)
function setHistorico(dir) { HIST = dir; }
function historico() { return HIST; }

const isUpper = (c) => !!c && c === c.toUpperCase() && c !== c.toLowerCase();
const isLower = (c) => !!c && c === c.toLowerCase() && c !== c.toUpperCase();
const isDigits = (s) => /^\p{Nd}+$/u.test(s);
const nc = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);

function strip(s, chars = SEPS) {
  let a = 0;
  let b = s.length;
  while (a < b && chars.includes(s[a])) a++;
  while (b > a && chars.includes(s[b - 1])) b--;
  return s.slice(a, b);
}
function rstrip(s, chars) {
  let b = s.length;
  while (b > 0 && chars.includes(s[b - 1])) b--;
  return s.slice(0, b);
}

// (início, fim, texto) de cada termo. Separa por _ - espaço . , CamelCase e letra/número.
function termos(nome) {
  const out = [];
  for (const m of nome.matchAll(PALAVRA)) {
    const w = m[0];
    const ini = m.index;
    let cur = 0;
    for (let i = 1; i < w.length; i++) {
      const p = w[i - 1];
      const c = w[i];
      const n = w[i + 1] || '';
      if ((isLower(p) && isUpper(c)) || (isUpper(p) && isUpper(c) && isLower(n))) {
        out.push([ini + cur, ini + i, w.slice(cur, i)]);
        cur = i;
      }
    }
    out.push([ini + cur, ini + w.length, w.slice(cur)]);
  }
  return out;
}

// Prefixos/sufixos de 1 e 2 blocos, com o separador (ex: 'IMG_', '_final').
function afixos(nome) {
  const partes = nome.split(SEP_SPLIT);
  const pre = new Set();
  const suf = new Set();
  for (const k of [1, 2]) {
    if (partes.length > 2 * k) {
      for (const [txt, alvo] of [[partes.slice(0, 2 * k).join(''), pre], [partes.slice(-2 * k).join(''), suf]]) {
        const miolo = txt.replace(SEP_SPLIT_G, '');
        if (miolo && !isDigits(miolo)) alvo.add(txt);
      }
    }
  }
  return [pre, suf];
}

function semExt(f) {
  const base = path.basename(f);
  const ext = path.extname(base);
  return ext ? base.slice(0, -ext.length) : base;
}

// Lista [tipo, texto, nº de arquivos], do mais frequente para o menos.
function analisar(arquivos) {
  const cont = new Map();
  const pre = new Map();
  const suf = new Map();
  const add = (m, k) => m.set(k, (m.get(k) || 0) + 1);
  for (const f of arquivos) {
    const nome = semExt(f);
    for (const t of new Set(termos(nome).map((x) => x[2]))) add(cont, t);
    const [p, s] = afixos(nome);
    for (const x of p) add(pre, x);
    for (const x of s) add(suf, x);
  }
  const itens = [...cont].map(([t, n]) => ['termo', t, n]);
  for (const [t, n] of pre) if (n > 1) itens.push(['prefixo', t, n]);
  for (const [t, n] of suf) if (n > 1) itens.push(['sufixo', t, n]);
  const lc = (s) => s.toLowerCase();
  return itens.sort((a, b) => b[2] - a[2] || (lc(a[1]) < lc(b[1]) ? -1 : lc(a[1]) > lc(b[1]) ? 1 : 0) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

function limpar(nome) {
  return strip(nome.replace(new RegExp(INVALIDOS.source, 'gu'), '').replace(REPETIDOS, '$1'));
}

function titulo(s) {
  return s.replace(/[\p{L}\p{M}]+/gu, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

// Aplica as ações em ordem ao nome SEM extensão. idx = posição do arquivo (para numerar).
function aplicarAcoes(nome, idx, acoes) {
  for (const a of acoes) {
    const t = a.tipo;
    if (t === 'substituir' || t === 'remover') {
      const alvo = a.termo;
      const novo = t === 'substituir' ? a.novo || '' : '';
      if (a.modo === 'prefixo') {
        if (nome.startsWith(alvo)) nome = novo + nome.slice(alvo.length);
      } else if (a.modo === 'sufixo') {
        if (nome.endsWith(alvo)) nome = nome.slice(0, nome.length - alvo.length) + novo;
      } else {
        for (const [ini, fim, txt] of termos(nome).reverse()) {
          if (txt === alvo) nome = nome.slice(0, ini) + novo + nome.slice(fim);
        }
      }
      if (t === 'remover') nome = strip(nome.replace(REPETIDOS, '$1'));
    } else if (t === 'prefixo') {
      nome = a.texto + nome;
    } else if (t === 'sufixo') {
      nome = nome + a.texto;
    } else if (t === 'numerar') {
      let fmt = a.formato.includes('#') ? a.formato : `${a.formato}_###`;
      const num = Number(a.inicio || 0) + idx;
      fmt = fmt.replace(/#+/, (m) => String(num).padStart(m.length, '0'));
      nome = fmt.split('{nome}').join(nome);
    } else if (t === 'caixa') {
      nome = { min: nome.toLowerCase(), mai: nome.toUpperCase(), tit: titulo(nome) }[a.modo];
    } else if (t === 'limpar') {
      nome = limpar(nome);
    }
  }
  return nome;
}

function descrever(a) {
  const t = a.tipo;
  if (t === 'substituir') return `Substituir ${a.modo} "${a.termo}" por "${a.novo}"`;
  if (t === 'remover') return `Remover ${a.modo} "${a.termo}"`;
  if (t === 'prefixo' || t === 'sufixo') return `Adicionar ${t} "${a.texto}"`;
  if (t === 'numerar') return `Numerar "${a.formato}" a partir de ${a.inicio}`;
  if (t === 'caixa') return { min: 'Converter para minúsculas', mai: 'Converter para MAIÚSCULAS', tit: 'Converter para Título' }[a.modo];
  return 'Limpar espaços, separadores e caracteres inválidos';
}

function chaveNatural(s) {
  return s.split(/(\d+)/).map((x) => (/^\d+$/.test(x) ? Number(x) : x.toLowerCase()));
}
function compararNatural(a, b) {
  const x = chaveNatural(a);
  const y = chaveNatural(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] === y[i]) continue;
    if (typeof x[i] === typeof y[i]) return x[i] < y[i] ? -1 : 1;
    return typeof x[i] === 'number' ? -1 : 1;
  }
  return x.length - y.length;
}

function listar(pasta, subpastas = false, extensoes = '') {
  const exts = new Set(
    String(extensoes || '').toLowerCase().split(/[,;\s]+/).filter(Boolean).map((e) => (e.startsWith('.') ? e : `.${e}`)),
  );
  const hist = HIST ? nc(path.resolve(HIST)) : null;
  const out = [];
  const visitar = (dir) => {
    let entradas;
    try { entradas = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    const dirs = [];
    for (const e of entradas) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (!hist || nc(path.resolve(p)) !== hist) dirs.push(p); }
      else if (e.isFile() && (!exts.size || exts.has(path.extname(e.name).toLowerCase()))) out.push(p);
    }
    if (subpastas) for (const d of dirs) visitar(d);
  };
  visitar(pasta);
  return out.sort((a, b) => compararNatural(path.relative(pasta, a), path.relative(pasta, b)));
}

// Uma linha por arquivo: de, para, rel, novo, status ('igual'|'muda'|'conflito'), motivo.
function gerarPrevia(arquivos, acoes, pasta) {
  const linhas = arquivos.map((f, i) => {
    const d = path.dirname(f);
    const base = path.basename(f);
    const ext = path.extname(base);
    const nome = ext ? base.slice(0, -ext.length) : base;
    const novoNome = aplicarAcoes(nome, i, acoes);
    const novo = novoNome + ext;
    return { de: f, para: path.join(d, novo), rel: path.relative(pasta, f), novo, status: novo !== base ? 'muda' : 'igual', motivo: '', vazio: !strip(novoNome) };
  });
  const mudando = new Set(linhas.filter((l) => l.status === 'muda').map((l) => nc(l.de)));
  const destinos = new Map();
  for (const l of linhas) destinos.set(nc(l.para), (destinos.get(nc(l.para)) || 0) + 1);
  for (const l of linhas) {
    const para = nc(l.para);
    const vazio = l.vazio;
    delete l.vazio;
    let motivo = '';
    if (vazio) motivo = 'nome vazio';
    else if (INVALIDOS.test(l.novo) || l.novo !== rstrip(l.novo, ' .')) motivo = 'caractere inválido';
    else if (destinos.get(para) > 1) motivo = 'nome repetido';
    else if (l.status === 'muda' && fs.existsSync(l.para) && !mudando.has(para) && para !== nc(l.de)) motivo = 'já existe na pasta';
    if (motivo) { l.status = 'conflito'; l.motivo = motivo; }
  }
  return linhas;
}

// Renomeia em 2 fases (via nome temporário) para permitir trocas. Nunca sobrescreve.
// Se algo falhar, desfaz o que já foi feito e relança o erro.
function renomear(pares) {
  const feitos = [];
  const temps = [];
  try {
    pares.forEach(([de, para], i) => {
      const tmp = `${de}.renomeador-tmp${i}`;
      fs.renameSync(de, tmp);
      feitos.push([de, tmp]);
      temps.push([tmp, para]);
    });
    for (const [tmp, para] of temps) {
      if (fs.existsSync(para)) throw Object.assign(new Error(`Já existe: ${para}`), { code: 'EEXIST' });
      fs.renameSync(tmp, para);
      feitos.push([tmp, para]);
    }
  } catch (e) {
    for (const [a, b] of feitos.reverse()) {
      try { fs.renameSync(b, a); } catch { /* segue desfazendo o resto */ }
    }
    throw e;
  }
}

const pad = (n, w = 2) => String(n).padStart(w, '0');
function carimbo(d) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${pad(d.getMilliseconds(), 3)}${pad(Math.floor(Math.random() * 1000), 3)}`;
}
function isoLocal(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function aplicar(linhas, pasta) {
  const pares = linhas.filter((l) => l.status === 'muda').map((l) => [l.de, l.para]);
  renomear(pares);
  fs.mkdirSync(HIST, { recursive: true });
  const agora = new Date();
  const log = { data: isoLocal(agora), pasta, desfeito: false, arquivos: pares.map(([de, para]) => ({ de, para })) };
  fs.writeFileSync(path.join(HIST, `${carimbo(agora)}.json`), JSON.stringify(log, null, 2));
  return pares.length;
}

// [caminho, log] da última operação ainda não desfeita, ou null.
function ultimoLog() {
  if (!HIST || !fs.existsSync(HIST)) return null;
  for (const nome of fs.readdirSync(HIST).filter((n) => n.endsWith('.json')).sort().reverse()) {
    const caminho = path.join(HIST, nome);
    const log = JSON.parse(fs.readFileSync(caminho, 'utf8'));
    if (!log.desfeito) return [caminho, log];
  }
  return null;
}

function desfazerUltima() {
  const achado = ultimoLog();
  if (!achado) return null;
  const [caminho, log] = achado;
  renomear(log.arquivos.map((a) => [a.para, a.de]));
  log.desfeito = true;
  log.desfeito_em = isoLocal(new Date());
  fs.writeFileSync(caminho, JSON.stringify(log, null, 2));
  return log;
}

// Quantos arquivos têm nome "sujo" (o botão Corrigir aparece quando há algum).
function contarSujos(arquivos) {
  return arquivos.filter((f) => { const n = semExt(f); return limpar(n) !== n; }).length;
}

module.exports = {
  setHistorico, historico, termos, analisar, limpar, aplicarAcoes, descrever, listar, gerarPrevia, renomear, aplicar, ultimoLog, desfazerUltima, contarSujos,
};
