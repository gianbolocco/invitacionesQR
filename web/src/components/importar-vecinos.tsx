'use client'
import { useState } from 'react'
import { Upload } from 'lucide-react'
import { ApiError, api } from '@/lib/api'
import { Button, ErrorNote, Eyebrow } from '@/components/ui'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

type FilaPreview = {
  line: number
  name: string
  email: string
  lot: number | null
  status: 'ready' | 'invalid' | 'duplicate_file' | 'existing'
  errors: string[]
}

type Preview = {
  rows: FilaPreview[]
  summary: { total: number; ready: number; duplicates: number; invalid: number }
}

type ResultadoFila = {
  line: number
  name: string
  email: string
  lot: number | null
  status: 'created' | 'mail_failed' | 'existing' | 'failed'
}

const TAMANO_MAXIMO = 1_000_000
const TAMANO_TANDA = 20
const PLANTILLA = '\uFEFFnombre;email;lote\r\n"Ana Pérez";ana@gmail.com;142\r\n"Juan Gómez";juan@gmail.com;\r\n'

function descargarPlantilla() {
  const archivo = new Blob([PLANTILLA], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(archivo)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = 'plantilla-vecinos.csv'
  enlace.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function estadoPreview(row: FilaPreview): string {
  if (row.status === 'ready') return 'Lista para importar'
  if (row.status === 'existing') return 'Ya está en el padrón'
  if (row.status === 'duplicate_file') return 'Correo repetido en el archivo'
  return row.errors.join(' · ')
}

function estadoResultado(row: ResultadoFila): string {
  if (row.status === 'created') return 'Alta creada · invitación aceptada por Resend'
  if (row.status === 'mail_failed') return 'Alta creada · correo fallido; se puede reenviar'
  if (row.status === 'existing') return 'Ya estaba en el padrón · omitido'
  return 'No se pudo crear · volver a revisar esta fila'
}

export function ImportarVecinos({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false)
  const [archivo, setArchivo] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [resultados, setResultados] = useState<ResultadoFila[]>([])
  const [error, setError] = useState<string | null>(null)
  const [leyendo, setLeyendo] = useState(false)
  const [importando, setImportando] = useState(false)
  const [confirmado, setConfirmado] = useState(false)
  const [progreso, setProgreso] = useState(0)

  async function seleccionarArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setArchivo(file.name)
    setPreview(null)
    setResultados([])
    setConfirmado(false)
    setProgreso(0)
    setError(null)

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Elegí un archivo .csv exportado desde Excel.')
      return
    }
    if (file.size > TAMANO_MAXIMO) {
      setError('El archivo supera el límite de 1 MB.')
      return
    }

    setLeyendo(true)
    try {
      const csv = await file.text()
      const data = await api<Preview>('/admin/people/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: csv,
      })
      setPreview(data)
    } catch (cause) {
      const code = cause instanceof ApiError ? cause.code : ''
      if (code === 'csv_columnas_requeridas') {
        setError('El CSV debe tener encabezados nombre y email; lote es opcional.')
      } else if (code === 'csv_demasiadas_filas') {
        setError('El archivo supera el máximo de 1000 vecinos por importación.')
      } else {
        setError('No pudimos leer el CSV. Descargá la plantilla y verificá que sea válido.')
      }
    } finally {
      setLeyendo(false)
    }
  }

  async function confirmarImportacion() {
    if (!preview || importando) return
    const listas = preview.rows.filter((row) => row.status === 'ready')
    if (!listas.length) return

    setImportando(true)
    setConfirmado(false)
    setError(null)
    setResultados([])
    setProgreso(0)
    let completadas = 0
    try {
      for (let inicio = 0; inicio < listas.length; inicio += TAMANO_TANDA) {
        const tanda = listas.slice(inicio, inicio + TAMANO_TANDA)
        const respuesta = await api<{ results: ResultadoFila[] }>('/admin/people/import', {
          method: 'POST',
          body: JSON.stringify({
            rows: tanda.map(({ line, name, email, lot }) => ({ line, name, email, lot })),
          }),
        })
        setResultados((actuales) => [...actuales, ...respuesta.results])
        completadas = Math.min(inicio + tanda.length, listas.length)
        setProgreso(completadas)
      }
      setConfirmado(true)
      onImported()
    } catch {
      setError(`Se interrumpió la importación después de ${completadas} de ${listas.length} filas. Lo ya cargado queda guardado; si volvés a subir el CSV, esas direcciones se omiten.`)
      onImported()
    } finally {
      setImportando(false)
    }
  }

  return (
    <>
      <Button type="button" variant="quiet" className="min-h-10 self-start px-3 text-sm"
        onClick={() => setOpen(true)}>
        <Upload aria-hidden className="mr-2 size-4" />
        Importar desde CSV
      </Button>
      <Dialog open={open} onOpenChange={(next) => { if (!importando || next) setOpen(next) }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Importar vecinos desde CSV</DialogTitle>
            <DialogDescription>
              Subí el padrón, revisá los datos y confirmá las altas. No se envía nada antes de confirmar.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <Eyebrow>Importación masiva</Eyebrow>
            <p className="mt-1 text-sm text-muted-foreground">
              Cargá varios vecinos de una vez. El rol será vecino; el lote es opcional.
            </p>
          </div>
          <Button type="button" variant="quiet" onClick={descargarPlantilla}>
            Descargar plantilla CSV
          </Button>
        </div>

        <label className="mt-4 flex flex-col gap-1.5 text-sm font-medium">
          Archivo CSV
          <input type="file" accept=".csv,text/csv" disabled={leyendo || importando}
            onChange={seleccionarArchivo}
            className="min-h-12 w-full rounded-md border border-input bg-card px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1.5 file:font-semibold disabled:opacity-50" />
        </label>
        <p className="mt-1 text-xs text-muted-foreground">
          Columnas: <code>nombre;email;lote</code>. El lote se puede dejar vacío. Máximo 1 MB y 1000 filas.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          El proveedor de correo puede aplicar límites diarios. Si algún envío falla, el vecino queda cargado y podés reenviar desde el padrón.
        </p>

        {leyendo && <p role="status" className="mt-4 text-sm text-muted-foreground">Validando archivo…</p>}
        {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}

        {/* Una vez que empiezan a llegar resultados, la tabla de preview deja
            paso a la de resultados: mostrar las dos a la vez confundía sobre
            cuál reflejaba el estado real. */}
        {preview && resultados.length === 0 && (
          <div className="mt-5 flex flex-col gap-4 border-t border-border pt-4">
            <div>
              <h2 className="font-semibold">Confirmá antes de dar las altas</h2>
              <p className="mt-1 text-sm text-muted-foreground">{archivo} · {preview.summary.total} filas</p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <p className="rounded-md bg-muted px-3 py-2"><strong>{preview.summary.ready}</strong> nuevas</p>
              <p className="rounded-md bg-muted px-3 py-2"><strong>{preview.summary.duplicates}</strong> duplicadas/existentes</p>
              <p className="rounded-md bg-muted px-3 py-2"><strong>{preview.summary.invalid}</strong> con errores</p>
              <p className="rounded-md bg-muted px-3 py-2"><strong>{preview.summary.total}</strong> total</p>
            </div>

            <div className="max-h-80 overflow-auto rounded-md border border-border">
              <table className="w-full min-w-[38rem] border-collapse text-left text-sm">
                <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Fila</th>
                    <th className="px-3 py-2">Nombre</th>
                    <th className="px-3 py-2">Mail</th>
                    <th className="px-3 py-2">Lote</th>
                    <th className="px-3 py-2">Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr key={`${row.line}-${row.email}`} className="border-t border-border align-top">
                      <td className="px-3 py-2 tabular-nums">{row.line}</td>
                      <td className="px-3 py-2">{row.name || '—'}</td>
                      <td className="px-3 py-2">{row.email || '—'}</td>
                      <td className="px-3 py-2 tabular-nums">{row.lot ?? '—'}</td>
                      <td className={`px-3 py-2 ${row.status === 'ready' ? 'text-foreground' : 'text-destructive'}`}>
                        {estadoPreview(row)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={importando || preview.summary.ready === 0}
                onClick={confirmarImportacion}>
                {importando ? 'Importando…' : `Confirmar e invitar ${preview.summary.ready}`}
              </Button>
              <Button type="button" variant="quiet" disabled={importando}
                onClick={() => { setPreview(null); setResultados([]); setError(null); setConfirmado(false) }}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {/* Se arma apenas llega la primera tanda, no recién al terminar: si
            una tanda de más adelante falla, lo ya importado queda visible en
            vez de perderse detrás del mensaje de error genérico. */}
        {resultados.length > 0 && (
          <div className="mt-5 flex flex-col gap-3 border-t border-border pt-4">
            <h2 className="font-semibold">
              {importando ? 'Importando…' : confirmado ? 'Importación terminada' : 'Importación interrumpida'}
            </h2>
            {importando && preview && (
              <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
                {progreso} de {preview.summary.ready}. No cierres esta página.
              </p>
            )}
            <div className="max-h-64 overflow-auto rounded-md border border-border">
              <table className="w-full min-w-[30rem] border-collapse text-left text-sm">
                <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
                  <tr><th className="px-3 py-2">Fila</th><th className="px-3 py-2">Vecino</th><th className="px-3 py-2">Mail</th><th className="px-3 py-2">Estado</th></tr>
                </thead>
                <tbody>
                  {resultados.map((row) => (
                    <tr key={`${row.line}-${row.email}`} className="border-t border-border">
                      <td className="px-3 py-2 tabular-nums">{row.line}</td>
                      <td className="px-3 py-2">{row.name}</td>
                      <td className="px-3 py-2">{row.email}</td>
                      <td className="px-3 py-2">{estadoResultado(row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Si un correo falló, el vecino ya quedó en el padrón y podés usar Reenviar desde su ficha.
            </p>
            {!importando && (
              <Button type="button" variant="quiet" className="self-start"
                onClick={() => { setPreview(null); setResultados([]); setError(null); setConfirmado(false) }}>
                {confirmado ? 'Importar otro archivo' : 'Cerrar'}
              </Button>
            )}
          </div>
        )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
