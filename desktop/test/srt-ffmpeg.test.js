// Sincronizador com ffmpeg de verdade: gera vídeos/imagem de teste, aplica o plano e confere
// a duração de cada clipe de saída.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { lerSrt, mapearMidias, planejar } = require('../electron/servicos/srt/plano');
const { rodar, info, renderizar } = require('../electron/servicos/srt/processar');

const SRT = `1
00:00:00,000 --> 00:00:07,400
um

2
00:00:07,500 --> 00:00:14,000
dois

3
00:00:14,000 --> 00:00:24,000
tres

4
00:00:24,000 --> 00:00:27,500
quatro
`;

test('gera clipes com a duração de cada bloco', { timeout: 240000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'srt-ff-'));
  try {
    const v = (n, comAudio) => rodar(['-y', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=24', ...(comAudio ? ['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100'] : []), '-t', '8', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', ...(comAudio ? ['-c:a', 'aac', '-shortest'] : []), path.join(dir, `${n}_cena.mp4`)]);
    await v(1, true); await v(2, false); await v(3, true);
    await rodar(['-y', '-f', 'lavfi', '-i', 'color=c=teal:size=800x800', '-frames:v', '1', path.join(dir, '4_imagem.png')]);
    const blocos = lerSrt(SRT);
    const arquivos = fs.readdirSync(dir).map((f) => path.join(dir, f));
    const mapa = mapearMidias(arquivos);
    const infos = new Map();
    for (const a of arquivos.filter((f) => f.endsWith('.mp4'))) infos.set(a, await info(a));
    assert.ok(Math.abs(infos.get(path.join(dir, '1_cena.mp4')).duracao - 8) < 0.1);
    const plano = planejar(blocos, mapa, new Map([...infos].map(([k, x]) => [k, x.duracao])), { cutMode: 'center', speedUp: true, minTarget: 7.5, slowDown: true, maxTarget: 11 });
    assert.deepStrictEqual(plano.map((p) => p.acao), ['acelerar', 'cortar', 'desacelerar', 'imagem']);
    const saida = path.join(dir, 'out');
    fs.mkdirSync(saida);
    for (const p of plano) {
      const destino = path.join(saida, `${p.num}.mp4`);
      await renderizar(p, destino, { w: 1280, h: 720, temAudio: p.tipo === 'video' && infos.get(p.arquivo).audio });
      const r = await info(destino);
      assert.ok(Math.abs(r.duracao - p.duracao) < 0.12, `bloco ${p.num}: ${r.duracao} vs ${p.duracao}`);
      assert.strictEqual(r.largura, 1280);
      assert.strictEqual(r.altura, 720);
      assert.ok(r.audio, `bloco ${p.num} sem trilha de áudio`);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
