'use client'
import { Marca } from './marca'

/**
 * Lo que se ve mientras se resuelve la sesión. Reemplaza al "Cargando…" en
 * texto plano: es la primera impresión de la app en cada apertura.
 */
export function Arranque() {
  return (
    <div role="status" aria-label="Cargando" className="grid min-h-dvh place-items-center bg-surface">
      <div className="flex flex-col items-center gap-6 animate-in fade-in duration-500">
        <Marca variante="grande" />
        <span aria-hidden className="relative h-1 w-28 overflow-hidden rounded-full bg-surface-sunk">
          <span className="absolute inset-y-0 w-1/3 animate-[arranque_1.1s_ease-in-out_infinite] rounded-full bg-marca" />
        </span>
      </div>
      <style>{`@keyframes arranque { 0% { left: -33% } 100% { left: 100% } }`}</style>
    </div>
  )
}
