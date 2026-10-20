import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

/*
 * Cuentas de prueba con contraseña conocida, creadas directo en la base de
 * desarrollo. El hash es de 'e2e-contrasena-larga': una contraseña de prueba,
 * nunca una real. El SQL entra por stdin para que la shell no toque los "$"
 * del hash.
 */
const HASH = '$argon2id$v=19$m=65536,p=4,t=3$FNIXItSWhG4ZP4UUiQUpQw$dBiGiJSFZQs58P/iBPADRrsdSGbGx9++qjzNf+Oj7w0'

const SQL = `
insert into unit (neighborhood_id, label)
  select id, 'Lote 900' from neighborhood limit 1
  on conflict do nothing;

insert into person (neighborhood_id, email, name, role, status, password_hash)
  select n.id, v.email, v.name, v.role, 'active', '${HASH}'
  from (select id from neighborhood limit 1) n, (values
    ('e2e.admin@visitpass.test', 'Admin E2E', 'admin'),
    ('e2e.vecino@visitpass.test', 'Vecina E2E', 'resident'),
    ('e2e.guardia@visitpass.test', 'Guardia E2E', 'guard')
  ) as v(email, name, role)
  on conflict (email) do update
    set status = 'active', password_hash = excluded.password_hash, role = excluded.role;

-- La alerta de permanencia arranca apagada: la prende permanencia.spec.ts.
update neighborhood set overstay_hours_visita = null, overstay_hours_proveedor = null;

insert into unit_member (unit_id, person_id)
  select u.id, p.id from unit u, person p
  where u.label = 'Lote 900' and p.email = 'e2e.vecino@visitpass.test'
  on conflict do nothing;
`

export default function preparar() {
  const raiz = resolve(__dirname, '..', '..') // Playwright carga este archivo como CommonJS
  execFileSync('docker', ['compose', 'exec', '-T', 'db', 'psql', '-U', 'invitaciones', '-v', 'ON_ERROR_STOP=1'], {
    cwd: raiz, input: SQL, stdio: ['pipe', 'inherit', 'inherit'],
  })
}
