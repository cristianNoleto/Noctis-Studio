# Deploy do Noctis Studio — 100% Vercel + Supabase

Tudo roda na Vercel, num único deploy e de graça:

| Parte | O que é | Onde roda |
|---|---|---|
| `client/` | O site (React/Vite) | Vercel (estático — abre instantâneo) |
| `api/[...path].js` | A API (proxy BYOK YouTube/Gemini/Pexels/Pixabay) | Vercel Functions (acorda em ~1s, sem os 40s do Render) |
| Transcrição | Navegador fala **direto** com a AssemblyAI | não passa pelo backend |
| Supabase | Login real (e-mail/senha e Google) | Supabase (nuvem) |

O `vercel.json` da **raiz do repositório** já configura o build do client, o fallback de SPA (F5 em qualquer rota funciona) e as funções.

## 1. Criar o projeto no Supabase (login real)

1. Crie conta em https://supabase.com → **New project** (região São Paulo, senha forte do banco).
2. **Auth por e-mail**: já vem ligado. Em *Authentication → Providers → Email*, deixe "Confirm email" como preferir (desligado = entra direto sem confirmar).
3. **Login com Google** (opcional): *Authentication → Providers → Google* → ative. Crie um OAuth Client no Google Cloud Console (APIs & Services → Credentials → OAuth client ID → Web) usando o redirect que o Supabase mostra nessa tela; cole Client ID e Secret no Supabase.
4. **Tabelas** (opcional hoje — veja "O que já funciona"): *SQL Editor* → cole `supabase/schema.sql` → Run.
5. Copie em *Settings → API*:
   - **Project URL** → vira `VITE_SUPABASE_URL`
   - **anon public key** → vira `VITE_SUPABASE_ANON_KEY`

## 2. Subir na Vercel

1. Suba o repositório para o GitHub (repo privado serve).
2. https://vercel.com → **Add New → Project** → importe o repo.
3. Configure:
   - **Root Directory**: deixe a **raiz** (não escolha `client` — o `vercel.json` da raiz cuida de tudo).
   - Framework: Other/None (o buildCommand do vercel.json manda).
4. **Environment Variables**:
   - `VITE_SUPABASE_URL` = Project URL do Supabase
   - `VITE_SUPABASE_ANON_KEY` = anon key do Supabase
   - (opcionais) `VITE_WHATSAPP_COMMUNITY_URL`, `VITE_DISCORD_URL`, `VITE_YOUTUBE_URL`, `VITE_WHATSAPP_PHONE`, `VITE_SUPPORT_EMAIL`
5. **Deploy**. A URL final fica tipo `https://noctis-studio.vercel.app`.
6. Volte no Supabase → *Authentication → URL Configuration* → preencha **Site URL** e **Redirect URLs** com essa URL.

Teste rápido: `https://SEU-PROJETO.vercel.app/api/health` deve responder `{"ok":true,"runtime":"vercel",...}`.

## 3. Checklist final

- [ ] O site abre na tela de login
- [ ] Criar conta / entrar funciona (Supabase Auth)
- [ ] Perfil → APIs → salvar suas 5 chaves do YouTube + Gemini
- [ ] Niche Finder busca canais (prova de que as functions estão no ar)
- [ ] Transcrição: subir um MP3 funciona (navegador → AssemblyAI direto)
- [ ] Configurações → Avançado → Exportar backup funciona

## Notas de arquitetura

- **BYOK**: nenhuma chave vai para a Vercel — as chaves de API são do usuário, ficam no navegador dele e são enviadas por header a cada chamada.
- **Cache/rotação em serverless**: o cache de buscas e o estado "chave esgotada" vivem por instância aquecida; num cold start eles zeram. Sem impacto real: a rotação de chaves acontece dentro da própria requisição quando o YouTube devolve 403.
- **Desenvolvimento local** continua igual: `npm run dev` em `server/` (porta 3001) + `npm run dev` em `client/` — o proxy do Vite aponta `/api/` para o Express local, que usa exatamente as mesmas rotas da função da Vercel.

## O que já funciona e o que ainda é local

- **Com Supabase configurado**: o login vira real (e-mail/senha + Google), com recuperação de senha. ✅
- **Os DADOS continuam no navegador** (localStorage): canais, vídeos, roteiros, prompts, chaves etc. ficam no dispositivo de cada usuário — é o "modo local" por design. O `supabase/schema.sql` já está pronto para a migração, mas a troca do `client/src/lib/db.js` para ler/gravar no Postgres do Supabase é uma fase própria (a interface do módulo foi desenhada para isso).
- Consequência prática: o mesmo usuário em outro computador começa vazio (use Exportar/Importar backup para levar os dados); dois dispositivos não sincronizam sozinhos.
