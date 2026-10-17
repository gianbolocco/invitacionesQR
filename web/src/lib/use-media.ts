import { useSyncExternalStore } from 'react'

/**
 * Si una media query se cumple, y avisa cuando cambia. En el servidor es
 * false: lo que depende del ancho se decide recién en el navegador.
 */
export function useMedia(consulta: string): boolean {
  return useSyncExternalStore(
    (aviso) => {
      const m = window.matchMedia(consulta)
      m.addEventListener('change', aviso)
      return () => m.removeEventListener('change', aviso)
    },
    () => window.matchMedia(consulta).matches,
    () => false,
  )
}
