// Fila do Creator com um "Flow" falso: ritmo, distribuição, cooldown sem troca de conta,
// sessão expirada, reescrita por política e animação esperando a imagem.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { abrir } = require('../electron/servicos/creator/db');
const { criarRepo } = require('../electron/servicos/creator/repo');
const { criarFila } = require('../electron/servicos/creator/fila');

const silencio = { info() {}, success() {}, warn() {}, error() {} };

function montar({ dispatch = {}, rewrite = {}, comportamento } = {}) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'fila-'));
  const db = abrir(':memory:');
  const repo = criarRepo(db, { projectsRoot: () => raiz });
  let relogio = 1_000_000;
  const chamadas = [];
  const driver = {
    async generate({ account, job }) {
      chamadas.push({ conta: account.id, job: job.id, prompt: job.prompt, kind: job.kind });
      const r = comportamento ? await comportamento({ account, job, chamadas }) : null;
      if (r instanceof Error) throw r;
      return { files: [{ data: Buffer.from('x'), ext: job.kind === 'video' ? '.mp4' : '.jpg' }] };
    },
  };
  const salvar = async (res, job, projeto) => res.files.map((f, i) => {
    const p = path.join(projeto.folder, `${job.seq}_${i}${f.ext}`);
    fs.writeFileSync(p, f.data);
    return p;
  });
  const settings = { dispatch: { delay: '10', maxConcurrentPerAccount: 1, distribution: 'sequential', dailyCapPerAccount: 0, cooldownBaseSeconds: 60, ...dispatch }, rewrite: { keys: [], maxAttempts: 2, ...rewrite } };
  const fila = criarFila({
    repo, driver, salvar, getSettings: () => settings, log: silencio,
    reescrever: async (p) => `${p} (versão segura)`,
    now: () => relogio, random: () => 0,
  });
  const passar = (s) => { relogio += s * 1000; };
  const ciclo = async () => { await fila.tick(); await new Promise((r) => setImmediate(r)); await new Promise((r) => setTimeout(r, 5)); };
  const conta = (id, extra = {}) => repo.salvarConta({ id, profile_dir: path.join(raiz, id), ...extra });
  return { repo, fila, chamadas, passar, ciclo, conta, raiz, settings, fim: () => fs.rmSync(raiz, { recursive: true, force: true }) };
}

function jobs(repo, proj, n, kind = 'image') {
  return Array.from({ length: n }, (_, i) => repo.criarJob({ project_id: proj.id, seq: i + 1, kind, prompt: `prompt ${i + 1}`, params: { provider: 'flow', aspect: '16:9' } }));
}

test('sequencial: uma conta por vez, respeitando o intervalo', async () => {
  const t = montar();
  try {
    t.conta('a@x.com'); t.conta('b@x.com');
    const p = t.repo.criarProjeto({ name: 'P1' });
    jobs(t.repo, p, 3);
    await t.ciclo();
    assert.strictEqual(t.chamadas.length, 1);
    await t.ciclo(); // intervalo de 10 s ainda não passou
    assert.strictEqual(t.chamadas.length, 1);
    t.passar(10); await t.ciclo();
    t.passar(10); await t.ciclo();
    assert.strictEqual(t.chamadas.length, 3);
    assert.deepStrictEqual([...new Set(t.chamadas.map((c) => c.conta))], ['a@x.com']);
    assert.ok(t.repo.jobsDoProjeto(p.id).every((j) => j.status === 'done' && j.files.length === 1));
  } finally { t.fim(); }
})

test('paralelo: todas as contas enviam', async () => {
  const t = montar({ dispatch: { distribution: 'parallel' } });
  try {
    t.conta('a@x.com'); t.conta('b@x.com'); t.conta('c@x.com');
    const p = t.repo.criarProjeto({ name: 'P2' });
    jobs(t.repo, p, 3);
    await t.ciclo();
    assert.strictEqual(new Set(t.chamadas.map((c) => c.conta)).size, 3);
  } finally { t.fim(); }
})

test('cooldown: a conta pausa e o pedido ESPERA a mesma conta (não troca)', async () => {
  let primeira = true;
  const t = montar({
    dispatch: { distribution: 'parallel' },
    comportamento: ({ account }) => {
      if (account.id === 'a@x.com' && primeira) { primeira = false; return new Error('Google: 429 UNUSUAL_ACTIVITY') }
      return null
    },
  });
  try {
    t.conta('a@x.com'); t.conta('b@x.com');
    const p = t.repo.criarProjeto({ name: 'P3' });
    const [j1] = jobs(t.repo, p, 1);
    await t.ciclo();
    const depois = t.repo.getJob(j1.id);
    assert.strictEqual(depois.status, 'pending');
    assert.strictEqual(depois.pinned_account, 'a@x.com');
    assert.strictEqual(t.repo.getConta('a@x.com').status, 'cooldown');
    t.passar(30); await t.ciclo();
    assert.strictEqual(t.chamadas.length, 1, 'b não pode pegar o pedido preso à conta a');
    t.passar(60); await t.ciclo();
    assert.strictEqual(t.repo.getConta('a@x.com').status, 'active');
    assert.strictEqual(t.repo.getJob(j1.id).status, 'done');
    assert.deepStrictEqual(t.chamadas.map((c) => c.conta), ['a@x.com', 'a@x.com']);
  } finally { t.fim(); }
})

test('sessão expirada: conta vai para reconectar e o pedido volta para a fila', async () => {
  const t = montar({ comportamento: ({ account }) => (account.id === 'a@x.com' ? new Error('session_expired: faça login') : null) });
  try {
    t.conta('a@x.com'); t.conta('b@x.com');
    const p = t.repo.criarProjeto({ name: 'P4' });
    const [j1] = jobs(t.repo, p, 1);
    await t.ciclo();
    assert.strictEqual(t.repo.getConta('a@x.com').status, 'reconnect');
    t.passar(10); await t.ciclo();
    assert.strictEqual(t.repo.getJob(j1.id).status, 'done');
    assert.strictEqual(t.chamadas.at(-1).conta, 'b@x.com');
  } finally { t.fim(); }
})

test('política: reescreve com o Gemini e gera de novo', async () => {
  const t = montar({ rewrite: { keys: ['k1'] }, comportamento: ({ job }) => (job.prompt.includes('segura') ? null : new Error('UNSAFE_GENERATION: policy')) });
  try {
    t.conta('a@x.com');
    const p = t.repo.criarProjeto({ name: 'P5' });
    const [j1] = jobs(t.repo, p, 1);
    await t.ciclo();
    let j = t.repo.getJob(j1.id);
    assert.strictEqual(j.status, 'pending');
    assert.strictEqual(j.rewrites.length, 1);
    assert.match(j.prompt, /versão segura/);
    t.passar(10); await t.ciclo();
    j = t.repo.getJob(j1.id);
    assert.strictEqual(j.status, 'done');
    assert.strictEqual(j.original_prompt, 'prompt 1');
  } finally { t.fim(); }
})

test('sem chave do Gemini: recusa por política vira falha', async () => {
  const t = montar({ comportamento: () => new Error('PROMINENT_PEOPLE filter') });
  try {
    t.conta('a@x.com');
    const p = t.repo.criarProjeto({ name: 'P6' });
    const [j1] = jobs(t.repo, p, 1);
    await t.ciclo();
    const j = t.repo.getJob(j1.id);
    assert.strictEqual(j.status, 'failed');
    assert.strictEqual(j.error_cat, 'filtro');
  } finally { t.fim(); }
})

test('animação espera a imagem ficar pronta; conta só de imagem não gera vídeo', async () => {
  const t = montar({ dispatch: { distribution: 'parallel' } });
  try {
    t.conta('img@x.com', { allowed_types: ['image'] });
    t.conta('vid@x.com', { allowed_types: ['image', 'video'] });
    const p = t.repo.criarProjeto({ name: 'P7' });
    const img = t.repo.criarJob({ project_id: p.id, seq: 1, kind: 'image', prompt: 'porta', params: { provider: 'flow' } });
    const vid = t.repo.criarJob({ project_id: p.id, seq: 1, kind: 'video', prompt: 'porta abre', params: { provider: 'flow' }, parent_id: img.id });
    await t.ciclo();
    assert.strictEqual(t.repo.getJob(vid.id).status, 'pending');
    assert.strictEqual(t.repo.getJob(img.id).status, 'done');
    t.passar(10); await t.ciclo();
    assert.strictEqual(t.repo.getJob(vid.id).status, 'done');
    assert.strictEqual(t.chamadas.find((c) => c.kind === 'video').conta, 'vid@x.com');
  } finally { t.fim(); }
})

test('projeto pausado não gera; fila pausada não gera', async () => {
  const t = montar();
  try {
    t.conta('a@x.com');
    const p = t.repo.criarProjeto({ name: 'P8' });
    jobs(t.repo, p, 1);
    t.repo.atualizarProjeto(p.id, { paused: true });
    await t.ciclo();
    assert.strictEqual(t.chamadas.length, 0);
    t.repo.atualizarProjeto(p.id, { paused: false });
    t.fila.pausar();
    await t.ciclo();
    assert.strictEqual(t.chamadas.length, 0);
    t.fila.retomar();
    await t.ciclo();
    assert.strictEqual(t.chamadas.length, 1);
  } finally { t.fim(); }
})

test('limite diário por conta', async () => {
  const t = montar({ dispatch: { dailyCapPerAccount: 2, delay: '1' } });
  try {
    t.conta('a@x.com');
    const p = t.repo.criarProjeto({ name: 'P9' });
    jobs(t.repo, p, 3);
    for (let i = 0; i < 5; i++) { await t.ciclo(); t.passar(2) }
    assert.strictEqual(t.chamadas.length, 2);
  } finally { t.fim(); }
})
