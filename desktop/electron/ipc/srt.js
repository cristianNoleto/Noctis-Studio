// IPC do Sincronizador SRT: prévia (plano) e aplicação (gera os clipes sincronizados).
const fs = require('fs');
const path = require('path');
const { lerSrt, mapearMidias, planejar, resumo, VIDEO } = require('../servicos/srt/plano');
const { info, renderizar, ffmpegPath } = require('../servicos/srt/processar');

function listar(pasta) {
  if (!pasta || !fs.existsSync(pasta)) return [];
  return fs.readdirSync(pasta, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => path.join(pasta, e.name));
}

async function emLotes(itens, n, fn) {
  const out = [];
  for (let i = 0; i < itens.length; i += n) out.push(...(await Promise.all(itens.slice(i, i + n).map(fn))));
  return out;
}

module.exports = function registrar(ctx) {
  const histFile = path.join(ctx.dataDir, 'srt-historico.json');
  const lerHist = () => { try { return JSON.parse(fs.readFileSync(histFile, 'utf8')); } catch { return []; } };
  const gravarHist = (l) => fs.writeFileSync(histFile, JSON.stringify(l.slice(0, 50), null, 2));
  let rodando = null;

  async function montarPlano({ srt, principal, extra, cfg }) {
    if (!srt || !fs.existsSync(srt)) throw new Error('Escolha o arquivo SRT (por tempo / VEO).');
    if (!principal || !fs.existsSync(principal)) throw new Error('Escolha a pasta principal com os arquivos numerados.');
    const blocos = lerSrt(fs.readFileSync(srt, 'utf8'));
    if (!blocos.length) throw new Error('Não encontrei blocos de legenda nesse arquivo.');
    const mapa = mapearMidias([...listar(principal), ...listar(extra)]);
    const videos = [...new Set([...mapa.values()].filter((m) => m.tipo === 'video').map((m) => m.arquivo))];
    const infos = new Map();
    await emLotes(videos, 4, async (v) => { infos.set(v, await info(v)); });
    const duracoes = new Map([...infos].map(([k, v]) => [k, v.duracao]));
    const plano = planejar(blocos, mapa, duracoes, cfg || {});
    const ref = [...infos.values()].find((i) => i.largura && i.altura);
    return { plano, resumo: resumo(plano), resolucao: ref ? { w: ref.largura, h: ref.altura } : { w: 1920, h: 1080 }, infos };
  }

  ctx.handle('srt:ffmpeg', () => ({ caminho: ffmpegPath() }));
  ctx.handle('srt:preview', async (opts) => {
    const { plano, resumo: r, resolucao } = await montarPlano(opts);
    ctx.store.set({ srt: { ...opts.cfg, ultimo: { srt: opts.srt, principal: opts.principal, extra: opts.extra || '', audio: opts.audio || '' } } });
    return { plano, resumo: r, resolucao };
  });

  ctx.handle('srt:apply', async (opts) => {
    if (rodando) throw new Error('Já existe uma sincronização em andamento.');
    const { plano, resolucao, infos } = await montarPlano(opts);
    const validos = plano.filter((p) => p.acao !== 'erro');
    if (!validos.length) throw new Error('Nenhum bloco pode ser processado (todos com erro).');
    const carimbo = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const saida = path.join(opts.principal, `sincronizado-${carimbo}`);
    fs.mkdirSync(saida, { recursive: true });
    rodando = { cancelado: false, sinal: {} };
    const erros = [];
    let feitos = 0;
    ctx.log.info(`Sincronizador: ${validos.length} clipe(s) → ${saida}`);
    try {
      for (const passo of validos) {
        if (rodando.cancelado) break;
        const nome = `${String(passo.num).padStart(3, '0')}_${path.basename(passo.arquivo, path.extname(passo.arquivo)).replace(/^\d+[_\-\s.]*/, '').slice(0, 60) || 'clipe'}.mp4`;
        try {
          const temAudio = passo.tipo === 'video' ? (infos.get(passo.arquivo)?.audio ?? false) : false;
          await renderizar(passo, path.join(saida, nome), { w: resolucao.w, h: resolucao.h, temAudio, sinal: rodando.sinal });
        } catch (e) {
          if (rodando.cancelado) break;
          erros.push({ num: passo.num, erro: e.message });
          ctx.log.error(`Sincronizador: bloco ${passo.num}: ${e.message}`);
        }
        feitos++;
        ctx.send('srt:progress', { feitos, total: validos.length, num: passo.num });
      }
      if (opts.audio && fs.existsSync(opts.audio)) fs.copyFileSync(opts.audio, path.join(saida, `000_narracao${path.extname(opts.audio)}`));
      fs.writeFileSync(path.join(saida, 'sincronizacao.json'), JSON.stringify({ criado: new Date().toISOString(), srt: opts.srt, cfg: opts.cfg, plano }, null, 2));
    } finally {
      const cancelado = rodando.cancelado;
      rodando = null;
      const entrada = { id: Date.now(), quando: Date.now(), srt: opts.srt, principal: opts.principal, saida, blocos: plano.length, feitos, erros: erros.length + plano.filter((p) => p.acao === 'erro').length, cancelado };
      gravarHist([entrada, ...lerHist()]);
    }
    ctx.log.success(`Sincronizador: pronto (${feitos - erros.length} clipe(s)) em ${saida}`);
    return { saida, feitos, erros };
  });

  ctx.handle('srt:cancel', () => {
    if (!rodando) return false;
    rodando.cancelado = true;
    rodando.sinal.matar && rodando.sinal.matar();
    ctx.log.warn('Sincronizador: cancelado');
    return true;
  });
  ctx.handle('srt:history', () => lerHist());
  ctx.handle('srt:historyRemove', (id) => { gravarHist(lerHist().filter((h) => h.id !== id)); return lerHist(); });
  ctx.handle('srt:isVideo', (p) => VIDEO.test(p || ''));
};
