import { useSyncExternalStore } from 'react'
import { subscribe, getState } from './autoCrawl'

// Estado reativo da busca automática (compartilhado por Admin, header chip, runner).
export function useAutoCrawl() {
  return useSyncExternalStore(subscribe, getState, getState)
}
