'use client'
import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { api, ApiError, apiBase } from '@/lib/api'
import { homeFor, type Me } from '@/lib/session'
import { abrirSesion } from '@/lib/sesion-contexto'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Campo } from '@/components/dominio/campo'
import { Nota } from '@/components/dominio/nota'
import { CampoContrasena } from '@/components/campo-contrasena'
import { cn } from '@/lib/utils'

const ERROR_GOOGLE: Record<string, string> = {
  not_in_padron: 'Ese mail no está en el padrón del barrio. Pedile el alta a la administración.',
  email_not_verified: 'Google no confirmó ese mail, así que no podemos vincularlo. Entrá con tu contraseña.',
  // Pestaña vieja o un link de vuelta de Google que no arrancó acá: el
  // remedio es empezar de nuevo desde esta pantalla.
  state_invalido: 'Ese intento de entrar con Google ya venció. Volvé a tocar el botón desde acá.',
  google_not_configured: 'El ingreso con Google no está habilitado. Entrá con tu contraseña.',
  google_failed: 'No se pudo entrar con Google. Probá con tu contraseña.',
}

function IconoGoogle() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-[18px]">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.77.42 3.45 1.18 4.94l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.96 10.96 0 0 0 12 1 11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  )
}

function Login() {
  const router = useRouter()
  const qc = useQueryClient()
  const params = useSearchParams()
  const [identificador, setIdentificador] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [google, setGoogle] = useState(false)

  useEffect(() => {
    api<{ enabled: boolean }>('/auth/google/enabled')
      .then((r) => setGoogle(r.enabled))
      .catch(() => {})
  }, [])

  // El error de Google ya está en la URL cuando la página se pinta.
  const errorParam = params.get('error')
  const mensaje = error ?? (errorParam ? ERROR_GOOGLE[errorParam] ?? ERROR_GOOGLE.google_failed : null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api('/auth/login', { method: 'POST', body: JSON.stringify({ identifier: identificador, password }) })
      const yo = await api<Me>('/auth/me')
      abrirSesion(qc, yo)
      router.push(homeFor(yo.role))
    } catch (err) {
      setError(err instanceof ApiError && err.status === 429
        ? 'Demasiados intentos. Esperá 15 minutos o restablecé tu contraseña.'
        : 'El email/usuario o la contraseña no coinciden. Revisalos e intentá de nuevo.')
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-[-0.02em]">Entrá a tu barrio</h1>
        <p className="mt-1 text-sm text-ink-soft">Vecinos y admins entran con su email; guardias, con el usuario que les asignó la administración.</p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-5">
        <Campo id="identificador" etiqueta="Email o usuario">
          <Input id="identificador" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false}
            required value={identificador} placeholder="tu@email.com o cruiz"
            onChange={(e) => setIdentificador(e.target.value)} />
        </Campo>
        <Campo id="clave" etiqueta="Contraseña"
          accesorio={<Link href="/olvide" className="text-sm font-medium text-marca hover:underline">¿La olvidaste?</Link>}>
          <CampoContrasena id="clave" autoComplete="current-password" required
            value={password} onChange={setPassword} />
        </Campo>
        {mensaje && <Nota tono="error">{mensaje}</Nota>}
        <Button type="submit" size="lg" disabled={busy}>
          {busy && <Loader2 className="animate-spin" aria-hidden />}
          {busy ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
      <p className="-mt-3 text-xs text-ink-soft">
        Si sos guardia y no tenés email, pedile a la administración que te restablezca la contraseña.
      </p>

      {google && (
        <>
          <div className="flex items-center gap-3 text-xs text-ink-soft">
            <span className="h-px flex-1 bg-line" />o<span className="h-px flex-1 bg-line" />
          </div>
          <a href={`${apiBase}/auth/google`} className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'w-full')}>
            <IconoGoogle />
            Continuar con Google
          </a>
        </>
      )}
    </div>
  )
}

export default function LoginPage() {
  return <Suspense fallback={null}><Login /></Suspense>
}
