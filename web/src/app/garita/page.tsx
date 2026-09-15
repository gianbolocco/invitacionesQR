'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { api } from '@/lib/api'
import { useMe, logout } from '@/lib/session'
import { KIND_LABEL, type Invitation } from '@/lib/invitations'

type Check = { ok: true } | { ok: false; reason: string }

type Resultado = {
  invitation: Pick<Invitation,
    'id' | 'kind' | 'guestName' | 'guestDoc' | 'plate' | 'validFrom' | 'validTo' | 'capacity' | 'unitLabel'>
  check: Check
  usedCount: number
  lastEntryAt: string | null
}

type Hit = { id: string; guestName: string; unitLabel: string; plate: string | null }

const MOTIVO: Record<string, string> = {
  revoked: 'La anularon',
  not_yet: 'Todavía no empieza',
  expired: 'Venció',
  wrong_weekday: 'Hoy no está habilitado',
  no_capacity: 'Cupo agotado',
}

function hora(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso))
}

/** Oscuro entre las 19 y las 7: una pantalla blanca a las 3am encandila y el
 *  guardia termina bajando el brillo hasta no ver nada de día. */
function esDeNoche(): boolean {
  const h = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', hour12: false,
  }).format(new Date()))
  return h >= 19 || h < 7
}

export default function GaritaPage() {
  const me = useMe()
  const [oscuro, setOscuro] = useState(false)
  const [guards, setGuards] = useState<{ id: string; name: string }[]>([])
  const [guardId, setGuardId] = useState('')
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [doc, setDoc] = useState('')
  const [plate, setPlate] = useState('')
  const [camaraError, setCamaraError] = useState(false)
  const buscadorRef = useRef<HTMLInputElement>(null)
  const registrarRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setOscuro(esDeNoche())
    const t = setInterval(() => setOscuro(esDeNoche()), 600_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!me) return
    api<typeof guards>('/gate/guards').then(setGuards).catch(() => {})
    setGuardId(localStorage.getItem('guardiaDeTurno') ?? '')
  }, [me])

  const mostrar = useCallback((r: Resultado) => {
    setResultado(r)
    setDoc(r.invitation.guestDoc ?? '')
    setPlate(r.invitation.plate ?? '')
    setHits([])
    // El foco salta al botón: Enter registra sin tocar el mouse.
    setTimeout(() => registrarRef.current?.focus(), 50)
  }, [])

  // El escáner corre permanentemente mientras no haya un resultado en pantalla.
  useEffect(() => {
    if (!me || resultado) return
    const scanner = new Html5Qrcode('reader')
    let vivo = true

    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: 260 },
      async (texto) => {
        const token = texto.split('/i/')[1] ?? texto
        const r = await api<Resultado>(`/gate/check/${token}`).catch(() => null)
        if (r && vivo) mostrar(r)
      },
      () => {},
    ).catch(() => setCamaraError(true))

    return () => {
      vivo = false
      scanner.stop().catch(() => {})
    }
  }, [me, resultado, mostrar])

  async function buscar(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setHits(await api<Hit[]>(`/gate/search?q=${encodeURIComponent(query)}`).catch(() => []))
  }

  // La búsqueda manual cae en el MISMO resultado que el QR. No es un flujo aparte.
  async function abrir(id: string) {
    const r = await api<Resultado>(`/gate/invitation/${id}`).catch(() => null)
    if (r) mostrar(r)
  }

  async function registrar() {
    if (!resultado) return
    await api('/gate/entries', {
      method: 'POST',
      body: JSON.stringify({
        invitationId: resultado.invitation.id,
        guardId: guardId || null,
        guestName: resultado.invitation.guestName,
        guestDoc: doc || undefined,
        plate: plate || undefined,
      }),
    }).catch(() => {})
    volver()
  }

  function volver() {
    setResultado(null)
    setQuery('')
    setDoc('')
    setPlate('')
    setTimeout(() => buscadorRef.current?.focus(), 50)
  }

  // Escape siempre vuelve. En la barrera no hay tiempo para buscar un botón.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && resultado) volver() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [resultado])

  if (!me) return <main className="p-6">Cargando…</main>

  if (me.role !== 'guard' && me.role !== 'admin') {
    return (
      <main className="p-6">
        <p>Esta pantalla es de la garita.</p>
      </main>
    )
  }

  /* ---------- Veredicto: la pantalla ENTERA es la respuesta ---------- */
  if (resultado) {
    const ok = resultado.check.ok
    const { invitation: inv } = resultado

    return (
      <main
        className={`flex min-h-dvh flex-col justify-between p-8 ${
          ok ? 'bg-pass-field text-pass-ink' : 'bg-deny-field text-deny-ink'
        }`}
        // aria-live para que un lector de pantalla anuncie el veredicto solo.
        aria-live="assertive"
      >
        <div>
          <div className="flex items-center gap-4">
            {/* Ícono + palabra + luminancia del campo: tres canales, ninguno es el color. */}
            <span aria-hidden className="text-6xl leading-none">{ok ? '✓' : '✕'}</span>
            <h1 className="display text-7xl sm:text-8xl">{ok ? 'PASA' : 'NO PASA'}</h1>
          </div>

          {!ok && (
            <p className="mt-3 text-3xl font-semibold">
              {MOTIVO[(resultado.check as { reason: string }).reason] ?? 'Rechazado'}
              {resultado.lastEntryAt && (resultado.check as { reason: string }).reason === 'no_capacity' && (
                <span className="tabular"> · ya entró a las {hora(resultado.lastEntryAt)}</span>
              )}
            </p>
          )}

          <p className="mt-8 text-4xl font-semibold">{inv.guestName}</p>
          <p className="mt-1 text-2xl opacity-80 tabular">
            {inv.unitLabel} · {KIND_LABEL[inv.kind]}
            {inv.capacity > 1 && ` · ${resultado.usedCount} de ${inv.capacity} entraron`}
          </p>
        </div>

        {ok ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-4">
              <label className="flex flex-1 flex-col gap-1 text-lg font-semibold">
                DNI
                <input value={doc} onChange={(e) => setDoc(e.target.value)} inputMode="numeric"
                  className="tabular min-h-16 rounded border-2 border-pass-ink/25 bg-white px-4 text-2xl" />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-lg font-semibold">
                Patente
                <input value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())}
                  className="tabular min-h-16 rounded border-2 border-pass-ink/25 bg-white px-4 text-2xl" />
              </label>
            </div>
            <button ref={registrarRef} onClick={registrar}
              className="min-h-20 rounded bg-pass-ink text-2xl font-bold text-pass-field">
              Registrar ingreso
            </button>
            <button onClick={volver} className="text-lg underline underline-offset-4 opacity-70">
              Cancelar (Esc)
            </button>
          </div>
        ) : (
          <button ref={registrarRef} onClick={volver}
            className="min-h-20 rounded border-2 border-deny-ink/40 text-2xl font-bold">
            Volver (Esc)
          </button>
        )}
      </main>
    )
  }

  /* ---------- Reposo: escanear y buscar ---------- */
  return (
    <main className={`min-h-dvh ${oscuro ? 'bg-alamo-deep text-alamo-line' : 'bg-surface text-ink'}`}>
      <div className="mx-auto grid max-w-6xl gap-6 p-6 lg:grid-cols-2">
        <header className="flex items-center justify-between lg:col-span-2">
          <p className="eyebrow" style={{ color: 'inherit', opacity: 0.7 }}>Garita · Álamo Alto</p>
          <div className="flex items-center gap-4">
            <button onClick={() => setOscuro((v) => !v)} className="text-sm underline underline-offset-4">
              {oscuro ? 'Modo claro' : 'Modo oscuro'}
            </button>
            <button onClick={logout} className="text-sm underline underline-offset-4">Salir</button>
          </div>
        </header>

        <section className="flex flex-col gap-4">
          <div id="reader" className="aspect-square w-full overflow-hidden rounded border
            border-current/20 bg-black" />
          {camaraError && (
            <p role="alert" className="text-sm">
              No se pudo abrir la cámara. Buscá por apellido, unidad o patente acá al lado.
            </p>
          )}
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Guardia de turno
            <select value={guardId}
              onChange={(e) => { setGuardId(e.target.value); localStorage.setItem('guardiaDeTurno', e.target.value) }}
              className="min-h-14 rounded border border-current/25 bg-white px-3 text-lg text-ink">
              <option value="">Sin asignar</option>
              {guards.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
        </section>

        <section className="flex flex-col gap-4">
          <form onSubmit={buscar} className="flex flex-col gap-2">
            <label htmlFor="q" className="text-lg font-semibold">Buscar</label>
            <div className="flex gap-2">
              <input id="q" ref={buscadorRef} autoFocus value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Apellido, unidad o patente"
                className="min-h-16 flex-1 rounded border border-current/25 bg-white px-4 text-xl text-ink" />
              <button className="min-h-16 rounded bg-alamo px-6 text-lg font-semibold text-white">
                Buscar
              </button>
            </div>
          </form>

          <ul className="flex flex-col gap-2">
            {hits.map((h) => (
              <li key={h.id}>
                <button onClick={() => abrir(h.id)}
                  className="min-h-16 w-full rounded border border-current/20 px-4 text-left text-lg">
                  <span className="font-semibold">{h.guestName}</span>
                  <span className="opacity-70 tabular"> · {h.unitLabel}{h.plate && ` · ${h.plate}`}</span>
                </button>
              </li>
            ))}
          </ul>

          {hits.length === 0 && query && (
            <p className="opacity-70">Sin resultados. Probá con el apellido o la unidad.</p>
          )}
        </section>
      </div>
    </main>
  )
}
