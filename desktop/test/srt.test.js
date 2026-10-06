const { test } = require('node:test');
const assert = require('node:assert');
const { lerSrt, mapearMidias, planejar, numeroDoArquivo } = require('../electron/servicos/srt/plano');

const SRT = `1
00:00:00,000 --> 00:00:07,200
Primeira frase.

2
00:00:07,500 --> 00:00:15,000
Segunda frase.

3
00:00:15,000 --> 00:00:26,000
Terceira, bem longa.

4
00:00:26,000 --> 00:00:40,000
Quarta, longa demais.

5
00:00:40,000 --> 00:00:43,000
Quinta.
`;

test('lê o SRT e calcula a duração incluindo o silêncio até o próximo bloco', () => {
  const b = lerSrt(SRT);
  assert.strictEqual(b.length, 5);
  assert.strictEqual(b[0].duracao, 7.5);
  assert.strictEqual(b[1].duracao, 7.5);
  assert.strictEqual(b[4].duracao, 3);
  assert.strictEqual(b[2].texto, 'Terceira, bem longa.');
});

test('número no começo do arquivo', () => {
  assert.strictEqual(numeroDoArquivo('12_Digital_illustration.mp4'), 12);
  assert.strictEqual(numeroDoArquivo('C:\\pasta\\3 cena.jpg'), 3);
  assert.strictEqual(numeroDoArquivo('cena_3.jpg'), null);
  assert.strictEqual(numeroDoArquivo('2023video.mp4'), null);
});

test('vídeo vence imagem com o mesmo número (pasta extra mesclada)', () => {
  const m = mapearMidias(['/a/1_x.jpg', '/b/1_x.mp4', '/a/2_y.png', '/a/notas.txt']);
  assert.strictEqual(m.get(1).tipo, 'video');
  assert.strictEqual(m.get(2).tipo, 'imagem');
  assert.strictEqual(m.size, 2);
});

test('plano: acelera, corta, desacelera, imagem e erro', () => {
  const b = lerSrt(SRT);
  const mapa = mapearMidias(['/v/1.mp4', '/v/2.mp4', '/v/3.mp4', '/v/4.mp4', '/v/5.jpg']);
  const dur = new Map([['/v/1.mp4', 8], ['/v/2.mp4', 8], ['/v/3.mp4', 8], ['/v/4.mp4', 8]]);
  const cfg = { cutMode: 'center', speedUp: true, minTarget: 7.5, slowDown: true, maxTarget: 11 };
  const p = planejar(b, mapa, dur, cfg);
  assert.strictEqual(p[0].acao, 'acelerar'); // 8 → 7.5 (bloco ≥ mínimo alvo)
  assert.ok(Math.abs(p[0].percentual - 6.25) < 0.01);
  assert.strictEqual(p[2].acao, 'desacelerar'); // 8 → 11
  assert.ok(Math.abs(p[2].percentual - 37.5) < 0.01);
  assert.strictEqual(p[3].acao, 'erro'); // 8 → 14 passa do máximo
  assert.strictEqual(p[4].acao, 'imagem');
});

test('sem aceleração: corta conforme o modo', () => {
  const b = lerSrt(SRT).slice(0, 1);
  const mapa = mapearMidias(['/v/1.mp4']);
  const dur = new Map([['/v/1.mp4', 8.5]]);
  const base = { speedUp: false, slowDown: true, maxTarget: 11 };
  assert.strictEqual(planejar(b, mapa, dur, { ...base, cutMode: 'start' })[0].corteInicio, 1);
  assert.strictEqual(planejar(b, mapa, dur, { ...base, cutMode: 'end' })[0].corteInicio, 0);
  assert.strictEqual(planejar(b, mapa, dur, { ...base, cutMode: 'center' })[0].corteInicio, 0.5);
  // com aceleração mas bloco abaixo do mínimo alvo → corta
  assert.strictEqual(planejar(b, mapa, dur, { ...base, cutMode: 'center', speedUp: true, minTarget: 7.9 })[0].acao, 'cortar');
});

test('random preenche blocos sem mídia com sobras', () => {
  const b = lerSrt(SRT).slice(0, 2);
  const mapa = mapearMidias(['/v/1.jpg', '/v/9.jpg']);
  const p = planejar(b, mapa, new Map(), { random: true }, () => 0);
  assert.strictEqual(p[1].acao, 'imagem');
  assert.strictEqual(p[1].arquivo, '/v/9.jpg');
  assert.ok(p[1].aleatoria);
  assert.strictEqual(planejar(b, mapa, new Map(), { random: false })[1].acao, 'erro');
});
