import { api } from './api'
import { ensureProjectsFolder, createFolder, uploadJson, setDriveOwner } from './drive'

// Cria um projeto de desenho (vazio ou com uma cena importada), usado tanto pela
// galeria de Desenhos quanto pela criação de storyboard a partir de um vídeo.
// Se o Drive estiver conectado, grava a pasta + scene.json direto no Drive; senão,
// cai no banco. `opts.videoId` liga a um vídeo; `opts.owner` (e-mail) cria no
// workspace de outro usuário (grava no Drive do DONO via porteiro).
export async function createDrawing(name, { sceneData = null, videoId = null, owner = null } = {}) {
  setDriveOwner(owner) // null = próprio Drive; e-mail = Drive do dono
  const data = sceneData || { elements: [], appState: {}, files: {} }
  let payload = { name, scene: data }
  try {
    // Próprio: checa o status. Dono (porteiro): tenta direto — se o Drive do dono
    // não estiver acessível, o ensureProjectsFolder lança e caímos no banco.
    const useDrive = owner ? true : (await api.drive.status()).connected
    if (useDrive) {
      const projects = await ensureProjectsFolder()
      const folderId = await createFolder(name, projects)
      const driveSceneFileId = await uploadJson({ name: 'scene.json', data, parentId: folderId })
      payload = { name, storage: 'drive', driveFolderId: folderId, driveSceneFileId }
    }
  } catch {
    /* Drive indisponível → cai no banco (payload já tem a cena) */
  }
  if (videoId) payload.videoId = videoId
  if (owner) payload.owner = owner
  const { scene } = await api.excalidraw.create(payload)
  return scene
}
