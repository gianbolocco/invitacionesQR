import type { Response } from 'express'

// ponytail: hub en memoria, alcanza con un proceso por barrio; con réplicas, pg LISTEN/NOTIFY.
const conexiones = new Map<string, Set<Response>>()

export function suscribir(personId: string, res: Response) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
  // Escribir en un socket reseteado emite 'error'; sin manejador tumbaría el proceso.
  res.on('error', () => {})
  res.write(': hola\n\n')
  const set = conexiones.get(personId) ?? new Set()
  set.add(res); conexiones.set(personId, set)
  // Un comentario cada 25 s: sin tráfico, los proxies cortan la conexión.
  const latido = setInterval(() => res.write(': latido\n\n'), 25_000)
  res.on('close', () => { clearInterval(latido); set.delete(res); if (!set.size) conexiones.delete(personId) })
}

export function emitir(personId: string, evento: string, datos: unknown) {
  for (const res of conexiones.get(personId) ?? []) res.write(`event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`)
}

export const conexionesDe = (personId: string) => conexiones.get(personId)?.size ?? 0

/** Al apagar: sin esto `server.close` espera a que el navegador corte. */
export function cerrarTodo() { for (const set of conexiones.values()) for (const res of set) res.end(); conexiones.clear() }
