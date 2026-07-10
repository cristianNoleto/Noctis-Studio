# Deploy do Noctis Studio — Vercel + Supabase

O sistema tem **duas partes** e cada uma vai para um lugar:

| Parte | O que é | Onde hospedar |
|---|---|---|
| `client/` | O site (React/Vite, arquivos estáticos) | **Vercel** |
| `server/` | A API Express (proxy BYOK do YouTube/Gemini/AssemblyAI/Pexels) | **Render** (a Vercel não roda um Express `app.listen` direto) |
| Supabase | Login real (e-mail/senha e Google) | **Supabase** (nuvem) |

Siga na ordem: servidor → Supabase → Vercel.

---

## 1. Subir o servidor (Render — grátis)

1. Suba o repositório para o GitHub (repo privado serve).
2. Crie conta em https://render.com → **New → Web Service** → conecte o repo.
3. Configure:
   - **Root Directory**: `server`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
4. Em **Environment**, adicione:
   - `CLIENT_ORIGIN` = `https://SEU-PROJETO.vercel.app` (a URL que a Vercel vai te dar no passo 3 — pode voltar aqui depois para preencher)
5. Deploy. Anote a URL gerada, ex.: `https://noctis-api.onrender.com`.
6. Teste: abra `https://noctis-api.onrender.com/api/health` — deve responder `{"ok":true,...}`.

> ⚠️ No plano Free o Render "dorme" após 15 min sem uso — a primeira chamada do dia demora ~40s para acordar. Se incomodar, o plano pago resolve, ou use Railway/Fly.io.

> 🔑 Nenhuma chave de API vai no servidor: o sistema é BYOK — as chaves ficam no navegador de cada usuário e são enviadas por header a cada chamada.

## 2. Criar o projeto no Supabase (login real)

1. Crie conta em https://supabase.com → **New project** (região São Paulo, senha forte do banco).
2. **Auth por e-mail**: já vem ligado. Em *Authentication → Providers → Email*, deixe "Confirm email" como preferir (desligado = entra direto sem confirmar).
3. **Login com Google** (opcional): *Authentication → Providers → Google* → ative. Você vai precisar criar um OAuth Client no Google Cloud Console (APIs & Services → Credentials → OAuth client ID → Web) usando o redirect que o Supabase mostra na mesma tela; cole o Client ID e o Secret no Supabase.
4. **Tabelas** (opcional hoje — veja "O que já funciona" abaixo): *SQL Editor* → cole o conteúdo de `supabase/schema.sql` → Run.
5. Pegue as credenciais em *Settings → API*:
   - **Project URL** → vai virar `VITE_SUPABASE_URL`
   - **anon public key** → vai virar `VITE_SUPABASE_ANON_KEY`
6. Em *Authentication → URL Configuration*, adicione a URL da Vercel (passo 3) em **Site URL** e **Redirect URLs**.

## 3. Subir o site (Vercel)

1. Edite `client/vercel.json` e troque `https://SEU-SERVIDOR.onrender.com` pela URL real do Render (passo 1). Commit + push.
2. Crie conta em https://vercel.com → **Add New → Project** → importe o repo.
3. Configure:
   - **Root Directory**: `client`
   - **Framework Preset**: Vite (detecta sozinho; Build `vite build`, Output `dist`)
4. Em **Environment Variables**, adicione:
   - `VITE_SUPABASE_URL` = Project URL do Supabase
   - `VITE_SUPABASE_ANON_KEY` = anon key do Supabase
   - (opcionais) `VITE_WHATSAPP_COMMUNITY_URL`, `VITE_DISCORD_URL`, `VITE_YOUTUBE_URL`, `VITE_WHATSAPP_PHONE`, `VITE_SUPPORT_EMAIL`
5. **Deploy**. A URL final fica tipo `https://noctis-studio.vercel.app`.
6. Volte no Render e preencha `CLIENT_ORIGIN` com essa URL; volte no Supabase e preencha a URL Configuration (passo 2.6).

O `vercel.json` já resolve os dois pontos críticos:
- `/api/*` é repassado para o servidor no Render (o site chama `/api/...` como se fosse local);
- qualquer outra rota cai no `index.html` (sem 404 ao dar F5 em `/niche-finder` etc.).

## 4. Checklist final

- [ ] `https://...vercel.app` abre a tela de login
- [ ] Criar conta / entrar funciona (Supabase Auth)
- [ ] Perfil → APIs → salvar suas 5 chaves do YouTube + Gemini
- [ ] Niche Finder busca canais (prova de que o rewrite `/api` → Render funciona)
- [ ] Configurações → Avançado → Exportar backup funciona

## O que já funciona e o que ainda é local

- **Com Supabase configurado**: o login vira real (e-mail/senha + Google), com recuperação de senha. ✅
- **Os DADOS continuam no navegador** (localStorage): canais, vídeos, roteiros, prompts, chaves etc. ficam no dispositivo de cada usuário — é o "modo local" por design. O `supabase/schema.sql` já está pronto para a migração, mas a troca do `client/src/lib/db.js` para ler/gravar no Postgres do Supabase é uma fase própria (a interface do módulo foi desenhada para isso).
- Consequência prática: o mesmo usuário em outro computador começa vazio (use Exportar/Importar backup para levar os dados); dois dispositivos não sincronizam sozinhos.
