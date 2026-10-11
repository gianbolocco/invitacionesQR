'use client'
import { QRCodeSVG } from 'qrcode.react'
import { useMarca } from '@/lib/marca-cliente'
import type { Marca as DatosMarca } from '@/lib/marca'
import { cn } from '@/lib/utils'

export type DatosPase = {
  barrio?: string
  tipo: string
  vigencia: string
  invitado: string
  unidad: string
  invita: string
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[#8a8378]">{etiqueta}</p>
      <p className="truncate text-sm font-semibold">{children}</p>
    </div>
  )
}

/**
 * La invitación como pase, estilo ticket de Wallet: cabecera con la marca,
 * el invitado, los datos, el troquel y el QR.
 *
 * El cuerpo es claro en los DOS temas a propósito: un QR sobre fondo oscuro
 * no lo lee ningún lector. Por eso usa colores fijos y no los tokens.
 */
export function Pase({ datos, qr, apagado = false, sello, className, marcaOverride }: {
  datos: DatosPase
  qr: string
  apagado?: boolean
  sello?: string
  className?: string
  marcaOverride?: DatosMarca
}) {
  const marcaReal = useMarca()
  const marca = marcaOverride ?? marcaReal
  return (
    <article className={cn('relative w-full max-w-sm overflow-hidden rounded-xl bg-white text-[#14130f] shadow-flotante',
      apagado && 'opacity-70 grayscale', className)}>
      <header className="flex items-center justify-between bg-marca px-5 py-4 text-sobre-marca">
        <div className="min-w-0">
          <p className="truncate text-[10px] font-semibold uppercase tracking-[0.1em] opacity-80">
            {datos.barrio ?? marca.nombre}
          </p>
          <p className="text-sm font-bold">Pase de {datos.tipo.toLowerCase()}</p>
        </div>
        <p className="shrink-0 text-sm font-bold tabular">{datos.vigencia}</p>
      </header>

      <div className="px-5 pb-2 pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[#8a8378]">Invitado</p>
        <p className="mt-0.5 break-words font-display text-[26px] font-extrabold leading-[1.05] tracking-[-0.02em]">
          {datos.invitado}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Dato etiqueta="Unidad">{datos.unidad}</Dato>
          <Dato etiqueta="Invita">{datos.invita}</Dato>
        </div>
      </div>

      {/* El troquel: línea punteada con dos medias lunas del color de fondo. */}
      <div aria-hidden className="relative my-3 h-6">
        <span className="absolute inset-x-5 top-1/2 border-t-2 border-dashed border-[#e6e0d6]" />
        <span className="absolute -left-3 top-0 size-6 rounded-full bg-surface" />
        <span className="absolute -right-3 top-0 size-6 rounded-full bg-surface" />
      </div>

      <div className="grid place-items-center px-5 pb-6">
        <QRCodeSVG value={qr} size={196} fgColor="#14130f" bgColor="#ffffff" marginSize={0}
          title={`Código de acceso de ${datos.invitado}`} />
      </div>

      {/* Rojo fijo: el cuerpo del pase es claro en los dos temas, y el token peligro se aclara en oscuro. */}
      {sello && (
        <span className="absolute right-4 top-24 rotate-[-12deg] rounded-md border-[3px] border-[#a3202f] px-3 py-1
          font-display text-xl font-extrabold uppercase tracking-wide text-[#a3202f]">
          {sello}
        </span>
      )}
    </article>
  )
}
