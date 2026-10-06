// Reescrita automática de prompts recusados por política, com o Gemini (chave do usuário).
// Várias chaves: se uma der limite (429/503) ou for recusada, passa para a próxima.

async function reescrever(prompt, erro, cfg, fetchImpl = fetch) {
  const keys = (cfg.keys || []).map((k) => String(k).trim()).filter(Boolean);
  if (!keys.length) throw Object.assign(new Error('Sem chave do Gemini (Configurações → Reescrita IA).'), { code: 'NO_KEY' });
  const model = cfg.model || 'gemini-2.5-flash';
  const instrucao = cfg.systemPrompt || 'Reescreva o prompt para evitar violações de política, mantendo a intenção visual. Retorne APENAS o prompt.';
  const corpo = {
    systemInstruction: { parts: [{ text: instrucao }] },
    contents: [{ role: 'user', parts: [{ text: `Prompt recusado:\n${prompt}\n\nMotivo informado pelo gerador: ${erro || 'política de conteúdo'}` }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
  };
  let ultimo = null;
  for (const key of keys) {
    let r;
    try {
      r = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(45000),
      });
    } catch (e) { ultimo = e; continue; }
    const data = await r.json().catch(() => ({}));
    if (r.status === 429 || r.status === 503 || r.status === 403 || r.status === 400) { ultimo = new Error(data.error?.message || `Gemini ${r.status}`); continue; }
    if (!r.ok) throw new Error(data.error?.message || `Gemini respondeu ${r.status}`);
    const texto = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
    if (!texto) throw new Error('O Gemini não devolveu texto (talvez também tenha bloqueado o conteúdo).');
    return texto.replace(/^["'`]+|["'`]+$/g, '').trim();
  }
  throw ultimo || new Error('Nenhuma chave do Gemini funcionou.');
}

module.exports = { reescrever };
