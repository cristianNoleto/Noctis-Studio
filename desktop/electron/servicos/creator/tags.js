// Leitura das linhas do composer: cada linha vira um pedido. Tags no COMEÇO da linha
// (várias, qualquer ordem, sem espaço dentro dos colchetes) mudam o pedido:
//   motor [flow] [grok] · tipo [i] [v] [iv] · formato [16:9] [9:16] [1:1] [4:3] [3:4] [2:3] [3:2]
//   imagem [nano_pro] [nano_2] [nano_lite] · vídeo [omni] [quality] [fast] [lite] [relaxed]
//   upscale [2k] [4k] [1080p] · duração [4s] [6s] [8s] [10s] · voz [voice:nome]
//   Grok: [speed] [480p] [720p] (e [quality] = qualidade no Grok)
// "[i] X [v] Y" na mesma linha = imagem X animada com o prompt Y.
// [Nome] no meio do texto é personagem (ingrediente importado no projeto).

const IMAGE_MODELS = {
  nano_pro: { label: 'Nano Banana Pro' },
  nano_2: { label: 'Nano Banana 2' },
  nano_lite: { label: 'Nano Banana 2 Lite' },
};
const VIDEO_QUALITIES = {
  fast: { label: 'Veo 3.1 - Fast' },
  quality: { label: 'Veo 3.1 - Quality' },
  lite: { label: 'Veo 3.1 - Lite' },
  relaxed: { label: 'Veo 3.1 - Lite [Lower Priority]' },
  omni: { label: 'Veo 3.1 - Omni' },
};
const ASPECTS = ['16:9', '9:16', '1:1', '4:3', '3:4', '2:3', '3:2'];
const DURATIONS = [4, 6, 8, 10];

function vazio() { return {}; }

// Lê UMA tag (sem colchetes) e aplica em `p`. Devolve false se não for tag conhecida.
function aplicarTag(t, p, ctx) {
  const k = t.toLowerCase();
  if (k === 'flow' || k === 'grok') { p.provider = k; return true; }
  if (k === 'i') { p.kind = 'image'; return true; }
  if (k === 'v') { p.kind = 'video'; return true; }
  if (k === 'iv') { p.kind = 'image'; p.animate = true; return true; }
  if (ASPECTS.includes(k)) { p.aspect = k; return true; }
  if (IMAGE_MODELS[k]) { p.model = k; return true; }
  if (k === 'quality') {
    // Em vídeo Flow, "quality" é a qualidade de vídeo; no Grok é o modo de qualidade.
    if (p.provider === 'grok' || ctx.provider === 'grok') p.grokMode = 'quality'; else p.quality = 'quality';
    return true;
  }
  if (VIDEO_QUALITIES[k]) { p.quality = k; return true; }
  if (k === 'speed') { p.grokMode = 'speed'; return true; }
  if (k === '480p' || k === '720p') { p.grokResolution = k; return true; }
  if (k === '2k' || k === '4k' || k === '1080p') { p.upscale = k; return true; }
  const dur = k.match(/^(\d{1,2})s$/);
  if (dur && DURATIONS.includes(Number(dur[1]))) { p.duration = Number(dur[1]); return true; }
  const voz = t.match(/^voice:([a-z0-9_-]+)$/i);
  if (voz) { p.voice = voz[1].toLowerCase(); return true; }
  return false;
}

// Consome tags do começo do texto. Para no primeiro token que não é tag conhecida.
function consumirTags(texto, ctx) {
  const p = vazio();
  let resto = texto;
  for (;;) {
    const m = resto.match(/^\s*\[([^\]\s]+)\]/);
    if (!m || !aplicarTag(m[1], p, { ...ctx, provider: p.provider || ctx.provider })) break;
    resto = resto.slice(m[0].length);
  }
  return { tags: p, resto: resto.trim() };
}

function personagens(texto, nomes) {
  if (!nomes || !nomes.length) return [];
  const achados = [];
  for (const m of texto.matchAll(/\[([^\]]+)\]/g)) {
    const n = nomes.find((x) => x.toLowerCase() === m[1].trim().toLowerCase());
    if (n && !achados.includes(n)) achados.push(n);
  }
  return achados;
}

// Bloco JSON {"dp": {...}} em vez de tags (mesmos campos).
function lerJson(linha) {
  const m = linha.match(/^\s*(\{.*"dp"\s*:.*\})\s*(.*)$/);
  if (!m) return null;
  try {
    const dp = JSON.parse(m[1]).dp || {};
    const p = {};
    if (dp.type) p.kind = dp.type === 'video' ? 'video' : 'image';
    if (dp.provider) p.provider = dp.provider;
    if (dp.model) p.model = dp.model;
    if (dp.quality) p.quality = dp.quality;
    if (dp.aspect) p.aspect = dp.aspect;
    if (dp.upscale) p.upscale = dp.upscale;
    if (dp.duration) p.duration = Number(dp.duration);
    if (dp.voice) p.voice = dp.voice;
    return { tags: p, resto: m[2].trim() };
  } catch { return null; }
}

/**
 * Converte o texto do composer em pedidos.
 * @param {string} texto várias linhas
 * @param {object} padrao config da tela: { provider, kind, aspect, model, quality, duration, outputs, upscaleImage, upscaleVideo, autoAnimate, animatePrompts[] }
 * @param {string[]} nomes nomes dos personagens importados no projeto
 */
function lerPedidos(texto, padrao = {}, nomes = []) {
  const linhas = String(texto || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out = [];
  let animIdx = 0;
  for (const linha of linhas) {
    const ctx = { provider: padrao.provider || 'flow' };
    const lido = lerJson(linha) || consumirTags(linha, ctx);
    let { tags, resto } = lido;
    let animPrompt = null;
    let animTags = {};
    // Par imagem+animação na mesma linha: "[i] prompt da imagem [v] prompt da animação"
    const par = resto.match(/^(.*?)\s+\[v\]\s+(.*)$/i);
    if (par && (tags.kind === 'image' || (!tags.kind && padrao.kind !== 'video'))) {
      resto = par[1].trim();
      const segundo = consumirTags(`[v] ${par[2]}`, ctx);
      animTags = segundo.tags;
      animPrompt = segundo.resto;
      tags.kind = 'image';
      tags.animate = true;
    }
    if (!resto) continue;
    const provider = tags.provider || padrao.provider || 'flow';
    const kind = tags.kind || (padrao.kind === 'video' ? 'video' : 'image');
    const base = {
      provider,
      aspect: tags.aspect || padrao.aspect || '16:9',
      outputs: Math.max(1, Math.min(4, Number(padrao.outputs) || 1)),
    };
    const chars = personagens(resto, nomes);
    const pedido = { kind, prompt: resto, characters: chars, params: { ...base } };
    if (kind === 'image') {
      pedido.params.model = tags.model || padrao.model || 'nano_pro';
      const up = tags.upscale || padrao.upscaleImage;
      if (up === '2k' || up === '4k') pedido.params.upscale = up;
    } else {
      pedido.params.quality = tags.quality || padrao.quality || 'fast';
      pedido.params.duration = tags.duration || padrao.duration || 8;
      pedido.params.mode = padrao.videoMode || (chars.length ? 'elements' : 'frames');
      if (chars.length) pedido.params.mode = 'elements';
      const up = tags.upscale || padrao.upscaleVideo;
      if (up === '1080p' || up === '4k') pedido.params.upscale = up;
      if (tags.voice || padrao.voice) pedido.params.voice = tags.voice || padrao.voice;
    }
    if (provider === 'grok') {
      if (tags.grokMode || padrao.grokMode) pedido.params.grokMode = tags.grokMode || padrao.grokMode;
      if (tags.grokResolution || padrao.grokResolution) pedido.params.grokResolution = tags.grokResolution || padrao.grokResolution;
    }
    const anima = kind === 'image' && (tags.animate || padrao.autoAnimate);
    if (anima) {
      const listado = Array.isArray(padrao.animatePrompts) ? padrao.animatePrompts[animIdx] : null;
      animIdx++;
      pedido.animate = {
        prompt: (animPrompt || (listado && listado.trim()) || resto).trim(),
        params: {
          provider: animTags.provider || provider,
          aspect: animTags.aspect || pedido.params.aspect,
          quality: animTags.quality || padrao.quality || 'fast',
          duration: animTags.duration || padrao.duration || 8,
          mode: 'frames',
          outputs: 1,
          ...(animTags.upscale === '1080p' || animTags.upscale === '4k' ? { upscale: animTags.upscale } : {}),
        },
      };
    }
    out.push(pedido);
  }
  return out;
}

module.exports = { lerPedidos, consumirTags, IMAGE_MODELS, VIDEO_QUALITIES, ASPECTS, DURATIONS };
