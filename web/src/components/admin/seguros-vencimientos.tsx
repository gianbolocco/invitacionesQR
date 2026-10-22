'use client'
import { useSegurosVencimientos, type SeguroVencimiento } from '@/lib/queries/admin'
import { hoyISO, fechaNumerica } from '@/lib/fechas'
import { textoVence } from '@/lib/seguro'

const CHIP: Record<SeguroVencimiento['estado'], string> = {
  vencido: 'bg-alto-tint text-alto',
  por_vencer: 'bg-espera-tint text-espera',
  sin_cargar: 'bg-surface-sunk text-ink-soft',
}
const ETIQUETA: Record<SeguroVencimiento['estado'], string> = {
  vencido: 'Vencido', por_vencer: 'Por vencer', sin_cargar: 'Sin cargar',
}

export function SegurosVencimientos() {
  const seguros = useSegurosVencimientos()
  const hoy = hoyISO()
  const filas = seguros.data ?? []

  return (
    <section className="flex flex-col gap-3 rounded-md border border-line bg-card p-5" aria-labelledby="seguros-titulo">
      <h3 id="seguros-titulo" className="text-[13px] font-semibold text-ink-soft">Seguros de proveedores</h3>
      {seguros.isPending ? (
        <p className="text-sm text-ink-soft">Cargando…</p>
      ) : filas.length === 0 ? (
        <p className="text-sm text-ink-soft">No hay seguros vencidos ni por vencer.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="text-[13px] text-ink-soft">
              <tr>
                {['Estado', 'Invitado', 'Rubro', 'Lote', 'Compañía · Póliza', 'Vence'].map((c) => (
                  <th key={c} scope="col" className="py-2 pr-4 font-semibold">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id} className="border-t border-line">
                  <td className="py-2.5 pr-4">
                    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${CHIP[f.estado]}`}>
                      {f.estado === 'por_vencer' && f.expiresOn ? textoVence(f.expiresOn, hoy) : ETIQUETA[f.estado]}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 font-medium">{f.guestName}</td>
                  <td className="py-2.5 pr-4">{f.tradeName}</td>
                  <td className="py-2.5 pr-4">{f.unitLabel}</td>
                  <td className="py-2.5 pr-4">{[f.company, f.policy].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="py-2.5 tabular">{f.expiresOn ? fechaNumerica(f.expiresOn) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-sm text-ink-soft">Solo invitaciones vigentes de rubros que piden seguro.</p>
    </section>
  )
}
