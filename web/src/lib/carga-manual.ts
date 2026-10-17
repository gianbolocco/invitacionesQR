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
  const [a1, a2] = rango(nueva)
  return tanda.some((o) => {
    if (o.invitationId !== nueva.invitationId) return false
    const [b1, b2] = rango(o)
    return a1 < b2 && b1 < a2
  })
}

/** Las dos horas de una carga en una línea: "Ingresó 21:10 · Salió 22:40". */
export function resumenCarga(c: Pick<Carga, 'entrada' | 'salida'>, hoy: string): string {
  const texto = (m: Momento) => (m.fecha === hoy ? m.hora : `${m.fecha.slice(8)}/${m.fecha.slice(5, 7)} ${m.hora}`)
  return c.salida
    ? `Ingresó ${texto(c.entrada)} · Salió ${texto(c.salida)}`
    : `Ingresó ${texto(c.entrada)} · Sigue adentro`
}
