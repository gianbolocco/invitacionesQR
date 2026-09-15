/**
 * Drizzle envuelve los errores de pg en un DrizzleQueryError cuyo mensaje es
 * "Failed query: …". El nombre de la constraint violada vive en `cause.constraint`.
 * Devuelve ese nombre, o null si la promesa no falló.
 */
export async function violatedConstraint(p: Promise<unknown>): Promise<string | null> {
  try {
    await p
    return null
  } catch (err) {
    return (err as { cause?: { constraint?: string } }).cause?.constraint ?? null
  }
}
