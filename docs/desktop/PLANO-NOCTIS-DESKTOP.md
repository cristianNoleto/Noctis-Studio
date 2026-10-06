# Noctis Studio Desktop: análise e plano de ação

Programa único para uso pessoal, juntando três coisas num app só, com a cara do site Noctis Studio:

1. **Renomeador**: renomear arquivos em massa.
2. **Audio Atlas**: buscar, ouvir e baixar músicas e SFX do Pixabay.
3. **Tudo que o Dark Planner faz hoje**, menos o Estúdio (editor de vídeo). O Text to Speech fica para depois.

Fonte analisada: a pasta do Google Drive com `pixabay app`, `Renomeador de arquivos`, `darkplanner` (instalação 2.0.21) e `DarkPlanner-Setup-2.0.21.exe`.

---

## 1. Resumo

| Programa | Tecnologia | Código | O que dá para aproveitar |
|---|---|---|---|
| Renomeador | Python + customtkinter | Fonte completo (`app.py`, 647 linhas, com testes) | Tudo. A lógica é portada para o app novo, com os mesmos testes. |
| Audio Atlas 1.0.4 | Electron + JS puro | Fonte completo (`src/`, `renderer/`) | Tudo. Já é Electron: entra quase direto. |
| Dark Planner 2.0.21 | Electron + núcleo Python (FastAPI) compilado | Processo principal em JS (legível, minificado). Interface, regras e Estúdio **criptografados**. Núcleo Python **compilado** (Nuitka). | O mapa completo de funções, telas, rotas e regras de negócio. O código em si não é copiado; o app novo é escrito do zero. |

Do Dark Planner consegui o mapa funcional quase inteiro, por quatro fontes:

- **Processo principal Electron** (`app.asar` → `out/main/index.js`, ~19,5 mil linhas depois de formatado): chat com os CLIs, login dos CLIs, serviço de produção, canais, delegação, Estúdio.
- **Servidor MCP** (`resources/mcp/darkplanner-server.js`, 3,6 mil linhas, sem minificar e comentado): todas as ferramentas que a IA do chat usa e os cuidados de cada uma.
- **Manual do app**, embutido no núcleo: descreve **tela por tela** Dashboard, Logs, Projetos, Creator, Text to Speech, Configurações, Contas e Estúdio.
- **Lista de rotas da API local** (~200 rotas) e **lista de módulos** do núcleo Python.

O que **não** dá para ler: `ui_bundle.enc` (a interface React), `rules.enc` (as regras de tempo que eles baixam do servidor deles), `studio_bundle.enc` e `turbo_host.enc` (Estúdio). Estão criptografados de propósito e **não vou quebrar essa criptografia**. Na prática isso não trava o projeto: o manual descreve cada tela em detalhe, e o que faltar de visual sai de prints seus (ver seção 9).

---

## 2. Renomeador: o que ele faz

Programa Python (`app.py`) com interface customtkinter, rodado por um lançador `.exe` (PyInstaller) e um instalador próprio.

**Núcleo:**
- `termos(nome)`: quebra o nome em termos por `_ - espaço .`, CamelCase e letra/número (ex.: `IMG_2023VideoFinal-v2` → `IMG, 2023, Video, Final, v, 2`).
- `analisar(arquivos)`: conta termos repetidos e também prefixos e sufixos de 1 e 2 blocos (`IMG_`, `_final`). Ordena do mais frequente para o menos.
- **Ações combináveis, em ordem:** substituir/remover (por termo, prefixo ou sufixo), adicionar prefixo/sufixo, numerar (`ferias_###`, `{nome}_###`, início configurável), caixa (minúsculo, MAIÚSCULO, Título), limpar (caracteres inválidos e separadores repetidos).
- **Nunca altera a extensão e nunca apaga arquivos.**
- `gerar_previa`: antes → depois, com conflitos que **bloqueiam** o Aplicar: `nome vazio`, `caractere inválido`, `nome repetido`, `já existe na pasta`.
- **Renomear em 2 fases** (via nome temporário): permite trocar nomes entre si (v2 ↔ v3). Se algo falhar no meio, desfaz o que já fez.
- **Histórico** em `historico/AAAAMMDD-HHMMSS.json`. "Desfazer última operação" pode ser clicado várias vezes, voltando uma operação por vez.
- Opções: incluir subpastas, filtrar por extensões (`.mp4 .png`), ordenação natural.

**Interface:** tela inicial (escolher pasta), "O que encontrei" (termos com Trocar/Remover, busca, dica de "Corrigir" quando há nomes sujos, "Mais opções…"), "Como vai ficar" (fila de mudanças numerada com ✕, tabela Antes/Depois/Status, "Só os que mudam", resumo, Aplicar).

**Testes:** `test_app.py` cobre análise, prévia, conflitos, aplicar/desfazer, rollback e interface.

**Instalação Windows:** sem admin, em `%LOCALAPPDATA%\Programs`, atalhos e registro em "Aplicativos". No app novo isso some, porque ele vira uma tela do Noctis Studio Desktop.

---

## 3. Audio Atlas: o que ele faz

Electron 44, JS puro, ícones Lucide, fonte Inter.

- **Busca no Pixabay** (músicas e SFX) por uma janela Chromium oculta, porque o Pixabay bloqueia `fetch` com Cloudflare. Lê o JSON da própria página (`__BOOTSTRAP_URL__`) e baixa as formas de onda.
- **Fila educada:** uma requisição por vez, com intervalo configurável (padrão 1,5 s, mínimo 0,5 s) e User-Agent identificável.
- **Tradução PT/ES → EN**: glossário de termos de áudio, com a API MyMemory como reserva.
- **Filtros:** tipo (música/SFX), duração (curta, média, longa), ordem (relevância, recentes), paginação.
- **Download** direto do CDN com progresso, nome `Titulo_ID.mp3`, sem baixar repetido (pelo catálogo ou pelo ID no nome de arquivos antigos).
- **Pasta automática** (`categorize.js`): usa uma pasta existente que combine (palavra inteira) ou cria uma nova com nome que faz sentido. Música vai para `background music\<gênero/clima>`.
- **Catálogo** `catalogo-pixabay.json` + `.csv` (com BOM para o Excel) na raiz do banco de sons, com a licença registrada.
- **Biblioteca local:** varre o banco de sons (até 4 níveis) e busca por título, pasta, autor e tags.
- **Favoritos, histórico de buscas** e marcação de **Content ID** (música que pode gerar reivindicação no YouTube).
- **Player** com forma de onda clicável e atalhos (Espaço, ↑/↓).
- **CLI** (`audio-atlas.cmd search|download|library|categories`, saída JSON, códigos de saída) e **servidor MCP** (`search_audio`, `download_audio`, `search_library`, `list_categories`). É assim que o Claude coloca o áudio no draft do CapCut.
- **Atualização automática** a partir de uma pasta local.

Pontos a corrigir na migração: caminhos fixos no código (`G:\Meu Drive\Video Youtube\The Shadow Archives\Materiais\Sounds`, `C:\Users\Cristian\Documents\pixabay app\dist`) viram configurações.

---

## 4. Dark Planner 2.0.21: como ele é por dentro

### 4.1 Arquitetura

```
Electron (main, JS)
 ├─ sobe o núcleo Python  darkplanner-core.exe  (FastAPI + SQLite criptografado, 127.0.0.1:porta, token de sessão)
 ├─ janela principal: carrega a UI (ui_bundle.enc) servida pelo núcleo
 ├─ chat IA: roda os CLIs (Claude Code, Codex, Antigravity, Grok) com node-pty
 │    └─ cada CLI recebe o MCP "darkplanner" (ferramentas que chamam a API local)
 ├─ serviço de produção autônoma (roteiro → narração → prompts → mídia → edição → render → entrega)
 ├─ canais (pasta por canal com canal.md, estado.json, memoria.md, skills/, videos/NN-slug/)
 ├─ Estúdio (Remotion + ffmpeg): editor e render   ← FORA do plano
 └─ updater, bandeja, splash, telemetria de falha de boot (servidor deles)

Núcleo Python (workers)
 ├─ contas Google: login, perfis de navegador, sessão, cooldown, plano/créditos
 ├─ Flow: Playwright + Chrome real, chamadas internas do Flow (tRPC), downloads
 ├─ Grok: navegador por conta, despacho próprio
 ├─ Google Vids, HeyGen (avatares)
 ├─ reescrita com Gemini dos prompts recusados por política
 ├─ ingredientes/personagens, lotes de personagens
 ├─ Sincronizador SRT (legado) + integração com CapCut
 └─ TTS (API de áudio do próprio Dark Planner, por assinatura)
```

### 4.2 Telas e funções (inventário completo)

**Dashboard.** 5 pílulas (na fila, gerando agora, gerados hoje, créditos somados das contas, prompts reescritos), "Gerando agora" com prévia ao vivo e galeria recente com visualizador em tela cheia.

**Logs.** Console ao vivo (WebSocket) com cores por nível, indicador de conexão com o motor, Copiar, Limpar (só a tela) e Exportar logs (em Configurações → Conta).

**Projetos.** Cards com capa, renomear inline, prioridade na fila global, pausar/retomar, excluir (vai para a Lixeira do sistema) e seleção múltipla por arraste com menu de botão direito. "Novo projeto" pede nome e conta Google.

**Creator** (o coração):
- **Barra superior:** voltar, nome, prioridade, pausado/processando, abrir pasta, abrir no Estúdio (fora), trocar conta (só na distribuição Manual), contadores (prontos, gerando, esperando, erro, clicáveis), busca de prompts, engrenagem.
- **Engrenagem:** tamanho do grid (P/M/G e Ctrl+roda), volume dos vídeos, mostrar detalhes, mostrar referências, limpar ao enviar, aceitar vídeo sem áudio, ordenação (recentes, antigos, sequência). Por projeto: apagar imagem ao animar, apagar fonte após upscale, fallback de modelo de imagem.
- **Filtros:** Tudo, Imagens, Vídeos, Uploads, Ingredientes, Favoritos, Erros (com "tentar todos de novo" e "reescrever todos"), Lixeira (restaurar ou excluir de vez) e Copiar prompts (abas Todos/Imagens/Vídeos).
- **Composer:** cada linha vira um pedido. Enter envia, Shift+Enter quebra a linha. Várias linhas abrem "um só / em lote" com prévia linha ↔ imagem. Anexos: slots Início/Fim em vídeo por Frames, referências nos outros modos, arrastar do grid. Seletor de voz em vídeo por Elementos.
- **Pílula de configuração:** provedor Flow/Grok, Imagem/Vídeo, Frames/Elementos, modelo, proporção, saídas por prompt (1 a 4), upscale automático (imagem 2k/4k, vídeo 1080p/4k) e duração. No Grok: qualidade, imagens por envio (4/8/12) e duração (6/10 s).
- **Tags no começo da linha:**
  - Motor: `[flow] [grok]`
  - Tipo: `[i]` imagem, `[v]` vídeo, `[iv]` imagem + animação com o mesmo prompt
  - Formato: `[16:9] [9:16] [1:1] [4:3] [3:4]` (Grok também `[2:3] [3:2]`)
  - Imagem Flow: `[nano_pro] [nano_2] [nano_lite]`
  - Vídeo Flow: `[omni] [quality] [fast] [lite] [relaxed]`
  - Upscale: `[2k] [4k] [1080p]`
  - Duração: `[4s] [6s] [8s] [10s]` (10 s só no Omni; Grok `[6s] [10s]`)
  - Voz: `[voice:charon]`
  - Qualidade Grok: `[speed] [quality] [480p] [720p]`
  - Personagem: `[Nome]` junto do texto
  - Também aceita um bloco JSON `dp` com os mesmos campos.
- **Card de mídia:** estados (aguardando, processando, baixando, erro recuperável, erro fatal, concluído), badges (tipo, upscale, provedor, conta, contador de reescritas), play no hover e carrossel de variações (Grok).
- **Menu do card:** favoritar, editar prompt, animar (Flow ou Grok), upscale, virar ingrediente, copiar ou reutilizar prompt, regenerar, excluir. Com erro: retry, editar prompt, copiar erro. Também funciona com vários selecionados.
- **Animar por 3 caminhos:** menu do card, tag `[iv]`, ou auto-animar (com prompts de animação, um por linha).
- **Visualizador:** tela cheia com ← →, modelo por extenso, histórico de reescrita v1..vN com o erro de cada tentativa e as referências usadas.
- **Ingredientes:** pacotes de imagens reutilizáveis. Painel de personagem: ligar, nome (= `[Nome]`), foto de corpo, voz de fala e notas. "Importar pro projeto" é necessário antes de usar `[Nome]`.
- **Numeração:** cada job recebe um número de sequência no projeto (imagens e vídeos no mesmo contador). Variações do mesmo prompt viram `3.1`, `3.2`… Mudar o número renomeia os arquivos no disco.

**Contas (Google e Grok):**
- **Distribuição:** Sequencial, Paralelo, Automático (paralelo só com fila grande) ou Manual (conta fixa por projeto).
- **Conectar conta:** abre o login do Google numa janela do app, com proxy opcional por conta.
- **Card da conta:** plano (Ultra/PRO/Free), créditos de vídeo, status (ativa, reconectar, cooldown com tempo restante, desativada), estrela de padrão, ligar/desligar, remover e tipos permitidos (imagem/vídeo).
- **Grok:** mesma lógica, sem Manual. Loga uma vez no grok.com e mostra estatísticas por modo (t2i, i2i, t2v, i2v) por dia, mês e total.

**Text to Speech.** Biblioteca e explorador de vozes, texto ou .txt, pausas, nome, gerar. SRT em 3 formatos: **por tempo** (blocos de X–Y s, um prompt por bloco), **legenda** (N palavras) e **por palavra** (karaokê), com caixa, velocidade e volume. Resultados com player, downloads, editor de SRT por tempo e roteiro. Usa a API paga do próprio Dark Planner, então **fica para depois**, com outro provedor (ElevenLabs).

**Configurações.**
- **Geral:** idioma, pasta raiz, padrão de nome de arquivo, o que o X da janela faz.
- **Gemini:** chave, máximo de reescritas, instrução da reescrita.
- **Avançado:** intervalo entre envios (fixo `30` ou faixa `30-45`, com aviso de seguro/agressivo) e pedidos simultâneos por conta.
- **API:** chave e endereço local, lista de rotas e guia para agentes.
- **Conta:** exportar logs e sair.

**Chat IA (painel em todas as telas):**
- **Agentes:** Claude Code, Codex, Antigravity e Grok, instalados pelo próprio app, com login, status, cota, escolha de modelo e esforço, e pasta de trabalho por conversa.
- **Conversas:** histórico com renomear e excluir, anexos de arquivos e pasta, aprovação de permissões ("cauteloso") e "zonas proibidas" de disco.
- **Ferramentas (servidor MCP):** projetos, contas, diagnóstico, logs, jobs (listar com espera, detalhe, excluir, reprocessar, cancelar, destravar), enviar prompts pela tela, ler e aplicar a configuração da geração, checklist de fases e linha de progresso, canais, narração e produção.
- **Modo Time:** um agente delega etapas para outros.
- **Como o Claude Code roda:** `claude -p --input-format stream-json --output-format stream-json --verbose --include-partial-messages --permission-prompt-tool stdio`, mais `--model`, `--effort`, `--append-system-prompt-file`, `--mcp-config` e `--resume`. É o modo oficial sem interface do Claude Code, e dá para fazer igual.

**Canais e Produção autônoma.**
- **Canal = uma pasta:** `canal.md` (narrador, narração, geração, edição, regras, agentes por etapa), `estado.json`, `memoria.md`, `skills/` e `videos/NN-slug/`.
- **Fila de títulos:** "produz" executa roteiro → revisão → narração → prompts → mídia → edição → validação → render → entrega.
- **Portas de validação por etapa:** por exemplo, nº de prompts = nº de blocos do SRT.
- **Controle da execução:** retoma depois de reiniciar, pode ser pausada, retomada ou cancelada, e tem decisões de aprovação.

**Sincronizador SRT + CapCut** (`sync_core`, `capcut_service`). Varre uma pasta de mídias numeradas, casa cada mídia com os blocos do SRT, corta e converte com ffmpeg (imagem → vídeo), valida, reprocessa os que falharam e guarda histórico. A integração com o CapCut lista projetos, aplica um plano num draft do CapCut e invalida os caches dele. Como você edita no CapCut, isso vale ouro.

**Outros que existem e você não citou:** **HeyGen** (avatares), **Google Vids**, **Lotes de personagens** (gerar, aprovar e exportar personagens). Ver as decisões na seção 8.

### 4.3 O conhecimento que o Dark Planner já aprendeu (e que vamos reaproveitar como regra)

- **Erros por categoria**, cada uma com conduta própria:
  - `sessão` (401/403, token): reconectar a conta.
  - `cota` (limite diário, créditos): parar a conta até virar o dia.
  - `filtro` (UNSAFE, PROMINENT_PEOPLE, MINOR…): reescrever o prompt.
  - `cooldown` (UNUSUAL_ACTIVITY, 429): esperar.
  - `configuração` (422, modelo inválido): corrigir a configuração.
- **Cooldown:** forçar a volta cedo "costuma render outro cooldown, mais longo". O normal é esperar. Cooldown repetido por ritmo se resolve **aumentando o intervalo entre envios**.
- **Intervalo entre envios** aceita fixo ou faixa (`30-45`). Paralelismo por conta é separado. O intervalo vale entre envios **da mesma conta**.
- **Variações por prompt multiplicam o gasto** (106 prompts × 4 = 424 gerações). Por isso a regra é sempre mostrar "N prompts × V variações = total" antes de enviar.
- **Projeto em conta sem permissão de gerar fica com jobs pendentes para sempre**, sem erro. É preciso checar a conta antes.
- **Acompanhar a fila pela lista do projeto** (uma chamada a cada ~5 s), nunca job a job.
- **Enviar em série** para não embaralhar a numeração.
- **Reescrita automática por Gemini** só para recusas de política, com teto de tentativas e histórico v1..vN.
- **Imagem ao animar:** apagar a imagem só depois de o vídeo existir de verdade, e nunca duas vezes.

---

## 5. Onde eu paro (limites)

Quero ser direto sobre isso para não haver surpresa no meio:

- **Não vou decifrar os arquivos `.enc`** (interface, regras, Estúdio). São protegidos de propósito. Para o visual das telas, uso o manual e os seus prints.
- **Não vou copiar o código do Dark Planner.** O app novo é escrito do zero, com as mesmas funções e o mesmo fluxo.
- **Automação do Flow:** o app vai usar o **Flow de verdade, num Chrome real, com a sua conta logada por você**. Ele faz o que você faria (escolher modelo e formato, colar o prompt, gerar, baixar), respeitando o ritmo que você configurar: intervalo entre envios, pedidos simultâneos e limite diário por conta. Quando o Google sinalizar cooldown, o app **pausa e espera**.
- **O que não vou construir:** a parte do Dark Planner feita para o Google **não perceber** a automação. Isso inclui "stealth"/falsificação de impressão digital do navegador, coleta ou resolução de captcha, rodízio de proxy/VPN para fugir de cooldown e chamadas diretas à API interna do Flow imitando navegador (`workers.stealth`, `captcha_pool`, `recaptcha_trap`, `proxy_relay`, escada `tier_*`/`captcha_*`).
- **Risco que você precisa saber:** automatizar o Flow provavelmente vai contra os termos do Google, com ou sem essas técnicas. O próprio Dark Planner vive lidando com cooldown. Minha recomendação é começar com **uma conta secundária** e um ritmo conservador.

---

## 6. Arquitetura proposta

**Um app só, um runtime só (Node/Electron)**, sem Python para instalar:

| Camada | Escolha | Por quê |
|---|---|---|
| Casca | **Electron** (mesma base do Audio Atlas e do Dark Planner) | Janela, bandeja, notificações, diálogos de pasta, navegador oculto para o Pixabay |
| Interface | **React 19 + Vite + Tailwind 4 + lucide-react** | Mesma stack do site: dá para reaproveitar paleta, tokens (`#0d0e12`, `#16171d`, `#23252e`, ciano `#00f2fe`), fonte Satoshi, modo claro/escuro e i18n pt/en/es |
| Dados | **SQLite** (`node:sqlite` do Electron) | Projetos, jobs, contas, ingredientes, logs e conversas num arquivo local |
| Flow e Grok | **playwright-core + Chrome instalado**, um perfil por conta | Login feito por você na janela; sessão fica salva no perfil |
| Chat IA | **node-pty + CLIs oficiais** (Claude Code primeiro) | Mesmo modelo do Dark Planner, usando o modo `stream-json` documentado |
| Ferramentas para a IA | **Servidor MCP "noctis"** (stdio, zero dependências) | A IA opera o app inteiro: projetos, prompts, fila, Audio Atlas, Renomeador |
| Mídia | **ffmpeg/ffprobe** | Sincronizador SRT, miniaturas, imagem → vídeo |

**Onde fica no repositório:** pasta nova `desktop/` neste repo (`Noctis-Studio`), separada do site (`client/`, `server/`), reaproveitando os tokens visuais e as traduções.

```
desktop/
  package.json            electron, vite, react, tailwind, playwright-core, node-pty
  electron/
    main/                 janela, bandeja, IPC, banco, fila, logs
    preload/              ponte segura para a interface
    servicos/
      renomeador/         porte do app.py (+ testes portados do test_app.py)
      audio-atlas/        pixabay, parser, translate, categorize, library
      flow/               perfis, login, automação da tela do Flow, downloads
      grok/
      fila/               despacho, ritmo, cooldown, categorias de erro, reescrita Gemini
      sync-srt/           parser SRT, casamento mídia↔bloco, ffmpeg
      capcut/             ler projetos e aplicar plano no draft
      agentes/            drivers Claude Code / Codex / Antigravity / Grok
      mcp/noctis-server.js
  src/                    interface React
    telas/                Inicio, Projetos, Creator, Contas, Sincronizador, AudioAtlas,
                          Renomeador, Narracao (em breve), Logs, Configuracoes
    componentes/          Sidebar, Header, ChatPainel, Card, Visualizador…
```

**Menu lateral:**
- **Início**
- **Produção:** Projetos/Creator, Sincronizador SRT, Narração (em breve)
- **Ferramentas:** Audio Atlas, Renomeador
- **Sistema:** Contas, Logs, Configurações
- O **chat IA** fica num painel que abre em qualquer tela.

---

## 7. Plano em fases

Cada fase termina com algo usável, testado e enviado para este branch.

| Fase | Entrega | Pronto quando… |
|---|---|---|
| **0. Esqueleto** | App Electron + React com o layout Noctis (sidebar, header, tema claro/escuro, pt/en/es), SQLite, tela de Logs ao vivo, Configurações (Geral), instalador Windows e atualização a partir de pasta local (como o Audio Atlas) | Abre, navega, salva configurações e gera o instalador |
| **1. Ferramentas** | **Renomeador** portado (mesmas regras, conflitos, 2 fases, histórico/desfazer, testes) e **Audio Atlas** dentro do app (busca, player, fila, download, pasta automática, catálogo, biblioteca, favoritos, histórico, CLI) | Os testes do Renomeador e os self-checks do Audio Atlas passam no app novo |
| **2. Chat IA** | Painel de chat com **Claude Code** (instalar, logar, modelo, esforço, histórico, anexos, aprovação de permissões) e **servidor MCP "noctis"** com as ferramentas do Renomeador e do Audio Atlas. Depois: Codex, Antigravity, Grok | Você pede no chat "baixa 3 whooshes pro canal" e ele faz |
| **3. Contas + Creator básico** | Contas Google (conectar por perfil de Chrome, status, padrão, ligar/desligar, tipos permitidos), Projetos, Creator com composer, **tags**, fila, despacho (Sequencial, Paralelo, Automático, Manual), **ritmo** (intervalo fixo ou faixa, simultâneos por conta, limite diário), download, numeração, grid e contadores | Um lote de prompts vira imagens/vídeos na pasta do projeto, no ritmo configurado |
| **4. Creator completo** | Variações, ingredientes/personagens, animar (3 caminhos), upscale, auto-animar, lote com prévia, favoritos, lixeira, erros por categoria, **reescrita com Gemini**, visualizador, Dashboard, ferramentas MCP de projetos e jobs | Paridade com o Creator do Dark Planner (menos Estúdio) |
| **5. Sincronizador SRT + CapCut** | Ler o SRT "por tempo", casar mídias numeradas com os blocos, ajustar duração (ffmpeg), validar e **montar o draft no CapCut** | Pasta de mídias + SRT viram um projeto CapCut montado |
| **6. Grok** | Contas Grok, geração por navegador, estatísticas por modo | Tags `[grok]` funcionam |
| **7. Canais e produção autônoma** | Canais (pasta, canal.md, estado, memória, skills), fila de títulos e pipeline roteiro → prompts → mídia → montagem com validação por etapa. TTS entra aqui quando houver provedor (ElevenLabs) | "Produz os próximos 5 vídeos do canal X" roda sozinho |

A ordem foi pensada para você ter valor rápido: as fases 0 e 1 já substituem os dois programas atuais, e a fase 2 já te dá o Claude dentro do app.

---

## 8. Decisões que preciso de você

1. **Onde fica o app:** pasta `desktop/` neste repositório *(recomendo)* ou um repositório novo só para ele?
2. **HeyGen, Google Vids e Lotes de personagens:** o Dark Planner tem. Você usa? Entram no plano ou ficam de fora?
3. **Ordem dos agentes no chat:** Claude Code primeiro *(recomendo)*. Quais dos outros (Codex, Antigravity, Grok) você usa de verdade?
4. **Contas:** quantas contas Google e qual plano (Ultra/PRO/Free)? Tem conta Grok?
5. **Python:** posso portar o Renomeador para JavaScript (um runtime só, sem Python instalado)? A lógica e os testes ficam iguais.

## 9. O que eu preciso que você me mande

Como a interface do Dark Planner está criptografada, o visual das telas tem que vir de você:

- **Prints (ou um vídeo curto navegando)** de cada tela: Dashboard, Projetos, Creator (com a pílula de configuração aberta, o menu de botão direito de um card, o painel de Ingredientes e o visualizador), Contas, Configurações (cada aba), Logs, Chat IA (uma conversa e a tela de escolher agente) e o Sincronizador SRT.
- **Um exemplo real de lote de prompts** que você manda hoje (com as tags), e um SRT "por tempo" de um vídeo seu.
- **A estrutura de pastas** que você usa para cada vídeo (onde ficam mídias, áudio, SRT e o projeto do CapCut).
- **Os valores que você usa hoje** em Configurações → Avançado (intervalo entre envios e simultâneos por conta) e na Distribuição das contas.

Pode subir tudo na mesma pasta do Drive. Eu consigo baixar de lá.
