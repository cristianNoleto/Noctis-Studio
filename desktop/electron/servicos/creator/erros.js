// Categoria provável de um erro de geração (pelo texto que o Flow/Grok devolve) e o que fazer.
// Aprendizado do Dark Planner: cada categoria tem uma conduta própria.
const REGRAS = [
  ['sessao', /get_token|session_?expired|SessionExpired|session dead|sem token|refresh falhou|not signed in|sign in|fa[çc]a login|\b401\b|\b403\b|reconect/i],
  ['quota', /limite di[aá]rio|DAILY_QUOTA|\bquota\b|insufficient|cr[eé]ditos? insuficientes|out of credits|no credits|sem cr[eé]ditos/i],
  ['filtro', /UNSAFE|SEXUAL|DANGER|PROMINENT_PEOPLE|\bMINOR\b|AUDIO_FILTERED|pol[ií]tica|polic(y|ies)|violat|guideline|n[aã]o pode ser gerad|can'?t generate|unable to generate this/i],
  ['cooldown', /UNUSUAL_ACTIVITY|cooldown|rate ?limit|too many|\b429\b|try again later|tente novamente mais tarde/i],
  ['configuracao', /\b422\b|value_error|modelo inv[aá]lido|invalid (model|aspect|parameter)|n[aã]o suportad/i],
  ['rede', /ECONN|ETIMEDOUT|ENOTFOUND|net::|network|timeout|tempo esgotado|socket/i],
];

function categoria(texto) {
  const t = String(texto || '');
  if (!t) return 'outro';
  for (const [cat, re] of REGRAS) if (re.test(t)) return cat;
  return 'outro';
}

const CONDUTA = {
  sessao: 'A conta precisa entrar de novo no Google (Contas → Reconectar).',
  quota: 'A conta ficou sem créditos/cota. O pedido espera esta conta voltar.',
  filtro: 'O Google recusou o prompt por política. Reescreva (ou deixe a reescrita automática tentar).',
  cooldown: 'O Google pediu uma pausa para esta conta. O pedido espera ela voltar; aumentar o intervalo entre envios evita novas pausas.',
  configuracao: 'Modelo, formato ou duração não aceitos. Confira a configuração do pedido.',
  rede: 'Falha de conexão. O app tenta de novo sozinho.',
  outro: 'Erro inesperado. Veja os Logs para detalhes.',
};

module.exports = { categoria, CONDUTA };
