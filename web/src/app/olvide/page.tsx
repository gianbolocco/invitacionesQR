'use client'
import { useState } from 'react'
import { api } from '@/lib/api'
import { Button, Field, Wordmark } from '@/components/ui'

export default function OlvidePage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    await api('/auth/forgot', { method: 'POST', body: JSON.stringify({ email }) }).catch(() => {})
    // Mismo mensaje pase lo que pase: no se filtra si el mail está en el padrón.
    setSent(true)
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-8 p-6">
      <Wordmark />
      {sent ? (
        <div>
          <h1 className="display text-xl font-bold">
            Revisá tu mail
          </h1>
          <p className="mt-1 text-ink-soft">
            Si ese mail está en el padrón, te mandamos un link para elegir una contraseña nueva.
            Vence en 15 minutos.
          </p>
        </div>
      ) : (
        <>
          <div>
            <h1 className="display text-2xl font-bold">
              Restablecer contraseña
            </h1>
            <p className="mt-1 text-ink-soft">Te mandamos un link al mail que tenés en el padrón.</p>
          </div>
          <form onSubmit={submit} className="flex flex-col gap-5">
            <Field label="Mail" type="email" autoComplete="email" required
                   value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button type="submit">Enviar link</Button>
          </form>
        </>
      )}
    </main>
  )
}
