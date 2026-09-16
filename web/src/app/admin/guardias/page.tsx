'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useMe } from '@/lib/session'
import { Shell } from '@/components/shell'
import { ESTADO, fecha, useAdminData, type Person } from '@/lib/admin'
import { Button, Field, ErrorNote, Filete, Eyebrow } from '@/components/ui'
import { SkeletonTarjetas, Cargando, Aviso, useAviso, Confirmar } from '@/components/feedback'

export default function GuardiasPage() {
  const me = useMe()
  const { people, cargar } = useAdminData()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useAviso()
  const [porDarDeBaja, setPorDarDeBaja] = useState<Person | null>(null)
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
    setAviso(`Contraseña de ${reseteando.name} cambiada. Si estaba adentro, quedó deslogueado.`)
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
    setPorDarDeBaja(null)
    await api(`/admin/people/${g.id}/disable`, { method: 'POST' })
    setAviso(`${g.name} quedó dado de baja.`)
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

        <Filete className="bg-card p-5">
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
            {aviso && <Aviso>{aviso}</Aviso>}
            <Button type="submit" className="self-start">Dar de alta</Button>
          </form>
        </Filete>

        {people === null && <Cargando><SkeletonTarjetas cantidad={2} /></Cargando>}
        {people !== null && guardias.length === 0 && (
          <Filete className="bg-card px-5 py-8 text-center">
            <p className="text-ink-soft">
              Todavía no hay guardias cargados.<br />
              Sin al menos uno, nadie puede escanear en la barrera.
            </p>
          </Filete>
        )}

        <ul className="flex flex-col gap-2">
          {guardias.map((g) => (
            <li key={g.id}>
              <Filete className={`flex flex-wrap items-center justify-between gap-3 bg-card px-4 py-3
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
                    <Button variant="quiet" onClick={() => setPorDarDeBaja(g)}>Dar de baja</Button>
                  ) : (
                    <Button variant="quiet" onClick={() => reactivar(g)}>Reactivar</Button>
                  )}
                </div>
              </Filete>
              {reseteando?.id === g.id && (
                <form onSubmit={resetear} className="mt-2 flex flex-col gap-3">
                  {/* Cambiar la contraseña cierra las sesiones abiertas. Si el
                      guardia está en la barrera, se queda afuera al instante:
                      el admin tiene que saberlo ANTES de tocar el botón. */}
                  <p className="rounded border-l-4 border-alamo/40 bg-alamo/5 px-3 py-2 text-sm">
                    Si {g.name} está usando la garita ahora, la contraseña nueva lo
                    deja afuera en el acto y va a tener que volver a entrar.
                  </p>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <Field label="Contraseña nueva" type="password" autoFocus value={nuevaClave}
                      onChange={(e) => setNuevaClave(e.target.value)} />
                  </div>
                  <Button type="submit">Guardar</Button>
                  <Button variant="quiet" type="button" onClick={() => setReseteando(null)}>
                    Cancelar
                  </Button>
                  </div>
                </form>
              )}
            </li>
          ))}
        </ul>
      </div>
      {porDarDeBaja && (
        <Confirmar
          titulo={`¿Dar de baja a ${porDarDeBaja.name}?`}
          detalle="No va a poder entrar a la garita. Los ingresos que ya registró quedan igual."
          accion="Dar de baja"
          onConfirmar={() => deshabilitar(porDarDeBaja)}
          onCancelar={() => setPorDarDeBaja(null)}
        />
      )}
    </Shell>
  )
}