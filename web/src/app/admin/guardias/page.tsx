'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useMe } from '@/lib/session'
import { Shell } from '@/components/shell'
import { ESTADO, useAdminData, type Person } from '@/lib/admin'
import { Button, Field, ErrorNote, Filete, Eyebrow } from '@/components/ui'

export default function GuardiasPage() {
  const me = useMe()
  const { people, cargar } = useAdminData()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [reseteando, setReseteando] = useState<Person | null>(null)
  const [nuevaClave, setNuevaClave] = useState('')

  useEffect(() => { if (me) cargar() }, [me]) // eslint-disable-line react-hooks/exhaustive-deps

  async function alta(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setAviso(null)
    if (password.length < 10) {
      setError('La contraseña necesita al menos 10 caracteres.')
      return
    }
    try {
      const creado = await api<{ id: string }>('/admin/people', {
        method: 'POST',
        body: JSON.stringify({ email, name, role: 'guard', unitIds: [] }),
      })
      await api(`/admin/people/${creado.id}/password`, {
        method: 'POST', body: JSON.stringify({ password }),
      })
      setAviso(`Cuenta de garita "${name}" lista. Anotá la contraseña: no se puede volver a ver.`)
      setName(''); setEmail(''); setPassword('')
      cargar()
    } catch {
      setError('No se pudo crear la cuenta. Puede que ese mail ya esté en el padrón.')
    }
  }

  async function resetear(e: React.FormEvent) {
    e.preventDefault()
    if (!reseteando || nuevaClave.length < 10) return
    await api(`/admin/people/${reseteando.id}/password`, {
      method: 'POST', body: JSON.stringify({ password: nuevaClave }),
    })
    setAviso(`Contraseña de "${reseteando.name}" cambiada.`)
    setReseteando(null)
    setNuevaClave('')
  }

  if (!me) return <main className="p-6 text-ink-soft">Cargando…</main>

  const guardias = (people ?? []).filter((p) => p.role === 'guard')

  return (
    <Shell me={me}>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="display text-2xl">Guardias</h1>
          <p className="mt-1 text-ink-soft">
            La cuenta identifica a la garita, no al guardia. Quién registró cada ingreso sale del
            selector de turno en la pantalla.
          </p>
        </div>

        <Filete className="bg-white p-5">
          <Eyebrow>Nueva cuenta de garita</Eyebrow>
          <form onSubmit={alta} className="mt-4 flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Nombre" required value={name} placeholder="Garita principal"
                onChange={(e) => setName(e.target.value)} />
              <Field label="Mail" type="email" required value={email}
                hint="Solo identifica la cuenta. No recibe mails."
                onChange={(e) => setEmail(e.target.value)} />
              <Field label="Contraseña" type="password" required value={password}
                hint="Mínimo 10 caracteres. La setea el admin."
                onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <ErrorNote>{error}</ErrorNote>}
            {aviso && <p role="status" className="text-sm text-alamo">{aviso}</p>}
            <Button type="submit" className="self-start">Crear cuenta</Button>
          </form>
        </Filete>

        <ul className="flex flex-col gap-2">
          {guardias.map((g) => (
            <li key={g.id}>
              <Filete className="flex flex-wrap items-center justify-between gap-3 bg-white px-4 py-3">
                <div>
                  <p className="font-semibold">{g.name}</p>
                  <p className="text-sm text-ink-soft">{g.email} · {ESTADO[g.status]}</p>
                </div>
                <Button variant="quiet" onClick={() => { setReseteando(g); setNuevaClave('') }}>
                  Cambiar contraseña
                </Button>
              </Filete>
              {reseteando?.id === g.id && (
                <form onSubmit={resetear} className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <Field label="Contraseña nueva" type="password" autoFocus value={nuevaClave}
                      onChange={(e) => setNuevaClave(e.target.value)} />
                  </div>
                  <Button type="submit">Guardar</Button>
                  <Button variant="quiet" type="button" onClick={() => setReseteando(null)}>
                    Cancelar
                  </Button>
                </form>
              )}
            </li>
          ))}
          {guardias.length === 0 && people !== null && (
            <p className="text-ink-soft">Todavía no hay cuentas de garita.</p>
          )}
        </ul>
      </div>
    </Shell>
  )
}
