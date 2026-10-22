'use client'
import { useState } from 'react'
import { Pencil, ShieldCheck } from 'lucide-react'
import { useCrearRubro, useEditarRubro, useRubros, type Rubro } from '@/lib/queries/admin'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

function Chip({ rubro, archivado }: { rubro: Rubro; archivado: boolean }) {
  const editar = useEditarRubro()
  const [renombrando, setRenombrando] = useState(false)
  const [nombre, setNombre] = useState(rubro.name)

  function guardar() {
    const n = nombre.trim()
    if (!n || n === rubro.name) return setRenombrando(false)
    editar.mutate({ id: rubro.id, name: n }, { onSuccess: () => setRenombrando(false) })
  }

  if (renombrando) {
    return (
      <Input autoFocus value={nombre} maxLength={40} aria-label={`Nuevo nombre de ${rubro.name}`} className="h-9 w-44"
        onChange={(e) => setNombre(e.target.value)} onBlur={() => setRenombrando(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); guardar() }
          if (e.key === 'Escape') setRenombrando(false)
        }} />
    )
  }
  return (
    <span className={`inline-flex h-9 items-center gap-1 rounded-full bg-surface-sunk pl-3 text-sm font-medium ${archivado ? 'text-ink-soft' : 'text-ink'}`}>
      {rubro.name}
      {rubro.requiresInsurance && <ShieldCheck className="size-4 text-ink-soft" role="img" aria-label="Pide seguro" />}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={`Acciones de ${rubro.name}`}
            className="grid size-9 place-items-center rounded-full text-ink-soft outline-none focus-visible:outline-2 focus-visible:outline-focus">
            <Pencil className="size-3.5" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => { setNombre(rubro.name); setRenombrando(true) }}>Renombrar</DropdownMenuItem>
          {!archivado && (
            <DropdownMenuCheckboxItem checked={rubro.requiresInsurance}
              onCheckedChange={(v) => editar.mutate({ id: rubro.id, requiresInsurance: v === true })}>
              Pide seguro
            </DropdownMenuCheckboxItem>
          )}
          <DropdownMenuItem onSelect={() => editar.mutate({ id: rubro.id, archived: !archivado })}>
            {archivado ? 'Desarchivar' : 'Archivar'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  )
}

export function Rubros() {
  const rubros = useRubros()
  const crear = useCrearRubro()
  const [nuevo, setNuevo] = useState('')
  const [verArchivados, setVerArchivados] = useState(false)
  const activos = (rubros.data ?? []).filter((r) => !r.archivedAt)
  const archivados = (rubros.data ?? []).filter((r) => r.archivedAt)

  function agregar(e: React.FormEvent) {
    e.preventDefault()
    const n = nuevo.trim()
    if (n) crear.mutate(n, { onSuccess: () => setNuevo('') })
  }

  return (
    <section className="flex flex-col gap-3 rounded-md border border-line bg-card p-5" aria-labelledby="rubros-titulo">
      <h3 id="rubros-titulo" className="text-[13px] font-semibold text-ink-soft">Rubros</h3>
      <div className="flex flex-wrap gap-2">
        {rubros.isPending && <p className="text-sm text-ink-soft">Cargando…</p>}
        {activos.map((r) => <Chip key={r.id} rubro={r} archivado={false} />)}
        {verArchivados && archivados.map((r) => <Chip key={r.id} rubro={r} archivado />)}
      </div>
      {archivados.length > 0 && (
        <button type="button" onClick={() => setVerArchivados((v) => !v)} aria-expanded={verArchivados}
          className="min-h-11 self-start text-sm text-ink-soft underline underline-offset-4">
          {verArchivados ? 'Ocultar archivados' : `Ver archivados (${archivados.length})`}
        </button>
      )}
      <form onSubmit={agregar} className="flex gap-2">
        <Input value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder="Nuevo rubro" maxLength={40}
          aria-label="Nuevo rubro" className="max-w-64" />
        <Button type="submit" variant="outline" disabled={crear.isPending || !nuevo.trim()}>Agregar</Button>
      </form>
      <p className="text-sm text-ink-soft">
        Archivar un rubro lo saca de la lista del vecino. Las invitaciones que ya lo usan siguen valiendo.
      </p>
    </section>
  )
}
