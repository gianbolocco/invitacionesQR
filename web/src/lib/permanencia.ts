import type { AgendaRow } from './queries/garita'

/** Alguien adentro que ya pasó el tiempo que fijó el admin para su tipo. */
export type Excedida = AgendaRow & { alertaDesde: string }

/**
 * Quiénes pasaron su tiempo a esta hora, el que más se pasó primero. La API ya
 * manda el vencimiento calculado (`alertaDesde`): acá solo se compara con el
 * reloj, así la alerta aparece aunque nadie haya escaneado nada.
 */
export function excedidas(filas: AgendaRow[], ahora: Date): Excedida[] {
  return filas
    .filter((f): f is Excedida => f.alertaDesde != null && new Date(f.alertaDesde).getTime() <= ahora.getTime())
    .sort((a, b) => new Date(a.alertaDesde).getTime() - new Date(b.alertaDesde).getTime())
}

/** Los excedidos primero; dentro de cada grupo, el orden que ya traían. */
export function primeroExcedidas<T extends { id: string }>(filas: T[], ids: Set<string>): T[] {
  return [...filas.filter((f) => ids.has(f.id)), ...filas.filter((f) => !ids.has(f.id))]
}
