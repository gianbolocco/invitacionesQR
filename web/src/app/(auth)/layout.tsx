import { Marca } from '@/components/dominio/marca'
import { SelectorTema } from '@/components/selector-tema'

/**
 * Las pantallas de acceso: la marca del barrio arriba y una sola tarjeta,
 * que flota sobre un fondo de manchas de color (`.fondo-acceso`).
 */
export default function LayoutAcceso({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-surface px-4 py-16">
      <div aria-hidden className="fondo-acceso" />
      <SelectorTema className="absolute right-4 top-4" />
      <div className="relative w-full max-w-sm animate-in fade-in slide-in-from-bottom-2 duration-500">
        <div className="mb-8 flex justify-center"><Marca variante="grande" /></div>
        <div className="rounded-lg border border-line bg-card p-6 shadow-(--sombra-flotante) sm:p-8">{children}</div>
      </div>
    </main>
  )
}
