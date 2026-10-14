/*
 * Lo que manda una lectora 2D o la cámara, interpretado. Puro y sin alias:
 * lo corre `node` en `lectora.check.ts`. Spec: 2026-10-13-lectora-2d-design.md.
 */
export type Lectura =
  | { tipo: 'qr'; token: string }
  | { tipo: 'dni'; documento: string; apellido: string; nombre: string }
export type LecturaDni = Extract<Lectura, { tipo: 'dni' }>

export const NO_RECONOCIDO = 'No se reconoció el código. Probá de nuevo o buscá por nombre.'

/*
 * Una lectora-teclado manda códigos de tecla US; Windows en español (España y
 * Latinoamérica deforman igual) los lee cambiados. Solo hace falta para el QR:
 * en el DNI basta con volver `"` a `@`, y tocar más rompería una Ñ de un apellido.
 */
const QR_ES_A_US: Record<string, string> = { 'Ñ': ':', '-': '/', "'": '-', '?': '_' }

export const soloDigitos = (s: string) => s.replace(/\D/g, '')

/** "46116502" → "46.116.502": así lo lee el guardia en la tarjeta. */
export const formatearDni = (doc: string) => doc.replace(/\B(?=(\d{3})+(?!\d))/g, '.')

const invertirCaja = (s: string) =>
  [...s].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join('')

const titulo = (s: string) => s.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (m) => m.toUpperCase())

/** La URL de la invitación en cualquier parte del texto (prefijos de lectora), o el token suelto. */
export function tokenDelQr(texto: string): string | null {
  const enUrl = texto.match(/https?:\/\/[^/\s]+\/i\/([A-Za-z0-9_-]+)/)
  if (enUrl) return enUrl[1]
  // ≥ 20: un token mide 22 (randomToken(16)); así "perez" tipeado no es un QR.
  return /^[A-Za-z0-9_-]{20,}$/.test(texto) ? texto : null
}

/**
 * El texto como lo escribió la lectora, ya corregido: Bloq Mayús y teclas US→es
 * para un QR delatado por su prefijo, `"`→`@` para un DNI. Lo usan la
 * interpretación y "Probar lectora", para mostrar lo mismo.
 */
export function repararTexto(crudo: string): string {
  let t = crudo.trim()
  if (/HTTPS?[:Ññ]/.test(t)) t = invertirCaja(t) // Bloq Mayús: el token distingue mayúsculas
  // Solo si el texto delata la deformación: a ciegas, rompería los - de un token limpio.
  if (/https?Ñ/.test(t)) return [...t].map((c) => QR_ES_A_US[c] ?? c).join('')
  return t.includes('@') ? t : t.replaceAll('"', '@')
}

function qrDe(texto: string): Lectura | null {
  const token = tokenDelQr(texto)
  return token ? { tipo: 'qr', token } : null
}

function dniDe(texto: string): LecturaDni | null {
  const c = texto.split('@').map((s) => s.trim())
  let doc: string | undefined, apellido: string | undefined, nombre: string | undefined
  // Nuevo (frente): trámite@APELLIDO@NOMBRE@SEXO@DNI@… — viejo (dorso): @DNI@…@…@APELLIDO@NOMBRE@…
  if (c.length >= 8 && /\d{8,}$/.test(c[0]) && /^[MFX]$/.test(c[3])) [, apellido, nombre, , doc] = c
  else if (c.length >= 9 && /^\d{7,8}\s*[A-Z]?$/.test(c[1])) [, doc, , , apellido, nombre] = c
  if (!doc || !apellido || !nombre) return null
  const documento = soloDigitos(doc)
  // Mejor "no reconocido" que abrir la invitación de otro.
  if (!/^\d{7,8}$/.test(documento)) return null
  return { tipo: 'dni', documento, apellido: titulo(apellido), nombre: titulo(nombre) }
}

export function interpretarLectura(crudo: string): Lectura | null {
  const t = repararTexto(crudo)
  return t ? qrDe(t) ?? dniDe(t) : null
}

/*
 * Perillas de calibración: "Probar lectora" muestra los valores de cada ráfaga.
 * Por promedio y no por hueco entre teclas: Bluetooth entrega en paquetes.
 */
export const MIN_CARACTERES = 8
export const PROMEDIO_MAX_MS = 35
export const HUECO_MAX_MS = 200
export const PAUSA_FIN_MS = 250
/** Tras cerrar una ráfaga, un Enter/Tab más es del terminador (CR+LF, terminador lento), no de una persona. */
export const GRACIA_TERMINADOR_MS = 1000

export type Terminador = 'Enter' | 'Tab' | 'pausa'
export type Rafaga = {
  texto: string
  promedioMs: number
  huecoMaxMs: number
  terminador: Terminador
  esLectura: boolean
}

/** Junta teclas con su hora y dice, al cerrar, si fue una lectora o una persona. */
export function crearDetector() {
  let teclas: { key: string; t: number }[] = []

  function cerrar(terminador: Terminador): Rafaga | null {
    if (!teclas.length) return null
    const huecos = teclas.slice(1).map((k, i) => k.t - teclas[i].t)
    const promedioMs = huecos.length ? (teclas.at(-1)!.t - teclas[0].t) / huecos.length : 0
    const huecoMaxMs = huecos.length ? Math.max(...huecos) : 0
    const texto = teclas.map((k) => k.key).join('')
    teclas = []
    return {
      texto, promedioMs: Math.round(promedioMs), huecoMaxMs, terminador,
      esLectura: texto.length >= MIN_CARACTERES && promedioMs < PROMEDIO_MAX_MS,
    }
  }

  return {
    /** Devuelve la ráfaga si esta tecla la cerró (Enter o Tab). */
    tecla(key: string, t: number): Rafaga | null {
      const ultima = teclas.at(-1)
      // Solo un carácter corta la ráfaga: algunas lectoras mandan el terminador tarde (terminador lento).
      if (key.length === 1 && ultima && t - ultima.t > HUECO_MAX_MS) teclas = []
      if (key === 'Enter' || key === 'Tab') return cerrar(key)
      // Una sola letra: afuera modificadores, `Dead` y `Unidentified` (Android).
      if (key.length === 1) teclas.push({ key, t })
      return null
    },
    /** A los PAUSA_FIN_MS sin teclas: lectoras sin terminador. */
    pausa: () => cerrar('pausa'),
    /** Hay una ráfaga en curso: un espacio ahora es de la lectora, no un "click" al botón enfocado. */
    enRafaga: (t: number) => { const u = teclas.at(-1); return Boolean(u && t - u.t <= HUECO_MAX_MS) },
  }
}
