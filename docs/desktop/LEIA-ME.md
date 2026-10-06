# Noctis Studio Desktop — guia rápido

App para Windows (pasta `desktop/`) que junta, com o visual e o logo do site:

| Tela | O que faz |
|---|---|
| **Início** | Fila, gerados hoje, reescritos pela IA, créditos, últimas gerações |
| **Meus Projetos / Creator** | Projetos com pasta própria; prompts em lote com tags (`[i] [v] [iv] [16:9] [nano_pro] [fast] [2k] [8s] [Personagem]`…); fila no Google Flow com ritmo por conta; reenviar, editar prompt, animar, favoritos, lixeira, ingredientes/personagens |
| **Sincronizador SRT** | Casa vídeos/imagens numerados com os blocos do SRT da narração: corta (início/meio/fim), acelera, desacelera, transforma imagem em vídeo; gera os clipes na ordem para arrastar no CapCut |
| **Narração** | Em breve (TTS) |
| **Audio Atlas** | Busca e baixa músicas/efeitos do Pixabay com categorias e biblioteca |
| **Renomeador** | Renomeação em lote com prévia, conflitos e desfazer |
| **Contas** | Contas Google do Flow: conectar, conferir, diagnóstico, ritmo e distribuição |
| **Logs / Configurações** | Logs exportáveis; Geral, Reescrita IA (chaves Gemini), Avançado, Conta |
| **Chat IA** (botão no canto) | Claude Code dentro do app, com acesso às ferramentas do Noctis e aprovação na tela; Codex e Gemini em modo básico |

## Acesso privado

* O instalador **não é público**: fica numa release do repositório privado e só sai pela página
  **App Desktop** do site (`/app-desktop`), para quem está logado. O site gera um link temporário.
* O app também exige login com a conta Noctis (abre o site no navegador e volta sozinho).
  Sem conta ativa o app fica bloqueado; sem internet ele funciona por até 7 dias.

## O que você precisa configurar (uma vez)

1. **Token do GitHub na Vercel** — crie um *fine-grained token* em GitHub → Settings → Developer
   settings → Fine-grained tokens, só com o repositório `Noctis-Studio` e permissão
   **Contents: Read-only**. Na Vercel (projeto do site) adicione a variável
   `GITHUB_RELEASES_TOKEN` com esse token e faça um novo deploy.
2. *(Opcional)* `DESKTOP_MIN_PLAN` na Vercel para exigir um plano mínimo (padrão: qualquer conta).
3. **Juntar esta branch na `main`.** O push na `main` publica o site com a página nova e roda o
   workflow **Desktop (Windows)**, que gera o instalador e cria a release `desktop-v0.1.0`.

Nada de SQL: o app não precisa de tabelas novas.

## Lançar uma versão nova

Aumente `"version"` em `desktop/package.json` (ex.: `0.1.1`) e faça push na `main`. O workflow testa,
gera `NoctisStudio-Setup-0.1.1.exe` e publica `desktop-v0.1.1`; a página do site passa a entregar
essa versão. Em outras branches, coloque `[build]` na mensagem do commit para só gerar o instalador
como artefato (sem publicar). O Windows pode mostrar o aviso do SmartScreen porque o instalador não
tem certificado de assinatura: clique em "Mais informações" → "Executar assim mesmo".

## Primeiro uso no PC

1. Instale, abra e entre com a conta Noctis.
2. **Contas → Conectar conta Google**: abre o Chrome para você entrar. Repita para cada conta.
3. **Teste do Flow**: crie um projeto, mande 1–2 prompts e acompanhe em **Logs**. A automação do Flow
   foi feita sem acesso a uma conta real; se algo não for clicado certo, use **Contas → Diagnóstico**
   (salva print + mapa da tela em `logs/diagnostico`) e me envie a pasta para eu ajustar.
4. **Chat IA**: o painel oferece instalar o Claude Code e entrar na conta (abre um terminal).
   Por padrão ele pede sua aprovação antes de mudar qualquer coisa.

## Limites desta versão

* Grok ainda não está disponível (só Google Flow).
* Upscale é manual no Flow (o app avisa no log).
* CapCut: o Sincronizador entrega os clipes prontos e na ordem; montar o projeto do CapCut
  automaticamente precisa de um projeto de exemplo seu.
* Ritmo e limites por conta são respeitados: quando uma conta entra em cooldown ou estoura a cota,
  a fila **espera aquela conta** (não troca de conta nem disfarça a automação para fugir do limite).

## Para desenvolver

```bash
cd desktop
npm install
npm run dev        # Vite + Electron
npm test           # testes (renomeador, login, tags, fila, SRT, chat)
npm run dist       # instalador (no Windows)
```
