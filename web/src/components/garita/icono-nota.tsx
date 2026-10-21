import { StickyNote } from 'lucide-react'
import { HoverCard } from 'radix-ui'

/**
 * El vecino dejó una nota. En la lista va la marca y la nota se lee al pasar el
 * mouse, sin abrir la invitación. El sr-only la lleva a los lectores de pantalla.
 */
export function IconoNota({ nota }: { nota: string | null | undefined }) {
  if (!nota) return null
  return (
    <HoverCard.Root openDelay={150} closeDelay={100}>
      <HoverCard.Trigger asChild>
        <span className="shrink-0 text-ink-soft hover:text-ink">
          <StickyNote className="size-4.5" aria-hidden />
          <span className="sr-only">Nota: {nota}</span>
        </span>
      </HoverCard.Trigger>
      <HoverCard.Portal>
        {/* Portal: el buscador y las filas recortan con overflow; afuera no. */}
        <HoverCard.Content side="top" align="start" sideOffset={6} aria-hidden
          className="z-50 max-w-64 rounded-md border border-line bg-popover p-3 text-sm text-ink shadow-(--sombra-flotante) break-words data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0">
          <p className="mb-1 text-xs font-semibold text-ink-soft">Nota del vecino</p>
          {nota}
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  )
}
