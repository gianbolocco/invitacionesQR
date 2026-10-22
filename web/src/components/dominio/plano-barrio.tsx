'use client'
import { useRef } from 'react'
import { Maximize2, X } from 'lucide-react'

/**
 * El plano del barrio en una tarjeta, con el lote del invitado resaltado (lo
 * resalta la API sobre el SVG). Siempre va en <img>: así un SVG subido por el
 * admin nunca ejecuta nada en la página. Ampliar abre un <dialog> nativo.
 */
export function PlanoBarrio({ src, lote }: { src: string; lote: string | null }) {
  const dialogo = useRef<HTMLDialogElement>(null)
  const disparador = useRef<HTMLButtonElement>(null)
  const alt = lote ? `Plano del barrio con el lote ${lote} resaltado` : 'Plano del barrio'

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-line bg-card p-5">
      <p className="text-[13px] font-semibold text-ink-soft">
        Plano del barrio{lote && <> · Tu destino: <span className="tabular text-ink">Lote {lote}</span></>}
      </p>
      <button ref={disparador} type="button" onClick={() => dialogo.current?.showModal()}
        className="relative block overflow-hidden rounded-md border border-line bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="block h-auto w-full" />
        <span className="absolute right-2 bottom-2 inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-card">
          <Maximize2 className="size-3.5" aria-hidden />Ampliar
        </span>
      </button>

      <dialog ref={dialogo} aria-label="Plano del barrio ampliado"
        onClose={() => disparador.current?.focus()}
        className="m-0 h-dvh max-h-none w-dvw max-w-none bg-escaner-fondo text-escaner-texto backdrop:bg-black/80">
        <button type="button" onClick={() => dialogo.current?.close()}
          className="fixed top-3 right-3 z-10 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-escaner-texto px-4 text-sm font-semibold text-escaner-fondo">
          <X className="size-4" aria-hidden />Cerrar
        </button>
        {/* ponytail: pinch-zoom nativo del navegador; sin zoom propio con botones */}
        <div className="h-full overflow-auto" style={{ touchAction: 'pinch-zoom' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="block h-auto w-full bg-white" />
        </div>
      </dialog>
    </section>
  )
}
