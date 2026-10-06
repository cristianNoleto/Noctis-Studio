// Login do app (loopback): simula o site e o Supabase localmente e percorre o fluxo inteiro.
const { test } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createAuth } = require('../electron/lib/auth');

const silencio = { info() {}, success() {}, warn() {}, error() {} };
const semCifra = { isEncryptionAvailable: () => false };

function servidor(handler) {
  return new Promise((resolve) => {
    const s = http.createServer(handler);
    s.listen(0, '127.0.0.1', () => resolve(s));
  });
}
const corpo = (req) => new Promise((r) => { let d = ''; req.on('data', (c) => { d += c; }); req.on('end', () => r(d ? JSON.parse(d) : {})); });
const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

async function cenario({ plano = 'FREE', negar = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-'));
  let refreshes = 0;
  const supa = await servidor(async (req, res) => {
    const b = await corpo(req);
    if (req.url === '/auth/v1/verify' && b.token_hash === 'hash-ok') {
      return json(res, 200, { access_token: 'acc-1', refresh_token: 'ref-1', expires_in: 3600, user: { id: 'u1', email: 'cris@exemplo.com', app_metadata: { plan: plano } } });
    }
    if (req.url.startsWith('/auth/v1/token') && b.refresh_token) {
      refreshes++;
      return json(res, 200, { access_token: `acc-${refreshes + 1}`, refresh_token: `ref-${refreshes + 1}`, expires_in: 3600, user: { id: 'u1', email: 'cris@exemplo.com', app_metadata: { plan: plano } } });
    }
    json(res, 400, { msg: 'inválido' });
  });
  const supaUrl = `http://127.0.0.1:${supa.address().port}`;
  const site = await servidor((req, res) => {
    if (req.url === '/api/desktop/info') {
      if (negar) return json(res, 403, { error: 'plan_required', message: 'Exige plano PRO.' });
      return json(res, 200, { available: false, plan: plano });
    }
    json(res, 404, {});
  });
  const siteUrl = `http://127.0.0.1:${site.address().port}`;
  const estados = [];
  const auth = createAuth({
    file: path.join(dir, 'conta.bin'),
    safeStorage: semCifra,
    getSiteUrl: () => siteUrl,
    log: silencio,
    onChange: (s) => estados.push(s.status),
    // "Navegador": o site devolve o usuário para o app com o token de uso único.
    openExternal: async (link) => {
      const u = new URL(link);
      const q = new URLSearchParams({ estado: u.searchParams.get('estado'), token_hash: 'hash-ok', url: supaUrl, key: 'anon' });
      setTimeout(() => { fetch(`http://127.0.0.1:${u.searchParams.get('porta')}/callback?${q}`).catch(() => {}) }, 20);
    },
  });
  const fim = () => { supa.close(); site.close(); fs.rmSync(dir, { recursive: true, force: true }); };
  return { auth, estados, dir, fim, supaUrl, siteUrl };
}

const esperar = async (cond, ms = 3000) => {
  const t = Date.now();
  while (!cond()) { if (Date.now() - t > ms) throw new Error('tempo esgotado'); await new Promise((r) => setTimeout(r, 20)); }
};

test('login completo pelo navegador e sessão salva', async () => {
  const c = await cenario({ plano: 'PRO' });
  try {
    await c.auth.init();
    assert.strictEqual(c.auth.state().status, 'signed_out');
    await c.auth.signIn();
    assert.strictEqual(c.auth.state().status, 'waiting_browser');
    await esperar(() => c.auth.isSignedIn());
    assert.strictEqual(c.auth.state().user.email, 'cris@exemplo.com');
    assert.strictEqual(c.auth.state().user.plan, 'PRO');
    assert.ok(fs.existsSync(path.join(c.dir, 'conta.bin')));
    // Reabrir o app: lê a sessão salva, renova o token e confere a conta no site.
    await c.auth.init();
    assert.ok(c.auth.isSignedIn());
    assert.strictEqual(c.auth.accessToken(), 'acc-2');
    c.auth.signOut();
    assert.ok(!fs.existsSync(path.join(c.dir, 'conta.bin')));
  } finally { c.auth.signOut(); c.fim(); }
});

test('conta sem acesso (site recusa) não libera o app', async () => {
  const c = await cenario({ negar: true });
  try {
    await c.auth.init();
    await c.auth.signIn();
    await esperar(() => c.auth.state().status === 'signed_out' && c.estados.includes('waiting_browser'));
    assert.ok(!c.auth.isSignedIn());
    assert.match(c.auth.state().error, /PRO/);
  } finally { c.auth.signOut(); c.fim(); }
});

test('callback com estado errado é recusado', async () => {
  const c = await cenario();
  try {
    await c.auth.init();
    const { link } = await (async () => {
      const orig = c.auth.signIn;
      return orig();
    })();
    const u = new URL(link);
    const r = await fetch(`http://127.0.0.1:${u.searchParams.get('porta')}/callback?estado=000&token_hash=hash-ok&url=${encodeURIComponent(c.supaUrl)}&key=anon`);
    assert.strictEqual(r.status, 400);
  } finally { c.auth.signOut(); c.fim(); }
});

// ---------------------------------------------------------------- login por e-mail e senha
// Cofre de mentira (como o DPAPI): cifra de verdade não importa no teste, só o caminho.
const cofre = {
  isEncryptionAvailable: () => true,
  encryptString: (t) => Buffer.from(`CIFRADO:${Buffer.from(t).toString('base64')}`),
  decryptString: (b) => Buffer.from(String(b).replace(/^CIFRADO:/, ''), 'base64').toString('utf8'),
};

async function cenarioSenha() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-senha-'));
  let senhaCerta = 'segredo123';
  let n = 0;
  const supa = await servidor(async (req, res) => {
    const b = await corpo(req);
    if (req.url.startsWith('/auth/v1/token') && b.refresh_token) {
      if (b.refresh_token === 'revogado') return json(res, 400, { msg: 'Invalid Refresh Token' });
      n++; return json(res, 200, { access_token: `acc-r${n}`, refresh_token: `ref-r${n}`, expires_in: 3600, user: { id: 'u1', email: 'cris@exemplo.com', app_metadata: { plan: 'PRO' } } });
    }
    json(res, 400, {});
  });
  const supaUrl = `http://127.0.0.1:${supa.address().port}`;
  let logins = 0;
  const site = await servidor(async (req, res) => {
    if (req.url === '/api/desktop/info') return json(res, 200, { plan: 'PRO' });
    if (req.url === '/api/desktop/password' && req.method === 'POST') {
      const b = await corpo(req);
      logins++;
      if (b.email !== 'cris@exemplo.com' || b.password !== senhaCerta) return json(res, 401, { error: 'invalid_credentials', message: 'E-mail ou senha incorretos.' });
      return json(res, 200, { url: supaUrl, key: 'anon', session: { access_token: `acc-p${logins}`, refresh_token: `ref-p${logins}`, expires_in: 3600, user: { id: 'u1', email: 'cris@exemplo.com', app_metadata: { plan: 'PRO' } } } });
    }
    json(res, 404, {});
  });
  const siteUrl = `http://127.0.0.1:${site.address().port}`;
  const novo = () => createAuth({ file: path.join(dir, 'conta.bin'), credFile: path.join(dir, 'conta-senha.bin'), safeStorage: cofre, getSiteUrl: () => siteUrl, log: silencio, onChange: () => {}, openExternal: async () => {} });
  return { dir, novo, trocarSenha: (s) => { senhaCerta = s; }, logins: () => logins, fim: () => { supa.close(); site.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

test('e-mail e senha: entra, guarda a senha cifrada e entra sozinho depois', async () => {
  const c = await cenarioSenha();
  try {
    const a = c.novo();
    await a.init();
    assert.strictEqual(a.state().status, 'signed_out');
    await assert.rejects(a.signInPassword({ email: 'cris@exemplo.com', password: 'errada' }), /incorretos/);
    await a.signInPassword({ email: 'cris@exemplo.com', password: 'segredo123', lembrar: true });
    assert.ok(a.isSignedIn());
    assert.deepStrictEqual(a.state().salvo, { email: 'cris@exemplo.com' });
    const bruto = fs.readFileSync(path.join(c.dir, 'conta-senha.bin'), 'utf8');
    assert.ok(bruto.startsWith('CIFRADO:') && !bruto.includes('segredo123'), 'a senha não pode ficar em texto puro');
    assert.ok(!JSON.stringify(a.state()).includes('segredo123'), 'a senha nunca vai para a tela');

    // "Sair": não entra sozinho de novo nesta mesma abertura…
    a.signOut();
    assert.strictEqual(a.state().status, 'signed_out');
    assert.strictEqual(await a.autoLogin(), false);
    // …mas ao abrir o app de novo (sem sessão), entra sozinho com a senha salva.
    const b = c.novo();
    await b.init();
    assert.ok(b.isSignedIn());

    // Sessão revogada (refresh falha) → entra de novo com a senha salva.
    const sess = JSON.parse(cofre.decryptString(fs.readFileSync(path.join(c.dir, 'conta.bin'))));
    sess.refresh_token = 'revogado';
    fs.writeFileSync(path.join(c.dir, 'conta.bin'), cofre.encryptString(JSON.stringify(sess)));
    const d = c.novo();
    await d.init();
    assert.ok(d.isSignedIn());

    // Senha trocada no site → a salva é descartada e o app pede login.
    c.trocarSenha('nova-senha');
    d.signOut();
    const e = c.novo();
    await e.init();
    assert.strictEqual(e.state().status, 'signed_out');
    assert.strictEqual(e.state().salvo, null);
    assert.match(e.state().error, /senha salva não funciona/);

    // "Sair e esquecer": apaga a senha.
    await e.signInPassword({ email: 'cris@exemplo.com', password: 'nova-senha', lembrar: true });
    e.signOut({ esquecer: true });
    assert.ok(!fs.existsSync(path.join(c.dir, 'conta-senha.bin')));
  } finally { c.fim(); }
});

test('sem cofre do sistema a senha não é guardada', async () => {
  const c = await cenarioSenha();
  try {
    const a = createAuth({ file: path.join(c.dir, 'x.bin'), credFile: path.join(c.dir, 'x-senha.bin'), safeStorage: semCifra, getSiteUrl: () => '', log: silencio, onChange: () => {}, openExternal: async () => {} });
    assert.strictEqual(a.state().podeSalvar, false);
  } finally { c.fim(); }
});
