'use client'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Fila } from '@/components/dominio/fila'
import { useContactos } from '@/lib/queries/contactos'
import { agruparContactos, filtrarContactos, lineaContacto, type Contacto } from '@/lib/contactos'

const NUEVA = '/invitaciones/nueva'

function Grupo({ titulo, cs }: { titulo: string; cs: Contacto[] }) {
  if (!cs.length) return null
  return (
    <section aria-label={titulo}>
      <h3 className="mb-1 mt-4 text-[13px] font-semibold text-ink-soft">{titulo}</h3>
      <ul>{cs.map((c) => (
        <li key={c.id}><Fila titulo={c.name} meta={lineaContacto(c)} href={`${NUEVA}?contacto=${c.id}`} /></li>
      ))}</ul>
    </section>
  )
}

/** "Nueva invitación" arranca por a quién: elegir un contacto deja solo la fecha. */
export function ElegirContacto({ abierto, onAbiertoChange }: { abierto: boolean; onAbiertoChange: (v: boolean) => void }) {
  const q = useContactos()
  const [busca, setBusca] = useState('')
  const { visitas, proveedores } = agruparContactos(filtrarContactos(q.data ?? [], busca, 'todos'))
  const cerrar = () => { onAbiertoChange(false); setBusca('') }
  return (
    <Sheet open={abierto} onOpenChange={(v) => (v ? onAbiertoChange(true) : cerrar())}>
      <SheetContent onOpenAutoFocus={(e) => e.preventDefault()}>
        <SheetHeader>
          <SheetTitle>¿A quién invitás?</SheetTitle>
          <SheetDescription className="sr-only">Elegí un contacto o invitá a alguien nuevo.</SheetDescription>
        </SheetHeader>
        {/* En la página nueva el link solo cambia el ?contacto=: la página no se desmonta y la hoja quedaría abierta. */}
        <div className="flex flex-col px-4 pb-8"
          onClick={(e) => { if ((e.target as HTMLElement).closest('a')) cerrar() }}>
          <Input aria-label="Buscar en tus contactos" placeholder="Buscá en tus contactos" value={busca}
            onChange={(e) => setBusca(e.target.value)} />
          <Fila href={NUEVA} titulo={<span className="flex items-center gap-2"><Plus aria-hidden className="size-4" />Alguien nuevo</span>} />
          <Grupo titulo="Visitas" cs={visitas} />
          <Grupo titulo="Proveedores" cs={proveedores} />
        </div>
      </SheetContent>
    </Sheet>
  )
}
