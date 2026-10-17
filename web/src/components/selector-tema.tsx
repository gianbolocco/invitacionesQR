'use client'
import { Monitor, Moon, Sun } from 'lucide-react'
import { useTema, type Tema } from '@/lib/theme'
import { cn } from '@/lib/utils'

const OPCIONES: { valor: Tema; etiqueta: string; icono: typeof Sun }[] = [
  { valor: 'claro', etiqueta: 'Claro', icono: Sun },
  { valor: 'sistema', etiqueta: 'Automático', icono: Monitor },
  { valor: 'oscuro', etiqueta: 'Oscuro', icono: Moon },
]

/**
 * Tres estados y no dos: "Automático" sigue al celular, que de noche se pone
 * oscuro solo. Mismo tamaño que los otros botones del header (44×44).
 */
export function SelectorTema({ className, sobreColor = false }: {
  className?: string
  /** En los headers, que llevan de fondo el color del barrio. */
  sobreColor?: boolean
}) {
  const [tema, setTema] = useTema()
  return (
    <div role="radiogroup" aria-label="Tema"
      className={cn('inline-flex rounded-sm border', sobreColor ? 'border-white/25' : 'border-line bg-card', className)}>
      {OPCIONES.map(({ valor, etiqueta, icono: Icono }) => (
        <button key={valor} type="button" role="radio" aria-checked={tema === valor}
          title={etiqueta} onClick={() => setTema(valor)}
          className={cn('grid size-11 place-items-center rounded-sm',
            tema === valor
              ? (sobreColor ? 'bg-white/20 text-white' : 'bg-azul-tint text-azul-text')
              : (sobreColor ? 'text-white/75 hover-fino:text-white' : 'text-ink-soft hover-fino:text-ink'))}>
          <Icono className="size-5" strokeWidth={2} aria-hidden />
          <span className="sr-only">{etiqueta}</span>
        </button>
      ))}
    </div>
  )
}
