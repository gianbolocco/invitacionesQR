const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

export class ApiError extends Error {
  constructor(public status: number, public code: string) { super(code) }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',          // sin esto la cookie de sesión no viaja
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'unknown' }))
    /*
     * 'forbidden' lo da solo el chequeo de rol de la API: la sesión no es la
     * que esta pantalla cree. Pasa cuando en otra pestaña se entró con otra
     * cuenta (el alta de un vecino abre sesión y pisa la cookie del admin), o
     * cuando alguien escribe /admin a mano. La raíz relee la sesión y lleva a
     * la casa del rol que sea. Los otros 403 (not_your_unit) no entran acá.
     */
    if (res.status === 403 && body.error === 'forbidden' && typeof window !== 'undefined') {
      // Recarga dura, no router: el `me` viejo que tiene en memoria tiene que irse.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = '/'
    }
    throw new ApiError(res.status, body.error ?? 'unknown')
  }
  return res.status === 204 ? (undefined as T) : res.json()
}

export const apiBase = BASE
