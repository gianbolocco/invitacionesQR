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
    throw new ApiError(res.status, body.error ?? 'unknown')
  }
  return res.status === 204 ? (undefined as T) : res.json()
}

export const apiBase = BASE
