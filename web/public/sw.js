self.addEventListener('push', (e) => {
  const d = e.data ? e.data.json() : {}
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => {
    // Con la app a la vista, el aviso en vivo ya se mostró: no duplicar.
    if (ws.some((w) => w.visibilityState === 'visible')) return
    return self.registration.showNotification(d.titulo, { body: d.cuerpo, icon: '/icon/192', data: { url: d.url || '/' } })
  }))
})
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((ws) => ws[0] ? ws[0].focus() : self.clients.openWindow(e.notification.data.url)))
})
