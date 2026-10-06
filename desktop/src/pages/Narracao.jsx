import { AudioLines } from 'lucide-react'
import { Card, PageHeader } from '../components/ui'

// Text to Speech: entra quando houver provedor (ElevenLabs). A tela já tem o lugar dela no menu.
export default function Narracao() {
  return (
    <div className="mx-auto max-w-[1100px] px-8 py-7">
      <PageHeader icon={AudioLines} kicker="Produção" title="Narração" subtitle="Texto em voz com legendas (SRT por tempo, legenda e por palavra)" />
      <Card className="p-8 text-center">
        <p className="text-lg font-semibold text-slate-200">Em breve</p>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-slate-500">
          A narração vai usar a sua chave do ElevenLabs. Enquanto isso, gere o áudio onde você já gera e use o SRT por tempo no Sincronizador SRT.
        </p>
      </Card>
    </div>
  )
}
