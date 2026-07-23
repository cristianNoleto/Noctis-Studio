import { supabase } from './supabase'

// Upload de mídia (imagem/vídeo) para o Supabase Storage → devolve a URL pública.
// Em modo local (sem Supabase) ou sem sessão devolve null, sinalizando que o
// chamador deve manter o base64 de antes. O caminho é sempre `<uid>/<pasta>/<uuid>`
// para bater com a RLS do bucket (escrita só na própria pasta).
export async function uploadMedia(source, { folder = 'img', ext = 'jpg', contentType = 'image/jpeg' } = {}) {
  if (!supabase) return null
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth?.user?.id
  if (!uid) return null
  // Aceita File/Blob direto ou uma data URL (base64) — o fetch converte a data URL em Blob.
  const blob = source instanceof Blob ? source : await (await fetch(source)).blob()
  const path = `${uid}/${folder}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('media').upload(path, blob, { contentType: blob.type || contentType, upsert: false })
  if (error) throw error
  return supabase.storage.from('media').getPublicUrl(path).data.publicUrl
}

// Envolve uploadMedia com fallback seguro: se o upload não rolar (modo local,
// sem sessão ou erro de rede), devolve o próprio base64 — o app segue idêntico.
export async function persistMedia(dataUrl, opts) {
  if (!dataUrl || !dataUrl.startsWith('data:')) return dataUrl // já é URL http → nada a fazer
  try {
    const url = await uploadMedia(dataUrl, opts)
    return url || dataUrl
  } catch {
    return dataUrl
  }
}
