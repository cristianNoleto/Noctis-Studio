# Noctis Studio

Plataforma SaaS de gestão e pesquisa para criadores de conteúdo dark no YouTube.

**Identidade:** fundo `#0D0E12`, superfícies `#16171D`, texto `#F3F4F6`, destaque cian elétrico; vermelho `#FF4747` reservado para YouTube e ações destrutivas. Logo: lua crescente "N" em gradiente cian→azul.

## Estrutura

```
client/     SPA React (Vite + Tailwind CSS v4 + React Router + Framer Motion + Lucide + @dnd-kit)
server/     API Node.js/Express — proxy BYOK (YouTube com rotação de chaves, Gemini, Pexels/Pixabay, AssemblyAI)
supabase/   schema.sql — banco PostgreSQL completo para a migração futura ao Supabase
```

## Rodando localmente

Requisitos: Node.js 20+.

```bash
# Terminal 1 — frontend (http://localhost:5173)
cd client && npm install && npm run dev

# Terminal 2 — backend (http://localhost:3001)
cd server && npm install && npm run dev
```

O frontend roda em **modo local**: autenticação simulada e dados salvos em
`localStorage` por usuário. Crie uma conta em `/register` e use normalmente.
Para ativar Supabase real (e-mail/senha + Google OAuth), copie
`client/.env.example` → `client/.env` e preencha as credenciais.

### Chaves de API (BYOK) — Perfil → APIs

As integrações reais usam **suas** chaves, salvas só no seu dispositivo:

| Integração | Onde criar | Usada em |
|---|---|---|
| YouTube Data API v3 (até 5 chaves) | Google Cloud Console | Gestão de Canais, Niche Finder, Vídeos Virais, Dobra de Nicho, Referências |
| Gemini | Google AI Studio | Relatórios de SEO/CTR, Dobra de Nicho |
| AssemblyAI | assemblyai.com | Transcrição |
| Pexels / Pixabay | pexels.com/api · pixabay.com/api | Vídeos e Imagens |

**Rotação de cota do YouTube:** o backend intercepta toda chamada; em erro 403
de cota, marca a chave como esgotada (reset à meia-noite, horário do Pacífico)
e refaz a requisição com a próxima chave — transparente para a interface. As
buscas são cacheadas em memória para economizar unidades.

## Status das fases

| Fase | Escopo | Status |
|------|--------|--------|
| 1 | Auth + layout base + Dashboard | ✅ |
| 2 | Gestão de Canais (modais, permissões, tabela de vídeos, editor de roteiro com WPM/SRT) | ✅ |
| 3 | Quadro de Ideias (kanban drag-and-drop) + Referências (pastas) + Prompts | ✅ |
| 4 | Configurações/APIs — rotação de 5 chaves YouTube + Gemini BYOK | ✅ |
| 5 | Niche Finder + Vídeos Virais (VPH/engajamento) + Canais Removidos | ✅ |
| 6 | Dobra de Nicho (mapa radial IA) + Relatórios de SEO | ✅ |
| 7 | Vídeos e Imagens (Pexels/Pixabay) + Transcrição + Ferramentas de Texto + Academia | ✅ |
| 8 | TTS/Narração, extensão Chrome, app desktop, Veo, docs públicas de API | 🔜 fora do escopo atual |

## Decisões técnicas

- **Modo local primeiro**: os dados do usuário (canais, vídeos, roteiros, kanban,
  prompts, referências, análises) vivem em `localStorage` com a mesma modelagem do
  `supabase/schema.sql`; a troca para o banco real não muda a interface da camada
  de dados (`client/src/lib/db.js`).
- **Crescimento mensal de canal** exige snapshots diários por 30 dias
  (`channel_stats_snapshots`) — enquanto isso a UI mostra métricas reais dos
  últimos vídeos e "Coletando dados...".
- **Dobra de Nicho** é 100% gerada por IA (Gemini) a partir de dados reais do canal
  semente; a interface deixa claro que scores são estimativas.
- **Tempo de narração/SRT**: cálculo matemático puro (150 WPM ±15%), sem áudio real.
- **Permissões de canal compartilhado**: flags granulares por membro; na migração
  ao Supabase, validação obrigatória no backend (RLS já previsto no schema).
