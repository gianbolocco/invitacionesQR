'use client'
import { Input } from '@/components/ui/input'
import { Campo } from '@/components/dominio/campo'
import { CampoFecha } from '@/components/dominio/campo-fecha'

export type ValorSeguro = { company: string; policy: string; expiresOn: string }

/** Los tres datos del seguro. No sabe nada de la API ni de cuándo se exigen. */
export function CamposSeguro({ valor, onCambio, errores, idBase }: {
  valor: ValorSeguro
  onCambio: (v: ValorSeguro) => void
  errores?: Partial<Record<keyof ValorSeguro, string | null>>
  idBase: string
}) {
  const set = (k: keyof ValorSeguro) => (v: string) => onCambio({ ...valor, [k]: v })
  return (
    <div className="flex flex-col gap-4">
      <Campo id={`${idBase}-compania`} etiqueta="Compañía" error={errores?.company}>
        <Input id={`${idBase}-compania`} value={valor.company} placeholder="Ej.: La Segunda" autoComplete="off"
          aria-invalid={Boolean(errores?.company) || undefined} aria-describedby={`${idBase}-compania-nota`}
          onChange={(e) => set('company')(e.target.value)} />
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id={`${idBase}-poliza`} etiqueta="Número de póliza" error={errores?.policy}>
          <Input id={`${idBase}-poliza`} value={valor.policy} className="tabular" autoComplete="off"
            aria-invalid={Boolean(errores?.policy) || undefined} aria-describedby={`${idBase}-poliza-nota`}
            onChange={(e) => set('policy')(e.target.value)} />
        </Campo>
        <Campo id={`${idBase}-vence`} etiqueta="Vence" error={errores?.expiresOn}>
          <CampoFecha id={`${idBase}-vence`} valor={valor.expiresOn} onCambio={set('expiresOn')} />
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
