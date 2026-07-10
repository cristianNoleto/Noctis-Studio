import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ChevronDown, Copy, Check, KeyRound, FileDown, Play } from 'lucide-react'

// Documentação da API — clone da página do original (API pública de áudio),
// com a marca Noctis. A API em si entra no ar junto com a fase de TTS.
const BASE = 'https://app.noctis.studio/api/v1/audio'

const ENDPOINTS = [
  {
    method: 'GET',
    path: '/api/v1/audio/voices',
    title: 'Listar vozes',
    desc: 'Retorna as vozes disponíveis para o seu plano, com voice_id, nome, idioma e preview.',
    example: `curl "${BASE}/voices" \\\n  -H "X-API-Key: nsk_sua_chave_aqui"`,
    response: `{\n  "voices": [\n    { "voice_id": "v_luna", "name": "Luna", "language": "pt-BR", "gender": "female" },\n    { "voice_id": "v_atlas", "name": "Atlas", "language": "pt-BR", "gender": "male" }\n  ]\n}`,
  },
  {
    method: 'POST',
    path: '/api/v1/audio/generate',
    title: 'Gerar áudio',
    desc: 'Envia um job de geração. Aceita pausas SSML no texto: <break time="1s"/> (máx. 10s por pausa).',
    example: `curl -X POST "${BASE}/generate" \\\n  -H "X-API-Key: nsk_sua_chave_aqui" \\\n  -H "Content-Type: application/json" \\\n  -d '{"text": "Olá! Este é um teste da API do Noctis.", "voice_id": "v_luna"}'`,
    response: `{\n  "job_id": "job_8f2k1",\n  "status": "queued",\n  "characters": 42\n}`,
  },
  {
    method: 'GET',
    path: '/api/v1/audio/status/{job_id}',
    title: 'Status do job',
    desc: 'Consulta o andamento: queued → processing → done (ou error).',
    example: `curl "${BASE}/status/JOB_ID" \\\n  -H "X-API-Key: nsk_sua_chave_aqui"`,
    response: `{\n  "job_id": "job_8f2k1",\n  "status": "done",\n  "duration_seconds": 12.4\n}`,
  },
  {
    method: 'GET',
    path: '/api/v1/audio/download/{job_id}',
    title: 'Download do áudio',
    desc: 'Retorna as URLs do MP3 e das 3 legendas SRT (por tempo, legenda e por palavra).',
    example: `curl "${BASE}/download/JOB_ID" \\\n  -H "X-API-Key: nsk_sua_chave_aqui"`,
    response: `{\n  "mp3": "https://cdn.noctis.studio/audio/job_8f2k1.mp3",\n  "srt_tempo": "...",\n  "srt_legenda": "...",\n  "srt_palavra": "..."\n}`,
  },
  {
    method: 'GET',
    path: '/api/v1/audio/usage',
    title: 'Uso diário e limites',
    desc: 'Quantos áudios você já gerou hoje e o limite do seu plano (compartilhado com o dashboard).',
    example: `curl "${BASE}/usage" \\\n  -H "X-API-Key: nsk_sua_chave_aqui"`,
    response: `{\n  "used_today": 3,\n  "daily_limit": 50,\n  "characters_per_audio": 150000\n}`,
  },
  {
    method: 'GET',
    path: '/api/v1/audio/multivoice/info',
    title: 'Info pra usar modo multivoz',
    desc: 'Sintaxe para alternar vozes no mesmo texto usando marcadores [voz:voice_id].',
    example: `curl "${BASE}/multivoice/info" \\\n  -H "X-API-Key: nsk_sua_chave_aqui"`,
    response: `{\n  "syntax": "[voz:v_luna] Olá! [voz:v_atlas] Oi, tudo bem?"\n}`,
  },
  {
    method: 'GET',
    path: '/api/v1/audio/docs',
    title: 'Documentação JSON',
    desc: 'Esta documentação em formato de máquina (OpenAPI-like) para agentes e integrações.',
    example: `curl "${BASE}/docs"`,
    response: `{ "openapi": "3.1", "title": "Noctis Audio API", "version": "1.0" }`,
  },
]

const NAV = [
  ['Começar', [['#visao-geral', 'Visão geral'], ['#quickstart', 'Quickstart'], ['#minha-chave', 'Minha chave'], ['#autenticacao', 'Autenticação'], ['#fluxo', 'Fluxo completo']]],
  ['Endpoints de áudio', ENDPOINTS.map((e) => [`#ep-${e.path.replace(/\W+/g, '-')}`, `${e.method} ${e.path.replace('/api/v1/audio', '')}`])],
  ['Recursos', [['#testar', 'Testar API'], ['#limites', 'Limites'], ['#erros', 'Códigos de erro']]],
]

const ERRORS = [
  ['400', 'Requisição inválida — texto muito curto/longo, parâmetros inválidos'],
  ['401', 'API key inválida, não encontrada ou revogada'],
  ['403', 'Plano não autorizado, assinatura inativa ou limite de IPs atingido'],
  ['404', 'Job não encontrado'],
  ['429', 'Rate limit ou limite diário atingido (verificar header Retry-After)'],
  ['500', 'Erro interno do servidor'],
]

const QUICKSTART_CURL = `# 1. Envie uma geração
curl -X POST "${BASE}/generate" \\
  -H "X-API-Key: nsk_sua_chave_aqui" \\
  -H "Content-Type: application/json" \\
  -d '{"text": "Olá! Este é um teste da API do Noctis.", "voice_id": "SEU_VOICE_ID"}'

# 2. Acompanhe até concluir (troque JOB_ID pelo job_id do passo 1)
curl "${BASE}/status/JOB_ID" \\
  -H "X-API-Key: nsk_sua_chave_aqui"

# 3. Pegue as URLs de download (MP3 + 3 legendas SRT)
curl "${BASE}/download/JOB_ID" \\
  -H "X-API-Key: nsk_sua_chave_aqui"`

function CopyBtn({ text, small }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className={`flex items-center gap-1 rounded border border-slate-800 bg-slate-900 text-slate-400 transition-colors hover:border-slate-700 hover:text-slate-200 ${small ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-[11px]'}`}
    >
      {copied ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
      {copied ? 'Copiado' : 'Copiar'}
    </button>
  )
}

function CodeBlock({ code, title }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-1.5">
        <span className="text-[10px] font-bold tracking-wider text-slate-500">{title || 'cURL'}</span>
        <CopyBtn text={code} small />
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-[11px] leading-relaxed text-slate-300">{code}</pre>
    </div>
  )
}

const methodCls = (m) => (m === 'POST' ? 'bg-green-500/15 text-green-400' : 'bg-cyan-500/15 text-cyan-400')

export default function ApiDocs() {
  const [open, setOpen] = useState(null)
  const md = buildMarkdown()

  return (
    <div className="mx-auto flex max-w-7xl gap-8">
      {/* Nav lateral própria da documentação (como no original) */}
      <aside className="sticky top-4 hidden w-52 shrink-0 self-start lg:block">
        <p className="flex items-baseline gap-1.5 font-bold text-slate-100">
          Noctis <span className="text-cyan-400">API</span>
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-bold text-slate-400">v1.0</span>
        </p>
        <nav className="mt-4 space-y-4">
          {NAV.map(([group, items]) => (
            <div key={group}>
              <p className="mb-1.5 text-[10px] font-bold tracking-wider text-slate-600">{group.toUpperCase()}</p>
              <ul className="space-y-0.5">
                {items.map(([href, label]) => (
                  <li key={href}>
                    <a href={href} className="block truncate rounded px-2 py-1 font-mono text-[11px] text-slate-400 hover:bg-slate-900 hover:text-cyan-300">
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <Link to="/" className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300">
            <ArrowLeft size={12} />
            Voltar para o app
          </Link>
        </nav>
      </aside>

      {/* Conteúdo */}
      <div className="min-w-0 flex-1 space-y-6">
        {/* Hero */}
        <div id="visao-geral" className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-xl font-bold text-slate-100">
                Noctis API
                <span className="rounded bg-cyan-500/15 px-2 py-0.5 text-[10px] font-bold text-cyan-400">v1.0</span>
              </p>
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-400">
                Acesso programático ao gerador de áudio do Noctis Studio. Gere locuções com vozes naturais e receba as 3 legendas SRT e o
                texto, tudo por uma API REST simples.
              </p>
              <p className="mt-2 font-mono text-xs text-cyan-300">{BASE}</p>
            </div>
            <div className="flex gap-2">
              <CopyBtn text={md} />
              <button
                onClick={() => {
                  const blob = new Blob([md], { type: 'text/markdown' })
                  const a = document.createElement('a')
                  a.href = URL.createObjectURL(blob)
                  a.download = 'noctis-api.md'
                  a.click()
                  URL.revokeObjectURL(a.href)
                }}
                className="flex items-center gap-1 rounded border border-slate-800 bg-slate-900 px-2 py-1 text-[11px] text-slate-400 transition-colors hover:border-slate-700 hover:text-slate-200"
              >
                <FileDown size={11} />
                Baixar noctis-api.md
              </button>
            </div>
          </div>
          <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3.5 py-2.5 text-xs text-amber-300/90">
            <b>Assinatura ativa obrigatória.</b> A API de áudio está disponível nos planos Pro e Plus, com os mesmos limites diários do
            dashboard — e entra no ar junto com a fase Text to Speech do Noctis.{' '}
            <Link to="/meu-plano" className="underline hover:text-amber-200">
              Gerencie sua assinatura
            </Link>
            .
          </div>
        </div>

        {/* Minha chave */}
        <div id="minha-chave" className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 font-semibold text-slate-100">
                API Pública de Áudio
                <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-[9px] font-bold text-cyan-400">PRO</span>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Crie uma chave de API para integrar a geração de áudio em seus scripts e automações. O uso via API compartilha o mesmo
                limite diário do dashboard.
              </p>
            </div>
            <button disabled title="Disponível na fase Text to Speech" className="flex cursor-not-allowed items-center gap-2 rounded-lg bg-cyan-500/40 px-4 py-2 text-xs font-bold text-white/70">
              <KeyRound size={13} />
              Gerar Chave de API
            </button>
          </div>
        </div>

        {/* Quickstart */}
        <div id="quickstart" className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
          <h2 className="font-semibold text-slate-100">Quickstart</h2>
          <p className="mt-0.5 text-xs text-slate-500">Seu primeiro áudio em menos de 60 segundos.</p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              ['1', 'Gere sua chave', 'Use a seção Minha chave aqui na documentação e clique em Gerar Chave de API.'],
              ['2', 'Envie um job', 'Faça um POST em /generate com seu texto e o voice_id (liste as vozes em /voices).'],
              ['3', 'Baixe seu áudio', 'Consulte /status/:job_id até concluir e pegue as URLs (MP3 + 3 SRTs) em /download/:job_id.'],
            ].map(([n, title, desc]) => (
              <div key={n} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3.5">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500/15 text-xs font-bold text-cyan-400">{n}</span>
                <p className="mt-2 text-sm font-semibold text-slate-200">{title}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{desc}</p>
              </div>
            ))}
          </div>
          <p className="mb-2 mt-4 text-xs font-semibold text-slate-300">Teste agora</p>
          <CodeBlock code={QUICKSTART_CURL} />
        </div>

        {/* Autenticação + Fluxo */}
        <div id="autenticacao" className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
          <h2 className="font-semibold text-slate-100">Autenticação</h2>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
            Todas as requisições devem incluir o header <code className="rounded bg-slate-950 px-1.5 py-0.5 font-mono text-cyan-300">X-API-Key</code>{' '}
            com sua chave de acesso no formato <code className="rounded bg-slate-950 px-1.5 py-0.5 font-mono text-cyan-300">nsk_...</code>
          </p>
          <div className="mt-3">
            <CodeBlock code={`curl "${BASE}/voices" \\\n  -H "X-API-Key: nsk_sua_chave_aqui"`} />
          </div>
          <p id="fluxo" className="mt-4 text-xs text-slate-500">
            <b className="text-slate-300">Fluxo completo:</b> Gerar Key → Listar Vozes (GET) → Gerar Áudio (POST) → Verificar Status (GET) → Download (GET)
          </p>
        </div>

        {/* Endpoints */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
          <h2 className="font-semibold text-slate-100">Endpoints</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Clique num endpoint para expandir parâmetros, exemplos e resposta. As pausas SSML (<code className="font-mono">&lt;break time="Xs"/&gt;</code>)
            estão documentadas dentro do POST /generate.
          </p>
          <div className="mt-4 space-y-2">
            {ENDPOINTS.map((ep, i) => (
              <div key={ep.path} id={`ep-${ep.path.replace(/\W+/g, '-')}`} className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950/60">
                <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-slate-900/60">
                  <span className={`w-14 shrink-0 rounded px-1.5 py-0.5 text-center text-[10px] font-bold ${methodCls(ep.method)}`}>{ep.method}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-200">{ep.path}</span>
                  <span className="hidden text-xs text-slate-500 sm:block">{ep.title}</span>
                  <ChevronDown size={14} className={`shrink-0 text-slate-600 transition-transform ${open === i ? 'rotate-180' : ''}`} />
                </button>
                {open === i && (
                  <div className="space-y-3 border-t border-slate-800 p-3.5">
                    <p className="text-xs leading-relaxed text-slate-400">{ep.desc}</p>
                    <CodeBlock code={ep.example} title="Request (cURL)" />
                    <CodeBlock code={ep.response} title="Response" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Testar API */}
        <div id="testar" className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
          <h2 className="flex items-center gap-2 font-semibold text-slate-100">
            <Play size={14} className="text-cyan-400" />
            Testar API
          </h2>
          <p className="mt-2 rounded-lg border border-slate-800 bg-slate-950 px-3.5 py-3 text-xs text-slate-500">
            Você ainda não tem uma API Key. Gere uma na página{' '}
            <Link to="/meu-plano" className="text-cyan-400 underline hover:text-cyan-300">
              Meu Plano
            </Link>{' '}
            quando a fase Text to Speech estiver no ar.
          </p>
        </div>

        {/* Limites + Erros */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div id="limites" className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
            <h2 className="font-semibold text-slate-100">Limites</h2>
            <table className="mt-3 w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] font-bold tracking-wider text-slate-600">
                  <th className="pb-2">LIMITE</th>
                  <th className="pb-2">VALOR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-400">
                <tr><td className="py-2">Áudios por dia</td><td className="py-2">Conforme seu plano (compartilhado com dashboard)</td></tr>
                <tr><td className="py-2">Caracteres por áudio</td><td className="py-2">Conforme seu plano (por geração, não acumulado)</td></tr>
                <tr><td className="py-2">Requests por minuto</td><td className="py-2">10</td></tr>
              </tbody>
            </table>
          </div>
          <div id="erros" className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
            <h2 className="font-semibold text-slate-100">Códigos de Erro</h2>
            <table className="mt-3 w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] font-bold tracking-wider text-slate-600">
                  <th className="pb-2">CÓDIGO</th>
                  <th className="pb-2">DESCRIÇÃO</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-400">
                {ERRORS.map(([code, desc]) => (
                  <tr key={code}>
                    <td className="py-2 font-mono font-bold text-red-400">{code}</td>
                    <td className="py-2">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function buildMarkdown() {
  return [
    '# Noctis API v1.0',
    '',
    `Base URL: ${BASE}`,
    '',
    'Autenticação: header `X-API-Key: nsk_...` em todas as requisições.',
    '',
    '## Endpoints',
    ...ENDPOINTS.map((e) => `- ${e.method} ${e.path} — ${e.title}: ${e.desc}`),
    '',
    '## Limites',
    '- Áudios por dia: conforme o plano',
    '- Caracteres por áudio: conforme o plano',
    '- Requests por minuto: 10',
  ].join('\n')
}
