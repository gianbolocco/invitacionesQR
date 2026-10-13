import type { Request, RequestHandler, Response } from 'express'

/*
 * Las pantallas de garita abiertas, para avisarles que algo cambió.
 *
 * ponytail: en memoria. Vale porque un despliegue es un barrio y corre UNA
 * API; con varias réplicas, un aviso emitido en una no llega a las garitas
 * conectadas a otra (habría que pasarlo por Postgres LISTEN/NOTIFY o Redis).
 */
const garitas = new Set<Response>()

/**
 * Abre el stream de Server-Sent Events y lo deja abierto. El aviso no lleva
 * datos: la garita vuelve a pedir lo que muestra, que ya trae los permisos y
 * el formato de siempre, y no hay un segundo camino que mantener.
 */
export function escucharAvisos(req: Request, res: Response): void {
  res.set({
    'Content-Type': 'text/event-stream',
    // no-transform: que ningún proxy lo comprima ni lo retenga para comprimir.
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
  })
  res.flushHeaders()
  // Si se corta, el navegador reintenta solo a los 3 s.
  res.write('retry: 3000\n\n')
  garitas.add(res)

  // Un comentario cada 25 s: sin tráfico, los proxies cortan la conexión.
  const latido = setInterval(() => res.write(': latido\n\n'), 25_000)
  req.on('close', () => {
    clearInterval(latido)
    garitas.delete(res)
  })
}

export function avisarGaritas(): void {
  for (const res of garitas) res.write('data: cambio\n\n')
}

/**
 * Avisa después de cualquier escritura que salió bien. Va como middleware en
 * los routers que tocan invitaciones o movimientos, y no llamado desde cada
 * servicio: así una escritura nueva no se puede olvidar de avisar. Avisa de
 * más (un cambio de logo también) y eso solo cuesta una consulta.
 */
export const avisarAlEscribir: RequestHandler = (req, res, next) => {
  if (req.method !== 'GET') {
    res.on('finish', () => { if (res.statusCode < 400) avisarGaritas() })
  }
  next()
}
