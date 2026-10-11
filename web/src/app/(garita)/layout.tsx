import { SeccionProtegida } from '@/components/seccion-protegida'

// La garita y la auditoría son del guardia y del admin.
export default function LayoutGarita({ children }: { children: React.ReactNode }) {
  return <SeccionProtegida roles={['guard', 'admin']}>{children}</SeccionProtegida>
}
