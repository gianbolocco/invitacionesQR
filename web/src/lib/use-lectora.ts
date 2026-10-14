'use client'
import { useEffect, useRef } from 'react'
import { useDemora } from './use-demora'
import { crearDetector, GRACIA_TERMINADOR_MS, interpretarLectura, PAUSA_FIN_MS, type Lectura, type Rafaga } from './lectora'

const editable = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || el.matches('input, textarea, select'))

/**
 * Una lectora 2D es un teclado: se la reconoce por el ritmo (ver crearDetector).
 * Escucha en captura para anular su Enter antes que el botón enfocado: si no,
 * dispara "Registrar ingreso" del invitado anterior. Con el foco en un campo
 * no actúa: eso lo resuelve useCampoLectora.
 *
 * Tanda (modo inventario, al reconectar una inalámbrica): vale la última. Por
 * eso la entrega espera PAUSA_FIN_MS a que no empiece otra ráfaga.
 */
export function useLectora({ onLectura, onRafaga, activo = true }: {
  onLectura?: (texto: string) => void
  onRafaga?: (r: Rafaga, enTanda: boolean) => void
  activo?: boolean
}) {
  const cb = useRef({ onLectura, onRafaga })
  useEffect(() => { cb.current = { onLectura, onRafaga } })

  useEffect(() => {
    if (!activo) return
    const detector = crearDetector()
    let pausa: ReturnType<typeof setTimeout> | undefined
    let entrega: ReturnType<typeof setTimeout> | undefined
    let pendiente: string | null = null
    let tragarEspacio = false
    let ultimoCierre = -Infinity

    function cerrada(r: Rafaga | null) {
      if (!r) return
      ultimoCierre = performance.now()
      cb.current.onRafaga?.(r, r.esLectura && pendiente !== null)
      if (r.esLectura) pendiente = r.texto
      if (pendiente === null) return
      clearTimeout(entrega)
      entrega = setTimeout(() => {
        const texto = pendiente!
        pendiente = null
        cb.current.onLectura?.(texto)
      }, PAUSA_FIN_MS)
    }

    function onKeyDown(e: KeyboardEvent) {
      if (editable(e.target)) return
      // Un espacio en medio de la ráfaga ("BOLOCCO VERONELLI") activaría el botón enfocado.
      tragarEspacio = e.key === ' ' && detector.enRafaga(e.timeStamp)
      if (tragarEspacio) e.preventDefault()
      clearTimeout(pausa)
      if (e.key.length === 1) clearTimeout(entrega) // empieza otra ráfaga: ¿tanda?
      const r = detector.tecla(e.key, e.timeStamp)
      // El Enter/Tab de la lectora nunca llega al botón enfocado: tras cualquier ráfaga
      // (una persona no tipea caracteres en un botón y después aprieta Enter) o dentro
      // de la gracia (CR+LF, terminador lento, tramo final trabado por Bluetooth).
      const terminador = e.key === 'Enter' || e.key === 'Tab'
      if (r || (terminador && e.timeStamp - ultimoCierre <= GRACIA_TERMINADOR_MS)) {
        e.preventDefault(); e.stopPropagation()
      }
      cerrada(r)
      pausa = setTimeout(() => cerrada(detector.pausa()), PAUSA_FIN_MS)
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === ' ' && tragarEspacio) e.preventDefault()
    }

    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
      clearTimeout(pausa)
      clearTimeout(entrega)
    }
  }, [activo])
}

/**
 * Para un campo que puede recibir una lectura (tiene el foco cuando el guardia
 * escanea). La reconoce al Enter/Tab —que se anula: no envía el formulario con
 * el texto crudo— y al quedar quieto el valor, para lectoras sin terminador.
 * `alLeer` tiene que reemplazar el valor del campo.
 */
export function useCampoLectora(valor: string, alLeer: (l: Lectura) => void) {
  const cb = useRef(alLeer)
  useEffect(() => { cb.current = alLeer })
  const quieto = useDemora(valor, PAUSA_FIN_MS)

  useEffect(() => {
    const l = interpretarLectura(quieto)
    if (l) cb.current(l)
  }, [quieto])

  return (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' && e.key !== 'Tab') return
    const l = interpretarLectura(e.currentTarget.value)
    if (!l) return
    e.preventDefault()
    cb.current(l)
  }
}
