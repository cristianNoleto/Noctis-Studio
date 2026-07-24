import { api } from './api'

// Adaptador do Google Drive no NAVEGADOR: fala direto com a API do Drive usando
// um access token de curta duração emitido pelo nosso servidor (a partir do
// refresh token guardado). Assim os arquivos pesados (imagens dos desenhos) sobem
// e baixam DIRETO do Google — sem trafegar pelo nosso servidor (Vercel).

const FILES = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
// Estrutura no Drive do usuário: raiz limpa, só a pasta do app; os projetos
// ficam todos dentro da pasta do app / "Excalidraw-projects". O nome deixa claro
// que é o banco dos storyboards e que NÃO deve ser apagada.
const APP_ROOT_NAME = 'Noctis Studio - Storyboards (NAO APAGAR)'
// Nomes antigos: se existir, é renomeado para o novo (preserva os projetos).
const APP_ROOT_LEGACY = ['Noctis Studio- Site', 'Noctis Studio - Site']
const PROJECTS_FOLDER_NAME = 'Excalidraw-projects'

let cachedToken = null // { accessToken, exp }
let cachedProjectsFolder = null // id da pasta Excalidraw-projects (por sessão)

// Access token com cache (expira antes do prazo real por segurança).
export async function driveToken() {
  if (cachedToken && Date.now() < cachedToken.exp - 60000) return cachedToken.accessToken
  const { accessToken, expiresIn } = await api.drive.access()
  cachedToken = { accessToken, exp: Date.now() + (expiresIn || 3600) * 1000 }
  return accessToken
}

function auth(token) {
  return { Authorization: `Bearer ${token}` }
}

async function driveFetch(url, opts = {}) {
  const token = await driveToken()
  const res = await fetch(url, { ...opts, headers: { ...auth(token), ...(opts.headers || {}) } })
  if (!res.ok) throw new Error(`drive_${res.status}`)
  return res
}

// Procura uma pasta pelo nome (dentro de parentId, ou na raiz se null). Devolve
// o id ou null.
async function findFolder(name, parentId) {
  const clauses = [`name='${name.replace(/'/g, "\\'")}'`, "mimeType='application/vnd.google-apps.folder'", 'trashed=false', parentId ? `'${parentId}' in parents` : "'root' in parents"]
  const q = encodeURIComponent(clauses.join(' and '))
  const res = await driveFetch(`${FILES}?q=${q}&fields=files(id,name)`)
  const { files } = await res.json()
  return files?.length ? files[0].id : null
}

// Acha uma pasta pelo nome; cria se não existir. Devolve o id.
async function ensureFolder(name, parentId) {
  return (await findFolder(name, parentId)) || createFolder(name, parentId)
}

// Pasta raiz do app no Drive. Se ainda existir com um nome antigo, RENOMEIA para
// o nome atual (preserva os projetos que já estão dentro) em vez de criar outra.
async function ensureAppRoot() {
  const current = await findFolder(APP_ROOT_NAME, null)
  if (current) return current
  for (const legacy of APP_ROOT_LEGACY) {
    const old = await findFolder(legacy, null)
    if (old) {
      try {
        await renameFile(old, APP_ROOT_NAME)
      } catch {
        /* se falhar o rename, segue usando a pasta mesmo assim */
      }
      return old
    }
  }
  return createFolder(APP_ROOT_NAME, null)
}

// Pasta onde TODOS os projetos ficam: "<pasta do app>/Excalidraw-projects".
// A raiz do Drive só recebe a pasta do app. Resultado cacheado por sessão.
export async function ensureProjectsFolder() {
  if (cachedProjectsFolder) return cachedProjectsFolder
  const appRoot = await ensureAppRoot()
  const projects = await ensureFolder(PROJECTS_FOLDER_NAME, appRoot)
  cachedProjectsFolder = projects
  return projects
}

export async function createFolder(name, parentId) {
  const res = await driveFetch(FILES, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: parentId ? [parentId] : undefined }),
  })
  return (await res.json()).id
}

// Upload multipart (metadados + conteúdo) → devolve o id do arquivo criado.
export async function uploadFile({ name, mimeType, blob, parentId }) {
  const meta = { name, parents: parentId ? [parentId] : undefined }
  const form = new FormData()
  form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }))
  form.append('file', blob instanceof Blob ? blob : new Blob([blob], { type: mimeType || 'application/octet-stream' }))
  const res = await driveFetch(`${UPLOAD}?uploadType=multipart&fields=id`, { method: 'POST', body: form })
  return (await res.json()).id
}

// Substitui o conteúdo de um arquivo existente.
export async function updateFileContent(fileId, blob, mimeType) {
  await driveFetch(`${UPLOAD}/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: { 'Content-Type': mimeType || 'application/octet-stream' },
    body: blob instanceof Blob ? blob : new Blob([blob], { type: mimeType || 'application/octet-stream' }),
  })
}

export async function downloadBlob(fileId) {
  const res = await driveFetch(`${FILES}/${fileId}?alt=media`)
  return res.blob()
}

export async function downloadText(fileId) {
  const res = await driveFetch(`${FILES}/${fileId}?alt=media`)
  return res.text()
}

export async function deleteFile(fileId) {
  await driveFetch(`${FILES}/${fileId}`, { method: 'DELETE' })
}

// Renomeia um arquivo ou pasta no Drive.
export async function renameFile(fileId, name) {
  await driveFetch(`${FILES}/${fileId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
}

// Tamanho (bytes) de um arquivo no Drive.
export async function fileSize(fileId) {
  const res = await driveFetch(`${FILES}/${fileId}?fields=size`)
  const { size } = await res.json()
  return size ? Number(size) : 0
}

// Sobe um JSON (ex.: a "planta" leve da cena) e devolve o id.
export async function uploadJson({ name, data, parentId }) {
  return uploadFile({ name, mimeType: 'application/json', blob: new Blob([JSON.stringify(data)], { type: 'application/json' }), parentId })
}
