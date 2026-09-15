'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useMe } from '@/lib/session'
import { Shell } from '@/components/shell'
import { ESTADO, fecha, useAdminData, type Person } from '@/lib/admin'
import { Button, Field, ErrorNote, Filete, Eyebrow } from '@/components/ui'

export default function UsuariosPage() {
  const me = useMe()
  const { people, units, cargar } = useAdminData()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [unitIds, setUnitIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => { if (me) cargar() }, [me]) // eslint-disable-line react-hooks/exhaustive-deps

  async function alta(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setAviso(null)
    try {
      await api('/admin/people', {
        method: 'POST',
        body: JSON.stringify({ email, name, role: 'resident', unitIds }),
      })
      setAviso(`Le mandamos la invitación a ${email}. Vence en 7 días.`)
      setEmail(''); setName(''); setUnitIds([])
      cargar()
    } catch {
      setError('No se pudo dar de alta. Puede que ese mail ya esté en el padrón.')
    }
  }

  async function reenviar(p: Person) {
    await api(`/admin/people/${p.id}/resend`, { method: 'POST' })
    setAviso(`Reenviamos la invitación a ${p.email}.`)
  }

  async function deshabilitar(p: Person) {
    if (!confirm(`¿Deshabilitar a ${p.name}? No va a poder entrar ni crear invitaciones.`)) return
    await api(`/admin/people/${p.id}/disable`, { method: 'POST' })
    cargar()
  }

  if (!me) return <main className="p-6 text-ink-soft">Cargando…</main>

  const vecinos = (people ?? []).filter((p) => p.role !== 'guard')

  return (
    <Shell me={me}>
      <div className="flex flex-col gap-6">
        <h1 className="display text-2xl">Usuarios</h1>

        <Filete className="bg-white p-5">
          <Eyebrow>Dar de alta un vecino</Eyebrow>
          <form onSubmit={alta} className="mt-4 flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nombre" required value={name} onChange={(e) => setName(e.target.value)} />
              <Field label="Mail" type="email" required value={email}
                hint="Le llega un link para entrar y crear su contraseña."
                onChange={(e) => setEmail(e.target.value)} />
            </div>
            <fieldset>
              <legend className="text-sm font-semibold">Unidades</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {units.map((u) => (
                  <button key={u.id} type="button" aria-pressed={unitIds.includes(u.id)}
                    onClick={() => setUnitIds((s) =>
                      s.includes(u.id) ? s.filter((x) => x !== u.id) : [...s, u.id])}
                    className={`min-h-11 rounded-full border px-4 text-sm font-semibold tabular ${
                      unitIds.includes(u.id)
                        ? 'border-alamo bg-alamo text-white'
                        : 'border-ink/15 text-ink-soft'
                    }`}>
                    {u.label}
                  </button>
                ))}
                {units.length === 0 && (
                  <p className="text-sm text-ink-soft">Cargá unidades primero en la solapa Unidades.</p>
                )}
              </div>
            </fieldset>
            {error && <ErrorNote>{error}</ErrorNote>}
            {aviso && <p role="status" className="text-sm text-alamo">{aviso}</p>}
            <Button type="submit" className="self-start">Dar de alta y enviar invitación</Button>
          </form>
        </Filete>

        {people === null && <p className="text-ink-soft">Cargando…</p>}

        <ul className="flex flex-col gap-2">
          {vecinos.map((p) => (
            <li key={p.id}>
              <Filete className={`flex flex-wrap items-center justify-between gap-3 bg-white px-4 py-3
                ${p.status === 'disabled' ? 'opacity-50' : ''}`}>
                <div className="min-w-0">
                  <p className="font-semibold">
                    {p.name}
                    {p.role === 'admin' && <span className="eyebrow ml-2">Admin</span>}
                  </p>
                  <p className="truncate text-sm text-ink-soft">{p.email}</p>
                  <p className="text-sm text-ink-soft tabular">
                    {p.units.map((u) => u.label).join(' · ') || 'Sin unidad'} · {ESTADO[p.status]}
                    {p.lastLoginAt && ` · entró ${fecha(p.lastLoginAt)}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  {p.status === 'invited' && (
                    <Button variant="quiet" onClick={() => reenviar(p)}>Reenviar</Button>
                  )}
                  {p.status !== 'disabled' && p.id !== me.id && (
                    <Button variant="quiet" onClick={() => deshabilitar(p)}>Deshabilitar</Button>
                  )}
                </div>
              </Filete>
            </li>
          ))}
        </ul>
      </div>
    </Shell>
  )
}
