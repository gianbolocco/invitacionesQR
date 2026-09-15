'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { api, ApiError } from '@/lib/api'
import { Button, Field, ErrorNote, Wordmark } from '@/components/ui'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
      router.push('/')
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
        {error && <ErrorNote>{error}</ErrorNote>}
        <Button type="submit" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</Button>
      </form>
      <Link href="/olvide" className="text-sm text-alamo underline underline-offset-4">
        Olvidé mi contraseña
      </Link>
    </main>
  )
}
