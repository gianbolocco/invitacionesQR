'use client'
import { createContext, useContext } from 'react'
import type { Marca } from './marca'

/**
 * La marca, bajada desde el layout a los componentes cliente.
 *
 * El layout ya la lee en el servidor, así que pasarla por contexto sale gratis:
 * sin requests extra y sin que el nombre del barrio aparezca vacío un instante
 * mientras llega. Si cada componente la pidiera por su cuenta serían tres
 * llamadas por carga de página y tres parpadeos.
 */
const Contexto = createContext<Marca>({
  nombre: 'VisitPass',
  color: '#1e6b47',
  tieneLogo: false,
})

export function MarcaProvider({ marca, children }: { marca: Marca; children: React.ReactNode }) {
  return <Contexto.Provider value={marca}>{children}</Contexto.Provider>
}

export function useMarca(): Marca {
  return useContext(Contexto)
}
