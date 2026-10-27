import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { notifyAdmin } from './alerts'
import * as api from './api'
import { ensureReminders, startReminders, stopReminders } from './reminders'
import { go } from './router'

const ALERT_POLL_MS = 30_000

interface Store {
  ready: boolean
  session: api.Session | null
  refresh: () => Promise<void>
  openCamera: () => void
  result: api.SnapResult | null
  setResult: (r: api.SnapResult | null) => void
  /** Admins only: open review items and how many are new. */
  alerts: api.AdminSummary | null
  checkAlerts: () => void
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState<api.Session | null>(null)
  const [result, setResult] = useState<api.SnapResult | null>(null)
  const [alerts, setAlerts] = useState<api.AdminSummary | null>(null)
  const lastUnread = useRef<number | null>(null)
  const isAdmin = !!session?.user.admin

  const refresh = useCallback(async () => {
    setSession(await api.getSession())
  }, [])

  useEffect(() => {
    refresh().then(() => setReady(true))
  }, [refresh])

  const checkAlerts = useCallback(() => {
    api.getAdminSummary().then((s) => {
      if (lastUnread.current !== null && s.unread > lastUnread.current) notifyAdmin(s.unread)
      lastUnread.current = s.unread
      setAlerts(s)
    }, () => {})
  }, [])

  useEffect(() => {
    if (!isAdmin) {
      setAlerts(null)
      lastUnread.current = null
      return
    }
    checkAlerts()
    const timer = setInterval(checkAlerts, ALERT_POLL_MS)
    document.addEventListener('visibilitychange', checkAlerts)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', checkAlerts)
    }
  }, [isAdmin, checkAlerts])

  // Keep a live streak pointer so nudges stop the moment today’s snap lands.
  const streakRef = useRef(session?.user.streak ?? null)
  streakRef.current = session?.user.streak ?? null

  useEffect(() => {
    if (!session || session.user.admin) {
      stopReminders()
      return
    }
    // Reminders are on by default — ask the browser once, then schedule nudges.
    let alive = true
    void ensureReminders().then(() => {
      if (alive) startReminders(() => streakRef.current)
    })
    return () => {
      alive = false
      stopReminders()
    }
  }, [session?.user.id, session?.user.admin])

  return (
    <Ctx.Provider value={{ ready, session, refresh, openCamera: () => go('snap'), result, setResult, alerts, checkAlerts }}>
      {children}
    </Ctx.Provider>
  )
}

export function useStore() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useStore must be inside StoreProvider')
  return ctx
}
