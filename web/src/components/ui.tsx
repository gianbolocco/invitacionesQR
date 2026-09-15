import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'

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
  variant?: 'primary' | 'quiet'
}

/** min-h-14 en primario: 56px, el pulgar del vecino en la calle. */
export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  const base = 'inline-flex min-h-12 items-center justify-center rounded px-5 font-semibold ' +
    'transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
  const look = variant === 'primary'
    ? 'min-h-14 bg-alamo text-white hover:bg-alamo-deep'
    : 'border border-alamo/30 text-alamo hover:bg-alamo/5'
  return <button className={`${base} ${look} ${className}`} {...props} />
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }

export function Field({ label, hint, id, className = '', ...props }: FieldProps) {
  const inputId = id ?? `f-${label.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-semibold">{label}</label>
      <input
        id={inputId}
        className={`min-h-12 rounded border border-ink/15 bg-white px-3 text-base
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
