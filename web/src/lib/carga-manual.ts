/**
 * La carga manual de movimientos: armar y validar en la pantalla lo mismo que
 * valida la API, para decirle al guardia qué corregir antes de mandar la tanda.
 * Sin imports de la app: lo corre `carga-manual.check.ts` con node.
 */

/** Argentina no tiene horario de verano desde 2009: Buenos Aires es siempre UTC-3. */
const OFFSET_BA = '-03:00'
/** Mismo límite que api/src/services/entries.ts (VENTANA_MANUAL_H). */
export const VENTANA_HORAS = 48

export type Momento = { fecha: string; hora: string }

export type Carga = {
  /** Para quitarla de la tanda: la misma persona puede tener dos cargas. */
  clave: string
  invitationId: string
  guestName: string
  unitLabel: string
  entrada: Momento
  /** null = todavía está adentro. */
  salida: Momento | null
  nota: string
}

/** 'YYYY-MM-DD' + 'HH:MM' de Buenos Aires → instante ISO con offset, como lo pide la API. */
export function aInstante(m: Momento): string {
  return `${m.fecha}T${m.hora}:00${OFFSET_BA}`
}

const completo = (m: Momento) => /^\d{4}-\d{2}-\d{2}$/.test(m.fecha) && /^\d{2}:\d{2}$/.test(m.hora)

/** Qué corregir en una carga, o null si está bien. Los textos son los que ve el guardia. */
export function validarCarga(
  c: Pick<Carga, 'entrada' | 'salida'>,
  ahora: Date = new Date(),
): string | null {
  if (!completo(c.entrada)) return 'Completá la fecha y la hora de ingreso.'
  const entro = Date.parse(aInstante(c.entrada))
  if (entro > ahora.getTime()) return 'Esa hora de ingreso todavía no pasó.'
  if (entro < ahora.getTime() - VENTANA_HORAS * 3_600_000) {
    return `Solo se puede cargar lo de las últimas ${VENTANA_HORAS} horas.`
  }
  if (c.salida) {
    if (!completo(c.salida)) return 'Completá la fecha y la hora de salida.'
    const salio = Date.parse(aInstante(c.salida))
    if (salio > ahora.getTime()) return 'Esa hora de salida todavía no pasó.'
    if (salio < entro) return 'La salida no puede ser anterior al ingreso.'
  }
  return null
}

/** El rango que ocupa una carga. Abierta (sin salida) ocupa hasta el infinito. */
function rango(c: Pick<Carga, 'entrada' | 'salida'>): [number, number] {
  return [Date.parse(aInstante(c.entrada)), c.salida ? Date.parse(aInstante(c.salida)) : Infinity]
}

/** Si una carga nueva pisa a otra ya agregada de la misma persona. Se tocan en el borde: no se pisan. */
export function pisaOtra(nueva: Carga, tanda: Carga[]): boolean {
  return tanda.some((o) => {
    if (o.invitationId !== nueva.invitationId) return false
    return seSolapan(rango(nueva), rango(o))
  })
}

/** Dos rangos se pisan si se cruzan; tocarse en el borde no cuenta. */
function seSolapan([a1, a2]: [number, number], [b1, b2]: [number, number]): boolean {
  return a1 < b2 && b1 < a2
}

/** Las dos horas de una carga en una línea: "Ingresó 21:10 · Salió 22:40". */
export function resumenCarga(c: Pick<Carga, 'entrada' | 'salida'>, hoy: string): string {
  const texto = (m: Momento) => (m.fecha === hoy ? m.hora : `${m.fecha.slice(8)}/${m.fecha.slice(5, 7)} ${m.hora}`)
  return c.salida
    ? `Ingresó ${texto(c.entrada)} · Salió ${texto(c.salida)}`
    : `Ingresó ${texto(c.entrada)} · Sigue adentro`
}

// ---- La planilla: filas que se tipean con el teclado ----

export type FilaPlanilla = {
  clave: string
  /** 'HH:MM' o lo que se tipeó. */
  ingreso: string
  persona:
    | { invitationId: string; nombre: string; lote: string; dniInvitacion: string | null }
    | { nombre: string; unitId: string; lote: string }
    | null
  dni: string
  /** '' = sigue adentro. */
  salida: string
  nota: string
}
export type Planilla = { fecha: string; filas: FilaPlanilla[] }

/** Lo que manda la API de carga manual (ver api/src/services/entries.ts). */
export type ItemManual = {
  invitationId?: string
  guest?: { name: string; unitId: string }
  guestDoc: string
  enteredAt: string
  exitedAt: string | null
  note?: string
}

/** '2140' → '21:40', '9' → '09:00', '21:4' → '21:04'; lo que no es una hora → ''. */
export function normalizarHora(texto: string): string {
  const t = texto.trim()
  let h: string, mi: string
  let m = /^(\d{1,2})(?::(\d{1,2}))?$/.exec(t)
  if (m) [, h, mi = '0'] = m
  else if ((m = /^(\d{1,2})(\d{2})$/.exec(t))) [, h, mi] = m
  else return ''
  if (Number(h) > 23 || Number(mi) > 59) return ''
  return `${h.padStart(2, '0')}:${mi.padStart(2, '0')}`
}

/** El día siguiente de una fecha 'YYYY-MM-DD' (aritmética de calendario, sin zona). */
function diaSiguiente(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** Una salida más temprana que el ingreso es de la madrugada del día siguiente. */
export function momentosDe(fecha: string, f: FilaPlanilla): { entrada: Momento; salida: Momento | null; masUnDia: boolean } {
  const entrada = { fecha, hora: normalizarHora(f.ingreso) }
  if (!f.salida.trim()) return { entrada, salida: null, masUnDia: false }
  const hora = normalizarHora(f.salida)
  const masUnDia = !!hora && !!entrada.hora && hora < entrada.hora
  return { entrada, salida: { fecha: masUnDia ? diaSiguiente(fecha) : fecha, hora }, masUnDia }
}

/** Qué corregir en una fila, o null si está bien. `todas` incluye a la propia fila. */
export function errorDeFila(fecha: string, f: FilaPlanilla, todas: FilaPlanilla[], ahora: Date = new Date()): string | null {
  if (!f.persona) return 'Elegí a la persona.'
  if (!f.dni.trim()) return 'Falta el DNI: en la puerta siempre se pide.'
  const { entrada, salida } = momentosDe(fecha, f)
  const error = validarCarga({ entrada, salida }, ahora)
  if (error) return error
  if ('invitationId' in f.persona) {
    const id = f.persona.invitationId
    const mia = rango({ entrada, salida })
    const pisa = todas.some((o) => {
      if (o.clave === f.clave || !o.persona || !('invitationId' in o.persona) || o.persona.invitationId !== id) return false
      const m = momentosDe(fecha, o)
      return m.entrada.hora !== '' && seSolapan(mia, rango(m))
    })
    if (pisa) return 'Esa persona ya tiene otro movimiento que se pisa con este.'
  }
  return null
}

/** Las filas completas como las pide `cargarManual`; las sin persona no viajan. */
export function aItems(p: Planilla): ItemManual[] {
  return p.filas.flatMap((f) => {
    if (!f.persona) return []
    const { entrada, salida } = momentosDe(p.fecha, f)
    const item: ItemManual = {
      ...('invitationId' in f.persona
        ? { invitationId: f.persona.invitationId }
        : { guest: { name: f.persona.nombre, unitId: f.persona.unitId } }),
      guestDoc: f.dni.trim(),
      enteredAt: aInstante(entrada),
      exitedAt: salida ? aInstante(salida) : null,
    }
    if (f.nota.trim()) item.note = f.nota.trim()
    return [item]
  })
}

/** El borrador guardado en el navegador; roto o con otra forma → null. */
export function leerBorrador(texto: string | null): Planilla | null {
  if (!texto) return null
  try {
    const p = JSON.parse(texto)
    return typeof p?.fecha === 'string' && Array.isArray(p.filas) ? p : null
  } catch {
    return null
  }
}
