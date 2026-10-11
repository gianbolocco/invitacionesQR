import Link from 'next/link'
import { Compass } from 'lucide-react'
import { Vacio } from '@/components/dominio/vacio'
import { buttonVariants } from '@/components/ui/button'

export default function NoEncontrado() {
  return (
    <main className="grid min-h-dvh place-items-center">
      <Vacio icono={Compass} titulo="Esta página no existe"
        detalle="Puede que el link esté mal copiado o que la página se haya movido."
        accion={<Link href="/" className={buttonVariants()}>Ir al inicio</Link>} />
    </main>
  )
}
