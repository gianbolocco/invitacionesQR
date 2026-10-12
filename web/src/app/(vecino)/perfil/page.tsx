'use client'
import Link from 'next/link'
import { LogOut, Settings2 } from 'lucide-react'
import { useSesion } from '@/lib/sesion-contexto'
import { logout } from '@/lib/session'
import { Button, buttonVariants } from '@/components/ui/button'
import { EncabezadoPagina } from '@/components/dominio/encabezado-pagina'
import { SelectorTema } from '@/components/selector-tema'

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-line pt-6">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">{titulo}</h2>
      {children}
    </section>
  )
}

export default function PerfilPage() {
  const me = useSesion()
  return (
    <div className="flex flex-col gap-8">
      <EncabezadoPagina antetitulo="Tu cuenta" titulo={me.name} subtitulo={me.email ?? me.username ?? ''} />

      <Seccion titulo="Tus unidades">
        {me.units.length === 0 ? (
          <p className="text-ink-soft">Todavía no tenés una unidad. Pedile a la administración que te asigne la tuya.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {me.units.map((u) => (
              <li key={u.id} className="rounded-full bg-surface-sunk px-4 py-2 text-sm font-semibold tabular">{u.label}</li>
            ))}
          </ul>
        )}
      </Seccion>

      <Seccion titulo="Apariencia">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-ink-soft">Automático sigue al tema de tu celular.</p>
          <SelectorTema />
        </div>
      </Seccion>

      {me.role === 'admin' && (
        <Seccion titulo="Administración">
          <Link href="/admin" className={buttonVariants({ variant: 'outline', className: 'self-start' })}>
            <Settings2 aria-hidden />Ir a la administración
          </Link>
        </Seccion>
      )}

      <Seccion titulo="Sesión">
        <Button variant="outline" className="self-start text-peligro hover:text-peligro" onClick={logout}>
          <LogOut aria-hidden />Cerrar sesión
        </Button>
      </Seccion>
    </div>
  )
}
