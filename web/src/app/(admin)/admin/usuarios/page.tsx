'use client'
import { Fragment, useEffect, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { useMe } from '@/lib/session'
import { Shell } from '@/components/shell'
import { ESTADO, fecha, useAdminData, type Person } from '@/lib/admin'
import { Button, Field, ErrorNote, Filete, Eyebrow } from '@/components/ui'
import { SkeletonFilas, Cargando, Aviso, useAviso, Confirmar } from '@/components/feedback'
import { ImportarVecinos } from '@/components/importar-vecinos'

export default function UsuariosPage() {
  const me = useMe()
  const { people, cargar } = useAdminData()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [lot, setLot] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useAviso()
  const [porDarDeBaja, setPorDarDeBaja] = useState<Person | null>(null)
  const [corrigiendo, setCorrigiendo] = useState<Person | null>(null)
  const [nuevoLote, setNuevoLote] = useState('')

  useEffect(() => { if (me) cargar() }, [me]) // eslint-disable-line react-hooks/exhaustive-deps

  async function alta(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setAviso(null)
    try {
      const { mailEnviado } = await api<{ mailEnviado: boolean }>('/admin/people', {
        method: 'POST',
        body: JSON.stringify({ email, name, role: 'resident', lot: lot ? Number(lot) : undefined }),
      })
      // El alta quedó hecha igual: si el mail no salió, se reenvía desde la lista.
      if (mailEnviado) {
        setAviso(lot
          ? `Le mandamos la invitación a ${email}. El Lote ${lot} ya está asignado.`
          : `Le mandamos la invitación a ${email}. Él carga su lote al entrar.`)
      }
      else setError(`Dimos de alta a ${email}, pero el mail no salió. Probá "Reenviar" en la lista.`)
      setEmail(''); setName(''); setLot('')
      cargar()
    } catch (err) {
      // La API ahora distingue el caso, así que el mensaje puede afirmar en vez
      // de sugerir: "puede que ya esté" deja al admin sin saber qué hacer.
      setError(err instanceof ApiError && err.code === 'mail_repetido'
        ? `${email} ya está en el padrón. Buscalo en la lista de abajo.`
        : 'No se pudo dar de alta. Revisá el mail y probá de nuevo.')
    }
  }

  async function corregirLote(e: React.FormEvent) {
    e.preventDefault()
    if (!corrigiendo || !nuevoLote.trim()) return
    await api(`/admin/people/${corrigiendo.id}/lot`, {
      method: 'POST', body: JSON.stringify({ lot: Number(nuevoLote) }),
    })
    setAviso(`${corrigiendo.name} ahora está en el Lote ${nuevoLote}.`)
    setCorrigiendo(null)
    setNuevoLote('')
    cargar()
  }

  async function reenviar(p: Person) {
    setError(null)
    try {
      await api(`/admin/people/${p.id}/resend`, { method: 'POST' })
      setAviso(`Reenviamos la invitación a ${p.email}.`)
    } catch {
      setError(`No pudimos mandarle el mail a ${p.email}. Probá de nuevo en un rato.`)
    }
  }

  async function reactivar(p: Person) {
    await api(`/admin/people/${p.id}/enable`, { method: 'POST' })
    setAviso(`${p.name} vuelve a tener acceso.`)
    cargar()
  }

  async function deshabilitar(p: Person) {
    setPorDarDeBaja(null)
    await api(`/admin/people/${p.id}/disable`, { method: 'POST' })
    setAviso(`${p.name} quedó dado de baja.`)
    cargar()
  }

  function acciones(p: Person) {
    return (
      <div className="flex flex-wrap gap-2">
        {p.status === 'invited' && (
          <Button type="button" variant="quiet" className="min-h-9 px-3 text-xs" onClick={() => reenviar(p)}>
            Reenviar
          </Button>
        )}
        {p.role === 'resident' && (
          <Button type="button" variant="quiet" className="min-h-9 px-3 text-xs"
            onClick={() => { setCorrigiendo(p); setNuevoLote('') }}>
            Cambiar lote
          </Button>
        )}
        {p.status !== 'disabled' && p.id !== me?.id && (
          <Button type="button" variant="quiet" className="min-h-9 px-3 text-xs" onClick={() => setPorDarDeBaja(p)}>
            Dar de baja
          </Button>
        )}
        {p.status === 'disabled' && (
          <Button type="button" variant="quiet" className="min-h-9 px-3 text-xs" onClick={() => reactivar(p)}>
            Reactivar
          </Button>
        )}
      </div>
    )
  }

  function editorLote(p: Person) {
    if (corrigiendo?.id !== p.id) return null
    return (
      <form onSubmit={corregirLote} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field label="Número de lote" autoFocus value={nuevoLote} className="tabular"
            inputMode="numeric" pattern="[0-9]*" placeholder="142"
            hint="Lo saca de su lote actual y lo pasa a este."
            onChange={(e) => setNuevoLote(e.target.value.replace(/\D/g, ''))} />
        </div>
        <Button type="submit">Guardar</Button>
        <Button variant="quiet" type="button" onClick={() => setCorrigiendo(null)}>
          Cancelar
        </Button>
      </form>
    )
  }

  if (!me) return <main className="p-6 text-ink-soft">Cargando…</main>

  const vecinos = (people ?? []).filter((p) => p.role !== 'guard')

  return (
    <Shell me={me}>
      <div className="flex flex-col gap-6">
        <h1 className="display text-2xl">Vecinos</h1>

        <Filete className="bg-card p-5">
          <Eyebrow>Dar de alta un vecino</Eyebrow>
          <form onSubmit={alta} className="mt-4 flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Nombre" required value={name} onChange={(e) => setName(e.target.value)} />
              <Field label="Mail" type="email" required value={email}
                hint="Le llega un link para activar su cuenta."
                onChange={(e) => setEmail(e.target.value)} />
              <Field label="Lote (opcional)" value={lot} maxLength={5} className="tabular"
                inputMode="numeric" pattern="[0-9]*" placeholder="142"
                hint="Si lo dejás vacío, lo completa al entrar."
                onChange={(e) => setLot(e.target.value.replace(/\D/g, ''))} />
            </div>
            {error && <ErrorNote>{error}</ErrorNote>}
            {aviso && <Aviso>{aviso}</Aviso>}
            <Button type="submit" className="self-start">Dar de alta y enviar invitación</Button>
          </form>
        </Filete>

        <ImportarVecinos onImported={cargar} />

        {people === null && (
          <Cargando>
            <div className="overflow-x-auto rounded-md border border-line p-4">
              <SkeletonFilas cantidad={4} columnas={6} />
            </div>
          </Cargando>
        )}

        <div className="hidden overflow-x-auto rounded-md border border-line md:block">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead className="bg-surface-sunk">
              <tr className="border-b border-line">
                <th className="px-3 py-2"><Eyebrow>Vecino</Eyebrow></th>
                <th className="px-3 py-2"><Eyebrow>Mail</Eyebrow></th>
                <th className="px-3 py-2"><Eyebrow>Lote</Eyebrow></th>
                <th className="px-3 py-2"><Eyebrow>Estado</Eyebrow></th>
                <th className="px-3 py-2"><Eyebrow>Último acceso</Eyebrow></th>
                <th className="px-3 py-2"><Eyebrow>Acciones</Eyebrow></th>
              </tr>
            </thead>
            <tbody>
              {vecinos.map((p) => (
                <Fragment key={p.id}>
                  <tr className={`border-b border-line ${p.status === 'disabled' ? 'opacity-50' : ''}`}>
                    <td className="px-3 py-3 font-semibold">
                      {p.name}{p.role === 'admin' && <span className="eyebrow ml-2">Admin</span>}
                    </td>
                    <td className="px-3 py-3">{p.email}</td>
                    <td className="px-3 py-3 text-ink-soft">
                      {p.units.map((u) => u.label).join(' · ') || 'Sin asignar'}
                    </td>
                    <td className="px-3 py-3">{ESTADO[p.status]}</td>
                    <td className="px-3 py-3 tabular text-ink-soft">{fecha(p.lastLoginAt)}</td>
                    <td className="px-3 py-3">{acciones(p)}</td>
                  </tr>
                  {corrigiendo?.id === p.id && (
                    <tr className="border-b border-line bg-surface-sunk/60">
                      <td colSpan={6} className="px-4 py-3">{editorLote(p)}</td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="divide-y divide-line md:hidden">
          {vecinos.map((p) => (
            <li key={p.id} className={`py-4 ${p.status === 'disabled' ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {p.name}{p.role === 'admin' && <span className="eyebrow ml-2">Admin</span>}
                  </p>
                  <p className="truncate text-sm text-ink-soft">{p.email}</p>
                </div>
                <span className="shrink-0 rounded-full border border-line px-2 py-1 text-xs">{ESTADO[p.status]}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-soft">
                <span>{p.units.map((u) => u.label).join(' · ') || 'Lote sin asignar'}</span>
                {p.lastLoginAt && <span>Último acceso: {fecha(p.lastLoginAt)}</span>}
              </div>
              <div className="mt-3">{acciones(p)}</div>
              {corrigiendo?.id === p.id && <div className="mt-3 border-t border-line pt-3">{editorLote(p)}</div>}
            </li>
          ))}
        </ul>
      </div>
      {porDarDeBaja && (
        <Confirmar
          titulo={`¿Dar de baja a ${porDarDeBaja.name}?`}
          detalle="No va a poder entrar, y las invitaciones vigentes que creó quedan anuladas. Se puede reactivar después."
          accion="Dar de baja"
          onConfirmar={() => deshabilitar(porDarDeBaja)}
          onCancelar={() => setPorDarDeBaja(null)}
        />
      )}
    </Shell>
  )
}
