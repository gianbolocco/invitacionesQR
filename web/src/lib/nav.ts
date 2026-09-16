/**
 * Los tres menús de la app y la regla de cuál va en cada pantalla.
 *
 * Vive fuera del componente para poder verificarse sin montar React: la única
 * parte con una decisión de verdad acá es a qué sección pertenece una ruta.
 */
export type Seccion = 'vecino' | 'garita' | 'admin'

export type ItemNav = {
  href: string
  label: string
  /** Clave del ícono; el componente la resuelve. Un .ts no lleva JSX. */
  icono?: 'invitaciones' | 'historial' | 'hoy' | 'escanear' | 'auditoria'
}

export const NAV: Record<Seccion, ItemNav[]> = {
  vecino: [
    { href: '/', label: 'Invitaciones', icono: 'invitaciones' },
    { href: '/historial', label: 'Historial', icono: 'historial' },
  ],
  // La garita tenía su propio marco: dos solapas chiquitas arriba, sin barra
  // inferior y sin el escáner en el menú — o sea, el rol que usa la app parado
  // en la calle con una mano era el único sin la navegación pensada para eso.
  garita: [
    { href: '/garita', label: 'Hoy', icono: 'hoy' },
    { href: '/garita/escanear', label: 'Escanear', icono: 'escanear' },
    { href: '/auditoria', label: 'Auditoría', icono: 'auditoria' },
  ],
  admin: [
    { href: '/admin', label: 'Tablero' },
    { href: '/admin/unidades', label: 'Unidades' },
    { href: '/admin/usuarios', label: 'Vecinos' },
    { href: '/admin/guardias', label: 'Guardias' },
    { href: '/admin/barrio', label: 'Barrio' },
    { href: '/auditoria', label: 'Auditoría' },
  ],
}

/**
 * Hasta tres destinos entran en la barra inferior; más que eso, en el
 * desplegable. La regla es la cantidad, no el rol: si mañana el vecino tiene un
 * cuarto ítem, pasa al desplegable solo.
 */
export const TOPE_BARRA = 3

export function esActivo(href: string, path: string): boolean {
  return href === '/' ? path === '/' : path.startsWith(href)
}

/** La sección donde cada rol está parado por defecto. */
const PROPIA: Record<'resident' | 'guard' | 'admin', Seccion> = {
  resident: 'vecino',
  guard: 'garita',
  admin: 'admin',
}

/**
 * Auditoría no es de la garita: es del guardia Y del admin. Por eso vive en
 * /auditoria y no colgada de /garita, y por eso la sección no puede salir solo
 * del prefijo de la ruta — la misma pantalla tiene que mostrarle a cada uno su
 * propio menú, o el admin que entra a auditar pierde el resto de su sección.
 *
 * La regla: si la ruta está en el menú propio del rol, esa es su sección.
 */
export function seccionDe(path: string, role: 'resident' | 'guard' | 'admin'): Seccion {
  if (path.startsWith('/admin')) return 'admin'
  const propia = PROPIA[role]
  if (NAV[propia].some((i) => esActivo(i.href, path))) return propia
  if (path.startsWith('/garita')) return 'garita'
  return 'vecino'
}
