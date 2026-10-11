'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
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
import { Toaster } from '@/components/ui/sonner'

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
      <Toaster />
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
    </main>
  )
}
