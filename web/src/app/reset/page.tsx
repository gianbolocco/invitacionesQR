'use client'
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { api } from '@/lib/api'
import { Button, Field, ErrorNote, Wordmark } from '@/components/ui'

function Reset() {
  const router = useRouter()
  const token = useSearchParams().get('t') ?? ''
  const [name, setName] = useState<string | null>(null)
  const [fallo, setFallo] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Igual que en /acceso: el GET mira, el POST consume.
  useEffect(() => {
    if (!token) return
        api<{ name: string }>(`/auth/reset/${token}`)
      .then((r) => setName(r.name))
      .catch(() => setFallo(true))
  }, [token])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 10) {
      setError('La contraseña necesita al menos 10 caracteres.')
      return
    }
    setBusy(true)
    try {
      await api('/auth/reset', { method: 'POST', body: JSON.stringify({ token, password }) })
      router.push('/')
    } catch {
      setError('Este link ya se usó o venció. Pedí uno nuevo desde "Olvidé mi contraseña".')
      setBusy(false)
    }
  }

  // Se deriva en render: el token está en la URL antes del primer pintado.
  const invalid = !token || fallo

  if (invalid) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 p-6">
        <Wordmark />
        <h1 className="display text-xl font-bold">
          Este link no sirve
        </h1>
        <p className="text-ink-soft">Los links de contraseña duran 15 minutos. Pedí uno nuevo.</p>
        <Button onClick={() => router.push('/olvide')}>Pedir otro link</Button>
      </main>
    )
  }

  if (!name) return <main className="p-6 text-ink-soft">Cargando…</main>

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-8 p-6">
      <Wordmark />
      <h1 className="display text-2xl font-bold">
        Nueva contraseña, {name}
      </h1>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <Field label="Contraseña" type="password" autoComplete="new-password"
               hint="Mínimo 10 caracteres."
               value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <ErrorNote>{error}</ErrorNote>}
        <Button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar y entrar'}</Button>
      </form>
    </main>
  )
}

export default function ResetPage() {
  return <Suspense fallback={<main className="p-6 text-ink-soft">Cargando…</main>}><Reset /></Suspense>
}
