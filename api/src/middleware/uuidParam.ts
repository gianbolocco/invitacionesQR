import type { Router } from 'express'
import { AppError } from '../lib/errors.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Valida los `:id` de un router antes de que lleguen a la base.
 *
 * Sin esto, un id mal formado se iba tal cual a una query de Postgres y volvía
 * como 500 ("invalid input syntax for type uuid"). Un 500 significa "se rompió
 * algo del lado del servidor"; esto es "mandaste mal el pedido", que es un 400.
 * La diferencia importa cuando hay que encontrar los 500 de verdad en el log.
 *
 * Va con router.param y no como middleware suelto para que valga para todas las
 * rutas del router con ese parámetro, incluidas las que se agreguen después.
 */
export function validarUuid(router: Router, ...nombres: string[]): void {
  for (const nombre of nombres.length ? nombres : ['id']) {
    router.param(nombre, ((req, _res, next, valor) => {
      next(UUID.test(String(valor)) ? undefined : new AppError(400, 'id_invalido'))
    }) as Parameters<Router['param']>[1])
  }
}

/** El mismo chequeo, para un id que no viene de la ruta. */
export const esUuid = (v: unknown): boolean => typeof v === 'string' && UUID.test(v)
