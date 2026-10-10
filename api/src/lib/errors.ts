import type { ErrorRequestHandler } from 'express'

export class AppError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message ?? code)
  }
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.code })
    return
  }
  /*
   * Express y sus parsers tiran errores con su propio status: body-parser
   * devuelve 413 cuando el cuerpo pasa el límite y 400 cuando el JSON está
   * roto. Aplanarlos a 500 diría "se rompió el servidor" sobre un pedido mal
   * hecho, y encima esconde los 500 de verdad en el log.
   *
   * Solo se respetan los 4xx. Un 5xx ajeno se sigue registrando y se devuelve
   * como 'internal': no hay que filtrar el mensaje de una librería.
   */
  const ajeno = err as { status?: number; statusCode?: number; type?: string }
  const status = ajeno?.status ?? ajeno?.statusCode
  if (typeof status === 'number' && status >= 400 && status < 500) {
    res.status(status).json({ error: ajeno.type ?? 'bad_request' })
    return
  }

  console.error(err)
  res.status(500).json({ error: 'internal' })
}
