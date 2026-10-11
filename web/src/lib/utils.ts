import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Junta clases y resuelve choques de Tailwind: la última gana. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
