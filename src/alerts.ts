/*
 * Admin alerts. While the app is open (or in the background on Android), new
 * review items pop a system notification. iPhone needs the app installed to
 * the Home Screen before it will ask for permission.
 */

export const alertsSupported = typeof window !== 'undefined' && 'Notification' in window

export const alertsOn = () => alertsSupported && Notification.permission === 'granted'

export async function enableAlerts() {
  if (!alertsSupported) return false
  return (await Notification.requestPermission()) === 'granted'
}

export async function notifyAdmin(unread: number) {
  if (!alertsOn()) return
  const title = 'EcoU admin'
  const options: NotificationOptions = {
    body: `${unread} new ${unread === 1 ? 'item needs' : 'items need'} review`,
    tag: 'ecou-admin',
    icon: '/icons/icon-192.png',
    data: { url: '/#/admin' },
  }
  const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined
  if (reg) await reg.showNotification(title, options)
  else new Notification(title, options)
}
