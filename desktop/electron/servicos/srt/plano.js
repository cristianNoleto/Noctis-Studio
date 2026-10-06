// Sincronizador SRT — parte "pura" (sem ffmpeg): ler o SRT, casar mídias pelo número e
// decidir o que fazer com cada bloco.
//
// Regras (as mesmas da tela do Dark Planner):
//  • Duração do bloco = início do próximo − início dele (inclui o silêncio entre falas).
//    O último bloco usa o próprio fim.
//  • Arquivos devem começar com o número do bloco: 1_video.mp4, 2_imagem.jpg… (pasta extra é
//    mesclada pelo número; se houver vídeo e imagem com o mesmo número, vale o vídeo).
//  • Vídeo maior que o bloco: CORTA (do início / centralizado / do fim). Com "aceleração
//    inteligente", se o bloco ainda for ≥ duração mínima alvo, ACELERA em vez de cortar.
//  • Vídeo menor que o bloco: com "desaceleração automática", DESACELERA até a duração máxima
//    alvo; acima disso o bloco é marcado como erro.
//  • Imagem vira vídeo com a duração do bloco (áudio silencioso).
const path = require('path');

const VIDEO = /\.(mp4|mov|avi|mkv|webm|m4v)$/i;
const IMAGEM = /\.(jpe?g|jfif|png|webp)$/i;

function tempo(t) {
  const m = String(t).trim().match(/^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})$/);
  if (!m) return NaN;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, '0')) / 1000;
}

function lerSrt(texto) {
  const blocos = [];
  const partes = String(texto || '').replace(/^﻿/, '').replace(/\r/g, '').split(/\n\s*\n/);
  for (const p of partes) {
    const linhas = p.split('\n').map((l) => l.trim()).filter(Boolean);
    const iTempo = linhas.findIndex((l) => l.includes('-->'));
    if (iTempo < 0) continue;
    const [a, b] = linhas[iTempo].split('-->').map((x) => tempo(x));
    if (Number.isNaN(a) || Number.isNaN(b)) continue;
    const num = iTempo > 0 && /^\d+$/.test(linhas[iTempo - 1]) ? Number(linhas[iTempo - 1]) : blocos.length + 1;
    blocos.push({ num, inicio: a, fim: b, texto: linhas.slice(iTempo + 1).join(' ') });
  }
  blocos.sort((x, y) => x.inicio - y.inicio);
  blocos.forEach((bl, i) => {
    const prox = blocos[i + 1];
    bl.duracao = Math.max(0.04, (prox ? prox.inicio : bl.fim) - bl.inicio);
  });
  return blocos;
}

function numeroDoArquivo(nome) {
  const m = String(nome).split(/[\\/]/).pop().match(/^(\d+)(?=[_\-\s.(]|$)/);
  return m ? Number(m[1]) : null;
}

// Junta pasta principal + extra pelo número inicial. Vídeo vence imagem no mesmo número.
function mapearMidias(arquivos) {
  const mapa = new Map();
  for (const f of arquivos) {
    const tipo = VIDEO.test(f) ? 'video' : IMAGEM.test(f) ? 'imagem' : null;
    const n = numeroDoArquivo(f);
    if (!tipo || n === null) continue;
    const ex = mapa.get(n);
    if (!ex || (ex.tipo === 'imagem' && tipo === 'video')) mapa.set(n, { arquivo: f, tipo });
  }
  return mapa;
}

/**
 * Decide a ação de cada bloco.
 * @param blocos de lerSrt
 * @param mapa de mapearMidias
 * @param duracoes Map arquivo → segundos (vídeos)
 * @param cfg { cutMode: 'start'|'center'|'end', speedUp, minTarget, slowDown, maxTarget, random }
 */
function planejar(blocos, mapa, duracoes, cfg, random = Math.random) {
  const usados = new Set();
  const sobras = [...mapa.entries()].filter(([n]) => !blocos.some((b) => b.num === n)).map(([, m]) => m);
  return blocos.map((b) => {
    let midia = mapa.get(b.num);
    let aleatoria = false;
    if (!midia && cfg.random && sobras.length) {
      const livres = sobras.filter((m) => !usados.has(m.arquivo));
      const pool = livres.length ? livres : sobras;
      midia = pool[Math.floor(random() * pool.length)];
      aleatoria = true;
    }
    const base = { num: b.num, inicio: b.inicio, duracao: b.duracao, texto: b.texto };
    if (!midia) return { ...base, acao: 'erro', motivo: `Nenhum arquivo começando com ${b.num}` };
    usados.add(midia.arquivo);
    if (midia.tipo === 'imagem') return { ...base, arquivo: midia.arquivo, tipo: 'imagem', aleatoria, acao: 'imagem' };
    const L = duracoes.get(midia.arquivo);
    if (!L) return { ...base, arquivo: midia.arquivo, tipo: 'video', aleatoria, acao: 'erro', motivo: 'Não consegui ler a duração do vídeo' };
    const D = b.duracao;
    const r = { ...base, arquivo: midia.arquivo, tipo: 'video', aleatoria, original: L };
    if (Math.abs(L - D) < 0.04) return { ...r, acao: 'manter' };
    if (D < L) {
      if (cfg.speedUp && D >= Number(cfg.minTarget || 0)) return { ...r, acao: 'acelerar', fator: L / D, percentual: ((L - D) / L) * 100 };
      const sobra = L - D;
      const inicioCorte = cfg.cutMode === 'start' ? sobra : cfg.cutMode === 'end' ? 0 : sobra / 2;
      return { ...r, acao: 'cortar', corteInicio: inicioCorte, cortado: sobra };
    }
    if (cfg.slowDown && D <= Number(cfg.maxTarget || 0)) return { ...r, acao: 'desacelerar', fator: L / D, percentual: ((D - L) / L) * 100 };
    return { ...r, acao: 'erro', motivo: `Bloco de ${D.toFixed(2)}s é longo demais para um vídeo de ${L.toFixed(2)}s${cfg.slowDown ? ` (máximo ${cfg.maxTarget}s)` : ' (desaceleração desligada)'}` };
  });
}

function resumo(plano) {
  const c = { total: plano.length, erro: 0, cortar: 0, acelerar: 0, desacelerar: 0, imagem: 0, manter: 0, duracao: 0 };
  for (const p of plano) { c[p.acao] = (c[p.acao] || 0) + 1; c.duracao += p.duracao; }
  return c;
}

module.exports = { lerSrt, tempo, mapearMidias, numeroDoArquivo, planejar, resumo, VIDEO, IMAGEM };
