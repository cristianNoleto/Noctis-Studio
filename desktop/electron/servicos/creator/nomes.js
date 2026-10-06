// Nome dos arquivos gerados a partir do padrão das Configurações.
// Variáveis: {order} {prompt} {type} {model} {ratio} {date} {time} {project} {seed}
const path = require('path');
const fs = require('fs');

function slugPrompt(prompt, max = 50) {
  const limpo = String(prompt || '')
    .replace(/\[[^\]]*\]/g, ' ')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
    .replace(/[^\w\s-]/g, ' ')
    .trim()
    .replace(/\s+/g, '_');
  return (limpo.slice(0, max).replace(/_+$/, '') || 'midia');
}

const pad = (n) => String(n).padStart(2, '0');

function montarNome(padrao, { seq, prompt, kind, model, ratio, project, seed }, d = new Date()) {
  const vars = {
    order: String(seq),
    prompt: slugPrompt(prompt),
    type: kind === 'video' ? 'video' : 'imagem',
    model: String(model || '').replace(/[^\w.-]/g, '_'),
    ratio: String(ratio || '').replace(':', 'x'),
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`,
    project: slugPrompt(project, 40),
    seed: String(seed || ''),
  };
  let nome = String(padrao || '{order}_{prompt}').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  nome = nome.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/_+/g, '_').replace(/^[_ .]+|[_ .]+$/g, '');
  return nome.slice(0, 120) || String(seq);
}

// Caminho livre na pasta: se já existir, acrescenta um sufixo curto.
function caminhoLivre(pasta, base, ext) {
  let p = path.join(pasta, `${base}${ext}`);
  if (!fs.existsSync(p)) return p;
  for (let i = 0; i < 50; i++) {
    p = path.join(pasta, `${base}_${Math.random().toString(16).slice(2, 10)}${ext}`);
    if (!fs.existsSync(p)) return p;
  }
  return p;
}

function nomePasta(nome) {
  return String(nome || 'Projeto').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Projeto';
}

module.exports = { montarNome, caminhoLivre, slugPrompt, nomePasta };
