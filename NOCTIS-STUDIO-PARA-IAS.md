# Noctis Studio para IAs

Guia para qualquer IA (Claude Desktop, Claude Code, ChatGPT/Codex, scripts) usar o **Noctis Studio** no computador do usuário:

- **Banco de sons**: buscar e baixar músicas e efeitos do Pixabay, procurar no que já está baixado.
- **Renomeador**: renomear arquivos em massa, sempre com prévia aprovada pelo usuário.

São dois jeitos de conectar, com as **mesmas ferramentas**:

| Jeito | Para quem | Precisa do app aberto? |
|---|---|---|
| **MCP `noctis-studio`** (stdio) | Claude Desktop, Claude Code, qualquer cliente MCP | Não (abre sozinho o que precisar) |
| **API local** `http://127.0.0.1:47821` | curl, scripts, navegador embutido, outras IAs | Sim (pode estar só na bandeja) |

> As 4 ferramentas de áudio têm **os mesmos nomes, parâmetros e respostas** do antigo MCP `audio-atlas`. Quem usava o Audio Atlas só troca o servidor.

---

## 1. Conectar

### Claude Desktop (MCP)

Jeito fácil: Noctis Studio → **Conectar IA** → **Adicionar automaticamente** (faz backup do arquivo, adiciona o `noctis-studio`, remove o `audio-atlas` antigo e não mexe em mais nada).

À mão: edite `%APPDATA%\Claude\claude_desktop_config.json` (Claude → Configurações → Desenvolvedor → Editar configuração). Apague o bloco `"audio-atlas"` se existir e coloque dentro de `"mcpServers"` o bloco que a tela **Conectar IA** mostra (ele já vem com os caminhos certos deste computador). O formato é:

```json
{
  "mcpServers": {
    "noctis-studio": {
      "command": "C:\\Users\\SEU_USUARIO\\AppData\\Local\\Programs\\Noctis Studio\\Noctis Studio.exe",
      "args": ["C:\\Users\\SEU_USUARIO\\AppData\\Local\\Programs\\Noctis Studio\\resources\\app.asar.unpacked\\electron\\servicos\\ia\\mcp.js"],
      "env": { "ELECTRON_RUN_AS_NODE": "1" }
    }
  }
}
```

Depois **feche o Claude por completo** (ícone na bandeja → Sair) e abra de novo.

### Claude Code

```bash
claude mcp add --transport stdio --scope user --env ELECTRON_RUN_AS_NODE=1 noctis-studio -- "C:\Users\SEU_USUARIO\AppData\Local\Programs\Noctis Studio\Noctis Studio.exe" "C:\Users\SEU_USUARIO\AppData\Local\Programs\Noctis Studio\resources\app.asar.unpacked\electron\servicos\ia\mcp.js"
```

(O comando exato, com os seus caminhos, está na tela **Conectar IA**. Se havia o antigo: `claude mcp remove audio-atlas --scope user`.)

### API local (qualquer IA ou script)

- Endereço: `http://127.0.0.1:47821` (porta configurável em Conectar IA). Só aceita conexões do próprio computador.
- Cabeçalho obrigatório: `X-API-Key: <chave>` (copie em Noctis Studio → Conectar IA). Exceções: `GET /`, `GET /api/health`, `GET /api/guide`.
- A API fica ativa enquanto o Noctis Studio estiver aberto (inclusive só na bandeja). Opção "Iniciar com o Windows (na bandeja)" em Conectar IA.

**Navegador embutido do Claude:** abra `http://127.0.0.1:47821/` e rode `fetch` na própria página (mesma origem; outras origens são recusadas):

```js
const r = await fetch('/api/categories', { headers: { 'X-API-Key': 'SUA_CHAVE' } });
console.log(await r.json());
```

---

## 2. Regras (leia antes de usar)

1. **Procure no banco local antes de baixar**: `search_library` primeiro; só use `search_audio`/`download_audio` se não houver algo bom.
2. **Prefira `contentId: false`** na hora de escolher música: `true` = registrada no Content ID do YouTube e pode gerar reivindicação no canal.
3. **Deixe o app escolher a categoria**: chame `download_audio` **sem** `category`. Só passe `category` se o usuário pedir uma pasta específica.
4. **Use o caminho absoluto** devolvido (`path`) para importar o áudio no projeto (CapCut, Premiere etc.).
5. **Nunca apague, mova ou renomeie as pastas do banco de sons.** Nenhuma ferramenta apaga arquivos — não tente contornar isso.
6. **Renomear = prévia → mostrar ao usuário → aplicar**: `preview_rename`, mostre a lista `{de, para}`, espere o "pode aplicar" e só então `apply_rename`. Guarde o `operationId` para um eventual `undo_rename`.
7. **Avisos (`notice`)**: se uma resposta trouxer `notice`, repita para o usuário (ex.: "criei a pasta X porque não havia nenhuma").
8. **Pasta do banco de sons**: use a que está configurada. `set_sound_folder` só quando o **usuário pedir** outra pasta — e diga qual passou a usar.
9. **Não force**: em `429` (ou `RATE_LIMITED`) espere os segundos de `Retry-After`/`retryAfter` antes de tentar de novo.

### Onde ficam os sons

- Se o usuário escolheu uma pasta (Conectar IA ou Audio Atlas → Configurações), é ela.
- Se não há pasta, na primeira chamada o Noctis Studio cria `Documentos\Noctis Studio\Banco de sons` e devolve um `notice` explicando onde e por quê.
- Se a pasta está numa unidade que não está disponível (ex.: Google Drive `G:` fechado), a resposta é um erro `NO_ROOT` com explicação — **nada é criado em outro lugar**. Peça ao usuário para abrir o Google Drive.

---

## 3. Ferramentas e rotas

Formato de erro do MCP (igual ao Audio Atlas): `isError: true` com o texto `{"ok": false, "error": "mensagem", "code": "CODIGO"}`.
Formato de erro da API: `{"error": {"code": "CODIGO", "message": "mensagem"}}`.

Toda ferramenta também pode ser chamada na API por `POST /api/tools/<nome>` com os argumentos no corpo JSON.

### `search_audio` — buscar no Pixabay *(somente leitura)*

| Parâmetro | Tipo | Obrigatório | Valores |
|---|---|---|---|
| `query` | texto | sim | PT/ES/EN (traduz sozinho). Ex.: `"dark ambient"`, `"bolha"` |
| `type` | texto | sim | `music` (trilhas) ou `sfx` (efeitos) |
| `duration` | texto | não | `short` < 2 s, `medium` 2–60 s, `long` > 60 s |
| `limit` | inteiro | não | 1–60, padrão 20 |
| `order` | texto | não | `relevance` ou `latest` |

Resposta: `{ query, searchedAs, translated, type, results: [{ id, title, author, duration, tags, pageUrl, genre, contentId, downloaded }] }`

- MCP: `search_audio {"query": "suspense escuro", "type": "music", "limit": 10}`
- curl: `curl -H "X-API-Key: SUA_CHAVE" "http://127.0.0.1:47821/api/audio/search?query=suspense%20escuro&type=music&limit=10"`
- fetch: `await (await fetch('/api/audio/search?query=whoosh&type=sfx&duration=short', { headers: { 'X-API-Key': 'SUA_CHAVE' } })).json()`

### `download_audio` — baixar para o banco de sons

| Parâmetro | Tipo | Obrigatório | |
|---|---|---|---|
| `id` | texto | sim | id numérico do Pixabay (de `search_audio`) |
| `type` | texto | sim | `music` ou `sfx` |
| `category` | texto | não | `"Woosh"` ou `"pasta\\subpasta"`. Vazio = escolha automática (recomendado) |

Resposta: `{ ok, duplicate, id, title, category, newFolder, path }` — se já estava baixado: `{ ok: true, duplicate: true, id, path, category }`.

- MCP: `download_audio {"id": "382724", "type": "music"}`
- curl: `curl -X POST -H "X-API-Key: SUA_CHAVE" -H "Content-Type: application/json" -d "{\"id\":\"382724\",\"type\":\"music\"}" http://127.0.0.1:47821/api/audio/download`
- fetch: `await (await fetch('/api/audio/download', { method: 'POST', headers: { 'X-API-Key': 'SUA_CHAVE', 'Content-Type': 'application/json' }, body: JSON.stringify({ id: '382724', type: 'music' }) })).json()`

### `search_library` — procurar no banco local *(somente leitura)*

`query` (texto). Resposta: `{ query, count, results: [{ id, title, author, type, category, tags, duration, pageUrl, localPath, fromPixabay }] }`

- curl: `curl -H "X-API-Key: SUA_CHAVE" "http://127.0.0.1:47821/api/library/search?query=whoosh"`

### `list_categories` — pasta raiz e categorias *(somente leitura)*

Sem parâmetros. Resposta: `{ root, categories: ["Woosh", "background music", ...] }`

- curl: `curl -H "X-API-Key: SUA_CHAVE" http://127.0.0.1:47821/api/categories`

### `set_sound_folder` — trocar a pasta do banco de sons

`path` (caminho absoluto). Cria a pasta se não existir; não move nem apaga nada. **Só quando o usuário pedir.**
Resposta: `{ ok, root, created, previousRoot, notice }` — API: `POST /api/sound-folder`.

### `list_rename_folders` — pastas liberadas para renomear *(somente leitura)*

Resposta: `{ folders: [{ path, exists }] }`. Se vier vazio, peça ao usuário para liberar uma pasta em Noctis Studio → Conectar IA → "Pastas liberadas para IAs". — API: `GET /api/rename/folders`.

### `preview_rename` — prévia (não altera nada) *(somente leitura)*

| Parâmetro | Tipo | Obrigatório | |
|---|---|---|---|
| `folder` | texto | sim | caminho absoluto dentro de uma pasta liberada |
| `actions` | lista | sim | 1 a 20 ações, aplicadas em ordem ao nome **sem extensão** |
| `recursive` | booleano | não | incluir subpastas (cada arquivo fica na própria pasta) |
| `extensions` | texto | não | ex.: `"mp4, mov"` |

Ações (`tipo`):

| tipo | campos | exemplo |
|---|---|---|
| `substituir` | `termo`, `novo`, `modo` (`termo`/`prefixo`/`sufixo`) | `{"tipo":"substituir","termo":"IMG","novo":"Foto"}` |
| `remover` | `termo`, `modo` | `{"tipo":"remover","termo":"final"}` |
| `prefixo` / `sufixo` | `texto` | `{"tipo":"prefixo","texto":"EP01_"}` |
| `numerar` | `formato` (com `#`; `{nome}` = nome atual), `inicio` | `{"tipo":"numerar","formato":"Cena_###","inicio":1}` |
| `caixa` | `modo`: `min`, `mai`, `tit` | `{"tipo":"caixa","modo":"tit"}` |
| `limpar` | — | remove espaços repetidos, separadores nas pontas e caracteres inválidos |

Resposta: `{ previewId, folder, expiresAt, total, unchanged, changes: [{de, para}], conflicts: [{de, para, motivo}], truncated, next }` (caminhos relativos a `folder`; `previewId` vale 30 min).

- curl: `curl -X POST -H "X-API-Key: SUA_CHAVE" -H "Content-Type: application/json" -d "{\"folder\":\"D:\\\\Videos\\\\Ep01\",\"actions\":[{\"tipo\":\"numerar\",\"formato\":\"Cena_###\",\"inicio\":1}]}" http://127.0.0.1:47821/api/rename/preview`

### `apply_rename` — aplicar a prévia aprovada

`previewId`. Recusa se expirou (`PREVIEW_EXPIRED`), se os arquivos mudaram (`PREVIEW_STALE`) ou se há conflitos (`HAS_CONFLICTS`). Nunca sobrescreve; a prévia só pode ser usada uma vez.
Resposta: `{ ok, renamed, folder, operationId }` — API: `POST /api/rename/apply`.

### `undo_rename` — desfazer

`operationId` (de `apply_rename`). Só a operação mais recente ainda não desfeita.
Resposta: `{ ok, operationId, restored, folder }` — API: `POST /api/rename/undo`.

### Rotas livres da API

| Rota | O que é |
|---|---|
| `GET /` | página mínima (use para `fetch` no navegador embutido) |
| `GET /api/health` | `{ ok, app: "noctis-studio", version, port }` |
| `GET /api/guide` | este guia em Markdown |

### Códigos de erro

| HTTP | code | Quando |
|---|---|---|
| 400 | `USAGE`, `BAD_CATEGORY`, `BAD_JSON` | parâmetro faltando/inválido |
| 401 | `UNAUTHORIZED` | `X-API-Key` ausente ou errada |
| 403 | `FORBIDDEN`, `FOLDER_NOT_ALLOWED`, `NOT_SIGNED_IN` | origem de fora, pasta não liberada, conta Noctis desconectada |
| 404 | `NOT_FOUND` | rota/prévia/item não encontrado |
| 409 | `NO_ROOT`, `CONFLICT`, `PREVIEW_STALE`, `PREVIEW_EXPIRED`, `HAS_CONFLICTS`, `LOCKED` | estado não permite (unidade desmontada, conflito de nomes, arquivo em uso) |
| 429 | `RATE_LIMITED` | fila do Pixabay cheia — respeite `Retry-After` |
| 500 | `ERROR`, `NETWORK`, `HTTP` | falha inesperada ou de rede |

---

## 4. Fluxos prontos

**Trilha para um vídeo**
1. `search_library {"query": "suspense"}` → se houver algo bom, use o `localPath`.
2. Senão: `search_audio {"query": "suspense escuro", "type": "music", "duration": "long"}` → escolha com `contentId: false`.
3. `download_audio {"id": "...", "type": "music"}` (sem `category`) → use o `path` devolvido.

**Efeitos sonoros curtos**
`search_audio {"query": "whoosh", "type": "sfx", "duration": "short", "limit": 10}` → `download_audio` dos escolhidos.

**Renomear as cenas de um episódio**
1. `list_rename_folders` → confirme que a pasta está liberada.
2. `preview_rename {"folder": "D:\\Videos\\Ep01", "actions": [{"tipo":"limpar"},{"tipo":"numerar","formato":"Cena_###","inicio":1}]}`
3. Mostre `changes` ao usuário (e `conflicts`, se houver). Espere a aprovação.
4. `apply_rename {"previewId": "..."}` → informe `renamed` e guarde o `operationId`.
5. Se o usuário pedir para voltar: `undo_rename {"operationId": "..."}`.

---

## 5. Solução de problemas

| Sintoma | O que fazer |
|---|---|
| As ferramentas não aparecem no Claude | Feche o Claude **por completo** (bandeja → Sair) e abra de novo. Veja o log: `%APPDATA%\Claude\logs\mcp-server-noctis-studio.log`. Em Noctis Studio → Conectar IA → **Testar conexão**. |
| Ainda aparece "audio-atlas" | Remova o bloco `"audio-atlas"` do `claude_desktop_config.json` (ou "Adicionar automaticamente") e reabra o Claude. |
| `NOT_SIGNED_IN` | Abra o Noctis Studio e entre na conta Noctis. O acesso das IAs vale 7 dias após o último login. |
| `401 UNAUTHORIZED` | Chave errada ou regenerada: copie de novo em Conectar IA. |
| API não responde / porta ocupada | O app precisa estar aberto (pode ser na bandeja). Se a tela avisar "porta ocupada", escolha outra porta em Conectar IA (o app não troca sozinho). O MCP não depende da porta. |
| `NO_ROOT` com G: | O Google Drive não está montado. Abra o Google Drive e tente de novo; nada é salvo em outro lugar. |
| `429 RATE_LIMITED` | Muitas buscas ao Pixabay em sequência. Espere o tempo de `Retry-After` e tente de novo. |
| `FOLDER_NOT_ALLOWED` | A pasta não foi liberada. Peça ao usuário para liberar em Conectar IA → "Pastas liberadas para IAs". |
| `PREVIEW_STALE` / `PREVIEW_EXPIRED` | Gere outra prévia e mostre de novo ao usuário. |
