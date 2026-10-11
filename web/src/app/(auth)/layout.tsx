import { Marca } from '@/components/dominio/marca'
import { SelectorTema } from '@/components/selector-tema'

/**
 * Las pantallas de acceso: la marca del barrio arriba y una sola tarjeta. Un
 * halo del color del barrio detrás le da identidad sin meter ruido.
 */
export default function LayoutAcceso({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-surface px-4 py-16">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-96
        bg-[radial-gradient(60%_100%_at_50%_0%,var(--marca-suave),transparent)]" />
      <SelectorTema className="absolute right-4 top-4" />
      <div className="relative w-full max-w-sm animate-in fade-in slide-in-from-bottom-2 duration-500">
        <div className="mb-8 flex justify-center"><Marca variante="grande" /></div>
        <div className="rounded-xl border border-line bg-card p-6 shadow-fila sm:p-8">{children}</div>
      </div>
    </main>
  )
}
