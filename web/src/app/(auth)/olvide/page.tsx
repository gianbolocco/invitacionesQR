'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, MailCheck } from 'lucide-react'
import { api } from '@/lib/api'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Campo } from '@/components/dominio/campo'
import { Vacio } from '@/components/dominio/vacio'

export default function OlvidePage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    await api('/auth/forgot', { method: 'POST', body: JSON.stringify({ email }) }).catch(() => {})
    // Mismo mensaje pase lo que pase: no se filtra si el mail está en el padrón.
    setSent(true)
  }

  if (sent) {
    return (
      <Vacio icono={MailCheck} titulo="Revisá tu mail"
        detalle="Si ese mail está en el padrón, te mandamos un link para elegir una contraseña nueva. Vence en 15 minutos."
        accion={<Link href="/login" className={buttonVariants({ variant: 'outline' })}>Volver a entrar</Link>} />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-[-0.02em]">Restablecer contraseña</h1>
        <p className="mt-1 text-sm text-ink-soft">Te mandamos un link al mail que tenés en el padrón.</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <Campo id="mail" etiqueta="Mail">
          <Input id="mail" type="email" autoComplete="email" required value={email}
            onChange={(e) => setEmail(e.target.value)} />
        </Campo>
        <Button type="submit" size="lg" disabled={busy}>
          {busy && <Loader2 className="animate-spin" aria-hidden />}
          Enviar link
        </Button>
      </form>
      <Link href="/login" className={buttonVariants({ variant: 'ghost', className: 'self-start' })}>
        <ArrowLeft aria-hidden />Volver
      </Link>
    </div>
  )
}
