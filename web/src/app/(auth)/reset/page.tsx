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
import { Skeleton } from '@/components/ui/skeleton'
import { Campo } from '@/components/dominio/campo'
import { Nota } from '@/components/dominio/nota'
import { Vacio } from '@/components/dominio/vacio'
import { CampoContrasena } from '@/components/campo-contrasena'

function Reset() {
  const router = useRouter()
  const qc = useQueryClient()
  const token = useSearchParams().get('t') ?? ''
  const [name, setName] = useState<string | null>(null)
  const [fallo, setFallo] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
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
    if (password.length < 10) { setError('La contraseña necesita al menos 10 caracteres.'); return }
    if (password !== confirmPassword) { setError('Las contraseñas no coinciden.'); return }
    setBusy(true)
    setError(null)
    try {
      await api('/auth/reset', { method: 'POST', body: JSON.stringify({ token, password }) })
      const yo = await api<Me>('/auth/me')
      abrirSesion(qc, yo)
      router.push(homeFor(yo.role))
    } catch {
      setError('Este link ya se usó o venció. Pedí uno nuevo desde "Olvidé mi contraseña".')
      setBusy(false)
    }
  }

  if (!token || fallo) {
    return (
      <Vacio icono={Link2Off} titulo="Este link no sirve"
        detalle="Los links de contraseña duran 15 minutos. Pedí uno nuevo."
        accion={<Link href="/olvide" className={buttonVariants()}>Pedir otro link</Link>} />
    )
  }

  if (!name) {
    return (
      <div role="status" aria-busy="true" className="flex flex-col gap-4">
        <span className="sr-only">Cargando…</span>
        <Skeleton className="h-7 w-48" />
        <Skeleton className="mt-4 h-11 w-full" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl font-extrabold tracking-[-0.02em]">Nueva contraseña, {name.split(' ')[0]}</h1>
      <form onSubmit={submit} className="flex flex-col gap-5">
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
          {busy ? 'Guardando…' : 'Guardar y entrar'}
        </Button>
      </form>
    </div>
  )
}

export default function ResetPage() {
  return <Suspense fallback={null}><Reset /></Suspense>
}
