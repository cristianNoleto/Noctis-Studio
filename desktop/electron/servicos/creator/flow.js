// Motor do Flow (Google): dirige o Flow DE VERDADE num Chrome instalado, com a conta logada
// pela própria pessoa (um perfil de Chrome por conta). Faz o que a pessoa faria na tela:
// abre o projeto, escolhe o modo/formato/modelo, cola o prompt, gera e baixa o resultado.
//
// NÃO usa: disfarce de navegador, captcha, proxy/VPN para fugir de limite, nem a API interna
// do Flow. Quando o Google mostra erro de limite, o erro sobe para a fila, que pausa a conta.
//
// A tela do Flow muda com frequência: todos os textos/rótulos procurados ficam em SEL (abaixo)
// e, se algo não for encontrado, o app salva um DIAGNÓSTICO (print + mapa da tela) na pasta de
// logs — é com ele que os localizadores são ajustados.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { spawn, execFile } = require('child_process');

const FLOW_URL = 'https://labs.google/fx/pt/tools/flow';
const SESSION_URL = 'https://labs.google/fx/api/auth/session';

// Textos/rótulos que identificam os controles (PT e EN). Ajuste aqui quando o Flow mudar.
const SEL = {
  novoProjeto: /^(\+\s*)?(novo projeto|new project)$/i,
  criarComFlow: /(criar com o flow|create with flow|come[çc]ar|get started)/i,
  enviar: /^(criar|gerar|enviar|create|generate|send|arrow_forward)$/i,
  modos: {
    image: /(criar imagem|create image|imagem|image)/i,
    textVideo: /(texto para v[ií]deo|text to video)/i,
    frames: /(frames para v[ií]deo|frames to video|quadros para v[ií]deo)/i,
    elements: /(ingredientes para v[ií]deo|ingredients to video|elementos)/i,
  },
  configuracoes: /(configura[çc][õo]es|settings|tune|ajustes)/i,
  proporcao: /(propor[çc][ãa]o|aspect ratio|formato)/i,
  saidas: /(sa[ií]das por (comando|prompt)|outputs per prompt|respostas)/i,
  modelo: /(modelo|model)/i,
  adicionarMidia: /(adicionar|add|upload|enviar imagem|carregar|\+)/i,
  erroGeracao: /(n[aã]o foi poss[ií]vel gerar|couldn'?t generate|failed to generate|something went wrong|algo deu errado|viola|policy|pol[ií]tica|unusual activity|atividade incomum|try again later|tente novamente mais tarde|limite|quota|cr[eé]ditos insuficientes|not enough credits)/i,
  prompt: 'textarea',
};
const ASPECT_TEXTO = { '16:9': /16\s*:\s*9|paisagem|landscape/i, '9:16': /9\s*:\s*16|retrato|portrait/i, '1:1': /1\s*:\s*1|quadrado|square/i, '4:3': /4\s*:\s*3/i, '3:4': /3\s*:\s*4/i };
const MODELO_TEXTO = {
  nano_pro: /nano banana pro/i, nano_2: /nano banana 2(?!.*lite)/i, nano_lite: /nano banana.*lite/i,
  fast: /veo.*fast|r[aá]pido/i, quality: /veo.*quality|qualidade/i, lite: /veo.*lite(?!.*lower)/i, relaxed: /lower priority|baixa prioridade|relaxed/i, omni: /omni/i,
};

// Chrome (ou Edge) instalado no Windows. O LOGIN do Google é feito nele, aberto como um
// navegador comum — sem automação, sem depurador, sem --no-sandbox. O Google recusa login em
// navegador controlado por automação ("Esse navegador ou app pode não ser seguro").
function acharNavegador() {
  const pf = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
  const candidatos = process.platform === 'win32'
    ? [...pf.map((b) => path.join(b, 'Google', 'Chrome', 'Application', 'chrome.exe')), ...pf.map((b) => path.join(b, 'Microsoft', 'Edge', 'Application', 'msedge.exe'))]
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']
      : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/microsoft-edge'];
  return candidatos.find((c) => fs.existsSync(c)) || null;
}

function slugConta(email) {
  return crypto.createHash('sha1').update(String(email).toLowerCase()).digest('hex').slice(0, 16);
}

function criarFlowDriver({ perfisDir, diagDir, getSettings, log, flowUrl = FLOW_URL, sessionUrl = SESSION_URL, executablePath = null }) {
  let pw = null;
  const sessoes = new Map(); // profileDir -> { ctx, page, fila: Promise }

  function playwright() {
    if (!pw) pw = require('playwright-core');
    return pw;
  }

  async function abrirPerfil(profileDir, { visivel, invisivel } = {}) {
    const ex = sessoes.get(profileDir);
    if (ex && !ex.fechado) return ex;
    fs.mkdirSync(profileDir, { recursive: true });
    const headless = invisivel ? true : visivel ? false : !!getSettings().dispatch?.headless;
    // Sandbox ligado → sem --no-sandbox (o Chrome roda com a proteção normal). Só os testes em
    // container como root desligam (NOCTIS_CHROME_ARGS=--no-sandbox).
    const opts = { headless, viewport: null, acceptDownloads: true, chromiumSandbox: !process.env.NOCTIS_CHROME_ARGS?.includes('--no-sandbox'), args: ['--no-first-run', '--no-default-browser-check'] };
    let ctx = null;
    let ultimo = null;
    const tentativas = executablePath ? [{ executablePath }] : [{ channel: 'chrome' }, { channel: 'msedge' }];
    for (const t of tentativas) {
      try { ctx = await playwright().chromium.launchPersistentContext(profileDir, { ...opts, ...t }); break; } catch (e) { ultimo = e; }
    }
    if (!ctx) throw Object.assign(new Error(`Não encontrei o Google Chrome instalado. Instale o Chrome e tente de novo. (${ultimo?.message?.split('\n')[0]})`), { cat: 'configuracao' });
    const s = { ctx, page: ctx.pages()[0] || (await ctx.newPage()), fila: Promise.resolve(), fechado: false };
    ctx.on('close', () => { s.fechado = true; sessoes.delete(profileDir); });
    sessoes.set(profileDir, s);
    return s;
  }

  // Login acontece no Chrome COMUM (sem automação). Enquanto ele está aberto, o app olha o
  // arquivo de cookies do perfil (só lê uma CÓPIA, nunca altera) para saber quando a sessão do
  // Flow apareceu; aí fecha o Chrome do jeito normal (como clicar no X) e confere a sessão.
  let loginAtual = null; // { proc, profileDir, concluir() }

  function fecharNormal(proc) {
    if (!proc || proc.exitCode !== null) return;
    if (process.platform === 'win32') execFile('taskkill', ['/PID', String(proc.pid), '/T'], { windowsHide: true }, () => {}); // sem /F = fechar a janela
    else { try { proc.kill('SIGTERM'); } catch { /* já saiu */ } }
    setTimeout(() => { if (proc.exitCode === null) { try { proc.kill('SIGKILL'); } catch { /* já saiu */ } } }, 15000).unref?.();
  }

  // Há cookie de sessão do Flow (next-auth) gravado no perfil? null = não deu para ler agora.
  function temCookieSessao(profileDir) {
    const host = new URL(flowUrl).hostname;
    for (const rel of [path.join('Default', 'Network', 'Cookies'), path.join('Default', 'Cookies')]) {
      const origem = path.join(profileDir, rel);
      if (!fs.existsSync(origem)) continue;
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noctis-ck-'));
      try {
        for (const suf of ['', '-wal', '-journal']) if (fs.existsSync(origem + suf)) fs.copyFileSync(origem + suf, path.join(tmp, 'c' + suf));
        const { DatabaseSync } = require('node:sqlite');
        const db = new DatabaseSync(path.join(tmp, 'c'), { readOnly: true });
        try {
          const r = db.prepare("SELECT COUNT(*) AS n FROM cookies WHERE (host_key = ? OR host_key = ? OR host_key LIKE ?) AND name LIKE '%session-token%'").get(host, `.${host}`, `%.${host}`);
          return r.n > 0;
        } finally { db.close(); }
      } catch { return null; } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
    }
    return false;
  }

  function chromeComum(profileDir, url, { timeoutMs, aoAbrir, detectar = false } = {}) {
    const exe = executablePath || acharNavegador();
    if (!exe) throw Object.assign(new Error('Não encontrei o Google Chrome instalado. Instale o Chrome e tente de novo.'), { cat: 'configuracao' });
    fs.mkdirSync(profileDir, { recursive: true });
    return new Promise((resolve, reject) => {
      const extra = process.env.NOCTIS_CHROME_ARGS ? process.env.NOCTIS_CHROME_ARGS.split(' ').filter(Boolean) : []; // só testes
      const p = spawn(exe, [`--user-data-dir=${profileDir}`, '--no-first-run', '--no-default-browser-check', '--new-window', ...extra, url], { stdio: 'ignore', windowsHide: false });
      let detectado = false;
      const atual = { proc: p, profileDir, concluir: () => fecharNormal(p) };
      if (detectar) loginAtual = atual;
      const limite = setTimeout(() => fecharNormal(p), timeoutMs);
      const olhar = detectar ? setInterval(() => {
        if (temCookieSessao(profileDir)) { detectado = true; clearInterval(olhar); log.info('Flow: login detectado, fechando o Chrome…'); fecharNormal(p); }
      }, 3000) : null;
      p.on('error', (e) => { clearTimeout(limite); if (olhar) clearInterval(olhar); reject(e); });
      p.on('exit', () => {
        clearTimeout(limite); if (olhar) clearInterval(olhar);
        if (loginAtual === atual) loginAtual = null;
        // Processos auxiliares do Chrome soltam o perfil logo depois; espera um pouco.
        setTimeout(() => resolve({ detectado }), 1500);
      });
      if (aoAbrir) aoAbrir(p);
    });
  }

  // Abre o perfil num Chrome rápido (sem janela; se não achar a sessão, tenta com janela),
  // lê a sessão do Flow e fecha — igual à conferência ao abrir o app.
  async function lerSessao(profileDir) {
    const ex = sessoes.get(profileDir);
    if (ex) await ex.ctx.close().catch(() => {});
    for (const modo of [{ invisivel: true }, { visivel: true }]) {
      let s = null;
      try {
        s = await abrirPerfil(profileDir, modo);
        await s.page.goto(flowUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
        const u = await sessaoGoogle(s.page);
        if (u && u.email) return u;
        log.warn(`Flow: sessão não encontrada no perfil (${modo.invisivel ? 'sem janela' : 'com janela'}; página ${s.page.url().slice(0, 80)})`);
      } catch (e) { log.warn(`Flow: não consegui conferir o perfil: ${e.message.split('\n')[0]}`); }
      finally { if (s) await s.ctx.close().catch(() => {}); }
    }
    return null;
  }

  async function renomearComCalma(de, para) {
    for (let i = 0; i < 20; i++) {
      try { fs.rmSync(para, { recursive: true, force: true }); fs.renameSync(de, para); return para; } catch { await new Promise((r) => setTimeout(r, 500)); }
    }
    return de; // ainda preso por algum processo: usa a pasta como está
  }

  // Uma operação por vez em cada perfil (o Chrome de uma conta faz uma coisa de cada vez).
  function emSerie(s, fn) {
    const r = s.fila.then(fn, fn);
    s.fila = r.catch(() => {});
    return r;
  }

  async function sessaoGoogle(page) {
    try {
      const r = await page.request.get(sessionUrl, { timeout: 20000 });
      const d = await r.json().catch(() => ({}));
      return d && d.user ? d.user : null;
    } catch { return null; }
  }

  async function diagnostico(page, nome) {
    try {
      fs.mkdirSync(diagDir, { recursive: true });
      const base = path.join(diagDir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${nome}`);
      await page.screenshot({ path: `${base}.png`, fullPage: false }).catch(() => {});
      const aria = await page.locator('body').ariaSnapshot().catch(() => '');
      fs.writeFileSync(`${base}.txt`, `URL: ${page.url()}\n\n${aria}`);
      return base;
    } catch { return null; }
  }

  // Botão/aba/opção por rótulo (role ou texto). Devolve o primeiro visível.
  async function achar(page, re, { roles = ['button', 'tab', 'option', 'menuitem', 'menuitemradio', 'radio', 'link'], timeout = 4000 } = {}) {
    const fim = Date.now() + timeout;
    while (Date.now() < fim) {
      for (const role of roles) {
        const loc = page.getByRole(role, { name: re });
        const n = await loc.count().catch(() => 0);
        for (let i = 0; i < n; i++) {
          const el = loc.nth(i);
          if (await el.isVisible().catch(() => false)) return el;
        }
      }
      const t = page.getByText(re);
      const n = await t.count().catch(() => 0);
      for (let i = 0; i < n; i++) { const el = t.nth(i); if (await el.isVisible().catch(() => false)) return el; }
      await page.waitForTimeout(250);
    }
    return null;
  }

  async function garantirLogado(page) {
    if (!page.url().startsWith(new URL(flowUrl).origin)) await page.goto(flowUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const user = await sessaoGoogle(page);
    if (!user) throw Object.assign(new Error('session_expired: a conta não está logada no Flow'), { cat: 'sessao' });
    return user;
  }

  // Entra (ou cria) o projeto do Flow que corresponde ao projeto do Noctis nesta conta.
  async function garantirProjeto(page, projetoUrl) {
    if (projetoUrl && page.url().startsWith(projetoUrl)) return projetoUrl;
    if (projetoUrl) {
      await page.goto(projetoUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(2500);
      if (/\/project\//.test(page.url())) return page.url();
    }
    await page.goto(flowUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2500);
    const entrar = await achar(page, SEL.criarComFlow, { timeout: 1500 });
    if (entrar) { await entrar.click(); await page.waitForTimeout(2500); }
    const novo = await achar(page, SEL.novoProjeto, { timeout: 8000 });
    if (!novo) throw new Error('Não achei o botão "Novo projeto" no Flow');
    await novo.click();
    await page.waitForURL(/\/project\//, { timeout: 30000 });
    await page.waitForTimeout(2000);
    return page.url();
  }

  async function escolher(page, abrirRe, opcaoRe) {
    if (!opcaoRe) return false;
    const direto = await achar(page, opcaoRe, { roles: ['tab', 'radio', 'option', 'menuitemradio'], timeout: 800 });
    if (direto) { await direto.click().catch(() => {}); return true; }
    if (abrirRe) {
      const abrir = await achar(page, abrirRe, { roles: ['button', 'combobox'], timeout: 1500 });
      if (abrir) {
        await abrir.click().catch(() => {});
        const op = await achar(page, opcaoRe, { roles: ['option', 'menuitem', 'menuitemradio', 'radio', 'button', 'tab'], timeout: 2500 });
        if (op) { await op.click().catch(() => {}); return true; }
        await page.keyboard.press('Escape').catch(() => {});
      }
    }
    return false;
  }

  async function configurar(page, job) {
    const p = job.params;
    const modo = job.kind === 'image' ? SEL.modos.image : job.parent_id || p.mode === 'frames' ? SEL.modos.frames : p.mode === 'elements' ? SEL.modos.elements : SEL.modos.textVideo;
    if (!(await escolher(page, /(modo|mode|tipo)/i, modo))) log.warn(`Flow: não confirmei o modo (${modo}) — seguindo com o que está na tela`);
    const cfg = await achar(page, SEL.configuracoes, { roles: ['button'], timeout: 1200 });
    if (cfg) {
      await cfg.click().catch(() => {});
      await page.waitForTimeout(500);
      if (ASPECT_TEXTO[p.aspect]) await escolher(page, SEL.proporcao, ASPECT_TEXTO[p.aspect]);
      if (p.outputs) await escolher(page, SEL.saidas, new RegExp(`^\\s*x?${p.outputs}\\s*$`));
      const mod = MODELO_TEXTO[job.kind === 'image' ? p.model : p.quality];
      if (mod) await escolher(page, SEL.modelo, mod);
      if (job.kind === 'video' && p.duration) await escolher(page, /(dura[çc][ãa]o|duration)/i, new RegExp(`^\\s*${p.duration}\\s*s`, 'i'));
      await page.keyboard.press('Escape').catch(() => {});
    }
  }

  async function anexar(page, arquivos) {
    for (const arq of arquivos.filter(Boolean)) {
      const input = page.locator('input[type=file]');
      if (await input.count()) { await input.first().setInputFiles(arq); await page.waitForTimeout(2500); continue; }
      const botao = await achar(page, SEL.adicionarMidia, { roles: ['button'], timeout: 2000 });
      if (!botao) throw new Error('Não achei onde anexar a imagem no Flow');
      const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 8000 }), botao.click()]);
      await chooser.setFiles(arq);
      await page.waitForTimeout(2500);
    }
  }

  async function midiasNaTela(page) {
    return page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('img, video, video source')) {
        const src = el.currentSrc || el.src || '';
        if (!src || src.startsWith('data:')) continue;
        const img = el.tagName === 'IMG';
        if (img && (el.naturalWidth < 256 || el.naturalHeight < 144)) continue;
        out.push({ src, video: !img });
      }
      return out;
    });
  }

  async function baixar(page, src) {
    if (src.startsWith('blob:')) {
      const b64 = await page.evaluate(async (u) => {
        const r = await fetch(u);
        const b = await r.blob();
        return await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.readAsDataURL(b); });
      }, src);
      const [meta, data] = b64.split(',');
      const tipo = (meta.match(/data:([^;]+)/) || [])[1] || '';
      return { data: Buffer.from(data, 'base64'), ext: tipo.includes('mp4') ? '.mp4' : tipo.includes('png') ? '.png' : tipo.includes('webp') ? '.webp' : '.jpg' };
    }
    const r = await page.request.get(src, { timeout: 120000 });
    if (!r.ok()) throw new Error(`Download do resultado respondeu ${r.status()}`);
    const tipo = r.headers()['content-type'] || '';
    return { data: await r.body(), ext: tipo.includes('mp4') || tipo.includes('video') ? '.mp4' : tipo.includes('png') ? '.png' : tipo.includes('webp') ? '.webp' : '.jpg' };
  }

  async function gerarNaTela(page, job, { anexos = [], onStatus } = {}) {
    await configurar(page, job);
    if (anexos.length) await anexar(page, anexos);
    const caixa = page.locator(SEL.prompt).first();
    await caixa.waitFor({ state: 'visible', timeout: 20000 });
    await caixa.fill(job.prompt);
    const antes = new Set((await midiasNaTela(page)).map((m) => m.src));
    let enviar = await achar(page, SEL.enviar, { roles: ['button'], timeout: 3000 });
    if (enviar) await enviar.click(); else await caixa.press('Enter');
    onStatus && onStatus('processing', 'gerando — aguardando o resultado');
    const espera = job.kind === 'video' ? 12 * 60000 : 5 * 60000;
    const quer = Math.max(1, job.params.outputs || 1);
    const inicio = Date.now();
    let novos = [];
    let estavelDesde = 0;
    while (Date.now() - inicio < espera) {
      await page.waitForTimeout(3000);
      const corpo = await page.locator('body').innerText().catch(() => '');
      const erro = corpo.split('\n').map((l) => l.trim()).find((l) => SEL.erroGeracao.test(l) && l.length < 300);
      novos = (await midiasNaTela(page)).filter((m) => !antes.has(m.src) && (job.kind === 'video' ? m.video : !m.video));
      if (novos.length >= quer) break;
      if (novos.length && !estavelDesde) estavelDesde = Date.now();
      if (novos.length && Date.now() - estavelDesde > 25000) break;
      if (erro && !novos.length && Date.now() - inicio > 6000) throw new Error(erro);
    }
    if (!novos.length) throw new Error(`O Flow não entregou o resultado em ${Math.round(espera / 60000)} min`);
    onStatus && onStatus('downloading', `Baixando ${novos.length} arquivo(s) do job ${job.id.slice(0, 8)}`);
    const files = [];
    for (const m of novos.slice(0, quer)) files.push(await baixar(page, m.src));
    return files;
  }

  return {
    perfilDe: (email) => path.join(perfisDir, slugConta(email)),

    // Login de uma conta nova: abre o Chrome COMUM (sem automação) num perfil novo, no Flow.
    // A pessoa entra na conta Google e FECHA a janela; aí o app confere a sessão do perfil.
    async conectar({ timeoutMs = 10 * 60000, aoAbrir } = {}) {
      const tmp = path.join(perfisDir, `novo-${Date.now()}`);
      await chromeComum(tmp, flowUrl, { timeoutMs, aoAbrir, detectar: true });
      const user = await lerSessao(tmp);
      if (!user || !user.email) {
        fs.rmSync(tmp, { recursive: true, force: true });
        throw new Error('Não encontrei a conta logada no Flow. No Chrome que abre, entre na conta Google e espere a página do Flow aparecer com a sua conta (se pedir, clique em "Criar com o Flow"/"Entrar"). O Chrome fecha sozinho quando o login for detectado.');
      }
      const destino = await renomearComCalma(tmp, path.join(perfisDir, slugConta(user.email)));
      return { email: user.email.toLowerCase(), name: user.name || '', profile_dir: destino };
    },

    // Botões da tela durante o login: "Já entrei" (fecha o Chrome e confere) e "Cancelar".
    concluirLogin() { if (loginAtual) { loginAtual.concluir(); return true; } return false; },
    loginAberto: () => !!loginAtual,

    // Conferência rápida (ao abrir o app e no botão "Conferir"): abre, lê a sessão e fecha.
    async verificar(account) {
      // Chrome da conta já aberto (gerando): confere nele mesmo, na vez dele, sem fechar.
      const ex = sessoes.get(account.profile_dir);
      if (ex && !ex.fechado) return this.conferir(account);
      const u = await lerSessao(account.profile_dir);
      return !!(u && u.email && u.email.toLowerCase() === account.id.toLowerCase());
    },

    // Refazer o login (conta em "reconectar"): mesmo caminho, no perfil da conta.
    async reconectar(account, { timeoutMs = 10 * 60000, aoAbrir } = {}) {
      const ex = sessoes.get(account.profile_dir);
      if (ex) await ex.ctx.close().catch(() => {});
      await chromeComum(account.profile_dir, flowUrl, { timeoutMs, aoAbrir, detectar: true });
      const u = await lerSessao(account.profile_dir);
      return !!(u && u.email && u.email.toLowerCase() === account.id.toLowerCase());
    },

    // Confere se a conta segue logada (usado ao abrir o app e no botão "Conferir").
    async conferir(account) {
      const s = await abrirPerfil(account.profile_dir);
      return emSerie(s, async () => {
        await s.page.goto(flowUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
        const u = await sessaoGoogle(s.page);
        return !!(u && u.email && u.email.toLowerCase() === account.id.toLowerCase());
      });
    },

    // Abre o Flow da conta, visível, para a pessoa olhar/ajustar à mão.
    async abrir(account) {
      const ex = sessoes.get(account.profile_dir);
      if (ex) { await ex.page.bringToFront().catch(() => {}); return true; }
      // Chrome comum: a pessoa pode olhar, ajustar e até entrar de novo na conta.
      chromeComum(account.profile_dir, flowUrl, { timeoutMs: 6 * 3600000 }).catch((e) => log.warn(`Flow: ${e.message}`));
      return true;
    },

    // Salva print + mapa da tela atual da conta (para ajustar os localizadores).
    async diagnosticar(account) {
      const s = await abrirPerfil(account.profile_dir, { visivel: true });
      return emSerie(s, async () => {
        if (!s.page.url().startsWith(new URL(flowUrl).origin)) await s.page.goto(flowUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
        await s.page.waitForTimeout(4000);
        return diagnostico(s.page, 'flow-tela');
      });
    },

    async generate({ account, job, project, parent, characters = [], onStatus, setFlowUrl }) {
      const s = await abrirPerfil(account.profile_dir);
      return emSerie(s, async () => {
        const page = s.page;
        try {
          await garantirLogado(page);
          const salvo = (project.settings.flowProjects || {})[account.id];
          const url = await garantirProjeto(page, salvo);
          if (url !== salvo && setFlowUrl) setFlowUrl(url);
          const anexos = [];
          if (parent && parent.files.length) anexos.push(parent.files[0]);
          if (job.params.startImage) anexos.push(job.params.startImage);
          if (job.params.endImage) anexos.push(job.params.endImage);
          for (const c of characters) if (job.prompt.includes(`[${c.name}]`)) anexos.push(c.file_path);
          for (const r of job.params.refs || []) anexos.push(r);
          const prompt = job.prompt.replace(/\[([^\]]+)\]/g, (m, n) => (characters.some((c) => c.name === n) ? n : m));
          const files = await gerarNaTela(page, { ...job, prompt }, { anexos, onStatus });
          if (job.params.upscale) log.warn(`Flow: upscale ${job.params.upscale} ainda é feito à mão no Flow (job ${job.id.slice(0, 8)})`);
          return { files };
        } catch (e) {
          const base = await diagnostico(page, `job-${job.id.slice(0, 8)}`);
          if (base) e.message = `${e.message} · diagnóstico: ${base}.png`;
          throw e;
        }
      });
    },

    async fecharTudo() {
      for (const s of sessoes.values()) await s.ctx.close().catch(() => {});
      sessoes.clear();
    },
  };
}

module.exports = { criarFlowDriver, FLOW_URL, slugConta, SEL, acharNavegador };
