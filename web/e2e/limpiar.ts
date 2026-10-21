import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

/** Al terminar, la alerta de permanencia vuelve a apagarse: si no, la base de desarrollo queda alertando. */
export default function limpiar() {
  execFileSync('docker', ['compose', 'exec', '-T', 'db', 'psql', '-U', 'invitaciones', '-v', 'ON_ERROR_STOP=1'], {
    cwd: resolve(__dirname, '..', '..'),
    input: "update neighborhood set overstay_hours_visita = null, overstay_hours_proveedor = null, provider_windows = '[]';",
    stdio: ['pipe', 'inherit', 'inherit'],
  })
}
