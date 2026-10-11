import { SeccionProtegida } from '@/components/seccion-protegida'

export default function LayoutAdmin({ children }: { children: React.ReactNode }) {
  return <SeccionProtegida roles={['admin']}>{children}</SeccionProtegida>
}
