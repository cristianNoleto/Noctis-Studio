// Cache local (IndexedDB) das imagens dos storyboards, por driveFileId. A 1ª vez
// baixa do Drive; nas próximas aberturas carrega INSTANTÂNEO do cache (o Drive
// continua sendo a fonte da verdade). Tudo best-effort: se o IndexedDB falhar
// (quota, modo privado), simplesmente não cacheia — o app segue baixando do Drive.

const DB_NAME = 'noctis-img-cache'
const STORE = 'imgs'
let dbPromise = null

function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no-idb'))
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  }).catch((e) => {
    dbPromise = null
    throw e
  })
  return dbPromise
}

// Devolve o Blob cacheado (ou null se não tiver).
export async function getCachedImage(key) {
  if (!key) return null
  try {
    const db = await openDB()
    return await new Promise((resolve) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
      req.onsuccess = () => resolve(req.result instanceof Blob ? req.result : null)
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

// Guarda o Blob no cache (best-effort).
export async function putCachedImage(key, blob) {
  if (!key || !(blob instanceof Blob)) return
  try {
    const db = await openDB()
    await new Promise((resolve) => {
      const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put(blob, key)
      req.onsuccess = () => resolve()
      req.onerror = () => resolve() // quota/erro → ignora, segue sem cache
    })
  } catch {
    /* ignora */
  }
}
