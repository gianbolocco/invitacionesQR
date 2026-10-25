'use client'
import { useState } from 'react'
import Link from 'next/link'
import { BookUser, Plus } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { EncabezadoPagina } from '@/components/dominio/encabezado-pagina'
import { Chips } from '@/components/dominio/chips'
import { Fila } from '@/components/dominio/fila'
import { Vacio } from '@/components/dominio/vacio'
import { SkeletonFilas } from '@/components/dominio/skeleton-filas'
import { ErrorConReintento } from '@/components/dominio/error-con-reintento'
import { FormularioContacto } from '@/components/vecino/formulario-contacto'
import { useContactos } from '@/lib/queries/contactos'
import { filtrarContactos, lineaContacto, type Contacto } from '@/lib/contactos'
import { cn } from '@/lib/utils'

type Tipo = 'todos' | 'visita' | 'proveedor'

export default function ContactosPage() {
  const q = useContactos()
  const [tipo, setTipo] = useState<Tipo>('todos')
  const [busca, setBusca] = useState('')
  // undefined = hoja cerrada; null = alta; un contacto = edición.
  const [hoja, setHoja] = useState<Contacto | null | undefined>(undefined)
  const todos = q.data ?? []
  const lista = filtrarContactos(todos, busca, tipo)
  const cuenta = (t: Tipo) => filtrarContactos(todos, '', t).length

  return (
    <div className="flex flex-col gap-6 pb-24 sm:pb-0">
      <EncabezadoPagina titulo="Contactos"
        acciones={<Button size="lg" className="hidden sm:inline-flex" onClick={() => setHoja(null)}><Plus aria-hidden />Agregar contacto</Button>} />

      {q.isPending ? <SkeletonFilas /> : q.isError ? (
        <ErrorConReintento onReintentar={() => q.refetch()} reintentando={q.isFetching} />
      ) : todos.length === 0 ? (
        <Vacio icono={BookUser} titulo="Todavía no guardaste contactos"
          detalle="Guardá a los que vienen seguido y los invitás en dos toques."
          accion={<Button onClick={() => setHoja(null)}><Plus aria-hidden />Agregar contacto</Button>} />
      ) : (
        <>
          <Chips etiqueta="Filtrar contactos" valor={tipo} onCambio={setTipo} desplaza
            opciones={[
              { valor: 'todos', etiqueta: 'Todos', contador: cuenta('todos') },
              { valor: 'visita', etiqueta: 'Visitas', contador: cuenta('visita') },
              { valor: 'proveedor', etiqueta: 'Proveedores', contador: cuenta('proveedor') },
            ]} />
          <Input aria-label="Buscar contacto" placeholder="Nombre o DNI" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <ul>
            {lista.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <Fila className="flex-1" titulo={c.name} meta={lineaContacto(c)} onClick={() => setHoja(c)} />
                <Link href={`/invitaciones/nueva?contacto=${c.id}`}
                  className={cn(buttonVariants({ size: 'sm' }), 'shrink-0')}>Invitar</Link>
              </li>
            ))}
          </ul>
          {lista.length === 0 && <p className="text-sm text-ink-soft">{busca.trim() ? `Nadie coincide con “${busca.trim()}”.` : 'No hay contactos de este tipo.'}</p>}
        </>
      )}

      {todos.length > 0 && (
        <Button size="lg" onClick={() => setHoja(null)}
          className="fixed inset-x-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] z-20 shadow-(--sombra-flotante) sm:hidden">
          <Plus aria-hidden />Agregar contacto
        </Button>
      )}

      <Sheet open={hoja !== undefined} onOpenChange={(v) => { if (!v) setHoja(undefined) }}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{hoja ? 'Editar contacto' : 'Nuevo contacto'}</SheetTitle>
            <SheetDescription>Lo ven y lo usan todos los que viven en tu casa.</SheetDescription>
          </SheetHeader>
          {hoja !== undefined && <FormularioContacto key={hoja?.id ?? 'nuevo'} contacto={hoja ?? undefined} onListo={() => setHoja(undefined)} />}
        </SheetContent>
      </Sheet>
    </div>
  )
}
