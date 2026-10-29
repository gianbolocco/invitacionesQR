'use client'
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiBase } from '@/lib/api'
import { useMarca } from '@/lib/marca-cliente'
import { clavePaquetes } from '@/lib/queries/paquetes'

/**
 * Abre el canal de avisos en vivo mientras el vecino tiene la app a la vista.
 * EventSource reconecta solo; si no se puede abrir, la tarjeta se actualiza
 * igual en el próximo fetch o al volver a la pestaña.
 */
export function EventosEnVivo() {
  const qc = useQueryClient()
  const { packagesEnabled } = useMarca()
  useEffect(() => {
    if (!packagesEnabled || typeof EventSource === 'undefined') return
    const es = new EventSource(`${apiBase}/events`, { withCredentials: true })
    es.addEventListener('package', (e) => {
      try {
        const d = JSON.parse((e as MessageEvent<string>).data) as { unitLabel: string; note: string | null }
        toast('Llegó un paquete', { description: [d.unitLabel, d.note].filter(Boolean).join(' · ') })
      } catch { /* dato ilegible: igual se refresca la lista */ }
      qc.invalidateQueries({ queryKey: clavePaquetes })
    })
    return () => es.close()
  }, [packagesEnabled, qc])
  return null
}
