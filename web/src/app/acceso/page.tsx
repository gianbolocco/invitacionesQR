'use client'
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { api } from '@/lib/api'
import { homeFor, type Me } from '@/lib/session'
import { Button, Field, ErrorNote, Wordmark } from '@/components/ui'

function Acceso() {
  const router = useRouter()
  const token = useSearchParams().get('t') ?? ''
  const [name, setName] = useState<string | null>(null)
  const [fallo, setFallo] = useState(false)
  const [password, setPassword] = useState('')
  const [lot, setLot] = useState('')
  const [needsLot, setNeedsLot] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // GET: solo mira el token. Si el escáner de links del cliente de mail pasa
  // por acá, no consume nada y la invitación sigue sirviendo.
  useEffect(() => {
    if (!token) return
    api<{ name: string }>(`/auth/invite/${token}`)
      .then((r) => setName(r.name))
      .catch(() => setFallo(true))
    api<{ needsLot: boolean }>(`/auth/invite/${token}/needs-lot`)
      .then((r) => setNeedsLot(r.needsLot))
      .catch(() => {})
  }, [token])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 10) {
      setError('La contraseña necesita al menos 10 caracteres.')
      return
    }
    if (needsLot && !lot.trim()) {
      setError('Escribí el número de tu lote.')
      return
    }
    setBusy(true)
    try {
      await api('/auth/invite', {
        method: 'POST',
        body: JSON.stringify({ token, password, lot: needsLot ? Number(lot) : undefined }),
      })
      const yo = await api<Me>('/auth/me')
      router.push(homeFor(yo.role))
    } catch {
      setError('Este link ya se usó o venció. Pedile a la administración que te lo reenvíe.')
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
        <p className="text-ink-soft">
          Ya se usó o pasaron los 7 días. Pedile a la administración que te reenvíe la invitación.
        </p>
      </main>
    )
  }

  if (!name) return <main className="p-6 text-ink-soft">Cargando…</main>

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-8 p-6">
      <Wordmark />
      <div>
        <h1 className="display text-2xl font-bold">
          Hola {name}
        </h1>
        <p className="mt-1 text-ink-soft">
          {needsLot
            ? 'Decinos tu lote y elegí una contraseña. Con eso ya podés gestionar las visitas.'
            : 'Elegí una contraseña y ya podés gestionar las visitas de tu casa.'}
        </p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-5">
        {needsLot && (
          <Field label="Número de lote" required value={lot} className="tabular"
                 inputMode="numeric" pattern="[0-9]*" placeholder="142"
                 hint="Solo el número. Después solo la administración puede cambiarlo."
                 onChange={(e) => setLot(e.target.value.replace(/\D/g, ''))} />
        )}
        <Field label="Contraseña" type="password" autoComplete="new-password"
               hint="Mínimo 10 caracteres. No hace falta que tenga símbolos raros."
               value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <ErrorNote>{error}</ErrorNote>}
        <Button type="submit" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</Button>
      </form>
    </main>
  )
}

export default function AccesoPage() {
  return <Suspense fallback={<main className="p-6 text-ink-soft">Cargando…</main>}><Acceso /></Suspense>
}
