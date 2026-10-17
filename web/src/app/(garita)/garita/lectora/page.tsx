'use client'
import { useState } from 'react'
import { ChromeGarita } from '@/components/garita/chrome'
import { EncabezadoPagina } from '@/components/dominio/encabezado-pagina'
import { useLectora } from '@/lib/use-lectora'
import { interpretarLectura, repararTexto, type Rafaga } from '@/lib/lectora'

type Registro = Rafaga & { id: number; enTanda: boolean }

function interpretacion(texto: string) {
  const l = interpretarLectura(texto)
  if (!l) return 'No reconocido'
  return l.tipo === 'qr' ? `QR · token ${l.token}` : `DNI ${l.documento} · ${l.nombre} ${l.apellido}`
}

/** Un DNI trae fecha de nacimiento y trámite: se muestra solo hasta el 5.º campo (spec 3.6). */
function recortar(texto: string) {
  let n = 0
  for (let i = 0; i < texto.length; i++) {
    if ((texto[i] === '@' || texto[i] === '"') && ++n === 5) return `${texto.slice(0, i)}…`
  }
  return texto
}

/**
 * Para instalar una lectora nueva: qué mandó, a qué ritmo y cómo se entendió.
 * Todo en memoria, no se manda a ningún lado; no navega ni registra nada.
 */
export default function ProbarLectoraPage() {
  const [registros, setRegistros] = useState<Registro[]>([])
  useLectora({
    onRafaga: (r, enTanda) => setRegistros((rs) => [{ ...r, enTanda, id: Date.now() + Math.random() }, ...rs].slice(0, 10)),
  })

  return (
    <ChromeGarita>
      <EncabezadoPagina titulo="Probar lectora" className="mb-6"
        subtitulo="Escaneá un QR de invitación y un DNI. Si algo sale “No reconocido”, mirá el texto crudo." />
      {registros.length === 0 && <p className="text-ink-soft">Esperando una lectura…</p>}
      <ul className="flex flex-col gap-3">
        {registros.map((r) => {
          const reparado = repararTexto(r.texto)
          const esDni = interpretarLectura(r.texto)?.tipo === 'dni'
          return (
          <li key={r.id} className="rounded-md border border-border p-4">
            <p className="font-semibold">{r.esLectura ? interpretacion(r.texto) : 'No pasó como lectura (¿muy lenta o muy corta?)'}</p>
            <p className="mt-1 break-all font-mono text-sm">{esDni ? recortar(r.texto) : r.texto}</p>
            {reparado !== r.texto && (
              <p className="mt-1 break-all font-mono text-sm">Reparado: {esDni ? recortar(reparado) : reparado}</p>
            )}
            <p className="mt-1 text-sm tabular text-ink-soft">
              {r.texto.length} caracteres · promedio {r.promedioMs} ms · hueco máx. {r.huecoMaxMs} ms · fin: {r.terminador}
            </p>
            {r.enTanda && <p className="mt-1 text-sm font-semibold">Llegó en tanda: configurá la lectora en envío inmediato.</p>}
          </li>
          )
        })}
      </ul>
    </ChromeGarita>
  )
}
