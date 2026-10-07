// Peças comuns aos 3 jeitos de rodar as ferramentas para IAs:
//   • dentro do app aberto (API local), • MCP em modo Node (sem janela), • modo sem janela
//   para o Pixabay (Noctis Studio.exe --noctis-ia, quando o app está fechado).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { merge } = require('../../lib/store');
const { travaSync, esperarVez } = require('./trava');

const ACESSO_DIAS = 7;

// %APPDATA%\Noctis Studio (mesmo lugar que o Electron usa como userData).
function dataDirPadrao() {
  if (process.env.NOCTIS_STUDIO_DATA) return process.env.NOCTIS_STUDIO_DATA;
  if (process.env.NOCTIS_USER_DATA) return process.env.NOCTIS_USER_DATA;
  const home = os.homedir();
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Noctis Studio');
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Noctis Studio');
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'Noctis Studio');
}

const arquivos = (dataDir) => ({
  config: path.join(dataDir, 'config.json'),
  acesso: path.join(dataDir, 'ia', 'acesso.json'),
  limite: path.join(dataDir, 'ia', 'pixabay-limite.json'),
  estadoAA: path.join(dataDir, 'ia', 'estado-audio-atlas'),
  historico: path.join(dataDir, 'renomeador', 'historico'),
});

// Configurações lidas DO ARQUIVO a cada uso (outro processo pode ter mudado) e gravadas com trava.
function configDeArquivo(dataDir) {
  const arq = arquivos(dataDir).config;
  const ler = () => { try { return JSON.parse(fs.readFileSync(arq, 'utf8')); } catch { return {}; } };
  return {
    get: () => merge({ audioAtlas: { root: '', intervalMs: 1500 }, ia: { pastasRenomear: [] } }, ler()),
    set(patch) {
      return travaSync(arq, () => {
        const novo = merge(ler(), patch);
        fs.mkdirSync(path.dirname(arq), { recursive: true });
        fs.writeFileSync(`${arq}.tmp`, JSON.stringify(novo, null, 2));
        fs.renameSync(`${arq}.tmp`, arq);
        return novo;
      });
    },
  };
}

// "Acesso das IAs": o app grava quando a conta Noctis está conectada (vale 7 dias depois do
// último login), e apaga ao sair da conta. O MCP e o modo sem janela só funcionam com ele.
function gravarAcesso(dataDir, dados) {
  const arq = arquivos(dataDir).acesso;
  fs.mkdirSync(path.dirname(arq), { recursive: true });
  fs.writeFileSync(arq, JSON.stringify({ ...dados, ate: Date.now() + ACESSO_DIAS * 86400000 }, null, 2));
}
function apagarAcesso(dataDir) { try { fs.unlinkSync(arquivos(dataDir).acesso); } catch { /* não havia */ } }
function lerAcesso(dataDir) {
  try {
    const a = JSON.parse(fs.readFileSync(arquivos(dataDir).acesso, 'utf8'));
    return a && Number(a.ate) > Date.now() ? a : null;
  } catch { return null; }
}
function exigirAcesso(dataDir) {
  const a = lerAcesso(dataDir);
  if (!a) throw Object.assign(new Error('O Noctis Studio não está liberado para IAs neste computador: abra o app Noctis Studio e entre na sua conta (o acesso vale 7 dias após o último login).'), { code: 'NOT_SIGNED_IN' });
  return a;
}

function documentosPadrao(dataDir) {
  return lerAcesso(dataDir)?.documentsDir || path.join(os.homedir(), 'Documents');
}

// Limitador do Pixabay somado entre todos os processos.
function ligarLimitador(pixabay, dataDir) {
  const arq = arquivos(dataDir).limite;
  pixabay.setLimitador((ms) => esperarVez(arq, ms));
}

module.exports = { dataDirPadrao, arquivos, configDeArquivo, gravarAcesso, apagarAcesso, lerAcesso, exigirAcesso, documentosPadrao, ligarLimitador, ACESSO_DIAS };
