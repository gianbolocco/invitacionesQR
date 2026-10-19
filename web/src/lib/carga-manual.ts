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

/** Los dos momentos de un movimiento. Salida null = todavía está adentro. */
type Movimiento = { entrada: Momento; salida: Momento | null }

/** 'YYYY-MM-DD' + 'HH:MM' de Buenos Aires → instante ISO con offset, como lo pide la API. */
export function aInstante(m: Momento): string {
  return `${m.fecha}T${m.hora}:00${OFFSET_BA}`
}

const completo = (m: Momento) => /^\d{4}-\d{2}-\d{2}$/.test(m.fecha) && /^\d{2}:\d{2}$/.test(m.hora)

/** Qué corregir en una carga, o null si está bien. Los textos son los que ve el guardia. */
export function validarCarga(
  c: Movimiento,
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
function rango(c: Movimiento): [number, number] {
  return [Date.parse(aInstante(c.entrada)), c.salida ? Date.parse(aInstante(c.salida)) : Infinity]
}

/** Dos rangos se pisan si se cruzan; tocarse en el borde no cuenta. */
function seSolapan([a1, a2]: [number, number], [b1, b2]: [number, number]): boolean {
  return a1 < b2 && b1 < a2
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
  if (!('invitationId' in f.persona) && !f.persona.unitId) return 'Elegí el lote al que va.'
  if (!f.dni.trim()) return 'Falta el DNI: en la puerta siempre se pide.'
  // Mismo tope que guestDoc en la API; pegar puede saltear el maxLength del input.
  if (f.dni.trim().length > 20) return 'El DNI tiene más de 20 caracteres.'
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

/** Una fila sin nada tipeado: no cuenta ni como error ni como movimiento. */
export const filaVacia = (f: FilaPlanilla) =>
  !f.persona && !f.ingreso.trim() && !f.dni.trim() && !f.salida.trim() && !f.nota.trim()

/**
 * Las filas como las pide `cargarManual`. Precondición: todas las filas están
 * bien (`errorDeFila` null); si alguna no, tira un Error en vez de callarla.
 * Las filas totalmente en blanco se saltean: una fila vacía al final es normal.
 */
export function aItems(p: Planilla, ahora: Date = new Date()): ItemManual[] {
  return p.filas.flatMap((f, i) => {
    if (filaVacia(f)) return []
    if (!f.persona || errorDeFila(p.fecha, f, p.filas, ahora) !== null) {
      throw new Error(`La fila ${i + 1} todavía tiene errores`)
    }
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

const esTexto = (v: unknown): v is string => typeof v === 'string'
const todosTexto = (o: Record<string, unknown>, ...claves: string[]) => claves.every((k) => esTexto(o[k]))

/** Una fila del borrador con la forma justa, o null si no se puede rescatar. */
function filaValida(v: unknown): FilaPlanilla | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (!esTexto(o.clave)) return null
  const p = o.persona
  let persona: FilaPlanilla['persona'] = null
  if (p != null) {
    if (typeof p !== 'object') return null
    const q = p as Record<string, unknown>
    if ('invitationId' in q) {
      if (!todosTexto(q, 'invitationId', 'nombre', 'lote') || !(q.dniInvitacion === null || esTexto(q.dniInvitacion))) return null
      persona = q as FilaPlanilla['persona']
    } else {
      if (!todosTexto(q, 'nombre', 'unitId', 'lote')) return null
      persona = q as FilaPlanilla['persona']
    }
  }
  const t = (k: string) => (esTexto(o[k]) ? (o[k] as string) : '')
  return { clave: o.clave, ingreso: t('ingreso'), persona, dni: t('dni'), salida: t('salida'), nota: t('nota') }
}

/** El borrador guardado en el navegador; JSON roto o sin forma de planilla → null, y las filas que no encajan se descartan. */
export function leerBorrador(texto: string | null): Planilla | null {
  if (!texto) return null
  try {
    const p = JSON.parse(texto)
    if (typeof p?.fecha !== 'string' || !Array.isArray(p.filas)) return null
    return { fecha: p.fecha, filas: p.filas.flatMap((f: unknown) => filaValida(f) ?? []) }
  } catch {
    return null
  }
}
