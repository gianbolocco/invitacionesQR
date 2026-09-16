'use client'
import { useEffect, useState } from 'react'

export type Tema = 'sistema' | 'claro' | 'oscuro'

const CLAVE = 'tema'

/**
 * Se aplica en el <html>, no en un contexto de React: así el CSS decide todo con
 * variables y ningún componente necesita saber en qué tema está.
 *
 * "sistema" borra el atributo en vez de escribir uno, porque el CSS ya tiene la
 * regla de prefers-color-scheme; escribir el valor calculado dejaría al usuario
 * clavado en el tema que tenía cuando eligió.
 */
export function aplicarTema(tema: Tema) {
  const html = document.documentElement
  if (tema === 'sistema') html.removeAttribute('data-theme')
  else html.setAttribute('data-theme', tema === 'oscuro' ? 'dark' : 'light')
}

export function leerTema(): Tema {
  try {
    const guardado = localStorage.getItem(CLAVE)
    return guardado === 'claro' || guardado === 'oscuro' ? guardado : 'sistema'
  } catch {
    return 'sistema'
  }
}

export function useTema() {
  const [tema, setTemaState] = useState<Tema>('sistema')

  // En el render del servidor no hay localStorage: se lee después de montar.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTemaState(leerTema())
  }, [])

  function setTema(nuevo: Tema) {
    setTemaState(nuevo)
    aplicarTema(nuevo)
    try {
      if (nuevo === 'sistema') localStorage.removeItem(CLAVE)
      else localStorage.setItem(CLAVE, nuevo)
    } catch {
      // Sin localStorage el tema dura la sesión. No es grave.
    }
  }

  return [tema, setTema] as const
}

/**
 * Corre antes del primer pintado para que la pantalla no arranque clara y salte
 * a oscura. Va inline en el <head>: cualquier otra forma llega tarde.
 */
export const SCRIPT_ANTI_PARPADEO = `
try {
  var t = localStorage.getItem('${CLAVE}');
  if (t === 'oscuro') document.documentElement.setAttribute('data-theme', 'dark');
  else if (t === 'claro') document.documentElement.setAttribute('data-theme', 'light');
} catch (e) {}
`.trim()
