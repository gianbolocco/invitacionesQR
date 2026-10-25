'use client'
import { useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Campo } from '@/components/dominio/campo'
import { Chips } from '@/components/dominio/chips'
import { useRubrosDelBarrio } from '@/lib/queries/invitaciones'
import { useBorrarContacto, useCrearContacto, useEditarContacto } from '@/lib/queries/contactos'
import type { Contacto } from '@/lib/contactos'

/** Alta o edición de un contacto. Una visita es nombre y DNI; un proveedor suma el rubro. */
export function FormularioContacto({ contacto, onListo }: { contacto?: Contacto; onListo: () => void }) {
  const [kind, setKind] = useState<Contacto['kind']>(contacto?.kind ?? 'visita')
  const [name, setName] = useState(contacto?.name ?? '')
  const [doc, setDoc] = useState(contacto?.doc ?? '')
  const [rubro, setRubro] = useState(contacto?.tradeId ?? '')
  const [intento, setIntento] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const { data: rubros } = useRubrosDelBarrio()
  const lista = rubros?.trades ?? []
  const crear = useCrearContacto()
  const editar = useEditarContacto()
  const borrar = useBorrarContacto()
  const guardando = crear.isPending || editar.isPending
  const errorNombre = intento && !name.trim() ? 'Escribí el nombre.' : null

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setIntento(true)
    if (!name.trim()) return
    const datos = { name: name.trim(), doc: doc.trim() || null, tradeId: kind === 'proveedor' && rubro ? rubro : null }
    if (contacto) await editar.mutateAsync({ id: contacto.id, ...datos })
    else await crear.mutateAsync({ kind, ...datos })
    onListo()
  }

  return (
    <form onSubmit={guardar} noValidate className="flex flex-col gap-5 px-4 pb-8">
      {!contacto && (
        <Campo id="tipo-contacto" etiqueta="Tipo">
          <Chips etiqueta="Tipo de contacto" valor={kind} onCambio={setKind}
            opciones={[{ valor: 'visita', etiqueta: 'Visita' }, { valor: 'proveedor', etiqueta: 'Proveedor' }]} />
        </Campo>
      )}
      <Campo id="nombre-contacto" etiqueta="Nombre" error={errorNombre}>
        <Input id="nombre-contacto" value={name} autoComplete="off" placeholder="Rosa Benítez"
          aria-invalid={Boolean(errorNombre) || undefined} onChange={(e) => setName(e.target.value)} />
      </Campo>
      <Campo id="doc-contacto" etiqueta="Documento (opcional)"
        ayuda={kind === 'proveedor' ? 'Con el DNI ves si su seguro está al día.' : 'Si lo cargás, el guardia no lo tiene que pedir.'}>
        <Input id="doc-contacto" value={doc} className="tabular" placeholder="30.123.456" onChange={(e) => setDoc(e.target.value)} />
      </Campo>
      {kind === 'proveedor' && lista.length > 0 && (
        <Campo id="rubro-contacto" etiqueta="Rubro (opcional)">
          <Select value={rubro} onValueChange={setRubro}>
            <SelectTrigger id="rubro-contacto" className="h-11! w-full"><SelectValue placeholder="Elegí el rubro" /></SelectTrigger>
            <SelectContent>{lista.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
          </Select>
        </Campo>
      )}
      <Button type="submit" size="lg" disabled={guardando}>
        {guardando && <Loader2 className="animate-spin" aria-hidden />}
        {contacto ? 'Guardar cambios' : 'Guardar contacto'}
      </Button>
      {contacto && (
        <Button type="button" variant="ghost" className="text-alto hover:bg-alto-tint hover:text-alto" onClick={() => setBorrando(true)}>
          <Trash2 aria-hidden />Borrar contacto
        </Button>
      )}
      <Dialog open={borrando} onOpenChange={setBorrando}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Borrar a {contacto?.name}?</DialogTitle>
            <DialogDescription>Sale de los contactos de tu casa. Las invitaciones que ya le hiciste quedan.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBorrando(false)}>Cancelar</Button>
            <Button variant="destructive" disabled={borrar.isPending}
              onClick={() => contacto && borrar.mutate(contacto.id, { onSuccess: () => { setBorrando(false); onListo() } })}>
              Borrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  )
}
