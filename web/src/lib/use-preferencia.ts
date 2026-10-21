import { useCallback, useEffect, useState } from 'react'

/**
 * Una preferencia de pantalla que se acuerda entre visitas (la vista elegida).
 * El almacenamiento puede faltar o lanzar (ventana privada, datos bloqueados):
 * sin él la pantalla anda igual, solo que no se acuerda. Hasta leerlo devuelve
 * null, así quien la usa no pinta una vista que después cambia.
 */
export function usePreferencia<T extends string>(clave: string): [T | null | undefined, (v: T) => void] {
  // undefined = todavía no se leyó; null = se leyó y no hay nada guardado.
  const [valor, setValor] = useState<T | null | undefined>(undefined)

  useEffect(() => {
    let guardado: T | null = null
    try { guardado = localStorage.getItem(clave) as T | null } catch { /* sin almacenamiento */ }
    // Leer el navegador solo se puede después de montar: no es un setState evitable.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValor(guardado)
  }, [clave])

  const guardar = useCallback((v: T) => {
    setValor(v)
    try { localStorage.setItem(clave, v) } catch { /* sin almacenamiento */ }
  }, [clave])

  return [valor, guardar]
}
