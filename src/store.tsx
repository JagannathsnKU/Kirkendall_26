import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import * as api from './api'
import { go } from './router'

interface Store {
  ready: boolean
  session: api.Session | null
  refresh: () => Promise<void>
  openCamera: () => void
  result: api.SnapResult | null
  setResult: (r: api.SnapResult | null) => void
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState<api.Session | null>(null)
  const [result, setResult] = useState<api.SnapResult | null>(null)

  const refresh = useCallback(async () => {
    setSession(await api.getSession())
  }, [])

  useEffect(() => {
    refresh().then(() => setReady(true))
  }, [refresh])

  return (
    <Ctx.Provider value={{ ready, session, refresh, openCamera: () => go('snap'), result, setResult }}>{children}</Ctx.Provider>
  )
}

export function useStore() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useStore must be inside StoreProvider')
  return ctx
}
