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
 * Primer dia de la semana con el que se numeran las semanas del cultivo.
 *
 * 0 = domingo, 1 = lunes.
 *
 * En Access esto NO estaba fijado: `Format$(d,"ww",0,0)` no significa
 * "domingo y semana del 1 de enero", sino "usa la configuracion regional de
 * Windows" (vbUseSystem). Comprobado cambiando iFirstDayOfWeek en el registro
 * y volviendo a preguntar al motor de Access: la misma fecha, 2021-11-14,
 * devuelve 47 con domingo y 46 con lunes.
 *
 * Es decir: el sistema anterior numeraba las semanas de forma distinta segun
 * el equipo donde se abriera la base. Aqui se fija de una vez, y se fija en
 * DOMINGO porque es la regla con la que se generaron las 157 actividades que
 * ya existen: cambiarla ahora partiria el historico en dos numeraciones y el
 * informe de costos por semana mezclaria ambas.
 *
 * Si la finca prefiere numerar por semanas de lunes a domingo, basta con
 * poner 1 aqui, pero hay que regenerar las actividades historicas.
 */
export const PRIMER_DIA_SEMANA = 0;

/**
 * Equivalente de Format$(fecha, "ww", 0, 0) de Access, con el primer dia de
 * la semana ya fijado.
 *
 * Comprobado 785/785 contra el propio motor de Access (fixture
 * api/test/fixtures/semanas-access.json) y 156/156 contra las semanas que
 * llevan grabadas las actividades migradas.
 *
 * @param {string} iso 'YYYY-MM-DD'
 * @param {number} [primerDia] 0 = domingo, 1 = lunes
 * @returns {number} 1..54
 */
export function semanaAccess(iso, primerDia = PRIMER_DIA_SEMANA) {
  const [a, m, d] = iso.split('-').map(Number);
  const fecha = Date.UTC(a, m - 1, d);
  const enero1 = Date.UTC(a, 0, 1);
  const diaDelAnio = Math.round((fecha - enero1) / 86400000);
  const dowEnero1 = (new Date(enero1).getUTCDay() - primerDia + 7) % 7;
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

/**
 * La misma numeracion de semana, para incrustar en SQL.
 *
 * OJO: no sirve `strftime('%U') + 1`. Coincide casi siempre, pero se desvia
 * un numero entero en los anios que empiezan en domingo, como 2023, porque
 * %U cuenta esos primeros dias como semana 00 mientras que Access los cuenta
 * como semana 1. Sobre el fixture de 785 fechas, %U+1 acierta 665/785; la
 * expresion de abajo, 785/785.
 *
 * `expr` aparece DOS veces en la expresion generada. Dos consecuencias:
 * conviene que sea barata, y si es un parametro hay que pasarlo numerado
 * (`?1`), nunca `?` a secas: SQLite trataria cada `?` como un parametro
 * distinto y el segundo quedaria sin enlazar, devolviendo NULL.
 */
export const SQL_SEMANA = (expr) =>
  `((CAST(strftime('%j', ${expr}) AS INTEGER) - 1` +
  ` + ((CAST(strftime('%w', date(${expr}, 'start of year')) AS INTEGER)` +
  ` - ${PRIMER_DIA_SEMANA} + 7) % 7)) / 7 + 1)`;

/** Weekday(expr) */
export const SQL_DIA_SEMANA = (expr) => `(CAST(strftime('%w', ${expr}) AS INTEGER) + 1)`;

/** expr + n dias, con n constante */
export const SQL_MAS_DIAS = (expr, n) => `date(${expr}, '${n >= 0 ? '+' : ''}${n} day')`;

/** expr + n dias, con n como expresion SQL (puede ser negativa o NULL) */
export const SQL_MAS_DIAS_EXPR = (expr, nExpr) =>
  `date(${expr}, CAST(${nExpr} AS INTEGER) || ' day')`;
