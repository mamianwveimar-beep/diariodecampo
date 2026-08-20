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

/**
 * Mismas dos funciones que api/src/access-compat/fechas.mjs, para poder
 * previsualizar en el navegador el calendario que el backend va a generar
 * al guardar, sin tener que pedirselo primero. PRIMER_DIA_SEMANA = 0
 * (domingo), la misma constante fijada en el backend por la razon explicada
 * alli: es la que encaja con las 157 actividades historicas.
 *
 * Se comprueban contra el motor real en humo-orden.mjs, comparando lo que
 * esta pantalla previsualiza contra lo que el backend deja guardado.
 */
const PRIMER_DIA_SEMANA = 0;

export function sumarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

export function semanaAccess(iso: string, primerDia = PRIMER_DIA_SEMANA): number {
  const [a, m, d] = iso.split('-').map(Number);
  const fecha = Date.UTC(a, m - 1, d);
  const enero1 = Date.UTC(a, 0, 1);
  const diaDelAnio = Math.round((fecha - enero1) / 86400000);
  const dowEnero1 = (new Date(enero1).getUTCDay() - primerDia + 7) % 7;
  return Math.floor((diaDelAnio + dowEnero1) / 7) + 1;
}
