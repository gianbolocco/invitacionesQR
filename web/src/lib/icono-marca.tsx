import { ImageResponse } from 'next/og'
import { leerMarca } from './marca'

/**
 * El ícono de la app instalada: el logo del barrio sobre blanco si hay, y si
 * no la inicial del nombre sobre el color de marca. Se arma en el servidor y
 * por la red interna, así que sirve igual en cualquier dominio.
 */
export async function iconoMarca(lado: number): Promise<ImageResponse> {
  const marca = await leerMarca()
  const base = process.env.API_INTERNAL_URL ?? 'http://localhost:8080'

  let logo: string | null = null
  if (marca.tieneLogo) {
    try {
      const res = await fetch(`${base}/branding/logo`, { cache: 'no-store' })
      if (res.ok) {
        const tipo = res.headers.get('content-type') ?? 'image/png'
        logo = `data:${tipo};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`
      }
    } catch {
      // Sin logo se cae a la inicial: un ícono roto es peor que uno simple.
    }
  }

  return new ImageResponse(
    logo ? (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ffffff' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt="" style={{ width: '72%', height: '72%', objectFit: 'contain' }} />
      </div>
    ) : (
      <div style={{
        width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: marca.color, color: '#ffffff', fontSize: lado * 0.56, fontWeight: 800,
      }}>
        {marca.nombre.trim().charAt(0).toUpperCase() || 'V'}
      </div>
    ),
    { width: lado, height: lado },
  )
}
