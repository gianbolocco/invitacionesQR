'use client'
import { useEffect, useState } from 'react'

/**
 * El valor, pero `ms` después de que dejó de cambiar. Para el buscador: el
 * vecino tipea "martin" y eso son seis teclas, no seis búsquedas.
 */
export function useDemora<T>(valor: T, ms = 300): T {
  const [demorado, setDemorado] = useState(valor)
  useEffect(() => {
    const t = setTimeout(() => setDemorado(valor), ms)
    return () => clearTimeout(t)
  }, [valor, ms])
  return demorado
}
