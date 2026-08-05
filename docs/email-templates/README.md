# Templates de e-mail — Noctis Studio

E-mails de autenticação com a marca Noctis Studio (paleta dark + ciano).
Cole o conteúdo de cada arquivo em **Supabase → Authentication → Email Templates**.

| Arquivo | Template no Supabase | Assunto sugerido |
|---|---|---|
| `confirm-signup.html` | Confirm sign up | Confirme seu e-mail — Noctis Studio |
| `invite.html` | Invite user | Você foi convidado para o Noctis Studio |
| `magic-link.html` | Magic Link | Seu link de acesso — Noctis Studio |
| `change-email.html` | Change Email Address | Confirme seu novo e-mail — Noctis Studio |
| `reset-password.html` | Reset Password | Redefinir sua senha — Noctis Studio |
| `reauthentication.html` | Reauthentication | Seu código de verificação — Noctis Studio |

> O **Invite user** é o template do **convite de colaborador/workspace**
> (disparado por `inviteUserByEmail` quando você adiciona um colaborador sem conta).

## Como aplicar
1. Supabase → **Authentication → Email Templates**.
2. Selecione o template (ex.: "Confirm signup").
3. Cole o **assunto** no campo *Subject* e o **HTML** do arquivo no corpo.
4. Salve. Repita para os outros.

## Variáveis usadas
- `{{ .ConfirmationURL }}` — link de ação (confirmar, convite, magic link, trocar e-mail, redefinir senha).
- `{{ .Token }}` — código de 6 dígitos (usado no template de **Reauthentication**, que NÃO tem link).
- `{{ .NewEmail }}` — o novo e-mail (usado no **Change Email Address**).
- Outras disponíveis: `{{ .SiteURL }}`, `{{ .Email }}`.

> Atenção: **Reauthentication** usa CÓDIGO (`{{ .Token }}`), não link — não troque por um botão de URL.

## Observações
- Remetente (`noreply@noctis-studio.online`) e nome ("Noctis Studio") são
  configurados no **Custom SMTP** (SMTP Settings), NÃO aqui no template.
- O e-mail de suporte no rodapé é `suporte@noctis-studio.online` — configure o
  encaminhamento (ex.: Cloudflare Email Routing → seu Gmail) para receber respostas.
