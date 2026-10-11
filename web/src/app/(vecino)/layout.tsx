import { SeccionProtegida } from '@/components/seccion-protegida'
import { ChromeVecino } from '@/components/vecino/chrome'

// El admin también puede invitar desde su casa; el guardia no tiene unidades.
export default function LayoutVecino({ children }: { children: React.ReactNode }) {
  return (
    <SeccionProtegida roles={['resident', 'admin']}>
      <ChromeVecino>{children}</ChromeVecino>
    </SeccionProtegida>
  )
}
