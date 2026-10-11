import { iconoMarca } from '@/lib/icono-marca'

// La marca cambia en vivo: el ícono no se puede hornear en el build.
export const dynamic = 'force-dynamic'
export const contentType = 'image/png'

export function generateImageMetadata() {
  return [
    { id: '192', size: { width: 192, height: 192 }, contentType: 'image/png' },
    { id: '512', size: { width: 512, height: 512 }, contentType: 'image/png' },
  ]
}

export default async function Icon({ id }: { id: Promise<string> }) {
  return iconoMarca(Number(await id))
}
