'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, Plus } from 'lucide-react'
import { ChromeGarita } from '@/components/garita/chrome'
import { RenglonPlanilla } from '@/components/garita/renglon-planilla'
import { EncabezadoPagina } from '@/components/dominio/encabezado-pagina'
import { Campo } from '@/components/dominio/campo'
import { CampoFecha } from '@/components/dominio/campo-fecha'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { hoyISO, sumarDias } from '@/lib/fechas'
import { useMedia } from '@/lib/use-media'
import { mensajeCargaManual } from '@/lib/gate'
import { useCargarManual } from '@/lib/queries/garita'
import {
  aItems, errorDeFila, filaVacia, leerBorrador, VENTANA_HORAS, type FilaPlanilla, type Planilla,
} from '@/lib/carga-manual'

/** Una sola planilla por navegador: la compu de la garita. */
const CLAVE_BORRADOR = 'pazzit.garita.planilla'
/** El mismo tope que MAX_CARGA_MANUAL en la API. */
const MAX_FILAS = 50

/** Las claves de las filas con algo tipeado. */
const conClaves = (filas: FilaPlanilla[]) => new Set(filas.filter((f) => !filaVacia(f)).map((f) => f.clave))

const filaNueva = (): FilaPlanilla => ({ clave: crypto.randomUUID(), ingreso: '', persona: null, dni: '', salida: '', nota: '' })

/**
 * Para pasar lo que se anotó en papel durante un corte: la planilla entera, en
 * el orden del papel y con el teclado. Es un registro, no una decisión de
 * acceso: no mira cupo ni vigencia (ver registerManual en la API).
 */
export default function CargarMovimientosPage() {
  const router = useRouter()
  const cargar = useCargarManual()
  const escritorio = useMedia('(min-width: 1024px)')
  // null hasta leer el borrador: en el servidor no hay localStorage.
  const [planilla, setPlanilla] = useState<Planilla | null>(null)
  /** Filas que el foco ya dejó: recién ahí se marcan sus errores, no mientras se tipean. */
  const [vistas, setVistas] = useState<ReadonlySet<string>>(new Set())
  const [errorApi, setErrorApi] = useState<{ clave: string; mensaje: string } | null>(null)

  const ingresos = useRef(new Map<string, HTMLInputElement>())
  /** La fila nueva todavía no está en el DOM: su Ingreso toma el foco al montarse. */
  const focoPendiente = useRef<string | null>(null)
  const refIngreso = (clave: string) => (el: HTMLInputElement | null) => {
    if (!el) { ingresos.current.delete(clave); return }
    ingresos.current.set(clave, el)
    if (focoPendiente.current === clave) { focoPendiente.current = null; el.focus() }
  }
  const enfocar = (clave: string) => ingresos.current.get(clave)?.focus()

  useEffect(() => {
    let guardado: string | null = null
    try { guardado = localStorage.getItem(CLAVE_BORRADOR) } catch { /* sin borrador */ }
    const p = leerBorrador(guardado)
    const inicial = p?.filas.length ? p : { fecha: hoyISO(), filas: [filaNueva()] }
    // En el celular, enfocar al entrar abre el teclado encima de la planilla.
    if (window.matchMedia('(min-width: 1024px)').matches) focoPendiente.current = inicial.filas.at(-1)!.clave
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlanilla(inicial)
    // Un borrador recuperado ya se tipeó: sus errores se ven sin tener que pasar por cada fila.
    setVistas(conClaves(inicial.filas))
  }, [])

  useEffect(() => {
    if (!planilla) return
    try {
      if (planilla.filas.every(filaVacia)) localStorage.removeItem(CLAVE_BORRADOR)
      else localStorage.setItem(CLAVE_BORRADOR, JSON.stringify(planilla))
    } catch {
      // Sin localStorage la planilla dura mientras la pestaña esté abierta.
    }
  }, [planilla])

  if (!planilla) return <ChromeGarita><div /></ChromeGarita>
  const { fecha, filas } = planilla

  const errores = new Map(filas.map((f) => [f.clave, filaVacia(f) ? null : errorDeFila(fecha, f, filas)]))
  const conDatos = filas.filter((f) => !filaVacia(f))
  const aCorregir = conDatos.filter((f) => errores.get(f.clave) || errorApi?.clave === f.clave).length
  const n = conDatos.length

  function cambiar(clave: string, cambios: Partial<FilaPlanilla>) {
    setPlanilla((p) => p && { ...p, filas: p.filas.map((f) => (f.clave === clave ? { ...f, ...cambios } : f)) })
    if (errorApi?.clave === clave) setErrorApi(null)
  }

  function agregar() {
    if (filas.length >= MAX_FILAS) return
    const nueva = filaNueva()
    focoPendiente.current = nueva.clave
    setPlanilla((p) => p && { ...p, filas: [...p.filas, nueva] })
  }

  // Enter en la nota: a la fila siguiente, o una nueva si era la última.
  function siguiente(i: number) {
    if (i < filas.length - 1) enfocar(filas[i + 1].clave)
    else agregar()
  }

  function quitar(i: number) {
    const resto = filas.filter((_, j) => j !== i)
    if (resto.length === 0) {
      const nueva = filaNueva()
      focoPendiente.current = nueva.clave
      setPlanilla({ fecha, filas: [nueva] })
    } else {
      setPlanilla({ fecha, filas: resto })
      enfocar((resto[i] ?? resto[i - 1]).clave)
    }
    if (errorApi?.clave === filas[i].clave) setErrorApi(null)
  }

  function guardar() {
    let items
    try {
      items = aItems(planilla!)
    } catch {
      // Una fila pudo salir de la ventana de 48 h desde el último render: se muestran sus errores.
      setVistas(conClaves(filas))
      return
    }
    cargar.mutate(items, {
      onSuccess: () => {
        toast.success(n === 1 ? 'Se cargó 1 movimiento.' : `Se cargaron ${n} movimientos.`)
        const nueva = filaNueva()
        focoPendiente.current = nueva.clave
        setVistas(new Set())
        setErrorApi(null)
        setPlanilla({ fecha, filas: [nueva] })
      },
      onError: (e) => {
        // El índice es de los ítems mandados, que saltean las filas en blanco.
        if (!(e instanceof ApiError && e.fila !== undefined)) return // el hook ya mostró el toast
        const fila = conDatos[e.fila]
        if (!fila) { toast.error(mensajeCargaManual(e)); return }
        setErrorApi({ clave: fila.clave, mensaje: mensajeCargaManual(e) })
        enfocar(fila.clave)
      },
    })
  }

  const renglones = filas.map((f, i) => (
    <RenglonPlanilla key={f.clave} fila={f} numero={i + 1} fecha={fecha} escritorio={escritorio}
      // Lo que se tipee mientras guarda se perdería: al guardar bien la planilla vuelve a una fila vacía.
      bloqueada={cargar.isPending}
      error={errorApi?.clave === f.clave ? errorApi.mensaje : vistas.has(f.clave) ? errores.get(f.clave) ?? null : null}
      refIngreso={refIngreso(f.clave)}
      onCambio={(c) => cambiar(f.clave, c)}
      onQuitar={() => quitar(i)}
      onEnterFinal={() => siguiente(i)}
      onSalir={() => { if (!vistas.has(f.clave)) setVistas((v) => new Set(v).add(f.clave)) }} />
  ))

  return (
    <ChromeGarita>
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <Button variant="ghost" size="sm" className="-ml-3 self-start" onClick={() => router.push('/garita')}>
          <ArrowLeft aria-hidden />Volver a la garita
        </Button>
        <EncabezadoPagina titulo="Cargar movimientos"
          subtitulo={`Para pasar lo que se anotó en papel durante un corte. Se puede cargar lo de las últimas ${VENTANA_HORAS} horas y queda marcado como carga manual.`} />

        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div className="w-60">
            <Campo id="fecha-planilla" etiqueta="Fecha de la planilla">
              <CampoFecha id="fecha-planilla" valor={fecha} min={sumarDias(hoyISO(), -2)}
                onCambio={(f) => {
                  setPlanilla((p) => p && { ...p, fecha: f })
                  // Otra fecha cambia la validez de todas las filas, también las que no se tocaron.
                  setVistas(conClaves(filas))
                }} />
            </Campo>
          </div>
          <p className="max-w-xl pb-1 text-sm text-ink-soft">
            Tab pasa de celda y Enter en la nota agrega una fila. La hora va sin dos puntos (2140); una salida más
            temprana que el ingreso es del día siguiente.
          </p>
        </div>

        {escritorio ? (
          <section aria-label="Planilla" className="rounded-md border border-line bg-card">
            <table className="w-full table-fixed border-collapse">
              <colgroup>
                <col className="w-10" /><col className="w-24" /><col /><col className="w-36" />
                <col className="w-44" /><col className="w-36" /><col className="w-[20%]" /><col className="w-14" />
              </colgroup>
              <thead>
                <tr className="border-b border-line text-left text-[13px] text-ink-soft">
                  <th scope="col" className="py-2.5 pl-3 font-semibold">#</th>
                  {['Ingreso', 'Persona', 'DNI', 'Lote', 'Salida', 'Nota'].map((t) => (
                    <th key={t} scope="col" className="px-3 py-2.5 font-semibold">{t}</th>
                  ))}
                  <th scope="col"><span className="sr-only">Quitar</span></th>
                </tr>
              </thead>
              <tbody>{renglones}</tbody>
            </table>
          </section>
        ) : (
          <div className="flex flex-col gap-3">{renglones}</div>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <Button variant="secondary" onClick={agregar} disabled={filas.length >= MAX_FILAS || cargar.isPending}>
            <Plus aria-hidden />Agregar fila
          </Button>
          <p className="text-sm text-ink-soft" aria-live="polite">
            {aCorregir > 0
              ? <span className="text-alto">{aCorregir === 1 ? 'Hay 1 fila para corregir.' : `Hay ${aCorregir} filas para corregir.`}</span>
              : n > 0 ? 'Borrador guardado en esta compu.' : null}
          </p>
          <Button size="lg" className="w-full sm:ml-auto sm:w-auto"
            disabled={n === 0 || aCorregir > 0 || cargar.isPending} onClick={guardar}>
            {cargar.isPending ? 'Guardando…' : `Guardar ${n} ${n === 1 ? 'movimiento' : 'movimientos'}`}
          </Button>
        </div>
      </div>
    </ChromeGarita>
  )
}
