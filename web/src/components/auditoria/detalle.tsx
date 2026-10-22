'use client'
import { useState } from 'react'
import { EstadoTag } from '@/components/dominio/estado-tag'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { fechaCompleta, hoyISO } from '@/lib/fechas'
import { franjasDelRubro, textoDias, textoHorario } from '@/lib/franjas'
import { PORTERIA } from '@/lib/invitations'
import { useRubrosDelBarrio } from '@/lib/queries/invitaciones'
import type { AuditRow } from '@/lib/queries/auditoria'
import { estadoSeguro } from '@/lib/seguro'
import { cn } from '@/lib/utils'
import { Movimientos } from './movimientos'
import { COLOR_SEGURO, ESTADO_TAG, TEXTO_SEGURO, esProveedor, vigenciaCorta } from './tabla'

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-line bg-card p-4">
      <h3 className="mb-3 text-sm font-bold">{titulo}</h3>
      {children}
    </section>
  )
}

function Dato({ etiqueta, children, className }: { etiqueta: string; children: React.ReactNode; className?: string }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 py-1 text-sm">
      <dt className="text-ink-soft">{etiqueta}</dt>
      <dd className={cn('min-w-0 break-words tabular', className)}>{children}</dd>
    </div>
  )
}

function Proveedor({ r, warnDays }: { r: AuditRow; warnDays: number | null }) {
  const { data } = useRubrosDelBarrio()
  const estado = estadoSeguro(r, hoyISO(), warnDays)
  const color = COLOR_SEGURO[estado]
  const rubro = data?.trades.find((t) => t.name === r.tradeName)
  // Sin el rubro a mano (o sin franjas cargadas) el horario se omite.
  const franjas = rubro ? franjasDelRubro(data!.providerWindows, rubro.id) : []
  return (
    <Bloque titulo="Proveedor">
      <dl>
        <Dato etiqueta="Rubro">{r.tradeName ?? '—'}</Dato>
        <Dato etiqueta="Compañía">{r.insuranceCompany || '—'}</Dato>
        <Dato etiqueta="Póliza">{r.insurancePolicy || '—'}</Dato>
        <Dato etiqueta="Vence" className={cn('font-semibold', color)}>
          {r.insuranceExpiresOn ? fechaCompleta(r.insuranceExpiresOn) : '—'}
        </Dato>
        {estado !== 'no_aplica' && <Dato etiqueta="Estado" className={cn('font-semibold', color)}>{TEXTO_SEGURO[estado]}</Dato>}
        {franjas.length > 0 && (
          <Dato etiqueta="Horario del rubro">
            {franjas.map((f, i) => <span key={i} className="block">{textoHorario(f)}</span>)}
          </Dato>
        )}
      </dl>
    </Bloque>
  )
}

/**
 * Todo lo de una fila de la auditoría: el proveedor, la invitación y cada
 * movimiento. Un panel a un costado en escritorio, de abajo en el celular.
 */
export function Detalle({ fila: abierta, warnDays, onCerrar }: { fila: AuditRow | null; warnDays: number | null; onCerrar: () => void }) {
  // Al cerrar, `abierta` vuelve a null pero el panel tarda en deslizarse: se muestra la última fila para que no salga en blanco.
  // También es la fila a la que vuelve el foco (Radix lo devuelve al Trigger, y acá no hay).
  const [ultima, setUltima] = useState<AuditRow | null>(null)
  if (abierta && abierta !== ultima) setUltima(abierta)
  const fila = abierta ?? ultima
  const tipo = !fila ? '' : fila.kind === 'frecuente'
    ? (fila.frequentAs === 'proveedor' ? 'Frecuente · viene a trabajar' : 'Frecuente')
    : fila.kind === 'proveedor' ? 'Proveedor' : 'Visita'
  return (
    <Sheet open={abierta !== null} onOpenChange={(abierto) => { if (!abierto) onCerrar() }}>
      <SheetContent onCloseAutoFocus={(e) => {
        e.preventDefault()
        document.querySelector<HTMLElement>(`[data-fila="${ultima?.id}"]`)?.focus()
      }}>
        {fila && (
          <>
            <SheetHeader className="pr-14">
              <SheetTitle className="break-words">{fila.guestName}</SheetTitle>
              <SheetDescription>{fila.unitLabel}</SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-3 px-4 pb-6">
              {esProveedor(fila) && <Proveedor r={fila} warnDays={warnDays} />}
              <Bloque titulo="Invitación">
                <dl>
                  <Dato etiqueta="Tipo">{tipo}</Dato>
                  {fila.weekdays && fila.weekdays.length > 0 && <Dato etiqueta="Días">{textoDias(fila.weekdays)}</Dato>}
                  <Dato etiqueta="Vigencia">{vigenciaCorta(fila)}</Dato>
                  {fila.note && <Dato etiqueta="Nota del vecino">{fila.note}</Dato>}
                  <Dato etiqueta="Invitó">{fila.porteria ? PORTERIA : fila.inviterName}</Dato>
                  <Dato etiqueta="Estado"><EstadoTag estado={ESTADO_TAG[fila.status]} contexto="garita" /></Dato>
                  {fila.status === 'anulada' && fila.revokedReason !== null && (
                    <Dato etiqueta="Motivo">{fila.revokedReason || 'Por portería, sin motivo'}</Dato>
                  )}
                </dl>
              </Bloque>
              <Bloque titulo="Movimientos"><Movimientos id={fila.id} /></Bloque>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
