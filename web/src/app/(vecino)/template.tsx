'use client'
import { motion } from 'motion/react'

/*
 * Cada pantalla entra con un fundido corto. Solo opacidad, a propósito: un
 * transform en este ancestro rompería `position: fixed` del botón flotante y
 * de la barra de abajo, que quedarían anclados al contenido.
 */
export default function Plantilla({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, ease: 'easeOut' }}>
      {children}
    </motion.div>
  )
}
