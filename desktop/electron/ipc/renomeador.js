// IPC do Renomeador. O histórico fica em <userData>/renomeador/historico.
const path = require('path');
const ren = require('../servicos/renomeador');

module.exports = function registrar(ctx) {
  ren.setHistorico(path.join(ctx.dataDir || ctx.app.getPath('userData'), 'renomeador', 'historico'));

  function analisar({ pasta, subpastas, extensoes }) {
    const arquivos = ren.listar(pasta, !!subpastas, extensoes || '');
    return { total: arquivos.length, itens: ren.analisar(arquivos), sujos: ren.contarSujos(arquivos) };
  }

  ctx.handle('ren:analisar', (opts) => analisar(opts));
  ctx.handle('ren:previa', ({ pasta, subpastas, extensoes, acoes }) => {
    const arquivos = ren.listar(pasta, !!subpastas, extensoes || '');
    return ren.gerarPrevia(arquivos, acoes || [], pasta);
  });
  ctx.handle('ren:aplicar', ({ pasta, subpastas, extensoes, acoes }) => {
    // Reconfere o disco antes de mexer: a prévia é gerada de novo aqui.
    const linhas = ren.gerarPrevia(ren.listar(pasta, !!subpastas, extensoes || ''), acoes || [], pasta);
    if (linhas.some((l) => l.status === 'conflito')) throw new Error('Há conflitos: ajuste as mudanças antes de aplicar.');
    const n = ren.aplicar(linhas, pasta);
    ctx.log.success(`Renomeador: ${n} arquivo(s) renomeado(s) em ${pasta}`);
    ctx.store.set({ renomeador: { lastFolder: pasta } });
    return n;
  });
  ctx.handle('ren:ultimo', () => {
    const achado = ren.ultimoLog();
    return achado ? { data: achado[1].data, pasta: achado[1].pasta, total: achado[1].arquivos.length } : null;
  });
  ctx.handle('ren:desfazer', () => {
    const log = ren.desfazerUltima();
    if (log) ctx.log.info(`Renomeador: operação de ${log.data} desfeita (${log.arquivos.length} arquivo(s))`);
    return log ? { data: log.data, total: log.arquivos.length } : null;
  });
  ctx.handle('ren:descrever', (acoes) => (acoes || []).map(ren.descrever));
};
