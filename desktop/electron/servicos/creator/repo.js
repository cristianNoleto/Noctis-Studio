// Acesso ao banco do Creator: contas, projetos, jobs, ingredientes e uso por dia.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { J } = require('./db');
const { nomePasta } = require('./nomes');

const agora = () => Date.now();
const hoje = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function criarRepo(db, { projectsRoot }) {
  const q = (sql) => db.prepare(sql);

  // ---------- contas
  function conta(r) {
    if (!r) return null;
    return { ...r, allowed_types: J(r.allowed_types, ['image', 'video']), is_default: !!r.is_default, enabled: !!r.enabled };
  }
  const contas = (provider) => (provider
    ? q('SELECT * FROM accounts WHERE provider = ? ORDER BY position, created_at').all(provider)
    : q('SELECT * FROM accounts ORDER BY provider, position, created_at').all()).map(conta);
  const getConta = (id) => conta(q('SELECT * FROM accounts WHERE id = ?').get(id));
  function salvarConta(c) {
    const ex = getConta(c.id);
    const pos = ex ? ex.position : (q('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM accounts').get().p);
    q(`INSERT INTO accounts (id, provider, label, plan, credits, status, allowed_types, is_default, enabled, profile_dir, position, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET label = excluded.label, plan = COALESCE(excluded.plan, plan), credits = COALESCE(excluded.credits, credits),
         status = excluded.status, profile_dir = excluded.profile_dir`).run(
      c.id, c.provider || 'flow', c.label || null, c.plan || null, c.credits ?? null, c.status || 'active',
      JSON.stringify(c.allowed_types || ['image', 'video']), c.is_default ? 1 : 0, c.enabled === false ? 0 : 1, c.profile_dir, pos, ex?.created_at || agora(),
    );
    if (!contas(c.provider || 'flow').some((x) => x.is_default)) definirPadrao(c.id);
    return getConta(c.id);
  }
  function atualizarConta(id, campos) {
    const cols = Object.keys(campos);
    if (!cols.length) return getConta(id);
    const vals = cols.map((k) => (k === 'allowed_types' ? JSON.stringify(campos[k]) : typeof campos[k] === 'boolean' ? (campos[k] ? 1 : 0) : campos[k]));
    q(`UPDATE accounts SET ${cols.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...vals, id);
    return getConta(id);
  }
  function definirPadrao(id) {
    const c = getConta(id);
    if (!c) return null;
    q('UPDATE accounts SET is_default = 0 WHERE provider = ?').run(c.provider);
    q('UPDATE accounts SET is_default = 1 WHERE id = ?').run(id);
    return getConta(id);
  }
  function removerConta(id) {
    q('UPDATE projects SET account_id = NULL WHERE account_id = ?').run(id);
    q("UPDATE jobs SET pinned_account = NULL, account_id = NULL, status = CASE WHEN status = 'processing' THEN 'pending' ELSE status END WHERE pinned_account = ? OR (account_id = ? AND status = 'processing')").run(id, id);
    q('DELETE FROM accounts WHERE id = ?').run(id);
  }

  // ---------- uso (Dia / Mês / Total)
  function registrarUso(accountId, kind, model) {
    q(`INSERT INTO usage (account_id, day, kind, model, count) VALUES (?, ?, ?, ?, 1)
       ON CONFLICT(account_id, day, kind, model) DO UPDATE SET count = count + 1`).run(accountId, hoje(), kind, model || '');
  }
  function usoHoje(accountId) {
    return q('SELECT COALESCE(SUM(count), 0) AS n FROM usage WHERE account_id = ? AND day = ?').get(accountId, hoje()).n;
  }
  function estatisticas(accountId) {
    const d = hoje();
    const mes = d.slice(0, 7);
    const por = (where, ...args) => q(`SELECT kind, model, SUM(count) AS n FROM usage WHERE account_id = ? ${where} GROUP BY kind, model`).all(accountId, ...args);
    return { dia: por('AND day = ?', d), mes: por('AND substr(day, 1, 7) = ?', mes), total: por('') };
  }

  // ---------- projetos
  function projeto(r) {
    if (!r) return null;
    return { ...r, paused: !!r.paused, settings: J(r.settings, {}) };
  }
  function contadores(projectId) {
    const rows = q("SELECT status, kind, COUNT(*) AS n FROM jobs WHERE project_id = ? AND kind != 'upload' GROUP BY status, kind").all(projectId);
    const c = { done: 0, processing: 0, pending: 0, failed: 0, deleted: 0, total: 0, images: 0, videos: 0, uploads: 0 };
    for (const r of rows) {
      const st = r.status === 'downloading' ? 'processing' : r.status;
      c[st] = (c[st] || 0) + r.n;
      if (r.status !== 'deleted') {
        c.total += r.n;
        if (r.kind === 'video') c.videos += r.n; else c.images += r.n;
      }
    }
    c.uploads = q("SELECT COUNT(*) AS n FROM jobs WHERE project_id = ? AND kind = 'upload' AND status != 'deleted'").get(projectId).n;
    c.favorites = q("SELECT COUNT(*) AS n FROM jobs WHERE project_id = ? AND favorite = 1 AND status != 'deleted'").get(projectId).n;
    return c;
  }
  function capa(projectId) {
    const r = q("SELECT files, kind FROM jobs WHERE project_id = ? AND status = 'done' ORDER BY finished_at DESC LIMIT 6").all(projectId);
    for (const x of r) {
      const f = J(x.files, []).find((p) => fs.existsSync(p));
      if (f) return { path: f, kind: x.kind };
    }
    return null;
  }
  const projetos = () => q('SELECT * FROM projects ORDER BY updated_at DESC').all().map((r) => ({ ...projeto(r), counts: contadores(r.id), cover: capa(r.id) }));
  const getProjeto = (id) => projeto(q('SELECT * FROM projects WHERE id = ?').get(id));
  function criarProjeto({ name, account_id, folder }) {
    const nome = String(name || '').trim() || 'Novo projeto';
    let pasta = folder && String(folder).trim() ? String(folder).trim() : path.join(projectsRoot(), nomePasta(nome));
    if (!folder && fs.existsSync(pasta) && fs.readdirSync(pasta).length) pasta = `${pasta} ${new Date().toISOString().slice(0, 10)}`;
    fs.mkdirSync(pasta, { recursive: true });
    const t = agora();
    const r = q('INSERT INTO projects (name, folder, account_id, settings, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      nome, pasta, account_id || null, JSON.stringify({ deleteSourceOnAnimate: false, deleteSourceOnUpscale: false, imageModelFallback: true, rewriteEnabled: true, acceptSilentVideo: false }), t, t,
    );
    return getProjeto(Number(r.lastInsertRowid));
  }
  function atualizarProjeto(id, campos) {
    const atual = getProjeto(id);
    if (!atual) throw new Error('Projeto não encontrado.');
    const novo = { ...campos };
    if (novo.settings) novo.settings = JSON.stringify({ ...atual.settings, ...novo.settings });
    if ('paused' in novo) novo.paused = novo.paused ? 1 : 0;
    novo.updated_at = agora();
    const cols = Object.keys(novo);
    q(`UPDATE projects SET ${cols.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...cols.map((k) => novo[k]), id);
    return getProjeto(id);
  }
  function excluirProjeto(id) {
    q('DELETE FROM jobs WHERE project_id = ?').run(id);
    q('DELETE FROM project_packs WHERE project_id = ?').run(id);
    q('DELETE FROM projects WHERE id = ?').run(id);
  }

  // ---------- jobs
  function job(r) {
    if (!r) return null;
    return { ...r, params: J(r.params, {}), rewrites: J(r.rewrites, []), files: J(r.files, []), favorite: !!r.favorite };
  }
  const getJob = (id) => job(q('SELECT * FROM jobs WHERE id = ?').get(id));
  const jobsDoProjeto = (projectId) => q('SELECT * FROM jobs WHERE project_id = ? ORDER BY created_at').all(projectId).map(job);
  function proximoSeq(projectId) {
    const p = getProjeto(projectId);
    q('UPDATE projects SET next_seq = next_seq + 1, updated_at = ? WHERE id = ?').run(agora(), projectId);
    return p.next_seq;
  }
  function criarJob({ project_id, seq, kind, prompt, params = {}, parent_id = null, status = 'pending', files = [] }) {
    const id = crypto.randomUUID();
    const t = agora();
    q(`INSERT INTO jobs (id, project_id, seq, kind, status, prompt, original_prompt, params, parent_id, files, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, project_id, String(seq), kind, status, prompt || '', prompt || '', JSON.stringify(params), parent_id, JSON.stringify(files), t, t);
    return getJob(id);
  }
  function atualizarJob(id, campos) {
    const novo = { ...campos, updated_at: agora() };
    for (const k of ['params', 'rewrites', 'files']) if (k in novo) novo[k] = JSON.stringify(novo[k]);
    if ('favorite' in novo) novo.favorite = novo.favorite ? 1 : 0;
    const cols = Object.keys(novo);
    q(`UPDATE jobs SET ${cols.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...cols.map((k) => novo[k]), id);
    return getJob(id);
  }
  const pendentes = () => q(`SELECT j.* FROM jobs j JOIN projects p ON p.id = j.project_id
       WHERE j.status = 'pending' AND p.paused = 0 AND j.kind != 'upload'
       ORDER BY p.priority DESC, p.created_at ASC, j.created_at ASC`).all().map(job);
  const emAndamento = () => q("SELECT * FROM jobs WHERE status IN ('processing', 'downloading')").all().map(job);
  const resumoFila = () => {
    const r = q("SELECT j.status, COUNT(*) AS n FROM jobs j JOIN projects p ON p.id = j.project_id WHERE j.kind != 'upload' AND j.status IN ('pending','processing','downloading') AND (p.paused = 0 OR j.status != 'pending') GROUP BY j.status").all();
    const o = { pending: 0, processing: 0 };
    for (const x of r) o[x.status === 'downloading' ? 'processing' : x.status] += x.n;
    return o;
  };
  // Jobs que estavam gerando quando o app fechou voltam para a fila.
  const recuperar = () => q("UPDATE jobs SET status = 'pending', account_id = NULL WHERE status IN ('processing', 'downloading')").run();
  const geradosHoje = () => q("SELECT COUNT(*) AS n FROM jobs WHERE status = 'done' AND finished_at >= ?").get(new Date(new Date().toDateString()).getTime()).n;
  const reescritos = () => q("SELECT COUNT(*) AS n FROM jobs WHERE rewrites != '[]'").get().n;
  const recentes = (n = 12) => q("SELECT * FROM jobs WHERE status = 'done' AND kind != 'upload' ORDER BY finished_at DESC LIMIT ?").all(n).map(job);
  const gerandoAgora = () => q("SELECT j.*, p.name AS project_name FROM jobs j JOIN projects p ON p.id = j.project_id WHERE j.status IN ('processing','downloading') ORDER BY j.started_at").all().map(job);

  // ---------- ingredientes
  const pacotes = () => q('SELECT * FROM packs ORDER BY created_at').all().map((p) => ({ ...p, items: q('SELECT * FROM pack_items WHERE pack_id = ? ORDER BY created_at').all(p.id).map((i) => ({ ...i, is_character: !!i.is_character })) }));
  const criarPacote = (name) => { const r = q('INSERT INTO packs (name, created_at) VALUES (?, ?)').run(String(name || 'Pacote').trim(), agora()); return Number(r.lastInsertRowid); };
  const renomearPacote = (id, name) => q('UPDATE packs SET name = ? WHERE id = ?').run(String(name).trim(), id);
  const excluirPacote = (id) => { q('DELETE FROM pack_items WHERE pack_id = ?').run(id); q('DELETE FROM project_packs WHERE pack_id = ?').run(id); q('DELETE FROM packs WHERE id = ?').run(id); };
  const addItem = (packId, { name, file_path }) => Number(q('INSERT INTO pack_items (pack_id, name, file_path, created_at) VALUES (?, ?, ?, ?)').run(packId, name, file_path, agora()).lastInsertRowid);
  function atualizarItem(id, campos) {
    const novo = { ...campos };
    if ('is_character' in novo) novo.is_character = novo.is_character ? 1 : 0;
    const cols = Object.keys(novo);
    if (cols.length) q(`UPDATE pack_items SET ${cols.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...cols.map((k) => novo[k]), id);
  }
  const removerItem = (id) => q('DELETE FROM pack_items WHERE id = ?').run(id);
  const importarPacote = (projectId, packId) => q('INSERT OR IGNORE INTO project_packs (project_id, pack_id) VALUES (?, ?)').run(projectId, packId);
  const pacotesDoProjeto = (projectId) => q('SELECT pack_id FROM project_packs WHERE project_id = ?').all(projectId).map((r) => r.pack_id);
  const personagensDoProjeto = (projectId) => q(`SELECT i.* FROM pack_items i JOIN project_packs pp ON pp.pack_id = i.pack_id WHERE pp.project_id = ? AND i.is_character = 1`).all(projectId);
  const itensDoProjeto = (projectId) => q(`SELECT i.* FROM pack_items i JOIN project_packs pp ON pp.pack_id = i.pack_id WHERE pp.project_id = ?`).all(projectId);

  return {
    contas, getConta, salvarConta, atualizarConta, definirPadrao, removerConta, registrarUso, usoHoje, estatisticas,
    projetos, getProjeto, criarProjeto, atualizarProjeto, excluirProjeto, contadores,
    getJob, jobsDoProjeto, proximoSeq, criarJob, atualizarJob, pendentes, emAndamento, resumoFila, recuperar, geradosHoje, reescritos, recentes, gerandoAgora,
    pacotes, criarPacote, renomearPacote, excluirPacote, addItem, atualizarItem, removerItem, importarPacote, pacotesDoProjeto, personagensDoProjeto, itensDoProjeto,
  };
}

module.exports = { criarRepo, hoje };
