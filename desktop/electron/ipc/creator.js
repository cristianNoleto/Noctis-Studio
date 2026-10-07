// IPC do Creator: projetos, envio de prompts, ações nos cards, contas e ingredientes.
const fs = require('fs');
const path = require('path');
const { shell } = require('electron');
const { abrir } = require('../servicos/creator/db');
const { criarRepo } = require('../servicos/creator/repo');
const { criarFila, mascarar } = require('../servicos/creator/fila');
const { lerPedidos } = require('../servicos/creator/tags');
const { reescrever } = require('../servicos/creator/gemini');
const { criarFlowDriver } = require('../servicos/creator/flow');
const { montarNome, caminhoLivre } = require('../servicos/creator/nomes');
const { CONDUTA } = require('../servicos/creator/erros');

module.exports = function registrar(ctx) {
  const settings = () => ctx.store.get();
  const db = abrir(path.join(ctx.dataDir, 'creator.db'));
  const repo = criarRepo(db, { projectsRoot: () => settings().projectsRoot });
  const flow = criarFlowDriver({ perfisDir: path.join(ctx.dataDir, 'perfis'), diagDir: path.join(ctx.dataDir, 'logs', 'diagnostico'), getSettings: settings, log: ctx.log });
  ctx.creator = { repo, flow };

  let avisoPendente = null;
  const avisar = () => {
    if (avisoPendente) return;
    avisoPendente = setTimeout(() => { avisoPendente = null; ctx.send('creator:update', { queue: fila.status(), at: Date.now() }); }, 250);
  };

  const driver = {
    async generate(args) {
      if ((args.job.params.provider || 'flow') !== 'flow') throw Object.assign(new Error('O motor Grok ainda não está disponível nesta versão do app.'), { cat: 'configuracao' });
      return flow.generate({
        ...args,
        setFlowUrl: (url) => {
          const p = repo.getProjeto(args.project.id);
          repo.atualizarProjeto(p.id, { settings: { flowProjects: { ...(p.settings.flowProjects || {}), [args.account.id]: url } } });
        },
      });
    },
  };

  async function salvar(resultado, job, projeto) {
    const padrao = settings().fileNamePattern;
    const arquivos = [];
    const varios = resultado.files.length > 1;
    resultado.files.forEach((f, i) => {
      const base = montarNome(padrao, { seq: job.seq, prompt: job.original_prompt || job.prompt, kind: job.kind, model: job.params.model || job.params.quality, ratio: job.params.aspect, project: projeto.name });
      const destino = caminhoLivre(projeto.folder, varios ? `${base}_${i + 1}` : base, f.ext || (job.kind === 'video' ? '.mp4' : '.jpg'));
      fs.mkdirSync(projeto.folder, { recursive: true });
      fs.writeFileSync(destino, f.data);
      arquivos.push(destino);
    });
    return arquivos;
  }

  // Ao abrir o app (com a conta Noctis conectada): abre cada conta Google rapidinho, confere a
  // sessão do Flow e fecha — a tela Contas mostra quem está logada e quem precisa reconectar.
  let conferindo = false;
  async function conferirContas() {
    if (conferindo) return;
    conferindo = true;
    try {
      for (const c of repo.contas().filter((x) => x.provider === 'flow' && x.enabled && fs.existsSync(x.profile_dir || ''))) {
        const ok = await flow.verificar(c).catch(() => false);
        if (!ok && c.status !== 'reconnect') { repo.atualizarConta(c.id, { status: 'reconnect', last_error: 'Sessão do Flow não encontrada: reconecte a conta.' }); ctx.log.warn(`[${mascarar(c.id)}] Precisa reconectar (sessão do Flow não encontrada)`); }
        else if (ok && c.status === 'reconnect') repo.atualizarConta(c.id, { status: 'active', last_error: null });
        if (ok) ctx.log.info(`[${mascarar(c.id)}] Conta logada e funcionando`);
        ctx.send('accounts:update', {});
      }
    } finally { conferindo = false; }
  }

  const fila = criarFila({ repo, driver, salvar, getSettings: settings, log: ctx.log, onUpdate: avisar, reescrever });
  // A fila só roda com a conta Noctis conectada.
  let travadaPelaConta = true;
  fila.pausar(true);
  ctx.onAuth.push((s) => {
    if (s.status === 'signed_in' && travadaPelaConta) { travadaPelaConta = false; conferirContas().finally(() => fila.retomar(true)); }
    else if (s.status === 'signed_out' && !travadaPelaConta) { travadaPelaConta = true; fila.pausar(true); }
  });
  if (ctx.auth.isSignedIn()) { travadaPelaConta = false; fila.retomar(true); }
  ctx.app.on('before-quit', () => { fila.parar(); flow.fecharTudo(); });
  fila.iniciar();

  const h = ctx.handle;

  // ---------- fila / dashboard
  h('creator:queueStatus', () => fila.status());
  h('creator:pause', () => { fila.pausar(); return fila.status(); });
  h('creator:resume', () => { fila.retomar(); return fila.status(); });
  h('creator:dashboard', () => {
    const contas = repo.contas('flow');
    return {
      queue: fila.status(),
      doneToday: repo.geradosHoje(),
      rewrites: repo.reescritos(),
      credits: contas.reduce((a, c) => a + (Number(c.credits) || 0), 0),
      accounts: { total: contas.length, active: contas.filter((c) => c.enabled && c.status === 'active').length },
      generating: repo.gerandoAgora(),
      recent: repo.recentes(12),
    };
  });

  // ---------- projetos
  h('creator:projects', () => repo.projetos());
  h('creator:createProject', (dados) => {
    const p = repo.criarProjeto(dados || {});
    ctx.log.success(`Projeto criado: ${p.name} (${p.folder})`);
    return p;
  });
  h('creator:updateProject', (id, campos) => { const p = repo.atualizarProjeto(id, campos || {}); avisar(); return p; });
  h('creator:deleteProjects', async (ids, { arquivos = false } = {}) => {
    for (const id of ids || []) {
      const p = repo.getProjeto(id);
      if (!p) continue;
      repo.excluirProjeto(id);
      if (arquivos && fs.existsSync(p.folder)) await shell.trashItem(p.folder).catch((e) => ctx.log.warn(`Não consegui mandar a pasta para a Lixeira: ${e.message}`));
      ctx.log.info(`Projeto excluído: ${p.name}`);
    }
    avisar();
    return true;
  });
  h('creator:project', (id) => {
    const p = repo.getProjeto(id);
    if (!p) throw new Error('Projeto não encontrado.');
    return { ...p, counts: repo.contadores(id), jobs: repo.jobsDoProjeto(id), packs: repo.pacotesDoProjeto(id), characters: repo.personagensDoProjeto(id).map((c) => c.name) };
  });

  // Texto do composer → jobs (mesma numeração para imagem e animação da mesma linha).
  h('creator:submit', ({ projectId, texto, padrao }) => {
    const p = repo.getProjeto(projectId);
    if (!p) throw new Error('Projeto não encontrado.');
    const nomes = repo.personagensDoProjeto(projectId).map((c) => c.name);
    const pedidos = lerPedidos(texto, padrao || {}, nomes);
    if (!pedidos.length) throw new Error('Nada para enviar: escreva um prompt por linha.');
    const criados = [];
    for (const ped of pedidos) {
      const seq = repo.proximoSeq(projectId);
      const params = { ...ped.params, refs: padrao?.refs || [], startImage: padrao?.startImage || null, endImage: padrao?.endImage || null };
      const j = repo.criarJob({ project_id: projectId, seq, kind: ped.kind, prompt: ped.prompt, params });
      criados.push(j.id);
      if (ped.animate) {
        const a = repo.criarJob({ project_id: projectId, seq, kind: 'video', prompt: ped.animate.prompt, params: ped.animate.params, parent_id: j.id });
        criados.push(a.id);
      }
    }
    ctx.log.info(`[${p.name}] ${pedidos.length} prompt(s) na fila (${criados.length} job(s))`);
    avisar();
    return { linhas: pedidos.length, jobs: criados.length };
  });

  function acao(id, tipo, dados = {}) {
    const j = repo.getJob(id);
    if (!j) throw new Error('Item não encontrado.');
    switch (tipo) {
      case 'retry':
        return repo.atualizarJob(id, { status: 'pending', error: null, error_cat: null, attempts: 0, not_before: null, account_id: null });
      case 'cancel':
        return repo.atualizarJob(id, { status: 'failed', error: 'Cancelado por você.', error_cat: 'outro' });
      case 'delete':
        return repo.atualizarJob(id, { status: 'deleted' });
      case 'restore':
        return repo.atualizarJob(id, { status: j.files.length ? 'done' : j.kind === 'upload' ? 'done' : 'failed' });
      case 'purge':
        for (const f of j.files) { if (fs.existsSync(f)) shell.trashItem(f).catch(() => {}); }
        db.prepare('DELETE FROM jobs WHERE id = ?').run(id);
        return null;
      case 'favorite':
        return repo.atualizarJob(id, { favorite: !j.favorite });
      case 'editPrompt': {
        const prompt = String(dados.prompt || '').trim();
        if (!prompt) throw new Error('O prompt não pode ficar vazio.');
        ctx.log.info(`[job ${id.slice(0, 8)}] Prompt trocado — voltou pra fila`);
        return repo.atualizarJob(id, { prompt, original_prompt: prompt, status: 'pending', error: null, error_cat: null, attempts: 0, account_id: null, not_before: null });
      }
      case 'regenerate': {
        const novo = repo.criarJob({ project_id: j.project_id, seq: j.seq, kind: j.kind === 'upload' ? 'image' : j.kind, prompt: j.original_prompt || j.prompt, params: j.params, parent_id: j.parent_id });
        return novo;
      }
      case 'animate': {
        if (j.kind === 'video') throw new Error('Só imagens podem ser animadas.');
        const params = { provider: 'flow', aspect: j.params.aspect || '16:9', quality: dados.quality || 'fast', duration: dados.duration || 8, mode: 'frames', outputs: 1 };
        return repo.criarJob({ project_id: j.project_id, seq: j.seq, kind: 'video', prompt: String(dados.prompt || j.original_prompt || j.prompt), params, parent_id: j.id });
      }
      case 'setSeq':
        return repo.atualizarJob(id, { seq: String(dados.seq) });
      default:
        throw new Error(`Ação desconhecida: ${tipo}`);
    }
  }
  h('creator:jobAction', (id, tipo, dados) => { const r = acao(id, tipo, dados); avisar(); return r; });
  h('creator:bulk', (ids, tipo, dados) => { for (const id of ids || []) { try { acao(id, tipo, dados); } catch (e) { ctx.log.warn(e.message); } } avisar(); return true; });
  h('creator:retryFailed', (projectId) => {
    const falhos = repo.jobsDoProjeto(projectId).filter((j) => j.status === 'failed');
    for (const j of falhos) acao(j.id, 'retry');
    avisar();
    return falhos.length;
  });
  h('creator:rewriteFailed', (projectId, prompts) => {
    const falhos = repo.jobsDoProjeto(projectId).filter((j) => j.status === 'failed');
    const lista = (prompts || []).map((p) => String(p).trim()).filter(Boolean);
    if (lista.length !== falhos.length) throw new Error(`São ${falhos.length} prompt(s) com erro e você colou ${lista.length}. A contagem tem que bater.`);
    falhos.forEach((j, i) => acao(j.id, 'editPrompt', { prompt: lista[i] }));
    avisar();
    return falhos.length;
  });
  h('creator:emptyTrash', async (projectId) => {
    const lixo = repo.jobsDoProjeto(projectId).filter((j) => j.status === 'deleted');
    for (const j of lixo) acao(j.id, 'purge');
    avisar();
    return lixo.length;
  });
  h('creator:restoreAll', (projectId) => {
    const lixo = repo.jobsDoProjeto(projectId).filter((j) => j.status === 'deleted');
    for (const j of lixo) acao(j.id, 'restore');
    avisar();
    return lixo.length;
  });
  h('creator:upload', (projectId, caminhos) => {
    const p = repo.getProjeto(projectId);
    const pasta = path.join(p.folder, 'uploads');
    fs.mkdirSync(pasta, { recursive: true });
    const criados = [];
    for (const c of caminhos || []) {
      if (!fs.existsSync(c)) continue;
      const destino = caminhoLivre(pasta, path.basename(c, path.extname(c)), path.extname(c));
      fs.copyFileSync(c, destino);
      criados.push(repo.criarJob({ project_id: projectId, seq: 'up', kind: 'upload', prompt: path.basename(c), status: 'done', files: [destino] }));
    }
    avisar();
    return criados.length;
  });
  h('creator:conduta', (cat) => CONDUTA[cat] || CONDUTA.outro);

  // ---------- contas
  h('accounts:list', () => repo.contas().map((c) => ({ ...c, usedToday: repo.usoHoje(c.id), stats: repo.estatisticas(c.id), masked: mascarar(c.id) })));
  h('accounts:connect', async (provider = 'flow') => {
    if (provider !== 'flow') throw new Error('Contas Grok ainda não estão disponíveis nesta versão.');
    ctx.log.info('Abrindo o Chrome para você entrar na conta Google…');
    const r = await flow.conectar();
    const c = repo.salvarConta({ id: r.email, provider: 'flow', label: r.name, profile_dir: r.profile_dir, status: 'active' });
    ctx.log.success(`[${mascarar(c.id)}] Conta conectada e pronta`);
    ctx.send('accounts:update', {});
    return c;
  });
  h('accounts:reconnect', async (id) => {
    const c = repo.getConta(id);
    const ok = await flow.reconectar(c);
    repo.atualizarConta(id, { status: ok ? 'active' : 'reconnect', last_error: ok ? null : 'Login não concluído' });
    if (ok) ctx.log.success(`[${mascarar(id)}] Conta reconectada`);
    ctx.send('accounts:update', {});
    return ok;
  });
  h('accounts:loginDone', () => flow.concluirLogin());
  h('accounts:check', async (id) => {
    const c = repo.getConta(id);
    const ok = await flow.verificar(c);
    if (!ok) repo.atualizarConta(id, { status: 'reconnect' });
    else if (c.status === 'reconnect') repo.atualizarConta(id, { status: 'active' });
    ctx.send('accounts:update', {});
    return ok;
  });
  h('accounts:open', (id) => flow.abrir(repo.getConta(id)));
  h('accounts:diagnose', async (id) => {
    const base = await flow.diagnosticar(repo.getConta(id));
    if (base) shell.showItemInFolder(`${base}.png`);
    return base;
  });
  h('accounts:update', (id, campos) => {
    const permitidos = {};
    for (const k of ['enabled', 'allowed_types', 'label', 'plan']) if (k in (campos || {})) permitidos[k] = campos[k];
    const c = repo.atualizarConta(id, permitidos);
    ctx.send('accounts:update', {});
    return c;
  });
  h('accounts:setDefault', (id) => { const c = repo.definirPadrao(id); ctx.send('accounts:update', {}); return c; });
  h('accounts:remove', (id) => {
    const c = repo.getConta(id);
    repo.removerConta(id);
    if (c?.profile_dir && fs.existsSync(c.profile_dir)) fs.rmSync(c.profile_dir, { recursive: true, force: true });
    ctx.log.info(`[${mascarar(id)}] Conta removida do app`);
    ctx.send('accounts:update', {});
    return true;
  });
  h('accounts:clearCooldown', (id) => {
    const c = repo.atualizarConta(id, { status: 'active', cooldown_until: null });
    ctx.log.warn(`[${mascarar(id)}] Pausa liberada à mão — se o Google pausar de novo, a próxima pausa tende a ser maior`);
    ctx.send('accounts:update', {});
    avisar();
    return c;
  });

  // ---------- ingredientes
  h('creator:packs', () => repo.pacotes());
  h('creator:createPack', (name) => repo.criarPacote(name));
  h('creator:renamePack', (id, name) => repo.renomearPacote(id, name));
  h('creator:deletePack', (id) => repo.excluirPacote(id));
  h('creator:addItems', (packId, caminhos) => {
    const pasta = path.join(ctx.dataDir, 'ingredientes', String(packId));
    fs.mkdirSync(pasta, { recursive: true });
    for (const c of caminhos || []) {
      if (!fs.existsSync(c)) continue;
      const destino = caminhoLivre(pasta, path.basename(c, path.extname(c)), path.extname(c));
      fs.copyFileSync(c, destino);
      repo.addItem(packId, { name: path.basename(c, path.extname(c)).slice(0, 40), file_path: destino });
    }
    return repo.pacotes();
  });
  h('creator:addItemFromJob', (packId, jobId) => {
    const j = repo.getJob(jobId);
    const f = j?.files?.[0];
    if (!f) throw new Error('Esse card ainda não tem arquivo.');
    const pasta = path.join(ctx.dataDir, 'ingredientes', String(packId));
    fs.mkdirSync(pasta, { recursive: true });
    const destino = caminhoLivre(pasta, path.basename(f, path.extname(f)), path.extname(f));
    fs.copyFileSync(f, destino);
    repo.addItem(packId, { name: `item_${j.seq}`, file_path: destino });
    return repo.pacotes();
  });
  h('creator:updateItem', (id, campos) => {
    const ok = {};
    for (const k of ['name', 'is_character', 'voice', 'notes', 'body_path']) if (k in (campos || {})) ok[k] = campos[k];
    if (ok.name && /^(i|v|iv)$/i.test(ok.name.trim())) throw new Error('"i", "v" e "iv" são reservados (são tags).');
    repo.atualizarItem(id, ok);
    return repo.pacotes();
  });
  h('creator:removeItem', (id) => { repo.removerItem(id); return repo.pacotes(); });
  h('creator:importPack', (projectId, packId) => { repo.importarPacote(projectId, packId); return repo.pacotesDoProjeto(projectId); });
};
