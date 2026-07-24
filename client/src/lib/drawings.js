import { api } from './api'
import { ensureProjectsFolder, createFolder, uploadJson } from './drive'

// Cria um projeto de desenho (vazio ou com uma cena importada), usado tanto pela
// galeria de Desenhos quanto pela criação de storyboard a partir de um vídeo.
// Se o Drive estiver conectado, grava a pasta + scene.json direto no Drive
// (dentro de "Noctis Studio- Site/Excalidraw-projects"); senão, cai no banco.
// `opts.videoId` liga o storyboard a um vídeo da gestão de canais.
export async function createDrawing(name, { sceneData = null, videoId = null } = {}) {
  const data = sceneData || { elements: [], appState: {}, files: {} }
  let payload = { name, scene: data }
  try {
    const st = await api.drive.status()
    if (st.connected) {
      const projects = await ensureProjectsFolder()
      const folderId = await createFolder(name, projects)
      const driveSceneFileId = await uploadJson({ name: 'scene.json', data, parentId: folderId })
      payload = { name, storage: 'drive', driveFolderId: folderId, driveSceneFileId }
    }
  } catch {
    /* Drive indisponível → cai no banco (payload já tem a cena) */
  }
  if (videoId) payload.videoId = videoId
  const { scene } = await api.excalidraw.create(payload)
  return scene
}
