'use client'
import { useTema } from '@/lib/theme'
import { TemaToggle } from './ui'

/**
 * Para las pantallas que no tienen Shell: login, alta, reset y la página
 * pública del invitado. El tema tiene que poder cambiarse ahí también — si no,
 * el invitado que abre el link de noche se come una pantalla blanca.
 */
export function TemaFlotante() {
  const [tema, setTema] = useTema()
  return (
    <div className="fixed right-4 top-4 z-40">
      <TemaToggle tema={tema} onTema={setTema} />
    </div>
  )
}
