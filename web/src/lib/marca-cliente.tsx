'use client'
import { createContext, useContext, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, apiBase } from './api'
import { urlPlano } from './plano'
import { MARCA_DEFAULT, type Marca } from './marca'

export const claveMarca = ['marca'] as const

/*
 * La marca llega ya resuelta desde el layout del servidor y entra como dato
 * inicial de la query: la primera pintada no espera ningún request. Después,
 * cuando el admin guarda un cambio, se invalida ['marca'] y toda la app la
 * vuelve a leer sin recargar.
 */
const Inicial = createContext<Marca>(MARCA_DEFAULT)

export function MarcaProvider({ marca, children }: { marca: Marca; children: React.ReactNode }) {
  return <Inicial.Provider value={marca}>{children}</Inicial.Provider>
}

export function useMarca(): Marca {
  const inicial = useContext(Inicial)
  const { data } = useQuery({
    queryKey: claveMarca,
    queryFn: ({ signal }) => api<Marca>('/branding', { signal }),
    initialData: inicial,
    staleTime: 5 * 60_000,
  })
  return data
}

/**
 * La URL del logo, con su versión. La respuesta se cachea una hora: sin la
 * versión, reemplazar el logo seguía mostrando el anterior. Es el único lugar
 * que arma esta URL.
 */
export function logoUrl(m: Marca): string | null {
  return m.tieneLogo ? `${apiBase}/branding/logo?v=${m.logoVersion ?? 0}` : null
}

/** La URL del plano del barrio (con su versión y, si hay, el lote a resaltar). */
export function planoUrl(m: Marca, lote: string | null): string | null {
  return m.tienePlano ? urlPlano(apiBase, m.planoVersion ?? 0, lote) : null
}

/**
 * Lleva la marca al documento: el color como variable CSS (de él sale el
 * acento de toda la app), el de la barra del navegador en claro y el título.
 * No dibuja nada.
 */
export function AplicarMarca() {
  const marca = useMarca()

  useEffect(() => {
    document.documentElement.style.setProperty('--marca-base', marca.color)
    document
      .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"][media="(prefers-color-scheme: light)"]')
      .forEach((m) => { m.content = marca.color })
  }, [marca.color])

  // generateMetadata ya fija el título inicial; solo se toca si el nombre cambia
  // después, para no pisar los títulos propios de cada página.
  const nombreInicial = useRef(marca.nombre)
  useEffect(() => {
    if (marca.nombre !== nombreInicial.current) document.title = marca.nombre
  }, [marca.nombre])

  return null
}
