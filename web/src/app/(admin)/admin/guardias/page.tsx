'use client'
import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import {
  usePersonas, useAltaGuardia, useReactivarPersona, useDeshabilitarPersona, useCambiarContrasenaGuardia, ApiError,
} from '@/lib/queries/admin'
import { ESTADO, type Person } from '@/lib/admin'
import { fechaConAnio } from '@/lib/fechas'
import { EncabezadoPagina } from '@/components/dominio/encabezado-pagina'
import { SheetAlta } from '@/components/admin/sheet-alta'
import { MenuFila, type AccionFila } from '@/components/admin/menu-fila'
import { Fila } from '@/components/dominio/fila'
import { Vacio } from '@/components/dominio/vacio'
import { ErrorConReintento } from '@/components/dominio/error-con-reintento'
import { SkeletonFilas } from '@/components/dominio/skeleton-filas'
import { Campo } from '@/components/dominio/campo'
import { Nota } from '@/components/dominio/nota'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

function AltaGuardia({ abierto, onAbiertoChange }: { abierto: boolean; onAbiertoChange: (v: boolean) => void }) {
  const alta = useAltaGuardia()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Mismo motivo que en AltaVecino: limpiar al cerrar por cualquier
  // camino, no solo al mandarlo.
  function cambiarAbierto(v: boolean) {
    if (!v) { setName(''); setEmail(''); setPassword(''); setError(null) }
    onAbiertoChange(v)
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 10) { setError('La contraseña necesita al menos 10 caracteres.'); return }
    try {
      await alta.mutateAsync({ name, email, password })
      cambiarAbierto(false)
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'mail_repetido'
        ? `${email} ya está en el padrón. Buscalo en la lista.`
        : 'No se pudo crear. Revisá el mail y probá de nuevo.')
    }
  }

  return (
    <SheetAlta etiqueta="Dar de alta" titulo="Dar de alta un guardia"
      descripcion="Cada guardia entra con su propio usuario: los ingresos que registra quedan a su nombre."
      abierto={abierto} onAbiertoChange={cambiarAbierto}>
      <form onSubmit={enviar} className="flex flex-col gap-4">
        <Campo id="nombre-g" etiqueta="Nombre y apellido">
          <Input id="nombre-g" required placeholder="Carlos Ruiz" value={name} onChange={(e) => setName(e.target.value)} />
        </Campo>
        <Campo id="mail-g" etiqueta="Usuario (mail)" ayuda="Identifica la cuenta. No hace falta que reciba mails.">
          <Input id="mail-g" type="email" required placeholder="carlos@mail.com" value={email}
            onChange={(e) => setEmail(e.target.value)} />
        </Campo>
        <Campo id="pass-g" etiqueta="Contraseña" ayuda="Mínimo 10 caracteres. Se la das vos en mano.">
          <Input id="pass-g" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Campo>
        {error && <Nota tono="error">{error}</Nota>}
        <Button type="submit" disabled={alta.isPending}>{alta.isPending ? 'Creando…' : 'Dar de alta'}</Button>
      </form>
    </SheetAlta>
  )
}

function DialogContrasena({ persona, onCerrar }: { persona: Person | null; onCerrar: () => void }) {
  const cambiar = useCambiarContrasenaGuardia()
  const [password, setPassword] = useState('')

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!persona || password.length < 10) return
    await cambiar.mutateAsync({ personId: persona.id, password })
    setPassword('')
    onCerrar()
  }

  return (
    <Dialog open={persona !== null} onOpenChange={(v) => { if (!v) { setPassword(''); onCerrar() } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cambiar la contraseña de {persona?.name}</DialogTitle>
          <DialogDescription>
            Si {persona?.name} está usando la garita ahora, la contraseña nueva lo deja afuera en el acto.
          </DialogDescription>
        </DialogHeader>
        <form id="form-contrasena" onSubmit={enviar}>
          <Campo id="nueva-clave" etiqueta="Contraseña nueva">
            <Input id="nueva-clave" type="password" autoFocus required value={password}
              onChange={(e) => setPassword(e.target.value)} />
          </Campo>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" form="form-contrasena" disabled={cambiar.isPending || password.length < 10}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DialogBaja({ persona, onCerrar }: { persona: Person | null; onCerrar: () => void }) {
  const deshabilitar = useDeshabilitarPersona()
  return (
    <Dialog open={persona !== null} onOpenChange={(v) => { if (!v) onCerrar() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Dar de baja a {persona?.name}?</DialogTitle>
          <DialogDescription>No va a poder entrar a la garita. Los ingresos que ya registró quedan igual.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button variant="destructive" disabled={deshabilitar.isPending}
            onClick={async () => { if (persona) await deshabilitar.mutateAsync(persona); onCerrar() }}>
            Dar de baja
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function GuardiasPage() {
  const personas = usePersonas()
  const reactivar = useReactivarPersona()
  const [altaAbierta, setAltaAbierta] = useState(false)
  const [reseteando, setReseteando] = useState<Person | null>(null)
  const [porDarDeBaja, setPorDarDeBaja] = useState<Person | null>(null)

  const guardias = (personas.data ?? []).filter((p) => p.role === 'guard')

  function accionesDe(g: Person): AccionFila[] {
    const acciones: AccionFila[] = [{ etiqueta: 'Cambiar contraseña', onClick: () => setReseteando(g) }]
    if (g.status === 'disabled') acciones.push({ etiqueta: 'Reactivar', onClick: () => reactivar.mutate(g) })
    else acciones.push({ etiqueta: 'Dar de baja', destructiva: true, onClick: () => setPorDarDeBaja(g) })
    return acciones
  }

  return (
    <>
      <div className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Guardias"
          subtitulo="Cada guardia entra con su propio usuario. La contraseña no se comparte entre turnos."
          acciones={<AltaGuardia abierto={altaAbierta} onAbiertoChange={setAltaAbierta} />} />

        {personas.isPending ? (
          <SkeletonFilas filas={3} />
        ) : personas.isError ? (
          <ErrorConReintento onReintentar={() => personas.refetch()} reintentando={personas.isFetching} />
        ) : guardias.length === 0 ? (
          <Vacio icono={ShieldCheck} titulo="Todavía no hay guardias cargados"
            detalle="Sin al menos uno, nadie puede escanear en la barrera." />
        ) : (
          <div>
            {guardias.map((g) => (
              <Fila key={g.id} titulo={g.name}
                meta={[ESTADO[g.status], g.lastLoginAt ? `último ingreso ${fechaConAnio(g.lastLoginAt)}` : 'nunca entró'].join(' · ')}
                extremo={<MenuFila acciones={accionesDe(g)} />}
                className={g.status === 'disabled' ? 'opacity-50' : undefined} />
            ))}
          </div>
        )}
      </div>

      <DialogContrasena persona={reseteando} onCerrar={() => setReseteando(null)} />
      <DialogBaja persona={porDarDeBaja} onCerrar={() => setPorDarDeBaja(null)} />
    </>
  )
}
