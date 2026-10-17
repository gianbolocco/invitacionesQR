// Capturas del rediseño: node docs/rediseno/capturas.cjs docs/rediseno/antes (o .../despues)
// Requiere el stack levantado y las cuentas e2e sembradas (web/e2e/preparar.ts).
const { chromium } = require(require('path').join(__dirname, '../../web/node_modules/playwright'))
const fs = require('fs')
const path = require('path')

const WEB = 'http://localhost:3000'
const API = 'http://localhost:8080'
const PASS = 'e2e-contrasena-larga'
const CUENTAS = { vecino: 'e2e.vecino@visitpass.test', guardia: 'e2e.guardia@visitpass.test', admin: 'e2e.admin@visitpass.test' }
const OUT = path.resolve(process.argv[2] || 'antes')
const VIEWPORTS = { movil: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, escritorio: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 } }
const TEMAS = { claro: 'claro', oscuro: 'oscuro' }
const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())

fs.mkdirSync(OUT, { recursive: true })
const log = []

async function sesion(browser, quien) {
  const ctx = await browser.newContext()
  const r = await ctx.request.post(`${API}/auth/login`, { data: { identifier: CUENTAS[quien], password: PASS } })
  if (!r.ok()) throw new Error(`login ${quien}: ${r.status()} ${await r.text()}`)
  const state = await ctx.storageState()
  return { ctx, state }
}

async function preparar(browser) {
  const { ctx: v } = await sesion(browser, 'vecino')
  const crear = async (guestName, extra = {}) => {
    const r = await v.request.post(`${API}/invitations`, { data: { kind: 'visita', guestName, validFrom: hoy, validTo: hoy, capacity: 1, ...extra } })
    if (!r.ok()) throw new Error(`crear ${guestName}: ${r.status()} ${await r.text()}`)
    return r.json()
  }
  const me = await (await v.request.get(`${API}/auth/me`)).json()
  const unitId = me.units[0].id
  const vigente = await crear('Juan Pérez', { unitId, guestDoc: '30123456', plate: 'AB123CD' })
  const anulada = await crear('Marta Gómez', { unitId })
  await v.request.post(`${API}/invitations/${anulada.id}/revoke`)
  const adentro = await crear('Carlos Ruiz', { unitId, guestDoc: '28999111' })
  const frecuente = await crear('Rosa Benítez', { unitId, kind: 'frecuente', validTo: addDays(hoy, 90), capacity: 999, weekdays: [1, 3, 5] })
  const { ctx: g } = await sesion(browser, 'guardia')
  const e = await g.request.post(`${API}/gate/entries`, { data: { invitationId: adentro.id, guestName: 'Carlos Ruiz', guestDoc: '28999111' } })
  if (!e.ok()) console.warn('entrada', e.status(), await e.text())
  await v.close(); await g.close()
  return { vigente, anulada, adentro, frecuente }
}

function addDays(iso, n) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

async function capturar(browser, state, rutas, extraCtx = {}) {
  for (const [vpNombre, vp] of Object.entries(VIEWPORTS)) {
    for (const tema of Object.values(TEMAS)) {
      const ctx = await browser.newContext({ ...vp, storageState: state, colorScheme: tema === 'oscuro' ? 'dark' : 'light', locale: 'es-AR', timezoneId: 'America/Argentina/Buenos_Aires', ...extraCtx })
      await ctx.addInitScript((t) => { try { localStorage.setItem('tema', t) } catch {} }, tema)
      const page = await ctx.newPage()
      const errores = []
      page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text().slice(0, 200)) })
      page.on('pageerror', (e) => errores.push('pageerror: ' + e.message.slice(0, 200)))
      for (const r of rutas) {
        errores.length = 0
        try {
          if (r.bloquearApi) await page.route(`${API}/**`, (route) => route.abort())
          await page.goto(WEB + r.url, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {})
          await page.waitForTimeout(r.espera ?? 900)
          if (r.accion) await r.accion(page)
          const archivo = `${r.nombre}--${vpNombre}--${tema}.png`
          await page.screenshot({ path: path.join(OUT, archivo), fullPage: !r.noFull })
          // Desborde horizontal: síntoma de layout roto en pantallas chicas.
          const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
          log.push({ archivo, url: r.url, desborde, errores: [...errores] })
          if (r.bloquearApi) await page.unroute(`${API}/**`)
        } catch (e) { log.push({ archivo: r.nombre, url: r.url, fallo: e.message.slice(0, 200) }) }
      }
      await ctx.close()
    }
  }
}

;(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] })
  const d = await preparar(browser)
  fs.writeFileSync(path.join(OUT, '_datos.json'), JSON.stringify(d, null, 2))

  await capturar(browser, undefined, [
    { nombre: '01-login', url: '/login' },
    { nombre: '02-olvide', url: '/olvide' },
    { nombre: '03-reset-token-invalido', url: '/reset?t=invalido' },
    { nombre: '04-acceso-token-invalido', url: '/acceso?t=invalido' },
    { nombre: '05-invitado-pase', url: `/i/${d.vigente.token}`, espera: 1500 },
    { nombre: '06-invitado-anulada', url: `/i/${d.anulada.token}`, espera: 1500 },
    { nombre: '07-invitado-inexistente', url: '/i/no-existe', espera: 1500 },
    { nombre: '08-no-encontrado', url: '/no-existe-esta-ruta' },
    { nombre: '09-login-error', url: '/login', accion: async (p) => { await p.getByLabel(/mail/i).fill('nadie@x.com'); await p.getByLabel('Contraseña', { exact: true }).fill('mal'); await p.getByRole('button', { name: 'Entrar' }).click(); await p.waitForTimeout(1200) } },
  ])

  const { state: sv } = await sesion(browser, 'vecino')
  await capturar(browser, sv, [
    { nombre: '10-vecino-inicio', url: '/', espera: 1500 },
    { nombre: '11-vecino-nueva', url: '/invitaciones/nueva' },
    { nombre: '12-vecino-nueva-frecuente', url: '/invitaciones/nueva?kind=frecuente' },
    { nombre: '13-vecino-nueva-errores', url: '/invitaciones/nueva', accion: async (p) => { await p.getByRole('button', { name: /crear invitación/i }).click(); await p.waitForTimeout(400) } },
    { nombre: '14-vecino-pase-creado', url: `/invitaciones/${d.vigente.id}?creada=1`, espera: 1500 },
    { nombre: '15-vecino-pase-anulado', url: `/invitaciones/${d.anulada.id}`, espera: 1500 },
    { nombre: '16-vecino-pase-adentro', url: `/invitaciones/${d.adentro.id}`, espera: 1500 },
    { nombre: '17-vecino-pase-frecuente', url: `/invitaciones/${d.frecuente.id}`, espera: 1500 },
    { nombre: '18-vecino-anular-dialogo', url: `/invitaciones/${d.vigente.id}`, espera: 1500, noFull: true, accion: async (p) => { await p.getByRole('button', { name: /anular invitación/i }).click(); await p.waitForTimeout(500) } },
    { nombre: '19-vecino-editar', url: `/invitaciones/${d.vigente.id}/editar`, espera: 1200 },
    { nombre: '20-vecino-historial', url: '/historial', espera: 1500 },
    { nombre: '21-vecino-perfil', url: '/perfil' },
    { nombre: '22-vecino-sin-conexion', url: '/', bloquearApi: true, espera: 4000 },
  ])

  const { state: sg } = await sesion(browser, 'guardia')
  await capturar(browser, sg, [
    { nombre: '30-garita-hoy', url: '/garita', espera: 1800 },
    { nombre: '31-garita-buscar', url: '/garita', espera: 1500, accion: async (p) => { const i = p.getByRole('searchbox').or(p.getByPlaceholder(/buscar|nombre/i)).first(); await i.fill('Pérez'); await p.waitForTimeout(1200) } },
    { nombre: '32-garita-escanear', url: '/garita/escanear', espera: 2500, noFull: true },
    { nombre: '33-veredicto-ingreso', url: `/garita/invitacion/${d.vigente.id}`, espera: 1200 },
    { nombre: '34-veredicto-no-pasa', url: `/garita/invitacion/${d.anulada.id}`, espera: 1200 },
    { nombre: '35-veredicto-egreso', url: `/garita/invitacion/${d.adentro.id}`, espera: 1200 },
    { nombre: '36-garita-autorizar-sin-invitacion', url: '/garita', espera: 1500, noFull: true, accion: async (p) => { await p.getByRole('button', { name: /autorizar sin invitación/i }).click(); await p.waitForTimeout(600) } },
    { nombre: '37-garita-cargar-corte', url: '/garita/cargar', espera: 1200 },
    { nombre: '38-garita-lectora', url: '/garita/lectora', espera: 1200 },
    { nombre: '39-auditoria', url: '/auditoria', espera: 1800 },
  ])
  await capturar(browser, sg, [
    { nombre: '32b-garita-escanear-sin-camara', url: '/garita/escanear', espera: 2500, noFull: true },
  ], { permissions: [] })

  const { state: sa } = await sesion(browser, 'admin')
  await capturar(browser, sa, [
    { nombre: '40-admin-tablero', url: '/admin', espera: 2000 },
    { nombre: '41-admin-vecinos', url: '/admin/vecinos', espera: 1800 },
    { nombre: '42-admin-guardias', url: '/admin/guardias', espera: 1500 },
    { nombre: '43-admin-barrio', url: '/admin/barrio', espera: 1500 },
    { nombre: '44-admin-auditoria', url: '/auditoria', espera: 1800 },
    { nombre: '45-kit', url: '/kit', espera: 1200 },
  ])

  fs.writeFileSync(path.join(OUT, '_log.json'), JSON.stringify(log, null, 2))
  await browser.close()
  const conProblemas = log.filter((l) => l.fallo || l.desborde > 0 || l.errores?.length)
  console.log(`capturas: ${log.length}, con problemas: ${conProblemas.length}`)
})().catch((e) => { console.error(e); process.exit(1) })
