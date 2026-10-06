// Fila de geração: escolhe o próximo pedido e a conta, respeitando o ritmo configurado.
//
// Regras (aprendidas com o Dark Planner, sem a parte de enganar o Google):
//  • Intervalo entre envios da MESMA conta: fixo ("25") ou faixa ("20-30", sorteado a cada envio).
//  • Gerações simultâneas por conta e limite diário por conta.
//  • Distribuição: sequential (uma conta por vez), parallel (todas), auto (paralelo só com fila
//    grande), manual (cada projeto usa a conta escolhida).
//  • Cooldown / 429 / cota: a conta PAUSA (tempo crescente) e o pedido ESPERA essa mesma conta —
//    o app não passa o pedido para outra conta para fugir do limite.
//  • Sessão expirada: conta vai para "reconectar" e o pedido volta para a fila.
//  • Recusa por política: reescrita pelo Gemini (se ligada), até o máximo de tentativas.
//  • Rede/outros: até 3 tentativas com espera crescente.
const { categoria } = require('./erros');

function parseDelay(txt) {
  const m = String(txt || '').trim().match(/^(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?$/);
  if (!m) return [20, 30];
  const a = Number(m[1]);
  const b = m[2] !== undefined ? Number(m[2]) : a;
  return a <= b ? [a, b] : [b, a];
}

const mascarar = (email) => { const [u] = String(email || '').split('@'); return `${u.slice(0, 4)}***`; };
const curto = (id) => String(id).slice(0, 8);
const proximaMeiaNoite = (t) => { const d = new Date(t); d.setHours(24, 0, 5, 0); return d.getTime(); };

function criarFila({ repo, driver, salvar, getSettings, log, onUpdate = () => {}, reescrever, now = Date.now, random = Math.random }) {
  let pausada = false;
  let timer = null;
  let ocupado = false;
  const rodando = new Map(); // accountId -> nº de jobs em andamento
  const proximoEnvio = new Map(); // accountId -> timestamp liberado
  const emVoo = new Set(); // ids de jobs em andamento

  const cfg = () => getSettings().dispatch || {};
  const intervaloMs = () => { const [a, b] = parseDelay(cfg().delay); return Math.round((a + random() * (b - a)) * 1000); };

  function liberarContas(t) {
    for (const c of repo.contas()) {
      if ((c.status === 'cooldown' || c.status === 'quota') && c.cooldown_until && c.cooldown_until <= t) {
        repo.atualizarConta(c.id, { status: 'active', cooldown_until: null });
        log.info(`[${mascarar(c.id)}] Conta liberada — voltou a gerar`);
      }
    }
  }

  function utilizavel(c, kind) {
    const cap = Number(cfg().dailyCapPerAccount) || 0;
    return c.enabled && c.status === 'active' && c.allowed_types.includes(kind) && (!cap || repo.usoHoje(c.id) < cap);
  }
  function livre(c, t) {
    const max = Math.max(1, Number(cfg().maxConcurrentPerAccount) || 1);
    return (rodando.get(c.id) || 0) < max && (proximoEnvio.get(c.id) || 0) <= t;
  }

  function escolherConta(job, projeto, contas, modo, t) {
    const provider = job.params.provider || 'flow';
    let cands = contas.filter((c) => c.provider === provider);
    if (job.pinned_account) cands = cands.filter((c) => c.id === job.pinned_account);
    else if (modo === 'manual') {
      const alvo = projeto.account_id || (cands.find((c) => c.is_default) || {}).id;
      cands = cands.filter((c) => c.id === alvo);
    } else if (modo === 'sequential') {
      // Uma conta por vez: a primeira (na ordem) que pode gerar este tipo agora.
      const ativa = cands.find((c) => utilizavel(c, job.kind));
      cands = ativa ? [ativa] : [];
    }
    cands = cands.filter((c) => utilizavel(c, job.kind) && livre(c, t));
    cands.sort((a, b) => (a.last_used || 0) - (b.last_used || 0));
    return cands[0] || null;
  }

  function pronto(job) {
    if (!job.parent_id) return true;
    const pai = repo.getJob(job.parent_id);
    if (!pai || pai.status === 'deleted' || pai.status === 'failed') {
      repo.atualizarJob(job.id, { status: 'failed', error: 'A imagem de origem falhou ou foi apagada.', error_cat: 'configuracao' });
      return false;
    }
    return pai.status === 'done' && pai.files.length > 0;
  }

  async function tick() {
    if (pausada || ocupado) return;
    ocupado = true;
    try {
      const t = now();
      liberarContas(t);
      const contas = repo.contas();
      const pend = repo.pendentes().filter((j) => !emVoo.has(j.id) && (!j.not_before || j.not_before <= t));
      let modo = cfg().distribution || 'sequential';
      if (modo === 'auto') modo = pend.length >= 20 ? 'parallel' : 'sequential';
      const projetos = new Map();
      for (const job of pend) {
        if (!pronto(job)) continue;
        if (!projetos.has(job.project_id)) projetos.set(job.project_id, repo.getProjeto(job.project_id));
        const conta = escolherConta(job, projetos.get(job.project_id), contas, modo, t);
        if (!conta) continue;
        rodando.set(conta.id, (rodando.get(conta.id) || 0) + 1);
        proximoEnvio.set(conta.id, t + intervaloMs());
        conta.last_used = t;
        executar(job, conta, projetos.get(job.project_id));
      }
    } finally { ocupado = false; }
  }

  async function executar(job, conta, projeto) {
    emVoo.add(job.id);
    const rotulo = `[${projeto.name}] [${job.kind === 'video' ? (job.parent_id ? 'animação' : 'vídeo') : 'imagem'}] [${mascarar(conta.id)}]`;
    repo.atualizarJob(job.id, { status: 'processing', account_id: conta.id, started_at: now(), attempts: job.attempts + 1, error: null, error_cat: null });
    repo.atualizarConta(conta.id, { last_used: now() });
    log.info(`${rotulo} Job ${curto(job.id)} começou`);
    onUpdate();
    try {
      const pai = job.parent_id ? repo.getJob(job.parent_id) : null;
      const resultado = await driver.generate({
        account: conta, job, project: projeto, parent: pai,
        characters: repo.personagensDoProjeto(projeto.id),
        onStatus: (st, msg) => { if (st === 'downloading') repo.atualizarJob(job.id, { status: 'downloading' }); if (msg) log.info(`${rotulo} ${msg}`); onUpdate(); },
      });
      const arquivos = await salvar(resultado, job, projeto);
      for (const a of arquivos) log.success(`Salvo: ${require('path').basename(a)}`);
      repo.atualizarJob(job.id, { status: 'done', files: arquivos, finished_at: now(), pinned_account: null, error: null, error_cat: null });
      repo.registrarUso(conta.id, job.kind, job.params.model || job.params.quality || '');
      repo.atualizarConta(conta.id, { cooldown_count: 0, ...(resultado.credits != null ? { credits: resultado.credits } : {}) });
      log.success(`${rotulo} Job ${curto(job.id)} concluído`);
      if (pai && projeto.settings.deleteSourceOnAnimate && pai.status === 'done') {
        repo.atualizarJob(pai.id, { status: 'deleted' });
        log.info(`${rotulo} Imagem de origem do job ${curto(pai.id)} foi para a lixeira (apagar imagem ao animar)`);
      }
    } catch (e) {
      await tratarErro(job, conta, projeto, e, rotulo);
    } finally {
      emVoo.delete(job.id);
      rodando.set(conta.id, Math.max(0, (rodando.get(conta.id) || 1) - 1));
      onUpdate();
    }
  }

  async function tratarErro(job, conta, projeto, e, rotulo) {
    const msg = String(e && e.message ? e.message : e);
    const cat = e.cat || categoria(msg);
    const atual = repo.getJob(job.id) || job;
    if (atual.status === 'deleted' || atual.status === 'failed') return; // cancelado durante a geração
    log.error(`${rotulo} Job ${curto(job.id)}: ${msg}`);

    if (cat === 'cooldown' || cat === 'quota') {
      const c = repo.getConta(conta.id);
      const n = (c.cooldown_count || 0) + 1;
      const base = Math.max(30, Number(cfg().cooldownBaseSeconds) || 60);
      const ate = cat === 'quota' ? proximaMeiaNoite(now()) : now() + (e.retryAfterMs || Math.min(6 * 3600, base * 2 ** (n - 1)) * 1000);
      repo.atualizarConta(conta.id, { status: cat, cooldown_until: ate, cooldown_count: n, last_error: msg.slice(0, 300) });
      repo.atualizarJob(job.id, { status: 'pending', account_id: null, pinned_account: conta.id, error: msg, error_cat: cat });
      const mins = Math.max(1, Math.round((ate - now()) / 60000));
      log.warn(cat === 'quota'
        ? `${rotulo} Conta sem cota/créditos — pausada até a meia-noite. O pedido espera esta conta.`
        : `${rotulo} Conta em pausa por ~${mins} min (pedido do Google). O pedido espera esta conta; aumente o intervalo entre envios.`);
      return;
    }
    if (cat === 'sessao') {
      repo.atualizarConta(conta.id, { status: 'reconnect', last_error: msg.slice(0, 300) });
      repo.atualizarJob(job.id, { status: 'pending', account_id: null, error: msg, error_cat: cat });
      log.warn(`[${mascarar(conta.id)}] Sessão do Google expirou — reconecte a conta em Contas`);
      return;
    }
    if (cat === 'filtro') {
      const r = getSettings().rewrite || {};
      const max = Number(r.maxAttempts) || 0;
      const temChave = (r.keys || []).some((k) => String(k).trim());
      if (projeto.settings.rewriteEnabled !== false && temChave && atual.rewrites.length < max && reescrever) {
        try {
          const novo = await reescrever(atual.prompt, msg, r);
          const rewrites = [...atual.rewrites, { prompt: atual.prompt, error: msg, at: now() }];
          repo.atualizarJob(job.id, { status: 'pending', prompt: novo, rewrites, account_id: null, error: null, error_cat: null });
          log.info(`${rotulo} Prompt reescrito pelo Gemini (tentativa ${rewrites.length}/${max}) — voltou pra fila`);
          return;
        } catch (er) {
          log.warn(`${rotulo} Reescrita falhou: ${er.message}`);
        }
      }
      repo.atualizarJob(job.id, { status: 'failed', account_id: null, error: msg, error_cat: cat, finished_at: now() });
      return;
    }
    if (cat === 'configuracao') {
      repo.atualizarJob(job.id, { status: 'failed', account_id: null, error: msg, error_cat: cat, finished_at: now() });
      return;
    }
    if (atual.attempts < 3) {
      repo.atualizarJob(job.id, { status: 'pending', account_id: null, error: msg, error_cat: cat, not_before: now() + 30000 * atual.attempts });
      log.warn(`${rotulo} Job ${curto(job.id)} vai tentar de novo (${atual.attempts}/3)`);
      return;
    }
    repo.atualizarJob(job.id, { status: 'failed', account_id: null, error: msg, error_cat: cat, finished_at: now() });
  }

  return {
    iniciar(ms = 1000) {
      repo.recuperar();
      clearInterval(timer);
      timer = setInterval(() => { tick().catch((e) => log.error(`Fila: ${e.message}`)); }, ms);
    },
    parar() { clearInterval(timer); timer = null; },
    pausar(silencioso) { pausada = true; if (!silencioso) log.warn('Fila pausada'); onUpdate(); },
    retomar(silencioso) { pausada = false; if (!silencioso) log.info('Fila retomada'); onUpdate(); },
    pausada: () => pausada,
    status() {
      const r = repo.resumoFila();
      return { paused: pausada, running: !pausada && (r.processing > 0 || r.pending > 0), pending: r.pending, processing: r.processing };
    },
    tick,
    _interno: { rodando, proximoEnvio, emVoo },
  };
}

module.exports = { criarFila, parseDelay, mascarar };
