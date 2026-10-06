// Interpreta o "intervalo entre envios": "25" (fixo) ou "20-30" (faixa). Mesma regra usada no processo principal.
export function parseDelay(txt) {
  const s = String(txt || '').trim()
  const m = s.match(/^(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?$/)
  if (!m) return null
  const a = Number(m[1])
  const b = m[2] !== undefined ? Number(m[2]) : a
  if (a > b) return null
  return [a, b]
}

export function avaliarRitmo(txt) {
  const r = parseDelay(txt)
  if (!r) return { valido: false, erro: 'Use um número ("25") ou uma faixa ("20-30"), com o primeiro menor ou igual ao segundo.' }
  const media = (r[0] + r[1]) / 2
  if (media < 8) return { valido: true, cor: 'text-red-400', rotulo: 'Agressivo: grande chance de cooldown.' }
  if (media < 15) return { valido: true, cor: 'text-amber-400', rotulo: 'Rápido: pode gerar cooldown em contas novas ou grátis.' }
  return { valido: true, cor: 'text-emerald-400', rotulo: 'Seguro: ritmo parecido com o de uma pessoa usando o Flow.' }
}
