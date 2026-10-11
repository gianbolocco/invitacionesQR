'use client'
import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Link2Off, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { homeFor, type Me } from '@/lib/session'
import { abrirSesion } from '@/lib/sesion-contexto'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Campo } from '@/components/dominio/campo'
import { Nota } from '@/components/dominio/nota'
import { Vacio } from '@/components/dominio/vacio'
import { CampoContrasena } from '@/components/campo-contrasena'

function Acceso() {
  const router = useRouter()
  const qc = useQueryClient()
  const token = useSearchParams().get('t') ?? ''
  const [name, setName] = useState<string | null>(null)
  const [fallo, setFallo] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [lot, setLot] = useState('')
  const [needsLot, setNeedsLot] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // GET solo mira el token: si el escáner de links del mail pasa por acá, no
  // consume nada y la invitación sigue sirviendo.
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
    if (password.length < 10) { setError('La contraseña necesita al menos 10 caracteres.'); return }
    if (password !== confirmPassword) { setError('Las contraseñas no coinciden.'); return }
    if (needsLot && !lot.trim()) { setError('Escribí el número de tu lote.'); return }
    setBusy(true)
    setError(null)
    try {
      await api('/auth/invite', {
        method: 'POST',
        body: JSON.stringify({ token, password, lot: needsLot ? Number(lot) : undefined }),
      })
      const yo = await api<Me>('/auth/me')
      abrirSesion(qc, yo)
      router.push(homeFor(yo.role))
    } catch {
      setError('Este link ya se usó o venció. Pedile a la administración que te lo reenvíe.')
      setBusy(false)
    }
  }

  if (!token || fallo) {
    return (
      <Vacio icono={Link2Off} titulo="Este link no sirve"
        detalle="Ya se usó o pasaron los 7 días. Pedile a la administración que te reenvíe la invitación."
        accion={<Link href="/login" className={buttonVariants({ variant: 'outline' })}>Ir a entrar</Link>} />
    )
  }

  if (!name) {
    return (
      <div role="status" aria-busy="true" className="flex flex-col gap-4">
        <span className="sr-only">Cargando…</span>
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-56" />
        <Skeleton className="mt-4 h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-[-0.02em]">Hola, {name.split(' ')[0]}</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {needsLot
            ? 'Decinos tu lote y elegí una contraseña. Con eso ya podés invitar.'
            : 'Elegí una contraseña y ya podés gestionar las visitas de tu casa.'}
        </p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-5">
        {needsLot && (
          <Campo id="lote" etiqueta="Número de lote" ayuda="Solo el número. Después solo la administración puede cambiarlo.">
            <Input id="lote" required value={lot} inputMode="numeric" pattern="[0-9]*" placeholder="142"
              className="tabular" aria-describedby="lote-nota"
              onChange={(e) => setLot(e.target.value.replace(/\D/g, ''))} />
          </Campo>
        )}
        <Campo id="clave" etiqueta="Contraseña">
          <CampoContrasena id="clave" autoComplete="new-password" medidor required
            value={password} onChange={setPassword} />
        </Campo>
        <Campo id="confirmar-clave" etiqueta="Confirmar contraseña">
          <CampoContrasena id="confirmar-clave" autoComplete="new-password" required
            value={confirmPassword} onChange={setConfirmPassword} />
        </Campo>
        {error && <Nota tono="error">{error}</Nota>}
        <Button type="submit" size="lg" disabled={busy}>
          {busy && <Loader2 className="animate-spin" aria-hidden />}
          {busy ? 'Entrando…' : 'Crear contraseña y entrar'}
        </Button>
      </form>
    </div>
  )
}

export default function AccesoPage() {
  return <Suspense fallback={null}><Acceso /></Suspense>
}
