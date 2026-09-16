import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, Ref } from 'react'

/** El doble filete del cartel de entrada. Envuelve paneles y tarjetas. */
export function Filete({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className="filete">
      <div className={className}>{children}</div>
    </div>
  )
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="eyebrow">{children}</p>
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'quiet' | 'peligro'
  ref?: Ref<HTMLButtonElement>
}

/** min-h-14 en primario: 56px, el pulgar del vecino en la calle. */
export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  const base = 'inline-flex min-h-12 items-center justify-center rounded px-5 font-semibold ' +
    'transition-[background-color,border-color,opacity] active:scale-[0.99] ' +
    'disabled:opacity-50 disabled:cursor-not-allowed'
  const look = {
    primary: 'min-h-14 bg-alamo text-surface hover:bg-alamo-deep',
    quiet: 'border border-alamo/30 text-alamo hover:bg-alamo/5',
    peligro: 'min-h-14 bg-deny-field text-deny-ink hover:opacity-90',
  }[variant]
  return <button className={`${base} ${look} ${className}`} {...props} />
}

/**
 * Un estado vacío es una invitación a hacer algo, no un cartel de "no hay nada".
 * Por eso la acción viene adentro y no al final de una lista que no existe.
 */
export function Vacio({ titulo, detalle, children }: {
  titulo: string
  detalle?: string
  children?: ReactNode
}) {
  return (
    <Filete className="flex flex-col items-center gap-4 bg-card px-5 py-10 text-center">
      <div>
        <p className="display text-lg">{titulo}</p>
        {detalle && <p className="mt-1 text-ink-soft">{detalle}</p>}
      </div>
      {children}
    </Filete>
  )
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }

export function Field({ label, hint, id, className = '', ...props }: FieldProps) {
  const inputId = id ?? `f-${label.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-semibold">{label}</label>
      <input
        id={inputId}
        className={`min-h-12 rounded border border-line bg-card px-3 text-base
          placeholder:text-ink-soft/60 ${className}`}
        {...props}
      />
      {hint && <p className="text-sm text-ink-soft">{hint}</p>}
    </div>
  )
}

/**
 * Los errores dicen qué hacer, no qué pasó. `role="alert"` para que el lector
 * de pantalla lo anuncie sin que el usuario tenga que ir a buscarlo.
 */
export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded border-l-4 border-deny-field bg-deny-field/5 px-3 py-2 text-sm">
      {children}
    </p>
  )
}

/**
 * Tres estados y no dos: "Sistema" tiene que existir, porque quien tiene el
 * celular en oscuro automático de noche espera que la app lo siga sola.
 * Un toggle de dos lo obliga a elegir un tema fijo para siempre.
 */
export function TemaToggle({ tema, onTema }: {
  tema: 'sistema' | 'claro' | 'oscuro'
  onTema: (t: 'sistema' | 'claro' | 'oscuro') => void
}) {
  const opciones = [
    { id: 'claro', label: 'Claro', icono: '☀' },
    { id: 'sistema', label: 'Auto', icono: '◐' },
    { id: 'oscuro', label: 'Oscuro', icono: '☾' },
  ] as const

  return (
    <div role="radiogroup" aria-label="Tema"
      className="flex rounded-full border border-line">
      {opciones.map((o) => (
        <button key={o.id} role="radio" aria-checked={tema === o.id}
          title={o.label} onClick={() => onTema(o.id)}
          className={`flex size-9 items-center justify-center rounded-full text-sm
            transition-colors ${
              tema === o.id ? 'bg-alamo text-surface' : 'text-ink-soft'
            }`}>
          <span aria-hidden>{o.icono}</span>
          <span className="sr-only">{o.label}</span>
        </button>
      ))}
    </div>
  )
}

/** Lockup del encabezado: la itálica del cartel vive acá y en ningún otro lado. */
export function Wordmark({ subtitle = 'Barrio cerrado' }: { subtitle?: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="font-[family-name:var(--font-playfair)] text-2xl italic text-alamo">
        Álamo Alto
      </span>
      <span className="eyebrow">{subtitle}</span>
    </div>
  )
}
