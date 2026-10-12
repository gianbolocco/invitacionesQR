import { z } from 'zod'

/** Largo mínimo de toda contraseña del sistema. Sin reglas de composición: solo largo. */
export const MIN_CONTRASENA = 6

export const contrasena = z.string()
  .min(MIN_CONTRASENA, `La contraseña necesita al menos ${MIN_CONTRASENA} caracteres`)
