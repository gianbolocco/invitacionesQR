'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useMe } from '@/lib/session'
import { Shell } from '@/components/shell'
import { ESTADO, fecha, useAdminData, type Person } from '@/lib/admin'
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
      setAviso(`${name} ya puede entrar. Anotá la contraseña: no se puede volver a ver.`)
      setName(''); setEmail(''); setPassword('')
      cargar()
    } catch {
      setError('No se pudo crear. Puede que ese mail ya esté en el padrón.')
    }
  }

  async function resetear(e: React.FormEvent) {
    e.preventDefault()
    if (!reseteando || nuevaClave.length < 10) return
    await api(`/admin/people/${reseteando.id}/password`, {
      method: 'POST', body: JSON.stringify({ password: nuevaClave }),
    })
    setAviso(`Contraseña de ${reseteando.name} cambiada.`)
    setReseteando(null)
    setNuevaClave('')
    cargar()
  }

  async function reactivar(g: Person) {
    await api(`/admin/people/${g.id}/enable`, { method: 'POST' })
    setAviso(`${g.name} vuelve a poder entrar.`)
    cargar()
  }

  async function deshabilitar(g: Person) {
    if (!confirm(`¿Dar de baja a ${g.name}? No va a poder entrar a la garita.`)) return
    await api(`/admin/people/${g.id}/disable`, { method: 'POST' })
    cargar()
  }

  if (!me) return <main className="p-6 text-ink-soft">Cargando…</main>

  const guardias = (people ?? []).filter((p) => p.role === 'guard')

  return (
    <Shell me={me}>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="display text-2xl">Guardias</h1>
          <p className="mt-1 text-ink-soft">
            Cada guardia entra con su propio usuario. Los ingresos que registra quedan a su
            nombre, así que la contraseña no se comparte entre turnos.
          </p>
        </div>

        <Filete className="bg-white p-5">
          <Eyebrow>Dar de alta un guardia</Eyebrow>
          <form onSubmit={alta} className="mt-4 flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Nombre y apellido" required value={name} placeholder="Carlos Ruiz"
                onChange={(e) => setName(e.target.value)} />
              <Field label="Usuario (mail)" type="email" required value={email}
                placeholder="carlos@alamoalto.com"
                hint="Identifica la cuenta. No hace falta que reciba mails."
                onChange={(e) => setEmail(e.target.value)} />
              <Field label="Contraseña" type="password" required value={password}
                hint="Mínimo 10 caracteres. Se la das vos en mano."
                onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <ErrorNote>{error}</ErrorNote>}
            {aviso && <p role="status" className="text-sm text-alamo">{aviso}</p>}
            <Button type="submit" className="self-start">Dar de alta</Button>
          </form>
        </Filete>

        {people === null && <p className="text-ink-soft">Cargando…</p>}
        {people !== null && guardias.length === 0 && (
          <Filete className="bg-white px-5 py-8 text-center">
            <p className="text-ink-soft">
              Todavía no hay guardias cargados.<br />
              Sin al menos uno, nadie puede escanear en la barrera.
            </p>
          </Filete>
        )}

        <ul className="flex flex-col gap-2">
          {guardias.map((g) => (
            <li key={g.id}>
              <Filete className={`flex flex-wrap items-center justify-between gap-3 bg-white px-4 py-3
                ${g.status === 'disabled' ? 'opacity-50' : ''}`}>
                <div className="min-w-0">
                  <p className="font-semibold">{g.name}</p>
                  <p className="truncate text-sm text-ink-soft">{g.email}</p>
                  <p className="text-sm text-ink-soft tabular">
                    {ESTADO[g.status]}
                    {g.lastLoginAt ? ` · último ingreso ${fecha(g.lastLoginAt)}` : ' · nunca entró'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="quiet" onClick={() => { setReseteando(g); setNuevaClave('') }}>
                    Cambiar contraseña
                  </Button>
                  {g.status !== 'disabled' ? (
                    <Button variant="quiet" onClick={() => deshabilitar(g)}>Dar de baja</Button>
                  ) : (
                    <Button variant="quiet" onClick={() => reactivar(g)}>Reactivar</Button>
                  )}
                </div>
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
        </ul>
      </div>
    </Shell>
  )
}
