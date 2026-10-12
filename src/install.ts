import { useEffect, useState } from 'react'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferred = e as InstallPromptEvent
  listeners.forEach((l) => l())
})

window.addEventListener('appinstalled', () => {
  deferred = null
  listeners.forEach((l) => l())
})

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)

/** 'prompt' when the browser can install directly, 'ios' for manual Add to Home Screen, null if installed/unsupported. */
export function useInstall() {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force((n) => n + 1)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])
  const mode: 'prompt' | 'ios' | null = isStandalone() ? null : deferred ? 'prompt' : isIOS() ? 'ios' : null
  const install = async () => {
    if (!deferred) return
    await deferred.prompt()
    deferred = null
    force((n) => n + 1)
  }
  return { mode, install }
}
