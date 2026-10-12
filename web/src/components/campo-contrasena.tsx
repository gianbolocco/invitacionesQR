'use client'
import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/** Largo mínimo de toda contraseña. Tiene que coincidir con el de la API (`api/src/lib/contrasena.ts`). */
export const MIN_CONTRASENA = 6

/**
 * Contraseña con mostrar/ocultar: en el celular, tipear a ciegas es la
 * principal causa de "no me deja entrar". El medidor cuenta largo, que es la
 * única regla que hay; no pide símbolos raros.
 */
export function CampoContrasena({ id, value, onChange, autoComplete, medidor = false, required, invalido }: {
  id: string
  value: string
  onChange: (v: string) => void
  autoComplete: 'current-password' | 'new-password'
  medidor?: boolean
  required?: boolean
  invalido?: boolean
}) {
  const [visible, setVisible] = useState(false)
  const faltan = Math.max(0, MIN_CONTRASENA - value.length)
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Input id={id} type={visible ? 'text' : 'password'} autoComplete={autoComplete}
          required={required} value={value} onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalido || undefined} aria-describedby={`${id}-nota`} className="pr-12" />
        <button type="button" onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-md text-ink-soft hover:text-ink">
          {visible ? <EyeOff className="size-[18px]" aria-hidden /> : <Eye className="size-[18px]" aria-hidden />}
        </button>
      </div>
      {medidor && (
        <div className="flex items-center gap-3" aria-live="polite">
          <span aria-hidden className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunk">
            <span className={cn('block h-full rounded-full transition-[width,background-color] duration-300',
              faltan === 0 ? 'bg-marca' : 'bg-ink-soft/50')}
              style={{ width: `${Math.min(100, (value.length / MIN_CONTRASENA) * 100)}%` }} />
          </span>
          <span className="shrink-0 text-xs text-ink-soft tabular">
            {faltan === 0 ? 'Lista' : `Faltan ${faltan}`}
          </span>
        </div>
      )}
    </div>
  )
}
