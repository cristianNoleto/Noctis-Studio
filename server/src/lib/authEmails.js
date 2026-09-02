// ---------------------------------------------------------------------------
// Renderização dos e-mails de autenticação (Noctis Studio) em pt/en/es.
// Usado pelo Send Email Hook: o Supabase chama nosso endpoint e nós montamos o
// e-mail NO IDIOMA do usuário (user_metadata.locale) e enviamos pelo Resend.
// Um único layout dark + ciano, parametrizado por tipo e idioma.
// ---------------------------------------------------------------------------

const SUPPORT = 'suporte@noctis-studio.online'
const DOMAIN = 'noctis-studio.online'

// Normaliza qualquer locale para 'pt' | 'en' | 'es' (padrão inglês).
export function normalizeLocale(raw) {
  const l = String(raw || '').toLowerCase().slice(0, 2)
  return l === 'pt' || l === 'es' ? l : 'en'
}

// Textos por idioma. `link`/`help` são comuns a todos os e-mails com botão.
const T = {
  pt: { link: 'Se o botão não funcionar, copie e cole este link no navegador:', help: 'Precisa de ajuda?', acct: 'Conta', method: 'Método de login', kind: 'Tipo' },
  en: { link: "If the button doesn't work, copy and paste this link into your browser:", help: 'Need help?', acct: 'Account', method: 'Sign-in method', kind: 'Type' },
  es: { link: 'Si el botón no funciona, copia y pega este enlace en el navegador:', help: '¿Necesitas ayuda?', acct: 'Cuenta', method: 'Método de acceso', kind: 'Tipo' },
}

// Nome amigável de um provedor de login e de um tipo de fator MFA.
function prettyProvider(p) {
  const map = { email: 'E-mail / senha', google: 'Google', github: 'GitHub', phone: 'Telefone', apple: 'Apple', facebook: 'Facebook' }
  return map[String(p || '').toLowerCase()] || (p ? String(p) : '')
}
function prettyFactor(f) {
  const map = { totp: 'App autenticador (TOTP)', phone: 'SMS', webauthn: 'Chave de segurança' }
  return map[String(f || '').toLowerCase()] || (f ? String(f) : '')
}
// Escapa texto vindo do payload (e-mail, provider) antes de injetar no HTML.
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]))
}

// Cópia por TIPO de e-mail e idioma. code:true → usa código (sem link/botão).
const COPY = {
  confirm: {
    pt: { subject: 'Confirme seu e-mail — Noctis Studio', heading: 'Confirme seu e-mail', intro: 'Falta um passo para ativar sua conta. Clique no botão abaixo para confirmar este e-mail e começar a operar seus canais.', button: 'Confirmar e-mail', foot: 'Você não criou esta conta? Pode ignorar este e-mail com segurança.' },
    en: { subject: 'Confirm your email — Noctis Studio', heading: 'Confirm your email', intro: 'One step left to activate your account. Click the button below to confirm this email and start managing your channels.', button: 'Confirm email', foot: "Didn't create this account? You can safely ignore this email." },
    es: { subject: 'Confirma tu correo — Noctis Studio', heading: 'Confirma tu correo', intro: 'Falta un paso para activar tu cuenta. Haz clic en el botón para confirmar este correo y empezar a gestionar tus canales.', button: 'Confirmar correo', foot: '¿No creaste esta cuenta? Puedes ignorar este correo.' },
  },
  invite: {
    pt: { subject: 'Você foi convidado para o Noctis Studio', heading: 'Você foi convidado', intro: 'Alguém liberou acesso a um workspace no Noctis Studio para você. Clique abaixo para criar sua senha e entrar.', button: 'Aceitar convite', foot: 'Não esperava este convite? Pode ignorar este e-mail.' },
    en: { subject: "You've been invited to Noctis Studio", heading: "You've been invited", intro: 'Someone gave you access to a workspace on Noctis Studio. Click below to set your password and sign in.', button: 'Accept invite', foot: "Weren't expecting this invite? You can ignore this email." },
    es: { subject: 'Te invitaron a Noctis Studio', heading: 'Te invitaron', intro: 'Alguien te dio acceso a un workspace en Noctis Studio. Haz clic abajo para crear tu contraseña e iniciar sesión.', button: 'Aceptar invitación', foot: '¿No esperabas esta invitación? Puedes ignorar este correo.' },
  },
  magic: {
    pt: { subject: 'Seu link de acesso — Noctis Studio', heading: 'Seu link de acesso', intro: 'Clique no botão abaixo para entrar na sua conta. O link é válido por tempo limitado e só pode ser usado uma vez.', button: 'Entrar no Noctis Studio', foot: 'Não pediu este acesso? Ignore este e-mail.' },
    en: { subject: 'Your sign-in link — Noctis Studio', heading: 'Your sign-in link', intro: 'Click the button below to sign in. The link is valid for a limited time and can be used only once.', button: 'Sign in to Noctis Studio', foot: "Didn't request this? Ignore this email." },
    es: { subject: 'Tu enlace de acceso — Noctis Studio', heading: 'Tu enlace de acceso', intro: 'Haz clic en el botón para iniciar sesión. El enlace es válido por tiempo limitado y de un solo uso.', button: 'Entrar a Noctis Studio', foot: '¿No lo pediste? Ignora este correo.' },
  },
  recovery: {
    pt: { subject: 'Redefinir sua senha — Noctis Studio', heading: 'Redefinir sua senha', intro: 'Recebemos um pedido para redefinir a senha da sua conta. Clique no botão abaixo para escolher uma nova senha.', button: 'Redefinir senha', foot: 'Não pediu isso? Ignore este e-mail — sua senha continua a mesma.' },
    en: { subject: 'Reset your password — Noctis Studio', heading: 'Reset your password', intro: 'We received a request to reset your account password. Click the button below to choose a new one.', button: 'Reset password', foot: "Didn't request this? Ignore this email — your password stays the same." },
    es: { subject: 'Restablece tu contraseña — Noctis Studio', heading: 'Restablece tu contraseña', intro: 'Recibimos una solicitud para restablecer la contraseña de tu cuenta. Haz clic para elegir una nueva.', button: 'Restablecer contraseña', foot: '¿No lo pediste? Ignora este correo — tu contraseña sigue igual.' },
  },
  email_change: {
    pt: { subject: 'Confirme seu novo e-mail — Noctis Studio', heading: 'Confirme seu novo e-mail', intro: 'Você pediu para alterar o e-mail da sua conta. Clique abaixo para confirmar a mudança.', button: 'Confirmar novo e-mail', foot: 'Não pediu essa alteração? Ignore este e-mail e sua conta segue com o e-mail atual.' },
    en: { subject: 'Confirm your new email — Noctis Studio', heading: 'Confirm your new email', intro: 'You requested to change your account email. Click below to confirm the change.', button: 'Confirm new email', foot: "Didn't request this? Ignore this email and your account keeps the current address." },
    es: { subject: 'Confirma tu nuevo correo — Noctis Studio', heading: 'Confirma tu nuevo correo', intro: 'Solicitaste cambiar el correo de tu cuenta. Haz clic para confirmar el cambio.', button: 'Confirmar nuevo correo', foot: '¿No lo pediste? Ignora este correo y tu cuenta mantiene el actual.' },
  },
  reauth: {
    code: true,
    pt: { subject: 'Seu código de verificação — Noctis Studio', heading: 'Código de verificação', intro: 'Para confirmar esta ação sensível na sua conta, use o código abaixo:', foot: 'O código expira em alguns minutos. Nunca compartilhe este código com ninguém.' },
    en: { subject: 'Your verification code — Noctis Studio', heading: 'Verification code', intro: 'To confirm this sensitive action on your account, use the code below:', foot: 'The code expires in a few minutes. Never share this code with anyone.' },
    es: { subject: 'Tu código de verificación — Noctis Studio', heading: 'Código de verificación', intro: 'Para confirmar esta acción sensible en tu cuenta, usa el código de abajo:', foot: 'El código caduca en unos minutos. Nunca compartas este código.' },
  },

  // ---------------------------------------------------------------------------
  // Notificações de segurança (informativas — sem botão/link). O Supabase as
  // dispara pelo Send Email Hook com email_action_type *_notification quando
  // ligadas no dashboard. `detail` = 'acct' | 'method' | 'kind' (o que mostrar).
  // ---------------------------------------------------------------------------
  password_changed: {
    notice: true, detail: 'acct',
    pt: { subject: 'Sua senha foi alterada — Noctis Studio', heading: 'Senha alterada', intro: 'A senha da sua conta foi alterada agora. Se foi você, está tudo certo — nenhuma ação é necessária.', foot: 'Não foi você? Redefina sua senha imediatamente e fale com o suporte.' },
    en: { subject: 'Your password was changed — Noctis Studio', heading: 'Password changed', intro: 'Your account password was just changed. If this was you, all good — no action needed.', foot: "Wasn't you? Reset your password immediately and contact support." },
    es: { subject: 'Tu contraseña fue cambiada — Noctis Studio', heading: 'Contraseña cambiada', intro: 'La contraseña de tu cuenta acaba de cambiar. Si fuiste tú, todo bien — no hace falta nada.', foot: '¿No fuiste tú? Restablece tu contraseña de inmediato y contacta al soporte.' },
  },
  email_changed: {
    notice: true, detail: 'acct',
    pt: { subject: 'Seu e-mail de acesso foi alterado — Noctis Studio', heading: 'E-mail alterado', intro: 'O e-mail de acesso da sua conta foi alterado. Se foi você, está tudo certo.', foot: 'Não reconhece essa mudança? Fale com o suporte imediatamente.' },
    en: { subject: 'Your sign-in email was changed — Noctis Studio', heading: 'Email changed', intro: 'The sign-in email for your account was changed. If this was you, all good.', foot: "Don't recognize this change? Contact support immediately." },
    es: { subject: 'Tu correo de acceso fue cambiado — Noctis Studio', heading: 'Correo cambiado', intro: 'El correo de acceso de tu cuenta fue cambiado. Si fuiste tú, todo bien.', foot: '¿No reconoces este cambio? Contacta al soporte de inmediato.' },
  },
  phone_changed: {
    notice: true, detail: 'acct',
    pt: { subject: 'Seu telefone foi alterado — Noctis Studio', heading: 'Telefone alterado', intro: 'O número de telefone da sua conta foi alterado. Se foi você, nenhuma ação é necessária.', foot: 'Não foi você? Fale com o suporte imediatamente.' },
    en: { subject: 'Your phone number was changed — Noctis Studio', heading: 'Phone number changed', intro: 'The phone number on your account was changed. If this was you, no action is needed.', foot: "Wasn't you? Contact support immediately." },
    es: { subject: 'Tu teléfono fue cambiado — Noctis Studio', heading: 'Teléfono cambiado', intro: 'El número de teléfono de tu cuenta fue cambiado. Si fuiste tú, no hace falta nada.', foot: '¿No fuiste tú? Contacta al soporte de inmediato.' },
  },
  identity_linked: {
    notice: true, detail: 'method',
    pt: { subject: 'Novo método de login vinculado — Noctis Studio', heading: 'Método de login vinculado', intro: 'Um novo método de login foi vinculado à sua conta. Agora você também pode entrar por ele.', foot: 'Não foi você que vinculou? Remova-o em Perfil → Segurança e fale com o suporte.' },
    en: { subject: 'A sign-in method was linked — Noctis Studio', heading: 'Sign-in method linked', intro: 'A new sign-in method was linked to your account. You can now sign in with it too.', foot: "Didn't link this? Remove it in Profile → Security and contact support." },
    es: { subject: 'Se vinculó un método de acceso — Noctis Studio', heading: 'Método de acceso vinculado', intro: 'Se vinculó un nuevo método de acceso a tu cuenta. Ahora también puedes entrar con él.', foot: '¿No lo vinculaste tú? Quítalo en Perfil → Seguridad y contacta al soporte.' },
  },
  identity_unlinked: {
    notice: true, detail: 'method',
    pt: { subject: 'Método de login removido — Noctis Studio', heading: 'Método de login removido', intro: 'Um método de login foi removido da sua conta e não pode mais ser usado para entrar.', foot: 'Não foi você? Fale com o suporte imediatamente.' },
    en: { subject: 'A sign-in method was removed — Noctis Studio', heading: 'Sign-in method removed', intro: 'A sign-in method was removed from your account and can no longer be used to sign in.', foot: "Wasn't you? Contact support immediately." },
    es: { subject: 'Se quitó un método de acceso — Noctis Studio', heading: 'Método de acceso quitado', intro: 'Se quitó un método de acceso de tu cuenta y ya no se puede usar para entrar.', foot: '¿No fuiste tú? Contacta al soporte de inmediato.' },
  },
  mfa_added: {
    notice: true, detail: 'kind',
    pt: { subject: 'Verificação em 2 etapas adicionada — Noctis Studio', heading: '2FA adicionado', intro: 'Um método de verificação em duas etapas (2FA) foi adicionado à sua conta. Sua conta está mais protegida.', foot: 'Não foi você? Fale com o suporte imediatamente.' },
    en: { subject: 'Two-factor method added — Noctis Studio', heading: 'MFA method added', intro: 'A two-factor (MFA) method was added to your account. Your account is now more secure.', foot: "Wasn't you? Contact support immediately." },
    es: { subject: 'Método de dos factores agregado — Noctis Studio', heading: 'MFA agregado', intro: 'Se agregó un método de dos factores (MFA) a tu cuenta. Tu cuenta está más protegida.', foot: '¿No fuiste tú? Contacta al soporte de inmediato.' },
  },
  mfa_removed: {
    notice: true, detail: 'kind',
    pt: { subject: 'Verificação em 2 etapas removida — Noctis Studio', heading: '2FA removido', intro: 'Um método de verificação em duas etapas (2FA) foi removido da sua conta. Ela pode estar menos protegida.', foot: 'Não foi você? Adicione o 2FA novamente e fale com o suporte imediatamente.' },
    en: { subject: 'Two-factor method removed — Noctis Studio', heading: 'MFA method removed', intro: 'A two-factor (MFA) method was removed from your account. It may be less protected now.', foot: "Wasn't you? Re-add MFA and contact support immediately." },
    es: { subject: 'Método de dos factores eliminado — Noctis Studio', heading: 'MFA eliminado', intro: 'Se eliminó un método de dos factores (MFA) de tu cuenta. Puede estar menos protegida.', foot: '¿No fuiste tú? Vuelve a agregar MFA y contacta al soporte de inmediato.' },
  },
}

// Mapeia o email_action_type do Supabase para a nossa chave de template.
export function templateKeyFor(actionType) {
  const a = String(actionType || '')
  // Notificações de segurança PRIMEIRO — senão "email_changed_notification"
  // cairia no startsWith('email_change') do fluxo de troca de e-mail.
  if (a === 'password_changed_notification') return 'password_changed'
  if (a === 'email_changed_notification') return 'email_changed'
  if (a === 'phone_changed_notification') return 'phone_changed'
  if (a === 'identity_linked_notification') return 'identity_linked'
  if (a === 'identity_unlinked_notification') return 'identity_unlinked'
  if (a === 'mfa_factor_enrolled_notification') return 'mfa_added'
  if (a === 'mfa_factor_unenrolled_notification') return 'mfa_removed'
  // Fluxos de autenticação (com link/código).
  if (a === 'signup') return 'confirm'
  if (a === 'invite') return 'invite'
  if (a === 'magiclink') return 'magic'
  if (a === 'recovery') return 'recovery'
  if (a.startsWith('email_change')) return 'email_change'
  if (a === 'reauthentication') return 'reauth'
  return null
}

function shell(inner) {
  // Documento HTML completo com <body> de fundo escuro → o e-mail fica TODO
  // escuro (não um card flutuando no branco do cliente de e-mail).
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark only">
<meta name="supported-color-schemes" content="dark">
</head>
<body style="margin:0;padding:0;background:#0D0E12;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0D0E12;margin:0;padding:32px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#16181F;border:1px solid #262A33;border-radius:16px;overflow:hidden;">
      <tr><td style="padding:32px 32px 8px 32px;">
        <div style="font-size:20px;font-weight:800;color:#E5E7EB;letter-spacing:-0.3px;">Noctis<span style="color:#22D3EE;"> Studio</span></div>
      </td></tr>
      ${inner}
    </table>
    <p style="margin:16px 0 0 0;font-size:11px;color:#4B5563;">© Noctis Studio · ${DOMAIN}</p>
  </td></tr>
</table>
</body>
</html>`
}

// Detalhe (Conta / Método / Tipo) mostrado nas notificações de segurança.
function noticeDetail(def, common, ctx) {
  if (def.detail === 'acct') return { label: common.acct, value: ctx.email }
  if (def.detail === 'method') return { label: common.method, value: prettyProvider(ctx.provider) }
  if (def.detail === 'kind') return { label: common.kind, value: prettyFactor(ctx.factor) }
  return null
}

// Renderiza { subject, html } para um tipo + idioma. `url` (link) OU `code` OU
// notice (aviso informativo, com `ctx` para o detalhe). Escapa valores do ctx.
export function renderAuthEmail({ key, locale, url, code, ctx = {} }) {
  const lang = normalizeLocale(locale)
  const def = COPY[key]
  if (!def) return null
  const c = def[lang] || def.en
  const common = T[lang] || T.en
  const footer = `<tr><td style="padding:24px 32px 32px 32px;border-top:1px solid #262A33;">
      <p style="margin:16px 0 0 0;font-size:12px;line-height:1.6;color:#6B7280;">${c.foot}<br>${common.help} <a href="mailto:${SUPPORT}" style="color:#22D3EE;">${SUPPORT}</a></p>
    </td></tr>`

  let body
  if (def.notice) {
    const d = noticeDetail(def, common, ctx)
    const detailBox = d && d.value
      ? `<tr><td style="padding:0 32px 8px 32px;">
        <div style="background:#0D0E12;border:1px solid #262A33;border-radius:12px;padding:14px 16px;">
          <span style="font-size:11px;font-weight:700;letter-spacing:0.5px;color:#6B7280;text-transform:uppercase;">${esc(d.label)}</span><br>
          <span style="font-size:15px;font-weight:600;color:#E5E7EB;">${esc(d.value)}</span>
        </div>
      </td></tr>`
      : ''
    body = `<tr><td style="padding:8px 32px 0 32px;">
        <h1 style="margin:0 0 12px 0;font-size:22px;font-weight:700;color:#F3F4F6;">${c.heading}</h1>
        <p style="margin:0 0 ${detailBox ? '16px' : '4px'} 0;font-size:14px;line-height:1.6;color:#9CA3AF;">${c.intro}</p>
      </td></tr>
      ${detailBox}`
  } else if (def.code) {
    body = `<tr><td style="padding:8px 32px 0 32px;">
        <h1 style="margin:0 0 12px 0;font-size:22px;font-weight:700;color:#F3F4F6;">${c.heading}</h1>
        <p style="margin:0 0 20px 0;font-size:14px;line-height:1.6;color:#9CA3AF;">${c.intro}</p>
      </td></tr>
      <tr><td style="padding:0 32px 8px 32px;">
        <div style="background:#0D0E12;border:1px solid #262A33;border-radius:12px;padding:18px;text-align:center;">
          <span style="font-size:30px;font-weight:800;letter-spacing:8px;color:#22D3EE;">${code || ''}</span>
        </div>
      </td></tr>`
  } else {
    body = `<tr><td style="padding:8px 32px 0 32px;">
        <h1 style="margin:0 0 12px 0;font-size:22px;font-weight:700;color:#F3F4F6;">${c.heading}</h1>
        <p style="margin:0 0 24px 0;font-size:14px;line-height:1.6;color:#9CA3AF;">${c.intro}</p>
      </td></tr>
      <tr><td style="padding:0 32px 8px 32px;">
        <a href="${url}" style="display:inline-block;background:#22D3EE;color:#06121A;text-decoration:none;font-size:14px;font-weight:700;padding:12px 24px;border-radius:10px;">${c.button}</a>
      </td></tr>
      <tr><td style="padding:20px 32px 0 32px;">
        <p style="margin:0;font-size:12px;line-height:1.6;color:#6B7280;">${common.link}<br><a href="${url}" style="color:#22D3EE;word-break:break-all;">${url}</a></p>
      </td></tr>`
  }
  return { subject: c.subject, html: shell(body + footer) }
}
