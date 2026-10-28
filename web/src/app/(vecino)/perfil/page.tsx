'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { LogOut, Settings2 } from 'lucide-react'
import { useSesion } from '@/lib/sesion-contexto'
import { logout } from '@/lib/session'
import { Button, buttonVariants } from '@/components/ui/button'
import { EncabezadoPagina } from '@/components/dominio/encabezado-pagina'
import { Switch } from '@/components/ui/switch'
import { useMarca } from '@/lib/marca-cliente'
import { activarPush, desactivarPush, entornoPush, suscripcionActual } from '@/lib/push-cliente'
import { toast } from 'sonner'
import { SelectorTema } from '@/components/selector-tema'

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-line pt-6">
      <h2 className="text-[13px] font-semibold text-ink-soft">{titulo}</h2>
      {children}
    </section>
  )
}

/** Avisos push de este dispositivo: pide permiso y suscribe, o desuscribe. */
function AvisosEnDispositivo() {
  const [e, setE] = useState<{ soportaPush: boolean; permiso: string } | null>(null)
  const [activo, setActivo] = useState(false)
  const [trabajando, setTrabajando] = useState(false)
  useEffect(() => {
    const env = entornoPush()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setE(env)
    if (env.soportaPush && env.permiso === 'granted') suscripcionActual().then((s) => setActivo(Boolean(s))).catch(() => {})
  }, [])
  if (!e) return null

  const cambiar = async (on: boolean) => {
    setTrabajando(true)
    try {
      if (on) {
        const permiso = await activarPush()
        setE({ ...e, permiso })
        setActivo(permiso === 'granted')
      } else {
        await desactivarPush()
        setActivo(false)
      }
    } catch {
      toast.error('No se pudo cambiar el aviso. Probá de nuevo.')
    } finally { setTrabajando(false) }
  }
  const ayuda = e.permiso === 'denied'
    ? 'Los avisos están bloqueados. Habilitalos desde los ajustes del navegador para este sitio.'
    : !e.soportaPush ? 'Este navegador no permite avisos. En iPhone, agregá Pazzit a la pantalla de inicio y abrila desde el ícono.'
    : 'Te avisamos cuando llega un paquete.'

  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-semibold">Notificaciones en este dispositivo</p>
        <p className="text-sm text-ink-soft">{ayuda}</p>
      </div>
      <Switch checked={activo} onCheckedChange={cambiar} aria-label="Notificaciones en este dispositivo"
        disabled={trabajando || !e.soportaPush || e.permiso === 'denied'} />
    </div>
  )
}

export default function PerfilPage() {
  const me = useSesion()
  const { packagesEnabled } = useMarca()
  return (
    <div className="flex flex-col gap-8">
      <EncabezadoPagina antetitulo="Tu cuenta" titulo={me.name} subtitulo={me.email ?? me.username ?? ''} />

      <Seccion titulo="Tus unidades">
        {me.units.length === 0 ? (
          <p className="text-ink-soft">Todavía no tenés una unidad. Pedile a la administración que te asigne la tuya.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {me.units.map((u) => (
              <li key={u.id} className="rounded-sm bg-surface-sunk px-4 py-2 text-sm font-semibold tabular">{u.label}</li>
            ))}
          </ul>
        )}
      </Seccion>

      {packagesEnabled && (
        <Seccion titulo="Avisos">
          <AvisosEnDispositivo />
        </Seccion>
      )}

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
        <Button variant="outline" className="self-start text-alto hover:text-alto" onClick={logout}>
          <LogOut aria-hidden />Cerrar sesión
        </Button>
      </Seccion>
    </div>
  )
}
