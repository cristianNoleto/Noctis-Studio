// Motor do Flow contra um "Flow falso" local (só para testar o caminho: login, novo projeto,
// configurar, colar prompt, gerar, esperar a mídia nova e baixar; e recusa por política).
// Precisa de um Chromium: usa o do Playwright em /opt/pw-browsers (ou PW_CHROMIUM).
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { criarFlowDriver } = require('../electron/servicos/creator/flow');

const CHROMIUM = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const temChromium = fs.existsSync(CHROMIUM);

// PNG 640x360 válido (gerado na hora pelo canvas da própria página não serve: precisa vir por URL).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAoAAAAFoCAIAAABIUN0GAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAG0lEQVR4nO3BAQ0AAADCoPdPbQ8HFAAAAAAAAPwZJkAAAQ1YGwYAAAAASUVORK5CYII=', 'base64');

const PAGINA_INICIAL = `<!doctype html><html><body>
<h1>Flow</h1><button onclick="location.href='/fx/pt/tools/flow/project/p1'">Novo projeto</button>
<script>if (location.search.includes('login')) setTimeout(() => { document.cookie = 'logado=1; path=/; max-age=3600' }, 800)</script>
</body></html>`;
const PAGINA_PROJETO = `<!doctype html><html><body>
<div role="tablist"><button role="tab">Criar imagem</button><button role="tab">Frames para vídeo</button></div>
<button aria-label="Configurações" onclick="document.getElementById('cfg').style.display='block'">⚙</button>
<div id="cfg" style="display:none"><button role="radio">16:9</button><button role="radio">x1</button><button role="option">Nano Banana Pro</button></div>
<textarea id="p"></textarea><button onclick="gerar()">Criar</button>
<div id="feed"></div>
<script>
let n = 0;
function gerar() {
  const t = document.getElementById('p').value;
  setTimeout(() => {
    if (t.includes('proibido')) { const e = document.createElement('div'); e.textContent = 'Não foi possível gerar: o pedido viola a política de uso'; document.getElementById('feed').prepend(e); return; }
    n++; const i = document.createElement('img'); i.src = '/media/' + n + '.png?t=' + Date.now(); i.width = 640; i.height = 360; document.getElementById('feed').prepend(i);
  }, 1200);
}
</script></body></html>`;

let srv;
let base;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-falso-'));

before(async () => {
  srv = http.createServer((req, res) => {
    const logado = /logado=1/.test(req.headers.cookie || '') || !req.url.includes('nologin');
    if (req.url.startsWith('/fx/api/auth/session')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(/logado=1/.test(req.headers.cookie || '') || process.env.FLOW_FALSO_SEMPRE ? { user: { email: 'Teste@gmail.com', name: 'Teste' } } : {}));
    }
    if (req.url.startsWith('/media/')) { res.writeHead(200, { 'Content-Type': 'image/png' }); return res.end(PNG); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(req.url.includes('/project/') ? PAGINA_PROJETO : PAGINA_INICIAL);
    void logado;
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(() => { srv.close(); fs.rmSync(dir, { recursive: true, force: true }); });

const silencio = { info() {}, success() {}, warn() {}, error() {} };
function driver(extra = {}) {
  return criarFlowDriver({
    perfisDir: path.join(dir, 'perfis'), diagDir: path.join(dir, 'diag'), log: silencio,
    getSettings: () => ({ dispatch: { headless: true } }),
    flowUrl: `${base}/fx/pt/tools/flow${extra.login ? '?login=1' : ''}`, sessionUrl: `${base}/fx/api/auth/session`, executablePath: CHROMIUM,
  });
}

test('conectar: detecta o login e guarda o perfil pelo e-mail', { skip: !temChromium && 'sem Chromium' }, async () => {
  const d = driver({ login: true });
  // O login acontece num Chrome comum; aqui o teste "fecha a janela" sozinho depois do login.
  const r = await d.conectar({ timeoutMs: 30000, aoAbrir: (p) => setTimeout(() => p.kill('SIGTERM'), 4000) });
  assert.strictEqual(r.email, 'teste@gmail.com');
  assert.ok(fs.existsSync(r.profile_dir));
  await d.fecharTudo();
});

test('gerar imagem: novo projeto, prompt, espera e baixa o resultado', { skip: !temChromium && 'sem Chromium' }, async () => {
  const d = driver();
  const conta = { id: 'teste@gmail.com', profile_dir: path.join(dir, 'perfis', 'g1') };
  // Marca o perfil como logado (cookie) abrindo uma vez.
  process.env.FLOW_FALSO_SEMPRE = '1';
  let urlProjeto = null;
  const job = { id: 'job-0001-abc', kind: 'image', prompt: 'um castelo na neblina', params: { aspect: '16:9', outputs: 1, model: 'nano_pro' } };
  const r = await d.generate({ account: conta, job, project: { id: 1, settings: {} }, characters: [], setFlowUrl: (u) => { urlProjeto = u } });
  assert.strictEqual(r.files.length, 1);
  assert.strictEqual(r.files[0].ext, '.png');
  assert.ok(r.files[0].data.length > 50);
  assert.match(urlProjeto, /\/project\/p1$/);
  // Segundo pedido reaproveita o projeto do Flow já aberto.
  const r2 = await d.generate({ account: conta, job: { ...job, id: 'job-0002-abc', prompt: 'outra cena' }, project: { id: 1, settings: { flowProjects: { [conta.id]: urlProjeto } } }, characters: [] });
  assert.strictEqual(r2.files.length, 1);
  await d.fecharTudo();
  delete process.env.FLOW_FALSO_SEMPRE;
});

test('recusa por política vira erro (com diagnóstico salvo)', { skip: !temChromium && 'sem Chromium' }, async () => {
  const d = driver();
  process.env.FLOW_FALSO_SEMPRE = '1';
  const conta = { id: 'teste@gmail.com', profile_dir: path.join(dir, 'perfis', 'g2') };
  const job = { id: 'job-0003-abc', kind: 'image', prompt: 'algo proibido', params: { aspect: '16:9', outputs: 1 } };
  await assert.rejects(d.generate({ account: conta, job, project: { id: 1, settings: {} }, characters: [] }), (e) => /viola a pol[ií]tica/.test(e.message) && /diagn[óo]stico/.test(e.message));
  assert.ok(fs.readdirSync(path.join(dir, 'diag')).some((f) => f.endsWith('.png')));
  await d.fecharTudo();
  delete process.env.FLOW_FALSO_SEMPRE;
});

test('conta deslogada: erro de sessão', { skip: !temChromium && 'sem Chromium' }, async () => {
  const d = driver();
  const conta = { id: 'teste@gmail.com', profile_dir: path.join(dir, 'perfis', 'g3') };
  const job = { id: 'job-0004-abc', kind: 'image', prompt: 'x', params: {} };
  await assert.rejects(d.generate({ account: conta, job, project: { id: 1, settings: {} }, characters: [] }), (e) => /session_expired/.test(e.message));
  await d.fecharTudo();
});
