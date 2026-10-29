// Apple revoca la suscripción push si un push no muestra nada: en dispositivos
// Apple la notificación del sistema se muestra siempre, aunque la app esté a la
// vista. iPadOS 13+ se presenta con UA de Mac (y el worker no tiene
// maxTouchPoints), así que Macintosh entra; Safari en Mac sigue la misma regla
// y un aviso duplicado ahí es inofensivo. Los navegadores de terceros se excluyen.
const ua = self.navigator.userAgent
const apple = /iPhone|iPad|iPod|Macintosh/.test(ua) && !/Chrome|CriOS|Firefox|FxiOS|Edg/.test(ua)

self.addEventListener('push', (e) => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { d = {} }
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => {
    // Con la app a la vista, el aviso en vivo ya se mostró: no duplicar.
    if (!apple && ws.some((w) => w.visibilityState === 'visible')) return
    return self.registration.showNotification(d.titulo || 'Pazzit', { body: d.cuerpo, icon: '/icon/192', data: { url: d.url || '/' } })
  }))
})
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = e.notification.data.url
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => {
    if (!ws[0]) return self.clients.openWindow(url)
    return ws[0].focus().then((c) => c.navigate(url).catch(() => {}))
  }))
})
