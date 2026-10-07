// Modo sem janela: "Noctis Studio.exe --noctis-ia <pedido.json> <resposta.json>".
// Usado pelo MCP quando o app está FECHADO e a ferramenta precisa do Pixabay (que só abre pelo
// Chromium do Electron). Não cria janela visível, ícone na bandeja nem trava de instância única;
// faz uma chamada, grava a resposta e sai.
const fs = require('fs');
const { app } = require('electron');
const amb = require('./ambiente');
const { executar } = require('./ferramentas-ia');

function rodar(argv) {
  const i = argv.indexOf('--noctis-ia');
  const [pedido, resposta] = argv.slice(i + 1, i + 3);
  const gravar = (obj) => { try { fs.writeFileSync(resposta, JSON.stringify(obj)); } catch { /* sem onde gravar */ } };

  app.setName('Noctis Studio');
  if (process.env.NOCTIS_USER_DATA) app.setPath('userData', process.env.NOCTIS_USER_DATA);
  app.on('window-all-closed', () => { /* a janela oculta do Pixabay não encerra o processo */ });

  app.whenReady().then(async () => {
    try {
      const { nome, args } = JSON.parse(fs.readFileSync(pedido, 'utf8'));
      const dataDir = app.getPath('userData');
      const acesso = amb.exigirAcesso(dataDir);
      const lib = require('../audio-atlas/library');
      const ren = require('../renomeador');
      const pixabay = require('../audio-atlas/pixabay');
      const { translate } = require('../audio-atlas/translate');
      const { criarNucleo } = require('./nucleo');
      const arq = amb.arquivos(dataDir);
      const config = amb.configDeArquivo(dataDir);
      lib.init(arq.estadoAA);
      ren.setHistorico(arq.historico);
      pixabay.setInterval(config.get().audioAtlas?.intervalMs || 1500);
      amb.ligarLimitador(pixabay, dataDir);
      const nucleo = criarNucleo({ lib, pixabay, translate, ren, config, dataDir, documentsDir: acesso.documentsDir || app.getPath('documents') });
      gravar({ ok: true, result: await executar(nucleo, nome, args) });
    } catch (e) {
      gravar({ ok: false, error: { code: e.code || 'ERROR', message: e.message, ...(e.retryAfter ? { retryAfter: e.retryAfter } : {}) } });
    }
    app.exit(0);
  });
}

module.exports = { rodar };
