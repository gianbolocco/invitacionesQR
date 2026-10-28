import { buildApp } from './app.js'
import { cerrarTodo } from './lib/eventos.js'
import { avisarPendientes } from './services/avisos.js'

const port = Number(process.env.PORT ?? 8080)
const server = buildApp().listen(port, () => console.log(`API escuchando en :${port}`))

avisarPendientes().catch((e) => console.error('No se pudieron avisar los paquetes pendientes', e))

/*
 * Node como PID 1 de un contenedor ignora SIGTERM si nadie lo atiende, así que
 * cada deploy esperaba los 10 s de gracia y terminaba en un SIGKILL. Ahora deja
 * de aceptar conexiones, termina las que están en curso (un ingreso a medio
 * registrar) y sale. El tope de 5 s es por si alguna no termina nunca.
 */
process.on('SIGTERM', () => {
  cerrarTodo()
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 5000).unref()
})
