import { api } from './api'

// Adaptador do Google Drive no NAVEGADOR: fala direto com a API do Drive usando
// um access token de curta duração emitido pelo nosso servidor (a partir do
// refresh token guardado). Assim os arquivos pesados (imagens dos desenhos) sobem
// e baixam DIRETO do Google — sem trafegar pelo nosso servidor (Vercel).

const FILES = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
// Estrutura no Drive do usuário: raiz limpa, só a pasta do app; os projetos
// ficam todos dentro de "Noctis Studio- Site/Excalidraw-projects".
const APP_ROOT_NAME = 'Noctis Studio- Site'
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

// Acha uma pasta pelo nome (dentro de parentId, ou na raiz se parentId null);
// cria se não existir. Devolve o id.
async function ensureFolder(name, parentId) {
  const clauses = [`name='${name.replace(/'/g, "\\'")}'`, "mimeType='application/vnd.google-apps.folder'", 'trashed=false', parentId ? `'${parentId}' in parents` : "'root' in parents"]
  const q = encodeURIComponent(clauses.join(' and '))
  const res = await driveFetch(`${FILES}?q=${q}&fields=files(id,name)`)
  const { files } = await res.json()
  if (files?.length) return files[0].id
  return createFolder(name, parentId)
}

// Pasta onde TODOS os projetos ficam: "Noctis Studio- Site/Excalidraw-projects".
// A raiz do Drive só recebe a pasta do app. Resultado cacheado por sessão.
export async function ensureProjectsFolder() {
  if (cachedProjectsFolder) return cachedProjectsFolder
  const appRoot = await ensureFolder(APP_ROOT_NAME, null)
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

// Sobe um JSON (ex.: a "planta" leve da cena) e devolve o id.
export async function uploadJson({ name, data, parentId }) {
  return uploadFile({ name, mimeType: 'application/json', blob: new Blob([JSON.stringify(data)], { type: 'application/json' }), parentId })
}
