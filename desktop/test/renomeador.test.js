// Testes do Renomeador — porte do test_app.py original (núcleo, aplicar/desfazer, rollback).
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const app = require('../electron/servicos/renomeador');

const NOMES = [
  ...[1, 2, 3, 4, 5, 6, 7].map((i) => `IMG_2023010${i}_00${i}.jpg`),
  'IMG_20230201_final.JPG', 'DSC0001.JPG', 'DSC0002.JPG', 'DSC0003.jpg',
  'Video Ferias 2023 (1).mp4', 'Video Ferias 2023 (2).mp4', 'Video  Ferias__Praia.mp4',
  'MeuArquivoFinal.txt', 'MeuArquivoRascunho.txt', 'relatorio-final-v2.docx',
  'relatorio-final-v3.docx', 'documento_copia_copia.pdf', 'Screenshot 2023-05-01 at 10.00.00.png',
  'Screenshot 2023-05-02 at 11.30.15.png', 'foto  com   espacos.png', 'HTMLParserNotas.md',
  'musica-01-final.mp3', 'musica-02-final.mp3', 'sem_extensao',
];
const SUB = ['IMG_20240301_001.jpg', 'IMG_20240302_002.jpg', 'Video Ferias 2024.mp4'];

let RAIZ;
let TESTES;

function criarPasta() {
  fs.rmSync(TESTES, { recursive: true, force: true });
  fs.mkdirSync(path.join(TESTES, 'subpasta'), { recursive: true });
  for (const n of NOMES) fs.writeFileSync(path.join(TESTES, n), '');
  for (const n of SUB) fs.writeFileSync(path.join(TESTES, 'subpasta', n), '');
}

function nomesNaPasta() {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else out.push(path.relative(TESTES, p));
    }
  };
  walk(TESTES);
  return out.sort();
}

const previa = (acoes, sub = false, exts = '') => app.gerarPrevia(app.listar(TESTES, sub, exts), acoes, TESTES);
const porNome = (linhas) => Object.fromEntries(linhas.map((l) => [l.rel, l]));

before(() => {
  RAIZ = fs.mkdtempSync(path.join(os.tmpdir(), 'renomeador-'));
  TESTES = path.join(RAIZ, 'pasta_testes');
  app.setHistorico(path.join(RAIZ, 'historico'));
  criarPasta();
});
after(() => fs.rmSync(RAIZ, { recursive: true, force: true }));

test('termos', () => {
  const t = (s) => app.termos(s).map((x) => x[2]);
  assert.deepStrictEqual(t('IMG_2023VideoFinal-v2'), ['IMG', '2023', 'Video', 'Final', 'v', '2']);
  assert.deepStrictEqual(t('HTMLParser notas.final'), ['HTML', 'Parser', 'notas', 'final']);
  assert.deepStrictEqual(t('Férias Ação2024'), ['Férias', 'Ação', '2024']);
});

test('listagem, filtro e subpastas', () => {
  assert.strictEqual(app.listar(TESTES).length, NOMES.length);
  assert.strictEqual(app.listar(TESTES, true).length, NOMES.length + SUB.length);
  assert.strictEqual(app.listar(TESTES, false, '.mp4').length, 3);
  assert.strictEqual(app.listar(TESTES, true, 'mp4, png').length, 3 + 3 + 1);
});

test('análise', () => {
  const lista = app.analisar(app.listar(TESTES));
  const itens = Object.fromEntries(lista.map(([tipo, txt, n]) => [`${tipo}|${txt}`, n]));
  assert.strictEqual(itens['termo|IMG'], 8);
  assert.strictEqual(itens['prefixo|IMG_'], 8);
  assert.strictEqual(itens['termo|final'], 5);
  assert.strictEqual(itens['sufixo|-final'], 2);
  assert.strictEqual(itens['termo|Video'], 3);
  assert.ok(lista[0][2] >= 8);
});

test('ações combinadas; extensão nunca muda', () => {
  let l = porNome(previa([{ tipo: 'substituir', modo: 'termo', termo: 'IMG', novo: 'foto' }, { tipo: 'caixa', modo: 'min' }]));
  assert.strictEqual(l['IMG_20230201_final.JPG'].novo, 'foto_20230201_final.JPG');
  assert.strictEqual(l['DSC0001.JPG'].novo, 'dsc0001.JPG');
  assert.strictEqual(l.sem_extensao.novo, 'sem_extensao');
  assert.strictEqual(l.sem_extensao.status, 'igual');

  l = porNome(previa([{ tipo: 'remover', modo: 'termo', termo: 'copia' }]));
  assert.strictEqual(l['documento_copia_copia.pdf'].novo, 'documento.pdf');
  l = porNome(previa([{ tipo: 'remover', modo: 'prefixo', termo: 'IMG_' }]));
  assert.strictEqual(l['IMG_20230101_001.jpg'].novo, '20230101_001.jpg');
  l = porNome(previa([{ tipo: 'limpar' }]));
  assert.strictEqual(l['foto  com   espacos.png'].novo, 'foto com espacos.png');
  assert.strictEqual(l['Video  Ferias__Praia.mp4'].novo, 'Video Ferias_Praia.mp4');
  const v = previa([{ tipo: 'numerar', formato: 'video_###', inicio: 1 }], false, '.mp4');
  assert.deepStrictEqual(v.map((x) => x.novo), ['video_001.mp4', 'video_002.mp4', 'video_003.mp4']);
  const m = previa([{ tipo: 'prefixo', texto: '2023 - ' }, { tipo: 'sufixo', texto: '_ok' }, { tipo: 'caixa', modo: 'tit' }], false, '.mp3');
  assert.strictEqual(m[0].novo, '2023 - Musica-01-Final_Ok.mp3');
});

test('conflitos', () => {
  let l = previa([{ tipo: 'substituir', modo: 'termo', termo: '01', novo: '02' }], false, '.mp3');
  assert.deepStrictEqual(l.map((x) => x.motivo), ['nome repetido', 'nome repetido']);
  let p = porNome(previa([{ tipo: 'substituir', modo: 'termo', termo: '3', novo: '2' }]));
  assert.strictEqual(p['relatorio-final-v3.docx'].motivo, 'nome repetido');
  assert.strictEqual(p['relatorio-final-v2.docx'].motivo, 'nome repetido');
  p = porNome(previa([{ tipo: 'substituir', modo: 'termo', termo: 'IMG', novo: 'a/b' }]));
  assert.strictEqual(p['IMG_20230101_001.jpg'].motivo, 'caractere inválido');
  p = porNome(previa([{ tipo: 'remover', modo: 'termo', termo: 'DSC' }, { tipo: 'remover', modo: 'termo', termo: '0001' }]));
  assert.strictEqual(p['DSC0001.JPG'].motivo, 'nome vazio');
  p = porNome(previa([{ tipo: 'substituir', modo: 'termo', termo: 'Rascunho', novo: 'Final' }]));
  assert.strictEqual(p['MeuArquivoRascunho.txt'].motivo, 'nome repetido');
  const arquivos = app.listar(TESTES, false, '.txt');
  const extra = path.join(TESTES, 'MeuArquivoNovo.txt');
  fs.writeFileSync(extra, '');
  p = porNome(app.gerarPrevia(arquivos, [{ tipo: 'substituir', modo: 'termo', termo: 'Rascunho', novo: 'Novo' }], TESTES));
  fs.unlinkSync(extra);
  assert.strictEqual(p['MeuArquivoRascunho.txt'].motivo, 'já existe na pasta');
  l = previa([
    { tipo: 'substituir', modo: 'termo', termo: '2', novo: '9' },
    { tipo: 'substituir', modo: 'termo', termo: '3', novo: '2' },
    { tipo: 'substituir', modo: 'termo', termo: '9', novo: '3' },
  ], false, '.docx');
  assert.deepStrictEqual(l.map((x) => x.status), ['muda', 'muda']);
});

test('aplicar, desfazer e rollback', () => {
  const antes = nomesNaPasta();
  assert.strictEqual(app.desfazerUltima(), null);

  const linhas = previa([{ tipo: 'remover', modo: 'prefixo', termo: 'IMG_' }, { tipo: 'caixa', modo: 'mai' }], true);
  assert.ok(!linhas.some((l) => l.status === 'conflito'));
  const n = app.aplicar(linhas, TESTES);
  assert.strictEqual(n, linhas.filter((l) => l.status === 'muda').length);
  const depois = nomesNaPasta();
  assert.ok(depois.includes('20230101_001.jpg'));
  assert.ok(depois.includes(path.join('subpasta', '20240301_001.jpg')));
  assert.ok(depois.includes('DSC0003.jpg'));
  assert.ok(depois.includes('MEUARQUIVOFINAL.txt'));
  assert.strictEqual(depois.length, antes.length);

  const troca = [
    { tipo: 'substituir', modo: 'termo', termo: '2', novo: '9' },
    { tipo: 'substituir', modo: 'termo', termo: '3', novo: '2' },
    { tipo: 'substituir', modo: 'termo', termo: '9', novo: '3' },
  ];
  app.aplicar(previa(troca, false, '.docx'), TESTES);

  assert.ok(app.desfazerUltima().desfeito);
  assert.deepStrictEqual(nomesNaPasta(), depois);
  assert.ok(app.desfazerUltima().desfeito);
  assert.deepStrictEqual(nomesNaPasta(), antes);
  assert.strictEqual(app.desfazerUltima(), null);

  // Falha no meio: nada muda (rollback). Bloqueia o 2º destino depois da prévia.
  const l2 = previa([{ tipo: 'prefixo', texto: 'x_' }], false, '.mp3');
  fs.writeFileSync(path.join(TESTES, 'x_musica-02-final.mp3'), '');
  assert.throws(() => app.aplicar(l2, TESTES), (e) => e.code === 'EEXIST');
  fs.unlinkSync(path.join(TESTES, 'x_musica-02-final.mp3'));
  assert.deepStrictEqual(nomesNaPasta(), antes);
});
