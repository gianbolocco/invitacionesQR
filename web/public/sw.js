// Apple revoca la suscripción push si un push no muestra nada: en iPhone la
// notificación del sistema se muestra siempre, aunque la app esté a la vista.
const esIos = /iPhone|iPad|iPod/.test(self.navigator.userAgent)

self.addEventListener('push', (e) => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { d = {} }
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => {
    // Con la app a la vista, el aviso en vivo ya se mostró: no duplicar.
    if (!esIos && ws.some((w) => w.visibilityState === 'visible')) return
    return self.registration.showNotification(d.titulo || 'Pazzit', { body: d.cuerpo, icon: '/icon/192', tag: d.url || '/', data: { url: d.url || '/' } })
  }))
})
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = e.notification.data.url
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => {
    if (!ws[0]) return self.clients.openWindow(url)
    return ws[0].focus().then((c) => c.navigate(url))
  }))
})
