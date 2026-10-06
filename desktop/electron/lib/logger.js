// Console do app: anel em memória (tela Logs), arquivo diário (exportar pro suporte)
// e transmissão ao vivo para a interface. Níveis: info, success, warn, error.
const fs = require('fs');
const path = require('path');

const MAX = 3000;
const buffer = [];
const listeners = new Set();
let dir = null;

function init(logDir) {
  dir = logDir;
  fs.mkdirSync(dir, { recursive: true });
  // Mantém só os últimos 14 dias.
  try {
    const files = fs.readdirSync(dir).filter((f) => /^noctis-\d{4}-\d{2}-\d{2}\.log$/.test(f)).sort();
    for (const f of files.slice(0, Math.max(0, files.length - 14))) fs.unlinkSync(path.join(dir, f));
  } catch { /* ignora */ }
}

const pad = (n) => String(n).padStart(2, '0');
function stamp(d) { return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; }
function day(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

function log(level, message, ctx = {}) {
  const d = new Date();
  const entry = { id: `${d.getTime()}-${Math.random().toString(36).slice(2, 7)}`, ts: d.toISOString(), time: stamp(d), level, message: String(message), ctx };
  buffer.push(entry);
  if (buffer.length > MAX) buffer.splice(0, buffer.length - MAX);
  if (dir) {
    try { fs.appendFileSync(path.join(dir, `noctis-${day(d)}.log`), `[${entry.time}] [${level.toUpperCase()}] ${entry.message}\n`); } catch { /* disco */ }
  }
  for (const fn of listeners) { try { fn(entry); } catch { /* ignora */ } }
  return entry;
}

module.exports = {
  init,
  log,
  info: (m, c) => log('info', m, c),
  success: (m, c) => log('success', m, c),
  warn: (m, c) => log('warn', m, c),
  error: (m, c) => log('error', m, c),
  recent: (n = 500) => buffer.slice(-n),
  clear: () => { buffer.length = 0; },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  dir: () => dir,
};
