import { useCallback, useEffect, useState } from 'react'
import { Plug, Copy, Check, Eye, EyeOff, RefreshCw, FolderOpen, FolderPlus, X, PlayCircle, FileDown, Wand2, Terminal, Globe, AlertTriangle, CircleCheck, CircleX, HardDriveDownload, Music } from 'lucide-react'
import { call, useEvent, useToast } from '../lib/api'
import { Badge, btnGhost, btnPrimary, Card, inputCls, Modal, PageHeader, SectionLabel, Spinner, Toggle } from '../components/ui'

function Copiar({ texto, rotulo = 'Copiar' }) {
  const [ok, setOk] = useState(false)
  return (
    <button className={`${btnGhost} shrink-0`} onClick={async () => { await navigator.clipboard.writeText(texto); setOk(true); setTimeout(() => setOk(false), 1500) }}>
      {ok ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}{ok ? 'Copiado' : rotulo}
    </button>
  )
}

function Bloco({ children, copiar }) {
  return (
    <div className="relative">
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-slate-800 bg-slate-950/70 p-3 pr-28 font-mono text-[12px] leading-relaxed text-cyan-200">{children}</pre>
      {copiar && <div className="absolute right-2 top-2"><Copiar texto={copiar} /></div>}
    </div>
  )
}

const Passo = ({ n, children }) => (
  <div className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-500/15 text-xs font-bold text-cyan-300">{n}</span><div className="min-w-0 flex-1 text-sm leading-relaxed text-slate-300">{children}</div></div>
)

const Linha = ({ ok, children }) => (
  <div className="flex items-start gap-2 text-sm">{ok ? <CircleCheck size={16} className="mt-0.5 shrink-0 text-emerald-400" /> : <CircleX size={16} className="mt-0.5 shrink-0 text-red-400" />}<span className="text-slate-300">{children}</span></div>
)

export default function ConectarIA() {
  const toast = useToast()
  const [e, setE] = useState(null)
  const [verChave, setVerChave] = useState(false)
  const [porta, setPorta] = useState('')
  const [teste, setTeste] = useState(null)
  const [testando, setTestando] = useState(false)
  const [exportar, setExportar] = useState(false)
  const [comChave, setComChave] = useState(false)
  const [confirmarChave, setConfirmarChave] = useState(false)

  const carregar = useCallback(() => call('ia:estado').then((s) => { setE(s); setPorta(String(s.porta)) }).catch((err) => toast(err.message, 'error')), [toast])
  useEffect(() => { carregar() }, [carregar])
  useEvent('ia:estado', carregar)
  useEvent('settings', carregar)

  const acao = async (canal, arg, msg) => {
    try { const r = await call(canal, arg); if (r?.api) setE(r); else if (r?.estado) setE(r.estado); if (msg) toast(msg, 'success'); return r } catch (err) { toast(err.message, 'error'); return null }
  }

  async function testar() {
    setTestando(true)
    try { setTeste(await call('ia:testar')) } catch (err) { toast(err.message, 'error') } finally { setTestando(false) }
  }

  if (!e) return <div className="flex justify-center py-20"><Spinner /></div>

  const url = `http://127.0.0.1:${e.porta}`
  const chave = e.chave || ''
  const chaveVista = verChave ? chave : `${chave.slice(0, 4)}${'•'.repeat(24)}${chave.slice(-3)}`
  const curl = `curl -H "X-API-Key: ${verChave ? chave : 'SUA_CHAVE'}" "${url}/api/library/search?query=whoosh"`
  const fetchEx = `// Abra ${url}/ no navegador embutido e rode no console da página:\nconst r = await fetch('/api/audio/search?query=dark%20ambient&type=music&limit=5', { headers: { 'X-API-Key': '${verChave ? chave : 'SUA_CHAVE'}' } });\nconsole.log(await r.json());`
  const ocupada = e.api?.erro === 'porta-ocupada'

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 px-8 py-7 pb-24">
      <PageHeader icon={Plug} kicker="IAs" title="Conectar" accent="IA" subtitle="Deixe o Claude (ou qualquer IA) buscar e baixar sons e renomear arquivos pelo Noctis Studio."
        right={(
          <div className="flex items-center gap-2">
            {e.api?.ativa ? <Badge tone="green">API ativa · {e.api.porta}</Badge> : <Badge tone="red">{ocupada ? `Porta ${e.porta} ocupada` : 'API parada'}</Badge>}
            <button className={btnPrimary} onClick={testar} disabled={testando}>{testando ? <Spinner size={14} /> : <PlayCircle size={15} />} Testar conexão</button>
          </div>
        )} />

      {ocupada && (
        <Card className="flex items-start gap-3 border-amber-500/30 bg-amber-500/5 px-5 py-3.5">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-400" />
          <p className="text-sm text-slate-300">A porta <b>{e.porta}</b> já está em uso por outro programa, então a API local não abriu. O Noctis Studio não troca de porta sozinho: escolha outra abaixo em <b>API local</b> e salve (depois clique em "Adicionar automaticamente" de novo no Claude só se você usa a API; o MCP não depende da porta).</p>
        </Card>
      )}

      {teste && (
        <Card className="space-y-2 p-5">
          <SectionLabel right={<button className="text-xs text-slate-500 hover:text-slate-300" onClick={() => setTeste(null)}>fechar</button>}>Resultado do teste</SectionLabel>
          <Linha ok={teste.api.ok}>API local {teste.api.ok ? `respondendo em 127.0.0.1:${teste.api.porta}` : `sem resposta${teste.api.erro ? ` — ${teste.api.erro}` : ''}`}</Linha>
          {teste.categorias && <Linha ok={teste.categorias.ok}>{teste.categorias.ok ? `Categorias: ${teste.categorias.total} pasta(s) em ${teste.categorias.root}` : `Categorias: ${teste.categorias.erro || `HTTP ${teste.categorias.status}`}`}</Linha>}
          <Linha ok={teste.mcp.ok}>{teste.mcp.ok ? `MCP noctis-studio ${teste.mcp.servidor?.version || ''}: ${teste.mcp.ferramentas.length} ferramentas (${teste.mcp.ferramentas.join(', ')})` : `MCP: ${teste.mcp.erro || 'não respondeu'}`}</Linha>
          <Linha ok={teste.claude.temNoctis && !teste.claude.temAudioAtlas}>Claude Desktop: {teste.claude.temNoctis ? '"noctis-studio" configurado' : '"noctis-studio" não configurado'}{teste.claude.temAudioAtlas ? ' · ainda tem o "audio-atlas" antigo' : ''}</Linha>
          {teste.avisos.map((a) => <p key={a} className="flex items-start gap-2 text-[13px] text-amber-300"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{a}</p>)}
        </Card>
      )}

      <Card className="space-y-4 p-6">
        <SectionLabel right={e.claude.temNoctis ? (e.claude.noctisAtualizado ? <Badge tone="green">configurado</Badge> : <Badge tone="amber">caminho antigo</Badge>) : <Badge tone="slate">não configurado</Badge>}>Claude Desktop (MCP)</SectionLabel>
        {e.claude.temAudioAtlas && (
          <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[13px] text-amber-200"><AlertTriangle size={15} className="mt-0.5 shrink-0" />Seu Claude ainda usa o MCP antigo "audio-atlas". O "noctis-studio" tem as mesmas ferramentas (mesmos nomes) e mais o Renomeador — substitua.</p>
        )}
        {!e.claude.valido && <p className="text-[13px] text-red-300">O arquivo do Claude está com JSON inválido ({e.claude.erro}). Corrija-o ou cole o bloco à mão.</p>}
        <Passo n={1}>
          <b>Jeito fácil:</b> clique em <b>Adicionar automaticamente</b>. O Noctis Studio faz um backup do arquivo, adiciona o "noctis-studio", remove o "audio-atlas" antigo e não mexe em mais nada (outros MCPs, como o do Dark Planner, continuam iguais).
          <div className="mt-2 flex flex-wrap gap-2">
            <button className={btnPrimary} disabled={!e.claude.valido} onClick={() => acao('ia:claudeAdicionar', undefined, 'Adicionado ao Claude Desktop. Agora feche o Claude por completo e abra de novo.')}><Wand2 size={14} /> Adicionar automaticamente</button>
            <button className={btnGhost} onClick={() => call('ia:abrirConfigClaude')}><FolderOpen size={14} /> Abrir pasta do arquivo</button>
          </div>
        </Passo>
        <Passo n={2}>
          <b>Ou à mão:</b> abra <code className="rounded bg-slate-800 px-1 text-cyan-200">{e.claude.arquivo}</code> (Claude → Configurações → Desenvolvedor → Editar configuração), apague o bloco <code className="rounded bg-slate-800 px-1">"audio-atlas"</code> se existir e coloque este dentro de <code className="rounded bg-slate-800 px-1">"mcpServers"</code>:
          <div className="mt-2"><Bloco copiar={e.mcp.json}>{e.mcp.json}</Bloco></div>
        </Passo>
        <Passo n={3}><b>Feche o Claude por completo</b> (ícone na bandeja → Sair, não só o X da janela) e abra de novo. As ferramentas aparecem como "noctis-studio".</Passo>
      </Card>

      <Card className="space-y-3 p-6">
        <SectionLabel>Claude Code (terminal)</SectionLabel>
        <p className="text-sm text-slate-400">Rode uma vez no terminal; vale para todos os projetos (<code className="rounded bg-slate-800 px-1">--scope user</code>):</p>
        <Bloco copiar={e.mcp.comandoClaudeCode}><Terminal size={12} className="mr-1 inline" />{e.mcp.comandoClaudeCode}</Bloco>
        <p className="text-xs text-slate-500">Se já existia um "audio-atlas": <code className="rounded bg-slate-800 px-1">claude mcp remove audio-atlas --scope user</code></p>
      </Card>

      <Card className="space-y-4 p-6">
        <SectionLabel>API local (outras IAs, scripts, navegador embutido)</SectionLabel>
        <div className="grid gap-4 md:grid-cols-[1fr_auto]">
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-slate-200">Endereço</p>
            <div className="flex gap-2"><input readOnly value={url} className={`${inputCls} font-mono`} /><Copiar texto={url} /></div>
            <p className="text-xs text-slate-500">Só aceita conexões deste computador. Fica ativa enquanto o Noctis Studio estiver aberto (inclusive só na bandeja).</p>
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-slate-200">Porta</p>
            <div className="flex gap-2">
              <input value={porta} onChange={(ev) => setPorta(ev.target.value.replace(/\D/g, '').slice(0, 5))} className={`${inputCls} w-28 font-mono`} />
              <button className={btnGhost} disabled={String(e.porta) === porta && e.api?.ativa} onClick={() => acao('ia:salvar', { porta: Number(porta) }, 'Porta salva.')}>Salvar</button>
            </div>
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-slate-200">Chave (cabeçalho <code className="text-cyan-300">X-API-Key</code>)</p>
          <div className="flex flex-wrap gap-2">
            <input readOnly value={chaveVista} className={`${inputCls} min-w-[280px] flex-1 font-mono`} />
            <button className={btnGhost} onClick={() => setVerChave((v) => !v)}>{verChave ? <EyeOff size={14} /> : <Eye size={14} />}{verChave ? 'Ocultar' : 'Mostrar'}</button>
            <Copiar texto={chave} />
            <button className={btnGhost} onClick={() => setConfirmarChave(true)}><RefreshCw size={14} /> Gerar nova</button>
          </div>
          <p className="text-xs text-slate-500">Trate como senha. O MCP lê a chave sozinho, não precisa colar em lugar nenhum.</p>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <div><p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-400"><Terminal size={12} /> curl</p><Bloco copiar={curl}>{curl}</Bloco></div>
          <div><p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-400"><Globe size={12} /> fetch (navegador embutido do Claude)</p><Bloco copiar={fetchEx}>{fetchEx}</Bloco></div>
        </div>
      </Card>

      <Card className="space-y-4 p-6">
        <SectionLabel>Pastas</SectionLabel>
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-200"><Music size={14} className="text-cyan-400" /> Banco de sons</p>
          <div className="flex gap-2">
            <input readOnly value={e.raizSons || 'Nenhuma escolhida — a IA cria "Documentos\\Noctis Studio\\Banco de sons" no primeiro uso e avisa.'} className={`${inputCls} ${e.raizSons ? 'font-mono' : 'text-slate-500'}`} />
            <button className={btnGhost} onClick={() => acao('ia:escolherPastaSons', undefined, 'Pasta do banco de sons salva.')}><FolderOpen size={14} /> Escolher</button>
          </div>
          <p className="text-xs text-slate-500">Mesma pasta da tela Audio Atlas. Se ela estiver no Google Drive (G:) e ele estiver fechado, as IAs recebem um aviso claro — nada é criado em outro lugar.</p>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-200">Pastas liberadas para IAs (Renomeador)</p>
            <button className={btnGhost} onClick={() => acao('ia:adicionarPasta')}><FolderPlus size={14} /> Liberar pasta</button>
          </div>
          <p className="text-xs text-slate-500">As IAs só renomeiam arquivos dentro destas pastas (e subpastas), sempre com prévia antes, sem sobrescrever, apagar ou mover entre pastas.</p>
          {e.pastasRenomear.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-800 px-4 py-3 text-sm text-slate-500">Nenhuma pasta liberada ainda.</p>
          ) : e.pastasRenomear.map((p) => (
            <div key={p} className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2">
              <FolderOpen size={14} className="shrink-0 text-cyan-400" />
              <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-slate-300">{p}</span>
              <button className="rounded-lg p-1 text-slate-500 hover:bg-slate-800 hover:text-red-400" title="Remover da lista (não apaga nada)" onClick={() => acao('ia:removerPasta', p)}><X size={14} /></button>
            </div>
          ))}
        </div>
      </Card>

      <Card className="flex items-center justify-between gap-4 p-6">
        <div>
          <p className="text-sm font-semibold text-slate-200">Iniciar com o Windows (na bandeja)</p>
          <p className="text-xs text-slate-500">Abre o Noctis Studio escondido na bandeja ao ligar o PC, com a API local pronta para as IAs. O MCP funciona mesmo com o app fechado.</p>
        </div>
        <Toggle checked={e.iniciarComWindows} onChange={(v) => acao('ia:salvar', { iniciarComWindows: v }, v ? 'Vai iniciar com o Windows.' : 'Não vai mais iniciar com o Windows.')} />
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="space-y-3 p-6">
          <SectionLabel>Guia para IAs</SectionLabel>
          <p className="text-sm text-slate-400">NOCTIS-STUDIO-PARA-IAS.md: regras, cada ferramenta e rota com exemplos, fluxos e solução de problemas. Entregue para qualquer IA que for usar o Noctis Studio.</p>
          <div className="flex flex-wrap gap-2">
            <button className={btnPrimary} onClick={() => setExportar(true)}><FileDown size={14} /> Exportar guia</button>
            <button className={btnGhost} onClick={() => call('ia:abrirNavegador', '/api/guide').catch(() => {})} disabled={!e.api?.ativa}><Globe size={14} /> Abrir /api/guide</button>
          </div>
          <p className="text-xs text-slate-500">Log do MCP no Claude: <code className="rounded bg-slate-800 px-1">{e.logMcp}</code> <button className="ml-1 text-cyan-400 hover:underline" onClick={() => call('ia:abrirLogMcp')}>abrir</button></p>
        </Card>

        <Card className="space-y-3 p-6">
          <SectionLabel>Apps antigos (Audio Atlas e Renomeador)</SectionLabel>
          {e.migracao?.erro ? <p className="text-sm text-red-300">{e.migracao.erro}</p> : (
            <>
              <p className="text-sm text-slate-400">{e.migracao?.mensagem || 'Ainda não verificado.'}</p>
              {e.migracao?.audioAtlas && <p className="text-xs text-slate-500">Audio Atlas: {e.migracao.audioAtlas.pasta ? `pasta "${e.migracao.audioAtlas.pasta}"` : 'pasta mantida'}, +{e.migracao.audioAtlas.favoritos} favoritos, +{e.migracao.audioAtlas.historico} buscas.</p>}
              {e.migracao?.renomeador && <p className="text-xs text-slate-500">Renomeador: +{e.migracao.renomeador.copiados} operações no histórico ({e.migracao.renomeador.jaExistiam} já existiam).</p>}
              {e.migracao?.bancoDeSons && <p className="text-xs text-slate-500">Banco de sons: {e.migracao.bancoDeSons.disponivel ? `${e.migracao.bancoDeSons.audios} áudios, ${e.migracao.bancoDeSons.noCatalogo} no catálogo` : e.migracao.bancoDeSons.aviso}</p>}
            </>
          )}
          <button className={btnGhost} onClick={() => acao('ia:migrar').then((r) => r && setE((x) => ({ ...x, migracao: r })))}><HardDriveDownload size={14} /> Importar de novo</button>
        </Card>
      </div>

      <Modal open={exportar} onClose={() => setExportar(false)} title="Exportar guia para IAs" width="max-w-md">
        <p className="text-sm text-slate-400">O arquivo leva o endereço da API e o bloco do MCP deste computador.</p>
        <label className="mt-4 flex items-start gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={comChave} onChange={(ev) => setComChave(ev.target.checked)} className="mt-0.5 accent-cyan-500" />
          <span>Incluir a chave da API no arquivo <span className="block text-xs text-amber-300/80">Só marque se o arquivo não vai sair deste computador.</span></span>
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button className={btnGhost} onClick={() => setExportar(false)}>Cancelar</button>
          <button className={btnPrimary} onClick={async () => { setExportar(false); const p = await acao('ia:exportarGuia', { incluirChave: comChave }); if (p) toast(`Guia salvo em ${p}`, 'success') }}><FileDown size={14} /> Salvar</button>
        </div>
      </Modal>

      <Modal open={confirmarChave} onClose={() => setConfirmarChave(false)} title="Gerar nova chave?" width="max-w-md">
        <p className="text-sm text-slate-400">A chave atual para de funcionar na hora. Scripts e IAs que usam a API local precisarão da nova (o MCP pega sozinho).</p>
        <div className="mt-5 flex justify-end gap-2">
          <button className={btnGhost} onClick={() => setConfirmarChave(false)}>Cancelar</button>
          <button className={btnPrimary} onClick={() => { setConfirmarChave(false); acao('ia:regenerarChave', undefined, 'Nova chave gerada.') }}><RefreshCw size={14} /> Gerar nova</button>
        </div>
      </Modal>
    </div>
  )
}
