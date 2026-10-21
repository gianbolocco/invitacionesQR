import { StickyNote } from 'lucide-react'

/** El vecino dejó una nota. En la lista va solo la marca: el texto entero está en el veredicto. */
export function IconoNota({ nota }: { nota: string | null | undefined }) {
  if (!nota) return null
  return (
    <span title={nota} className="shrink-0 text-ink-soft">
      <StickyNote className="size-3.5" aria-hidden />
      <span className="sr-only">Nota: {nota}</span>
    </span>
  )
}
