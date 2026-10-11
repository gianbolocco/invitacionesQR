import { SeccionProtegida } from '@/components/seccion-protegida'
import { ChromeAdmin } from '@/components/admin/chrome'

export default function LayoutAdmin({ children }: { children: React.ReactNode }) {
  return (
    <SeccionProtegida roles={['admin']}>
      <ChromeAdmin>{children}</ChromeAdmin>
    </SeccionProtegida>
  )
}
