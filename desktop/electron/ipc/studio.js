// Narração (ElevenLabs) e Estúdio (Google: imagem/vídeo) DENTRO do app.
//   O app não tem a chave: ele chama a API HOSPEDADA do Noctis Studio
//   (mesmo backend do site) com o token da conta Noctis. A chave central é do
//   dono e vive só no servidor — o app nunca a vê. A cota diária por usuário é
//   a mesma do site (contada no servidor).
//
//   Binário (áudio/imagem/vídeo) volta como base64 pela ponte IPC; a interface
//   converte em Blob. Cada handler devolve o JSON do servidor OU { base64, mime,
//   ... } para os que retornam mídia.

module.exports = function registrar(ctx) {
  const base = () => (ctx.store.get().siteUrl || 'https://noctis-studio.online').replace(/\/+$/, '');

  async function apiFetch(path, { method = 'GET', body, binary = false, timeout = 60000 } = {}) {
    const token = ctx.auth.accessToken();
    if (!token) throw Object.assign(new Error('Entre com sua conta Noctis para usar o app.'), { code: 'AUTH' });
    let res;
    try {
      res = await fetch(`${base()}/api${path}`, {
        method,
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token}` },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeout),
      });
    } catch (e) {
      throw Object.assign(new Error(`Sem conexão com o servidor: ${e.message}`), { code: 'NETWORK' });
    }
    if (!res.ok) {
      let j = {};
      try { j = await res.json(); } catch { /* corpo não-JSON */ }
      throw Object.assign(new Error(j.message || `Erro ${res.status}`), { code: j.error || 'request_failed' });
    }
    if (binary) {
      const buf = Buffer.from(await res.arrayBuffer());
      const num = (h) => { const v = res.headers.get(h); return v == null ? null : Number(v); };
      return {
        base64: buf.toString('base64'),
        mime: res.headers.get('content-type') || 'application/octet-stream',
        cost: num('X-Tts-Cost'),
        remaining: num('X-Tts-Remaining') ?? num('X-Image-Remaining'),
        unlimited: (res.headers.get('X-Tts-Unlimited') ?? res.headers.get('X-Unlimited')) === '1',
      };
    }
    return res.json();
  }

  // Narração (TTS) — áudio no site e no app.
  ctx.handle('studio:tts-status', () => apiFetch('/tts/status'));
  ctx.handle('studio:tts-voices', () => apiFetch('/tts/voices'));
  ctx.handle('studio:tts-generate', (body) => apiFetch('/tts/generate', { method: 'POST', body, binary: true, timeout: 180000 }));

  // Estúdio (imagem/vídeo) — só no app.
  ctx.handle('studio:media-status', () => apiFetch('/media-gen/status'));
  ctx.handle('studio:image', (body) => apiFetch('/media-gen/image', { method: 'POST', body, binary: true, timeout: 120000 }));
  ctx.handle('studio:video-start', (body) => apiFetch('/media-gen/video', { method: 'POST', body }));
  ctx.handle('studio:video-status', (id) => apiFetch(`/media-gen/video/${encodeURIComponent(id)}`));
  ctx.handle('studio:video-file', (id) => apiFetch(`/media-gen/video/${encodeURIComponent(id)}/file`, { binary: true, timeout: 180000 }));
  ctx.handle('studio:videos', () => apiFetch('/media-gen/videos'));
};
