# E-mails de auth multilíngues (Send Email Hook)

Com isto, o Supabase **não envia** mais os e-mails de autenticação. Em vez disso,
ele chama nosso endpoint (`/api/auth/email-hook`), que monta o e-mail **no idioma
do usuário** (pt/en/es) e envia pelo **Resend**, do domínio próprio.

> Enquanto o hook NÃO estiver ativado, o Supabase segue usando os templates do
> dashboard (aqueles HTML em português). Ative o hook para ganhar o multilíngue.

## Como funciona
- O idioma vem de `user_metadata.locale`, gravado no cadastro (o app já faz isso).
- Contas antigas / login pelo Google sem locale → padrão **inglês**.
- Renderização: `server/src/lib/authEmails.js`. Endpoint: `server/src/routes/authEmailHook.js`.

## Passo 1 — Variáveis de ambiente na Vercel
Adicione (Project → Settings → Environment Variables):

| Variável | Valor |
|---|---|
| `RESEND_API_KEY` | sua API key do Resend (`re_...`) |
| `EMAIL_FROM` | `Noctis Studio <noreply@noctis-studio.online>` |
| `SEND_EMAIL_HOOK_SECRET` | o secret gerado no Passo 2 (formato `v1,whsec_...`) |
| `SUPABASE_URL` | (já deve existir) URL do projeto Supabase |

Redeploy após salvar.

## Passo 2 — Ativar o hook no Supabase
1. Dashboard → **Authentication → Hooks** (ou **Auth Hooks**).
2. Em **Send Email Hook** → **Enable**.
3. Tipo: **HTTPS**.
4. URL: `https://noctis-studio.online/api/auth/email-hook`
   (ou o domínio de produção que estiver usando).
5. O Supabase gera um **secret** (`v1,whsec_...`). Copie e cole em
   `SEND_EMAIL_HOOK_SECRET` na Vercel (Passo 1). Redeploy.
6. Salve o hook.

## Passo 3 — Testar
- Crie uma conta de teste com o idioma do app em **inglês** e outra em **português**
  (troca o idioma na interface antes de cadastrar) → cada e-mail deve chegar no
  idioma escolhido, do remetente `noreply@noctis-studio.online`.
- Logs de envio: painel do **Resend** (mostra sucesso/bounce). Erros do hook:
  logs da função na **Vercel**.

## Observações
- Com o hook ativo, os templates do dashboard ficam **ignorados** (não precisa
  mantê-los, mas não atrapalham).
- Segurança: o endpoint valida a **assinatura** de cada requisição com o secret —
  ninguém consegue disparar e-mails sem ele.
- Reautenticação usa **código** (não link); os demais usam link de verificação.
