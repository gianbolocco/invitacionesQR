'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Inbox, Plus, Trash2 } from 'lucide-react'
import { Marca } from '@/components/dominio/marca'
import { EstadoTag } from '@/components/dominio/estado-tag'
import { Fila } from '@/components/dominio/fila'
import { EncabezadoPagina } from '@/components/dominio/encabezado-pagina'
import { Vacio } from '@/components/dominio/vacio'
import { ErrorConReintento } from '@/components/dominio/error-con-reintento'
import { Chips, ChipsMultiples } from '@/components/dominio/chips'
import { SkeletonPantalla } from '@/components/dominio/skeleton-pantalla'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-line pb-8">
      <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-soft">{titulo}</h2>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </section>
  )
}

export function Kit() {
  const [on, setOn] = useState(true)
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 p-6">
      <h1 className="titulo-display text-[40px]">Kit <em>VisitPass.</em></h1>

      <Bloque titulo="Botones">
        <Button><Plus />Nueva invitación</Button>
        <Button variant="outline">Copiar link</Button>
        <Button variant="secondary">Secundario</Button>
        <Button variant="ghost">Fantasma</Button>
        <Button variant="destructive"><Trash2 />Anular</Button>
        <Button variant="link">Link</Button>
        <Button size="sm">Chico</Button>
        <Button size="lg">Grande</Button>
        <Button disabled>Deshabilitado</Button>
      </Bloque>

      <Bloque titulo="Campos">
        <div className="flex w-72 flex-col gap-1.5">
          <Label htmlFor="k-nombre">Nombre del invitado</Label>
          <Input id="k-nombre" placeholder="Juan Pérez" />
        </div>
        <div className="flex items-center gap-2"><Switch checked={on} onCheckedChange={setOn} id="k-sw" /><Label htmlFor="k-sw">Solo las mías</Label></div>
        <Badge>Etiqueta</Badge>
      </Bloque>

      <Bloque titulo="Skeletons">
        <div className="flex w-80 flex-col gap-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-4 w-52" />
        </div>
      </Bloque>

      <Bloque titulo="Tabs">
        <Tabs defaultValue="esperando" className="w-96">
          <TabsList>
            <TabsTrigger value="esperando">Esperando 2</TabsTrigger>
            <TabsTrigger value="adentro">Adentro 1</TabsTrigger>
            <TabsTrigger value="frecuentes">Frecuentes</TabsTrigger>
          </TabsList>
          <TabsContent value="esperando" className="text-ink-soft">Lista de esperando</TabsContent>
          <TabsContent value="adentro" className="text-ink-soft">Lista de adentro</TabsContent>
          <TabsContent value="frecuentes" className="text-ink-soft">Frecuentes</TabsContent>
        </Tabs>
      </Bloque>

      <Bloque titulo="Superposiciones">
        <Dialog>
          <DialogTrigger asChild><Button variant="outline">Abrir diálogo</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>¿Anular la invitación de Sofía?</DialogTitle>
              <DialogDescription>No va a poder entrar. Si ya estaba en la barrera, avisale.</DialogDescription>
            </DialogHeader>
            <DialogFooter><Button variant="destructive">Anular</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        <Sheet>
          <SheetTrigger asChild><Button variant="outline">Abrir panel</Button></SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Dar de alta un vecino</SheetTitle>
              <SheetDescription>Le llega un link para crear su contraseña.</SheetDescription>
            </SheetHeader>
          </SheetContent>
        </Sheet>
        <Button variant="outline" onClick={() => toast.success('Invitación anulada', {
          action: { label: 'Deshacer', onClick: () => toast('Restaurada') },
        })}>Toast</Button>
      </Bloque>

      <Bloque titulo="Marca">
        <Marca />
        <span className="rounded-lg bg-marca px-4 py-3"><Marca variante="banda" /></span>
        <Marca variante="grande" />
      </Bloque>

      <Bloque titulo="Estados">
        {(['esperando', 'adentro', 'salio', 'concluida', 'anulada', 'vencida', 'invitado', 'activo', 'deshabilitado'] as const)
          .map((e) => <EstadoTag key={e} estado={e} detalle={e === 'adentro' ? '14:02' : undefined} />)}
      </Bloque>

      <Bloque titulo="Encabezado y filas">
        <div className="w-full max-w-md">
          <EncabezadoPagina antetitulo="Lote 142" titulo={<>Hola, <em>Lucía.</em></>} />
          <div className="mt-4">
            <Fila titulo="Martín Gómez" meta="Visita · entró 14:02" extremo={<EstadoTag estado="adentro" />} onClick={() => {}} />
            <Fila titulo="Sofía Ledesma" meta="Visita · hoy" extremo={<EstadoTag estado="esperando" />} href="/kit" />
            <Fila titulo="Rosa Benítez" meta="Frecuente · Lun Mié Vie" extremo={<EstadoTag estado="esperando" />} />
          </div>
        </div>
      </Bloque>

      <Bloque titulo="Chips">
        <ChipsDemo />
      </Bloque>

      <Bloque titulo="Vacío y error">
        <div className="w-80 rounded-lg border border-line bg-card">
          <Vacio icono={Inbox} titulo="Todavía no invitaste a nadie" detalle="Creá una invitación y compartila por WhatsApp." accion={<Button>Nueva invitación</Button>} />
        </div>
        <div className="w-80 rounded-lg border border-line bg-card">
          <ErrorConReintento onReintentar={() => toast('Reintentando')} />
        </div>
      </Bloque>

      <Bloque titulo="Skeleton de pantalla">
        <div className="w-full rounded-lg border border-line"><SkeletonPantalla filas={3} /></div>
      </Bloque>
    </main>
  )
}

function ChipsDemo() {
  const [tipo, setTipo] = useState<'visita' | 'frecuente' | 'proveedor'>('visita')
  const [dias, setDias] = useState<string[]>(['1', '3'])
  return (
    <div className="flex flex-col gap-3">
      <Chips etiqueta="Tipo" valor={tipo} onCambio={setTipo} opciones={[
        { valor: 'visita', etiqueta: 'Visita' },
        { valor: 'frecuente', etiqueta: 'Frecuente' },
        { valor: 'proveedor', etiqueta: 'Proveedor', contador: 3 },
      ]} />
      <ChipsMultiples etiqueta="Días" valores={dias} onCambio={setDias}
        opciones={['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((d, i) => ({ valor: String(i), etiqueta: d }))} />
    </div>
  )
}
