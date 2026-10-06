// Sincronizador SRT — parte com ffmpeg: lê duração/resolução e gera um clipe por bloco,
// todos no mesmo formato (H.264 + AAC, mesma resolução e 30 fps) para colar direto na timeline.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function ffmpegPath() {
  try {
    const p = require('ffmpeg-static');
    if (p) {
      const desempacotado = p.replace('app.asar', 'app.asar.unpacked');
      if (fs.existsSync(desempacotado)) return desempacotado;
      if (fs.existsSync(p)) return p;
    }
  } catch { /* sem pacote */ }
  return 'ffmpeg';
}

function rodar(args, { onLinha, sinal } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath(), args, { windowsHide: true });
    let err = '';
    p.stderr.on('data', (d) => { const s = String(d); err += s; if (err.length > 200000) err = err.slice(-100000); if (onLinha) onLinha(s); });
    p.on('error', (e) => reject(new Error(`ffmpeg não pôde ser executado: ${e.message}`)));
    if (sinal) sinal.matar = () => p.kill('SIGKILL');
    p.on('close', (code) => (code === 0 ? resolve(err) : reject(Object.assign(new Error(`ffmpeg falhou (código ${code}): ${err.split('\n').filter(Boolean).slice(-3).join(' | ')}`), { stderr: err }))));
  });
}

// Informações do arquivo (ffmpeg -i sai com código 1 sem saída definida; lemos o stderr).
async function info(arquivo) {
  let txt = '';
  try { txt = await rodar(['-hide_banner', '-i', arquivo]); } catch (e) { txt = e.stderr || ''; }
  const d = txt.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const v = txt.match(/Stream.*Video:.*?(\d{2,5})x(\d{2,5})/);
  return {
    duracao: d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : null,
    largura: v ? Number(v[1]) : null,
    altura: v ? Number(v[2]) : null,
    audio: /Stream.*Audio:/.test(txt),
  };
}

// atempo aceita 0.5–2.0 por filtro; encadeia se preciso.
function atempo(f) {
  const partes = [];
  let r = f;
  while (r > 2) { partes.push('atempo=2.0'); r /= 2; }
  while (r < 0.5) { partes.push('atempo=0.5'); r /= 0.5; }
  partes.push(`atempo=${r.toFixed(6)}`);
  return partes.join(',');
}

async function renderizar(passo, destino, { w = 1920, h = 1080, fps = 30, temAudio = true, sinal } = {}) {
  const D = passo.duracao.toFixed(3);
  const enquadrar = `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps}`;
  const saida = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', '-t', D, destino];
  const silencio = ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo'];
  let args;
  if (passo.acao === 'imagem') {
    args = ['-y', '-loop', '1', '-i', passo.arquivo, ...silencio, '-filter_complex', `[0:v]${enquadrar}[v]`, '-map', '[v]', '-map', '1:a', '-shortest', ...saida];
  } else {
    const entrada = passo.acao === 'cortar' ? ['-ss', passo.corteInicio.toFixed(3), '-i', passo.arquivo] : ['-i', passo.arquivo];
    const fator = passo.acao === 'acelerar' || passo.acao === 'desacelerar' ? passo.fator : 1;
    const vf = `[0:v]setpts=PTS/${fator.toFixed(6)},${enquadrar}[v]`;
    if (temAudio) {
      const af = fator !== 1 ? `[0:a]${atempo(fator)},apad[a]` : '[0:a]apad[a]';
      args = ['-y', ...entrada, '-filter_complex', `${vf};${af}`, '-map', '[v]', '-map', '[a]', ...saida];
    } else {
      args = ['-y', ...entrada, ...silencio, '-filter_complex', vf, '-map', '[v]', '-map', '1:a', ...saida];
    }
  }
  await rodar(args, { sinal });
}

module.exports = { ffmpegPath, rodar, info, renderizar, atempo };
