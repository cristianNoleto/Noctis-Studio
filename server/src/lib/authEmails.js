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
  pt: { link: 'Se o botão não funcionar, copie e cole este link no navegador:', help: 'Precisa de ajuda?' },
  en: { link: "If the button doesn't work, copy and paste this link into your browser:", help: 'Need help?' },
  es: { link: 'Si el botón no funciona, copia y pega este enlace en el navegador:', help: '¿Necesitas ayuda?' },
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
}

// Mapeia o email_action_type do Supabase para a nossa chave de template.
export function templateKeyFor(actionType) {
  const a = String(actionType || '')
  if (a === 'signup') return 'confirm'
  if (a === 'invite') return 'invite'
  if (a === 'magiclink') return 'magic'
  if (a === 'recovery') return 'recovery'
  if (a.startsWith('email_change')) return 'email_change'
  if (a === 'reauthentication') return 'reauth'
  return null
}

function shell(inner) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0D0E12;margin:0;padding:32px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#16181F;border:1px solid #262A33;border-radius:16px;overflow:hidden;">
      <tr><td style="padding:32px 32px 8px 32px;">
        <div style="font-size:20px;font-weight:800;color:#E5E7EB;letter-spacing:-0.3px;">Noctis<span style="color:#22D3EE;"> Studio</span></div>
      </td></tr>
      ${inner}
    </table>
    <p style="margin:16px 0 0 0;font-size:11px;color:#4B5563;">© Noctis Studio · ${DOMAIN}</p>
  </td></tr>
</table>`
}

// Renderiza { subject, html } para um tipo + idioma. `url` (link) OU `code`.
export function renderAuthEmail({ key, locale, url, code }) {
  const lang = normalizeLocale(locale)
  const def = COPY[key]
  if (!def) return null
  const c = def[lang] || def.en
  const common = T[lang] || T.en
  const footer = `<tr><td style="padding:24px 32px 32px 32px;border-top:1px solid #262A33;">
      <p style="margin:16px 0 0 0;font-size:12px;line-height:1.6;color:#6B7280;">${c.foot}<br>${common.help} <a href="mailto:${SUPPORT}" style="color:#22D3EE;">${SUPPORT}</a></p>
    </td></tr>`

  let body
  if (def.code) {
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
