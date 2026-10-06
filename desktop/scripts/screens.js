// Abre o app (Electron) e tira print das telas — para conferir o visual sem abrir na mão.
// Uso: xvfb-run -a node scripts/screens.js <pasta-de-saida> [--login]
const { _electron: electron } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const os = require('os');

const out = process.argv[2] || 'screens';
const soLogin = process.argv.includes('--login');
const paginas = (process.env.PAGES || 'dashboard,projetos,srt,audio-atlas,renomeador,contas,logs,config').split(',');

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const userData = process.env.NOCTIS_USER_DATA || fs.mkdtempSync(path.join(os.tmpdir(), 'noctis-ud-'));
  const app = await electron.launch({
    executablePath: require('electron'),
    args: [path.join(__dirname, '..'), '--no-sandbox'],
    env: { ...process.env, NOCTIS_USER_DATA: userData, ...(soLogin ? {} : { NOCTIS_DEV_NO_LOGIN: '1' }) },
  });
  app.process().stdout.on('data', (d) => process.stdout.write(`[main] ${d}`));
  app.process().stderr.on('data', (d) => { const s = String(d); if (!/dbus|gpu|GLES|viz/i.test(s)) process.stderr.write(`[main] ${s}`); });
  const win = await app.firstWindow();
  win.on('console', (m) => { if (m.type() === 'error') console.log('[renderer]', m.text()); });
  win.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await win.setViewportSize({ width: 1440, height: 900 });
  await win.waitForTimeout(1500);
  if (soLogin) {
    await win.screenshot({ path: path.join(out, 'login.png') });
  } else {
    for (const p of paginas) {
      await win.evaluate((pg) => { localStorage.setItem('noctis_page', pg) }, p);
      await win.reload();
      await win.waitForTimeout(1800);
      await win.screenshot({ path: path.join(out, `${p.replace(/\//g, '_')}.png`) });
      console.log('ok', p);
    }
  }
  await app.close();
})().catch((e) => { console.error(e); process.exit(1); });
