/**
 * Fecha de hoy en la zona del negocio, en formato ISO.
 *
 * El navegador puede estar en cualquier huso; el criterio del sistema es la
 * hora de Colombia, igual que en el backend (hoyBogota de access-compat).
 */
export const ZONA = 'America/Bogota';

export function hoyLocal(ahora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(ahora);
}
