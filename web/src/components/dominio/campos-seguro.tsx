'use client'
import { Input } from '@/components/ui/input'
import { Campo } from '@/components/dominio/campo'
import { CampoFecha } from '@/components/dominio/campo-fecha'

export type ValorSeguro = { company: string; policy: string; expiresOn: string }

/** Los tres datos del seguro. No sabe nada de la API ni de cuándo se exigen. */
export function CamposSeguro({ valor, onCambio, onBlur, errores, idBase, min }: {
  valor: ValorSeguro
  /** Primer día elegible del vencimiento. */
  min?: string
  onCambio: (v: ValorSeguro) => void
  /** Al salir de cualquiera de los tres campos. */
  onBlur?: () => void
  errores?: Partial<Record<keyof ValorSeguro, string | null>>
  idBase: string
}) {
  const set = (k: keyof ValorSeguro) => (v: string) => onCambio({ ...valor, [k]: v })
  return (
    <div className="flex flex-col gap-4" onBlur={onBlur}>
      <Campo id={`${idBase}-compania`} etiqueta="Compañía" error={errores?.company}>
        <Input id={`${idBase}-compania`} value={valor.company} placeholder="Ej.: La Segunda" autoComplete="off"
          aria-invalid={Boolean(errores?.company) || undefined} aria-describedby={errores?.company ? `${idBase}-compania-nota` : undefined}
          onChange={(e) => set('company')(e.target.value)} />
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id={`${idBase}-poliza`} etiqueta="Número de póliza" error={errores?.policy}>
          <Input id={`${idBase}-poliza`} value={valor.policy} className="tabular" autoComplete="off"
            aria-invalid={Boolean(errores?.policy) || undefined} aria-describedby={errores?.policy ? `${idBase}-poliza-nota` : undefined}
            onChange={(e) => set('policy')(e.target.value)} />
        </Campo>
        <Campo id={`${idBase}-vence`} etiqueta="Vence" error={errores?.expiresOn}>
          <CampoFecha id={`${idBase}-vence`} valor={valor.expiresOn} onCambio={set('expiresOn')} min={min} desplegable />
        </Campo>
      </div>
    </div>
  )
}

/** Los tres o ninguno. */
export function estadoSeguroCargado(v: ValorSeguro): 'vacio' | 'completo' | 'parcial' {
  const n = [v.company.trim(), v.policy.trim(), v.expiresOn].filter(Boolean).length
  return n === 0 ? 'vacio' : n === 3 ? 'completo' : 'parcial'
}

/** Errores por campo si están a medias: el primero vacío lleva la regla entera, los otros solo avisan. */
export function erroresSeguro(v: ValorSeguro): Partial<Record<keyof ValorSeguro, string>> | undefined {
  if (estadoSeguroCargado(v) !== 'parcial') return undefined
  const vacios = (['company', 'policy', 'expiresOn'] as const).filter((k) => !(k === 'expiresOn' ? v[k] : v[k].trim()))
  return Object.fromEntries(vacios.map((k, i) => [k, i === 0 ? 'Completá los tres datos del seguro o dejalos vacíos.' : 'Falta este dato.']))
}
