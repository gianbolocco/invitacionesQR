import { NextRequest, NextResponse } from 'next/server'

/*
 * La CSP sale de acá y no del Caddy porque lleva un nonce por request: Next lo
 * lee de este header y se lo pone a sus scripts inline. Así no hace falta
 * 'unsafe-inline' en script-src. El costo es nulo: el layout ya es force-dynamic.
 *
 * style-src sí lleva 'unsafe-inline': React, Radix y motion escriben atributos
 * style, y eso no se puede firmar con nonce. Un estilo inyectado no ejecuta código.
 *
 * En desarrollo la API vive en otro origen (localhost:8080); en Coolify es /api,
 * el mismo origen, y entra por 'self'.
 */
const api = URL.canParse(process.env.NEXT_PUBLIC_API_URL ?? '')
  ? ` ${new URL(process.env.NEXT_PUBLIC_API_URL!).origin}`
  : ''

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const dev = process.env.NODE_ENV === 'development'
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data:${api}`,
    `connect-src 'self'${api}`,
    "font-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')

  const headers = new Headers(request.headers)
  headers.set('x-nonce', nonce)
  headers.set('Content-Security-Policy', csp)
  const response = NextResponse.next({ request: { headers } })
  response.headers.set('Content-Security-Policy', csp)
  return response
}

export const config = {
  matcher: [
    {
      // Los estáticos (incluido el service worker, que se sirve tal cual) y los prefetch de <Link> no son documentos: no necesitan CSP.
      source: '/((?!_next/static|_next/image|favicon.ico|sw.js|brand/).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
