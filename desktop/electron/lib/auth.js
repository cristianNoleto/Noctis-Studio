// Conta Noctis Studio dentro do app.
//
// Login em "loopback" (o mesmo modelo de apps desktop como o Claude Code):
//   1. o app abre um servidor HTTP em 127.0.0.1:<porta aleatória> e um `estado` aleatório;
//   2. abre o navegador em <site>/app-desktop/conectar?porta=…&estado=…;
//   3. no site (já logado, com captcha e Google funcionando), a pessoa confirma;
//      o servidor do site gera um token de USO ÚNICO (token_hash);
//   4. o navegador volta para 127.0.0.1:<porta>/callback e o app troca o token por
//      uma sessão PRÓPRIA no Supabase (POST /auth/v1/verify).
// A sessão fica cifrada com o safeStorage do sistema. A cada abertura (e de 6 em 6 h)
// o app renova o token e reconfere a conta no site: conta apagada, suspensa ou sem
// o plano mínimo → o app trava de novo na tela de login.
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const OFFLINE_GRACE_MS = 7 * 24 * 3600 * 1000; // sem internet, segue liberado por até 7 dias desde a última conferência
const RECHECK_MS = 6 * 3600 * 1000;

function createAuth({ file, safeStorage, openExternal, getSiteUrl, log, onChange }) {
  let state = { status: 'checking', user: null, error: null }; // checking | signed_out | signed_in | waiting_browser
  let session = null; // { url, key, access_token, refresh_token, expires_at, user, checkedAt }
  let pending = null;
  let timer = null;

  const emit = () => onChange && onChange(publicState());
  function publicState() { return { ...state }; }
  function set(s) { state = { ...state, ...s }; emit(); }

  function load() {
    try {
      const raw = fs.readFileSync(file);
      const text = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString('utf8');
      return JSON.parse(text);
    } catch { return null; }
  }
  function save() {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (!session) { try { fs.unlinkSync(file); } catch { /* já não existe */ } return; }
    const text = JSON.stringify(session);
    fs.writeFileSync(file, safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(text) : Buffer.from(text));
  }

  function userOf(u, plan) {
    return { id: u.id, email: u.email, name: u.user_metadata?.display_name || u.user_metadata?.full_name || u.email, plan: plan || u.app_metadata?.plan || 'FREE' };
  }

  async function gotrue(url, key, pathAndQuery, body) {
    const r = await fetch(`${url}/auth/v1/${pathAndQuery}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(data.msg || data.error_description || data.message || `HTTP ${r.status}`), { status: r.status });
    return data;
  }

  function adopt(url, key, data) {
    session = {
      url, key,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (Number(data.expires_in) || 3600) * 1000,
      user: userOf(data.user),
      checkedAt: Date.now(),
    };
    save();
  }

  // Confere no site se a conta pode usar o app (fundador, plano mínimo, suspensão).
  async function checkMembership() {
    const site = getSiteUrl();
    const r = await fetch(`${site}/api/desktop/info`, { headers: { Authorization: `Bearer ${session.access_token}` }, signal: AbortSignal.timeout(20000) });
    const data = await r.json().catch(() => ({}));
    if (r.status === 401 || r.status === 403) throw Object.assign(new Error(data.message || 'Conta sem acesso ao app.'), { status: r.status, denied: true });
    if (!r.ok) throw new Error(data.message || `Site respondeu ${r.status}`);
    if (data.plan) session.user.plan = data.plan;
    return data;
  }

  async function refresh({ force = false } = {}) {
    if (!session) return false;
    try {
      if (force || Date.now() > session.expires_at - 5 * 60 * 1000) {
        const data = await gotrue(session.url, session.key, 'token?grant_type=refresh_token', { refresh_token: session.refresh_token });
        const checkedAt = session.checkedAt;
        adopt(session.url, session.key, data);
        session.checkedAt = checkedAt;
      }
      await checkMembership();
      session.checkedAt = Date.now();
      save();
      set({ status: 'signed_in', user: session.user, error: null });
      return true;
    } catch (e) {
      if (e.status === 400 || e.status === 401 || e.status === 403 || e.denied) {
        log.warn(`Conta Noctis: acesso encerrado (${e.message})`);
        session = null; save();
        set({ status: 'signed_out', user: null, error: e.message });
        return false;
      }
      // Sem internet / site fora: segue liberado dentro da carência.
      if (Date.now() - (session.checkedAt || 0) < OFFLINE_GRACE_MS) {
        log.warn(`Conta Noctis: não deu para conferir agora (${e.message}). Seguindo offline.`);
        set({ status: 'signed_in', user: session.user, error: null, offline: true });
        return true;
      }
      set({ status: 'signed_out', user: null, error: 'Faz mais de 7 dias que o app não confere sua conta. Conecte-se à internet e entre de novo.' });
      return false;
    }
  }

  async function init() {
    session = load();
    if (!session) { set({ status: 'signed_out' }); return; }
    set({ status: 'checking', user: session.user });
    await refresh({ force: true });
    clearInterval(timer);
    timer = setInterval(() => { refresh({ force: true }); }, RECHECK_MS);
  }

  function page(title, body) {
    return `<!doctype html><meta charset="utf-8"><title>${title}</title>
<body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#0d0e12;color:#f3f4f6;font-family:Satoshi,Inter,system-ui,sans-serif">
<div style="max-width:420px;text-align:center;border:1px solid #23252e;background:#16171d;border-radius:18px;padding:36px">
<div style="width:56px;height:56px;margin:0 auto 16px;border-radius:14px;background:linear-gradient(135deg,#00f2fe,#00b8cc)"></div>
<h1 style="font-size:20px;margin:0 0 8px">${title}</h1><p style="color:#8b93a5;font-size:14px;line-height:1.5;margin:0">${body}</p></div></body>`;
  }

  function cancelPending(reason) {
    if (!pending) return;
    clearTimeout(pending.timeout);
    try { pending.server.close(); } catch { /* fechado */ }
    pending = null;
    if (reason) set({ status: 'signed_out', error: reason });
  }

  async function signIn() {
    cancelPending();
    const estado = crypto.randomBytes(24).toString('hex');
    const server = http.createServer(async (req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.pathname !== '/callback') { res.writeHead(404); return res.end(); }
      const q = u.searchParams;
      const send = (code, t, b) => { res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(page(t, b)); };
      if (q.get('estado') !== estado) return send(400, 'Link inválido', 'Este link não é desta tentativa de login. Volte ao app e clique em Entrar de novo.');
      const url = q.get('url') || '';
      const key = q.get('key') || '';
      const tokenHash = q.get('token_hash') || '';
      if (!/^(https:\/\/[a-z0-9.-]+|http:\/\/(127\.0\.0\.1|localhost)(:\d+)?)$/i.test(url) || !key || !tokenHash) return send(400, 'Dados incompletos', 'O site não enviou tudo que o app precisa. Tente de novo.');
      try {
        let data;
        try { data = await gotrue(url, key, 'verify', { type: 'magiclink', token_hash: tokenHash }); }
        catch { data = await gotrue(url, key, 'verify', { type: 'email', token_hash: tokenHash }); }
        adopt(url, key, data);
        cancelPending();
        await refresh();
        if (state.status === 'signed_in') {
          log.success(`Conta Noctis conectada: ${session.user.email}`);
          send(200, 'Pronto!', 'O Noctis Studio Desktop está conectado à sua conta. Pode fechar esta aba e voltar ao app.');
          clearInterval(timer);
          timer = setInterval(() => { refresh({ force: true }); }, RECHECK_MS);
        } else {
          send(403, 'Sem acesso', state.error || 'Esta conta não pode usar o app.');
        }
      } catch (e) {
        log.error(`Login no app falhou: ${e.message}`);
        cancelPending(`Não foi possível entrar: ${e.message}`);
        send(500, 'Não deu certo', `Não foi possível entrar: ${e.message}. Volte ao app e tente de novo.`);
      }
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const porta = server.address().port;
    pending = { server, estado, timeout: setTimeout(() => cancelPending('O tempo para entrar acabou. Clique em Entrar de novo.'), 10 * 60 * 1000) };
    const link = `${getSiteUrl()}/app-desktop/conectar?porta=${porta}&estado=${estado}`;
    set({ status: 'waiting_browser', error: null, link });
    await openExternal(link);
    return { link };
  }

  function signOut() {
    cancelPending();
    session = null; save();
    clearInterval(timer);
    set({ status: 'signed_out', user: null, error: null });
  }

  // Só para desenvolvimento local (app não empacotado): libera sem conta.
  function devBypass() {
    session = null;
    set({ status: 'signed_in', user: { id: 'dev', email: 'dev@local', name: 'Desenvolvimento', plan: 'MASTER' }, error: null, dev: true });
  }

  return {
    init, signIn, signOut, refresh, devBypass,
    cancel: () => cancelPending('Login cancelado.'),
    state: publicState,
    isSignedIn: () => state.status === 'signed_in',
    accessToken: () => session?.access_token || null,
  };
}

module.exports = { createAuth };
