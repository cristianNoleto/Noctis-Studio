// Travas entre PROCESSOS (o app aberto, o MCP e o modo sem janela podem rodar ao mesmo tempo):
//  • travaSync(arquivo, fn): exclusão mútua com um arquivo .lock (criado com 'wx'); trava
//    abandonada (processo morto) expira sozinha.
//  • esperarVez(arquivo, intervaloMs): limitador compartilhado — garante o intervalo mínimo entre
//    requisições ao Pixabay somando TODOS os processos (grava o horário da última num arquivo).
const fs = require('fs');
const path = require('path');

const ABANDONADA_MS = 30 * 1000;
const dormirSync = (ms) => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { /* sem Atomics */ } };
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function tentarTravar(lock) {
  try {
    const fd = fs.openSync(lock, 'wx');
    fs.writeSync(fd, String(process.pid));
    fs.closeSync(fd);
    return true;
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    try { if (Date.now() - fs.statSync(lock).mtimeMs > ABANDONADA_MS) fs.unlinkSync(lock); } catch { /* outro processo já limpou */ }
    return false;
  }
}

function travaSync(arquivo, fn, { esperaMaxMs = 15000 } = {}) {
  const lock = `${arquivo}.lock`;
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  const t0 = Date.now();
  while (!tentarTravar(lock)) {
    if (Date.now() - t0 > esperaMaxMs) throw Object.assign(new Error('Outro processo do Noctis Studio está usando o catálogo. Tente de novo em instantes.'), { code: 'LOCKED' });
    dormirSync(25);
  }
  try { return fn(); } finally { try { fs.unlinkSync(lock); } catch { /* já removida */ } }
}

async function travaAsync(arquivo, fn, { esperaMaxMs = 60000 } = {}) {
  const lock = `${arquivo}.lock`;
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  const t0 = Date.now();
  while (!tentarTravar(lock)) {
    if (Date.now() - t0 > esperaMaxMs) throw Object.assign(new Error('O limitador do Pixabay está ocupado por outro processo.'), { code: 'RATE_LIMITED', retryAfter: 10 });
    await dormir(50);
  }
  try { return await fn(); } finally { try { fs.unlinkSync(lock); } catch { /* já removida */ } }
}

// Espera a vez deste processo de falar com o Pixabay, respeitando o intervalo global.
async function esperarVez(arquivo, intervaloMs) {
  await travaAsync(arquivo, async () => {
    let ultima = 0;
    try { ultima = Number(JSON.parse(fs.readFileSync(arquivo, 'utf8')).ultima) || 0; } catch { /* primeira vez */ }
    const falta = ultima + intervaloMs - Date.now();
    if (falta > 0) await dormir(Math.min(falta, intervaloMs));
    fs.writeFileSync(arquivo, JSON.stringify({ ultima: Date.now(), pid: process.pid }));
  });
}

module.exports = { travaSync, travaAsync, esperarVez };
