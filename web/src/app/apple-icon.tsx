import { iconoMarca } from '@/lib/icono-marca'

export const dynamic = 'force-dynamic'
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return iconoMarca(180, false)
}
