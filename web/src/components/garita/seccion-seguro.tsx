'use client'
import { CamposSeguro, estadoSeguroCargado, type ValorSeguro } from '@/components/dominio/campos-seguro'
import { textoEstado, type EstadoSeguro, type SeguroDatos } from '@/lib/seguro'
import { fechaCompleta, hoyISO } from '@/lib/fechas'

/**
 * Una sección de la ficha del veredicto: un título, el estado de su seguro al
 * lado (lo que el guardia lee de un vistazo) y sus filas. Si la sección lleva
 * seguro, se muestra como texto con "Corregir", o como campos cuando falta,
 * venció o el guardia lo está corrigiendo.
 */
export function SeccionSeguro({
  titulo, estado, guardado, quien, abierto, valor, onCambio, onCorregir, onGuardar, guardando, idBase, fechaPasada, requerido, buscando, children,
}: {
  titulo: string
  estado: EstadoSeguro
  guardado: SeguroDatos | null
  quien?: string | null
  abierto: boolean
  valor: ValorSeguro
  onCambio: (v: ValorSeguro) => void
  onCorregir?: () => void
  onGuardar?: () => void
  guardando?: boolean
  idBase: string
  fechaPasada?: boolean
  /** Si falta, frena el ingreso. Si no (p. ej. lo autorizó la portería), cargarlo es opcional. */
  requerido?: boolean
  /** El veredicto todavía es de otro documento o patente: el estado no vale. */
  buscando?: boolean
  children?: React.ReactNode
}) {
  const texto = estado === 'no_aplica' ? '' : buscando ? 'Buscando…' : textoEstado(estado, guardado?.expiresOn ?? null, hoyISO())
  const mal = estado === 'sin_cargar' || estado === 'vencido'
  return (
    <section aria-labelledby={`${idBase}-titulo`} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id={`${idBase}-titulo`} className="text-xl font-bold tracking-[-0.01em] sm:text-2xl">{titulo}</h2>
        {texto && (
          // El estado lleva palabra y borde, no solo color: se lee igual sobre NO PASA y sobre INGRESO.
          <span className={`rounded-full border px-2.5 py-0.5 text-sm font-semibold ${mal && !buscando ? 'border-current' : 'border-current/40'}`}>
            {texto}
          </span>
        )}
        {onCorregir && !abierto && guardado && estado !== 'no_aplica' && (
          <button type="button" onClick={onCorregir} aria-label={`Corregir seguro · ${titulo}`} className="ml-auto min-h-11 text-sm font-semibold underline underline-offset-4">
            Corregir
          </button>
        )}
      </div>

      <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-6 gap-y-2.5 text-lg sm:text-xl">
        {children}
        {estado !== 'no_aplica' && !abierto && guardado && (
          <>
            <dt className="opacity-80">Seguro</dt>
            <dd className="min-w-0 break-words font-semibold tabular">
              {guardado.company} · {guardado.policy} · vence {fechaCompleta(guardado.expiresOn)}
              {quien && <span className="block text-base font-normal opacity-80">{quien}</span>}
            </dd>
          </>
        )}
      </dl>

      {estado !== 'no_aplica' && abierto && (
        // Las etiquetas de Campo son text-ink: sobre NO PASA no se leerían. Acá toman el color del veredicto.
        <div className="flex flex-col gap-3 [&_label]:text-current">
          {mal && !guardado && <p className="text-base font-semibold">{requerido ? 'Pedile el certificado y cargalo.' : 'Opcional: si lo tiene, cargalo.'}</p>}
          <CamposSeguro idBase={idBase} valor={valor} onCambio={onCambio} min={hoyISO()} />
          {fechaPasada && <p className="text-base font-semibold">La fecha cargada ya pasó.</p>}
          {onGuardar && (
            <button type="button" onClick={onGuardar} disabled={guardando || estadoSeguroCargado(valor) !== 'completo'}
              className="min-h-12 rounded border-2 border-current/50 text-lg font-bold disabled:opacity-50">
              {guardando ? 'Guardando…' : 'Guardar corrección'}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
