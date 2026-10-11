import { notFound } from 'next/navigation'
import { Kit } from './kit'

/** Catálogo de componentes para revisarlos a ojo. No existe en producción. */
export default function KitPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <Kit />
}
