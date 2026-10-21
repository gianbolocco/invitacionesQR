/**
 * Ningún color de marca escrito a mano (spec, bug #5) ni tokens del sistema
 * viejo.
 *
 * Un hex de la paleta de barrios pegado en un componente se ve bien en el
 * barrio verde de la demo y mal en todos los demás. Solo pueden aparecer
 * donde se definen.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = fileURLToPath(new URL('../src/', import.meta.url))
const PERMITIDOS = new Set(['app/globals.css', 'lib/marca.ts'])
// Tiene que coincidir con PALETA en api/src/lib/marca.ts.
// La paleta de api/src/lib/marca.ts y el verde de datos que usaba el tablero.
const PROHIBIDOS = ['#2f5bff', '#1e6b47', '#14565c', '#1d4e89', '#3b3b7a', '#5b3a75', '#7a1f3d', '#8a3c1e', '#36454f', '#0f8f52']
// Los tokens y tamaños del sistema viejo (docs/rediseno/plan.md §6): si vuelve uno, el
// componente queda con el color del barrio o con una etiqueta de 10px.
const VIEJOS = [
  'marca-deep', 'marca-suave', 'sobre-marca', 'peligro', 'pass-field', 'deny-', 'amber-', 'emerald-',
  'text-[10px]', 'text-[11px]', 'text-[10.5px]',
]

function recorrer(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? recorrer(p) : [p]
  })
}

const errores = []
for (const archivo of recorrer(RAIZ)) {
  if (!/\.(tsx?|css)$/.test(archivo)) continue
  const rel = relative(RAIZ, archivo).split(sep).join('/')
  if (PERMITIDOS.has(rel)) continue
  const texto = readFileSync(archivo, 'utf8').toLowerCase()
  for (const t of [...PROHIBIDOS, ...VIEJOS]) {
    if (texto.includes(t)) errores.push(`${rel}: ${t}`)
  }
}

if (errores.length) {
  console.error('Colores de marca o tokens viejos (usá los de globals.css: bg-azul, text-alto, text-[13px], …):')
  for (const e of errores) console.error('  ' + e)
  process.exit(1)
}
console.log('colores: ok')
