import { forwardRef } from 'react'
import HCaptcha from '@hcaptcha/react-hcaptcha'
import { isLocalMode } from '../lib/supabase'

// Sitekey do hCaptcha é PÚBLICA (pode ficar no código). A secret vive só no
// painel do Supabase (Authentication → Attack Protection), que faz a verificação.
export const HCAPTCHA_SITEKEY = import.meta.env.VITE_HCAPTCHA_SITEKEY || '443aa96a-9714-4f6c-a246-c51437043e60'

// Só exige captcha em produção (Supabase configurado) e com sitekey presente.
export const captchaEnabled = !isLocalMode && !!HCAPTCHA_SITEKEY

// Widget do hCaptcha. `onToken(token|'')` avisa o pai quando resolve/expira.
// Use a ref para chamar resetCaptcha() depois de cada tentativa de login.
const Captcha = forwardRef(function Captcha({ onToken }, ref) {
  if (!captchaEnabled) return null
  return (
    <div className="flex justify-center">
      <HCaptcha
        ref={ref}
        sitekey={HCAPTCHA_SITEKEY}
        theme="dark"
        onVerify={(token) => onToken(token)}
        onExpire={() => onToken('')}
        onError={() => onToken('')}
      />
    </div>
  )
})

export default Captcha
