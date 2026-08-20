#!/usr/bin/env node
/**
 * Trae el historico de Access a la temporada actual.
 *
 *   node etl/08-actualizar-fechas.mjs            dice que haria, sin tocar nada
 *   node etl/08-actualizar-fechas.mjs aplicar    lo hace
 *
 * POR QUE: los datos migrados son de 2021. Sirven para demostrar la paridad
 * con Access, pero no para trabajar: ningun cultivo esta proximo a cosecha,
 * ninguna labor cae en la semana en curso, y el panel sale vacio.
 *
 * QUE TOCA Y QUE NO
 *
 * Toca SOLO la base viva de wrangler (api/.wrangler/state). No toca:
 *   - origen/            el .accdb congelado
 *   - etl/salida/        la extraccion de Access
 *   - db/local/          la base que reconstruye el ETL
 *
 * Esa separacion es lo que deja intacta la evidencia de paridad: tanto
 * `npm run paridad` como `etl/06-comparar-paridad.mjs` trabajan sobre
 * db/local, que se regenera desde la extraccion congelada. Volver a correr
 * `node etl/03-cargar.mjs` devuelve los datos a 2021 en db/local sin
 * enterarse de esto.
 *
 * COMO DESPLAZA
 *
 * Por un numero entero de SEMANAS, no de dias sueltos: asi cada fecha
 * conserva su dia de la semana, que es de lo que depende toda la numeracion
 * de semanas del sistema (regla de domingo, ver access-compat/fechas.mjs).
 *
 * Y solo mueve lo anterior al corte: lo que ya registro el usuario en la
 * temporada actual se queda donde esta. Eso hace que reejecutarlo no acumule
 * desplazamientos: la segunda vez ya no hay nada por debajo del corte.
 *
 * semanaAbono no se recalcula desde cero -haria falta la fecha de la labor,
 * que no se guarda- sino que se conserva su distancia en semanas hasta la
 * siembra, que es justo lo que significa esa columna.
 */
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hoyBogota, semanaAccess, sumarDias } from '../api/src/access-compat/fechas.mjs';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const ESTADO = join(RAIZ, 'api', '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject');

/** Lo sembrado antes de esta fecha es historico de Access y se mueve. */
const CORTE = '2025-01-01';
/** Donde queremos que caiga la siembra mas reciente del historico. */
const DIAS_ANTES_DE_HOY = 40;

const aplicar = process.argv[2] === 'aplicar';

if (!existsSync(ESTADO)) {
  console.error('No hay base viva de wrangler. Arranca antes: cd api && npm run dev');
  process.exit(1);
}
const ficheros = readdirSync(ESTADO).filter((f) => f.endsWith('.sqlite'));
if (ficheros.length !== 1) {
  console.error(`Esperaba un unico fichero de estado y hay ${ficheros.length}. ` +
                `Para todos los procesos de wrangler y vuelve a intentarlo.`);
  process.exit(1);
}

const db = new DatabaseSync(join(ESTADO, ficheros[0]));
const hoy = hoyBogota();

// ------------------------------------------------- cuanto hay que mover
const viejos = db.prepare(
  'SELECT codigosistema, fechasiembra FROM programacionCultivos WHERE fechasiembra < ?'
).all(CORTE);

if (!viejos.length) {
  console.log(`No queda ninguna siembra anterior a ${CORTE}: no hay nada que mover.`);
  db.close();
  process.exit(0);
}

const masReciente = viejos.map((c) => c.fechasiembra).sort().at(-1);
const objetivo = sumarDias(hoy, -DIAS_ANTES_DE_HOY);
const diasBrutos = Math.round(
  (Date.parse(objetivo + 'T00:00:00Z') - Date.parse(masReciente + 'T00:00:00Z')) / 86400000
);
// a semanas enteras, para conservar el dia de la semana
const dias = Math.round(diasBrutos / 7) * 7;

console.log(`hoy                        ${hoy}`);
console.log(`siembra historica mas nueva ${masReciente}  (${viejos.length} cultivos por debajo de ${CORTE})`);
console.log(`desplazamiento             +${dias} dias  (${dias / 7} semanas exactas)`);
console.log(`                           ${masReciente} -> ${sumarDias(masReciente, dias)}`);

const codigos = viejos.map((c) => c.codigosistema);
const marcas = codigos.map(() => '?').join(',');

/** Desplaza una columna de fecha, respetando los nulos. */
function mover(tabla, columna, filtro, params) {
  const antes = db.prepare(
    `SELECT COUNT(*) n FROM ${tabla} WHERE ${columna} IS NOT NULL AND ${filtro}`
  ).get(...params).n;
  if (aplicar && antes) {
    db.prepare(
      `UPDATE ${tabla} SET ${columna} = date(${columna}, '+${dias} day') ` +
      `WHERE ${columna} IS NOT NULL AND ${filtro}`
    ).run(...params);
  }
  console.log(`  ${aplicar ? 'movidas ' : 'moveria'} ${String(antes).padStart(4)}  ${tabla}.${columna}`);
  return antes;
}

// actividades.fechaSiembra esta desnormalizada, y en el origen ya habia filas
// donde no coincidia con la del cultivo: Access no tenia clave foranea que lo
// impidiera. No lo provoca este desplazamiento, asi que la comprobacion del
// final no exige que sean cero, sino que no aparezca ninguna nueva.
const SQL_DESCUADRE =
  'SELECT COUNT(*) n FROM actividades a ' +
  'JOIN programacionCultivos pc ON pc.codigosistema = a.codigoSistema ' +
  'WHERE a.fechaSiembra <> pc.fechasiembra';
const descuadreAntes = db.prepare(SQL_DESCUADRE).get().n;

console.log('\n--- fechas ---');
const enCultivo = `codigosistema IN (${marcas})`;
mover('programacionCultivos', 'fechasiembra', enCultivo, codigos);
mover('programacionCultivos', 'fechaRealCosecha', enCultivo, codigos);
mover('programacionCultivos', 'fechafinal', enCultivo, codigos);
mover('programacionCultivos', 'fechaRegistroSiembra', enCultivo, codigos);

mover('actividades', 'fechaSiembra', `codigoSistema IN (${marcas})`, codigos);
mover('actividades', 'fechaRegistro', `codigoSistema IN (${marcas})`, codigos);
mover('cosecha', 'fechaCosecha', enCultivo, codigos);
mover('costosInsumos', 'fecha', `programacionCultivoCodCultivo IN (${marcas})`, codigos);
mover('inventarioProductos', 'fecha', `codigoSistemaProgramacion IN (${marcas})`, codigos);

// ------------------------------------------------------ semanaAbono
// Se conserva la distancia en semanas hasta la siembra, que es lo que esa
// columna significa. Recalcularla desde cero pediria la fecha de la labor,
// y esa no se guarda en ningun sitio.
console.log('\n--- semanaAbono ---');
const labores = db.prepare(
  `SELECT a.id, a.semanaAbono, a.fechaSiembra
     FROM actividades a WHERE a.codigoSistema IN (${marcas})`
).all(...codigos);

let recalculadas = 0;
const poner = db.prepare('UPDATE actividades SET semanaAbono = ? WHERE id = ?');
for (const l of labores) {
  // fechaSiembra ya esta movida si se aplico; si no, se simula
  const nueva = aplicar ? l.fechaSiembra : sumarDias(l.fechaSiembra, dias);
  const vieja = aplicar ? sumarDias(l.fechaSiembra, -dias) : l.fechaSiembra;
  const desdeLaSiembra = (l.semanaAbono - semanaAccess(vieja) + 54) % 54;
  const semana = ((semanaAccess(nueva) + desdeLaSiembra - 1) % 54) + 1;
  if (semana !== l.semanaAbono) {
    if (aplicar) poner.run(semana, l.id);
    recalculadas++;
  }
}
console.log(`  ${aplicar ? 'recalculadas' : 'recalcularia'} ${recalculadas} de ${labores.length}`);

// ------------------------------------------------------- comprobacion
if (aplicar) {
  const descuadreDespues = db.prepare(SQL_DESCUADRE).get().n;
  const fk = db.prepare('PRAGMA foreign_key_check').all();
  console.log('\n--- comprobacion ---');
  console.log(`  fechaSiembra que no cuadra con su cultivo: ${descuadreDespues}` +
              `  (antes ${descuadreAntes}, heredadas de Access)`);
  console.log(`  violaciones de clave foranea: ${fk.length}`);
  if (descuadreDespues > descuadreAntes || fk.length) {
    console.error('\n[ERROR] la base quedo inconsistente');
    db.close();
    process.exit(1);
  }
}

db.close();
console.log(aplicar
  ? '\n[ok] el historico ya esta en la temporada actual (solo en la base viva)'
  : '\n(ensayo: no se toco nada. Repite con "aplicar" para hacerlo)');
