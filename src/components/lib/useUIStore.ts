import { useEffect, useState } from 'react'
import { uiStore, type UIState } from './uiStore'

export function useUIStore<T>(selector: (s: UIState) => T): T {
  const [value, setValue] = useState<T>(() => selector(uiStore.state))
  useEffect(() => {
    const unsub = uiStore.subscribe(() => {
      setValue(selector(uiStore.state))
    })
    return () => unsub()
  }, [selector])
  return value
}


