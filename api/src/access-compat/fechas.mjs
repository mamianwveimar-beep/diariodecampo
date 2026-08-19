/**
 * Equivalencias de las funciones de fecha de Access sobre SQLite / D1.
 *
 * Verificadas contra los datos reales del origen: ver api/test/fechas.test.mjs,
 * que contrasta semanaAccess() con las 157 filas de actividades migradas.
 */

/** Zona horaria del negocio. Los Workers de Cloudflare corren siempre en UTC. */
export const ZONA = 'America/Bogota';

/**
 * Equivalente de Date() de Access.
 *
 * NO usar date('now') en SQL: en un Worker resuelve en UTC y entre las 19:00
 * y la medianoche hora de Colombia devolveria el dia siguiente. La fecha se
 * calcula aqui y se pasa siempre como parametro enlazado.
 *
 * @param {Date} [ahora]
 * @returns {string} 'YYYY-MM-DD'
 */
export function hoyBogota(ahora = new Date()) {
  // en-CA produce directamente el formato ISO
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(ahora);
}

/**
 * Equivalente de Format$(fecha, "ww", 0, 0) de Access.
 *
 * Con los argumentos 0,0 Access usa domingo como primer dia de la semana y
 * cuenta como semana 1 la que contiene el 1 de enero. Eso es exactamente
 * strftime('%U') + 1.
 *
 * @param {string} iso 'YYYY-MM-DD'
 * @returns {number} 1..54
 */
export function semanaAccess(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  const fecha = Date.UTC(a, m - 1, d);
  const enero1 = Date.UTC(a, 0, 1);
  const diaDelAnio = Math.round((fecha - enero1) / 86400000);
  const dowEnero1 = new Date(enero1).getUTCDay();          // 0 = domingo
  return Math.floor((diaDelAnio + dowEnero1) / 7) + 1;
}

/**
 * Equivalente de Weekday(fecha) de Access: 1 = domingo ... 7 = sabado.
 * @param {string} iso
 * @returns {number} 1..7
 */
export function diaSemanaAccess(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay() + 1;
}

/**
 * Suma dias a una fecha ISO, como el operador + de Access sobre fechas.
 * @param {string} iso
 * @param {number} dias
 * @returns {string}
 */
export function sumarDias(iso, dias) {
  const [a, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1, d + dias));
  return t.toISOString().slice(0, 10);
}

// --------------------------------------------------------- fragmentos SQL
// Los mismos calculos, para incrustar en las consultas que corren en D1.

/** Format$(expr,"ww",0,0) */
export const SQL_SEMANA = (expr) => `(CAST(strftime('%U', ${expr}) AS INTEGER) + 1)`;

/** Weekday(expr) */
export const SQL_DIA_SEMANA = (expr) => `(CAST(strftime('%w', ${expr}) AS INTEGER) + 1)`;

/** expr + n dias, con n constante */
export const SQL_MAS_DIAS = (expr, n) => `date(${expr}, '${n >= 0 ? '+' : ''}${n} day')`;

/** expr + n dias, con n como expresion SQL (puede ser negativa o NULL) */
export const SQL_MAS_DIAS_EXPR = (expr, nExpr) =>
  `date(${expr}, CAST(${nExpr} AS INTEGER) || ' day')`;
