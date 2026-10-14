/** `node src/lib/lectora.check.ts`. Los dos primeros textos son de una lectora real de la instalación. */
import assert from 'node:assert/strict'
import { interpretarLectura, crearDetector, soloDigitos } from './lectora.ts'

const DNI = { tipo: 'dni', documento: '46116502', apellido: 'Bolocco Veronelli', nombre: 'Gianlucca Valentino' }
const QR = { tipo: 'qr', token: 'mcNlErk30BgByd7asEPm7Q' }

// Deformados por teclado US → Windows en español.
assert.deepEqual(interpretarLectura('00705994066"BOLOCCO VERONELLI"GIANLUCCA VALENTINO"M"46116502"B"12-09-2004"06-06-2023"209'), DNI)
assert.deepEqual(interpretarLectura('httpsÑ--qa.visitpass.quest-i-mcNlErk30BgByd7asEPm7Q'), QR)
// Limpios (cámara, lectora bien configurada).
assert.deepEqual(interpretarLectura('00705994066@BOLOCCO VERONELLI@GIANLUCCA VALENTINO@M@46116502@B@12/09/2004@06/06/2023@209'), DNI)
assert.deepEqual(interpretarLectura('https://qa.visitpass.quest/i/mcNlErk30BgByd7asEPm7Q'), QR)
// Bloq Mayús, prefijo/sufijo, - y _ deformados, token suelto.
assert.deepEqual(interpretarLectura('HTTPSñ--QA.VISITPASS.QUEST-I-MCnLeRK30bGbYD7ASepM7q'), QR)
assert.deepEqual(interpretarLectura(']Q1https://qa.visitpass.quest/i/mcNlErk30BgByd7asEPm7Q\r'), QR)
assert.deepEqual(interpretarLectura("httpsÑ--x.com-i-ab'cd?ef0123456789abcdef"), { tipo: 'qr', token: 'ab-cd_ef0123456789abcdef' })
assert.deepEqual(interpretarLectura('mcNlErk30BgByd7asEPm7Q'), QR)
// DNI formato viejo (dorso).
assert.deepEqual(interpretarLectura('@20111222    @A@1@PÉREZ@JUAN CARLOS@ARGENTINA@01/01/1970@M@01/01/2010@00000000000@7055 @01/01/2025@123@0@ILR:2.01'),
  { tipo: 'dni', documento: '20111222', apellido: 'Pérez', nombre: 'Juan Carlos' })
// Lo que tipea una persona nunca es una lectura.
for (const basura of ['', 'perez', '46116502', 'Lote 142', 'https://otro.com/x', '00705994066"BOLOCCO"GIAN"M"12"B"x"y"z']) {
  assert.equal(interpretarLectura(basura), null, basura)
}
assert.equal(soloDigitos('30.123.456'), '30123456')

function tipear(texto: string, ms: (i: number) => number, fin = 'Enter') {
  const d = crearDetector()
  let t = 1000
  for (const [i, k] of [...texto].entries()) { t += ms(i); assert.equal(d.tecla(k, t), null) }
  return fin === 'pausa' ? d.pausa() : d.tecla(fin, t + 3)
}
const qr = 'httpsÑ--qa.visitpass.quest-i-mcNlErk30BgByd7asEPm7Q'
assert.equal(tipear(qr, () => 4)?.esLectura, true)                                // USB
assert.equal(tipear(qr, () => 4)?.texto, qr)
assert.equal(tipear(qr, (i) => (i % 10 === 9 ? 120 : 2))?.esLectura, true)        // Bluetooth, en paquetes
assert.equal(tipear('juan perez lote', () => 90)?.esLectura, false)               // persona
assert.equal(tipear('abc', () => 3)?.esLectura, false)                            // muy corta
assert.equal(tipear(qr, () => 4, 'pausa')?.terminador, 'pausa')                   // sin terminador
assert.equal(tipear(qr, (i) => (i === 20 ? 300 : 4))?.texto, qr.slice(20))        // un hueco largo corta

console.log('lectora: ok')
