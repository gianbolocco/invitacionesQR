import { SeccionProtegida } from '@/components/seccion-protegida'

// El admin también puede invitar desde su casa; el guardia no tiene unidades.
export default function LayoutVecino({ children }: { children: React.ReactNode }) {
  return <SeccionProtegida roles={['resident', 'admin']}>{children}</SeccionProtegida>
}
