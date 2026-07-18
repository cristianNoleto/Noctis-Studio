import { MessageCircle } from 'lucide-react'
import { useI18n } from '../i18n'

const phone = import.meta.env.VITE_WHATSAPP_PHONE || ''
const message = import.meta.env.VITE_WHATSAPP_MESSAGE || 'Olá! Vim pelo Noctis Studio.'

export default function WhatsAppWidget() {
  const { t } = useI18n()
  if (!phone) return null
  const href = `https://api.whatsapp.com/send?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(message)}`
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t('dashboard.community.whatsapp')}
      className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-green-500 text-white shadow-lg shadow-green-500/30 transition-transform hover:scale-110"
    >
      <MessageCircle size={28} />
    </a>
  )
}
