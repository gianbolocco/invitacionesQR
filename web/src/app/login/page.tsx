'use client'
import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { api, ApiError, apiBase } from '@/lib/api'
import { homeFor, type Me } from '@/lib/session'
import { Button, Field, ErrorNote, Wordmark } from '@/components/ui'

const ERROR_GOOGLE: Record<string, string> = {
  not_in_padron: 'Ese mail no está en el padrón de Álamo Alto. Pedile el alta a la administración.',
  email_not_verified: 'Google no confirmó ese mail, así que no podemos vincularlo. Entrá con tu contraseña.',
  google_failed: 'No se pudo entrar con Google. Probá con tu contraseña.',
}

function Login() {
  const router = useRouter()
  const params = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [google, setGoogle] = useState(false)

  useEffect(() => {
    api<{ enabled: boolean }>('/auth/google/enabled')
      .then((r) => setGoogle(r.enabled))
      .catch(() => {})
  }, [])

  // El error que vuelve del callback de Google se deriva en render, no en un
  // efecto: ya está en la URL cuando la página se pinta.
  const errorParam = params.get('error')
  const mensaje = error ?? (errorParam
    ? ERROR_GOOGLE[errorParam] ?? ERROR_GOOGLE.google_failed
    : null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
      const yo = await api<Me>('/auth/me')
      router.push(homeFor(yo.role))
    } catch (err) {
      setError(err instanceof ApiError && err.status === 429
        ? 'Demasiados intentos. Esperá 15 minutos o restablecé tu contraseña.'
        : 'El mail o la contraseña no coinciden. Revisalos e intentá de nuevo.')
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-8 p-6">
      <Wordmark />
      <form onSubmit={submit} className="flex flex-col gap-5">
        <Field label="Mail" type="email" autoComplete="email" required
               value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field label="Contraseña" type="password" autoComplete="current-password" required
               value={password} onChange={(e) => setPassword(e.target.value)} />
        {mensaje && <ErrorNote>{mensaje}</ErrorNote>}
        <Button type="submit" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</Button>
      </form>

      {google && (
        <a href={`${apiBase}/auth/google`}
          className="inline-flex min-h-12 items-center justify-center rounded border
            border-alamo/30 px-5 font-semibold text-alamo">
          Continuar con Google
        </a>
      )}

      <Link href="/olvide" className="text-sm text-alamo underline underline-offset-4">
        Olvidé mi contraseña
      </Link>
    </main>
  )
}

export default function LoginPage() {
  return <Suspense fallback={<main className="p-6 text-ink-soft">Cargando…</main>}><Login /></Suspense>
}
