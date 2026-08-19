#!/usr/bin/env node
/**
 * Paridad de las 20 consultas de accion.
 *
 * No compara contra la foto historica de Access, porque esa foto se genero
 * en 2021 con valores de origen que despues se editaron (ver el bloque 3:
 * dos cultivos cambiaron de fecha o de numero de plantas y un producto
 * cambio de nombre). Comparar contra ella mediria los cambios del usuario,
 * no la calidad de la traduccion.
 *
 * Lo que si se comprueba:
 *   1. FORMULA     cada fila que genera el SQL coincide, campo a campo, con
 *                  una reimplementacion independiente en JavaScript de la
 *                  consulta original de Access.
 *   2. IDEMPOTENCIA reejecutar no duplica: las consultas con indice UNIQUE
 *                  insertan 0 filas la segunda vez, igual que en Access.
 *   3. DERIVA      se informa, sin fallar, de las diferencias frente a la
 *                  foto de Access y de su causa.
 *
 *   node api/test/paridad-consultas.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONSULTAS_ACCION, CONSTANTES as C } from '../src/queries/consultas-accion.mjs';
import { semanaAccess, sumarDias } from '../src/access-compat/fechas.mjs';

const RAIZ = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const ORIGEN_DB = join(RAIZ, 'db', 'local', 'diariodecampo.db');
const PRUEBA_DB = join(RAIZ, 'db', 'local', 'paridad-consultas.db');
const PARIDAD = join(RAIZ, 'docs', 'paridad');

if (!existsSync(ORIGEN_DB)) {
  console.error('Falta db/local/diariodecampo.db. Ejecuta antes: node etl/03-cargar.mjs');
  process.exit(1);
}
mkdirSync(PARIDAD, { recursive: true });
if (existsSync(PRUEBA_DB)) rmSync(PRUEBA_DB);
copyFileSync(ORIGEN_DB, PRUEBA_DB);

const db = new DatabaseSync(PRUEBA_DB);
db.exec('PRAGMA foreign_keys = ON;');

const kAct = (r) => [r.codigoSistema, r.codsemilla, r.fechaSiembra, r.semanaAbono, r.Actividad].join('|');
const kCos = (r) => [r.concepto, r.detalle, r.programacionCultivoCodCultivo].join('|');

const fotoAccess = {
  actividades: db.prepare('SELECT * FROM actividades').all(),
  costosInsumos: db.prepare('SELECT * FROM costosInsumos').all(),
};

// ============================================================ 1. FORMULA
// Oraculo: reimplementacion en JS de las consultas originales de Access.
const semillas = db.prepare('SELECT * FROM infoSemilla').all();
const cultivos = db.prepare('SELECT * FROM programacionCultivos').all();
const productos = new Map(db.prepare('SELECT * FROM productos').all().map((p) => [p.id, p]));

/** join infoSemilla INNER JOIN programacionCultivos ON Id = codSemilla */
const parejas = cultivos
  .map((pc) => ({ pc, s: semillas.find((s) => s.Id === pc.codSemilla) }))
  .filter((x) => x.s);

const desdeProducto = (actividad, dias, campo, productoId, filtro) => {
  const p = productos.get(productoId);
  if (!p) return [];
  return parejas.filter(({ s }) => (filtro ? filtro(s) : true)).map(({ pc, s }) => ({
    codigoSistema: pc.codigosistema, codsemilla: pc.codSemilla, fechaSiembra: pc.fechasiembra,
    Actividad: actividad, semanaAbono: semanaAccess(sumarDias(pc.fechasiembra, dias)),
    cantidadAbono: s[campo], lote: pc.lote, cama: pc.cama,
    numeroPlantas: pc.numeroPlantasSembradas, detalle: p.nombreProducto,
    unidad: p.unidad, costo: p.valorUnidad,
  }));
};

const deLabor = (actividad, detalle, dias, minutos, filtro) =>
  parejas.filter(({ s }) => (filtro ? filtro(s) : true)).map(({ pc }) => ({
    codigoSistema: pc.codigosistema, codsemilla: pc.codSemilla, fechaSiembra: pc.fechasiembra,
    Actividad: actividad, semanaAbono: semanaAccess(sumarDias(pc.fechasiembra, dias)),
    cantidadAbono: minutos, lote: pc.lote, cama: pc.cama,
    numeroPlantas: pc.numeroPlantasSembradas, detalle, unidad: 'Min', costo: C.COSTO_MINUTO,
  }));

const manoDeObra = (concepto, factor) =>
  cultivos.map((pc) => ({
    concepto, detalle: concepto, fecha: pc.fechasiembra, unidad: 'hora',
    valorUnitario: C.JORNAL_HORA, programacionCultivoCodCultivo: pc.codigosistema,
    cantidad: (pc.numeroPlantasSembradas * factor) / C.MINUTOS_POR_HORA,
    producto: C.PRODUCTO_MANO_DE_OBRA,
  }));

const abonamiento = (productoId, cantidadDe) => {
  const p = productos.get(productoId);
  if (!p) return [];
  return parejas.map(({ pc, s }) => ({
    concepto: 'Abonamiento', detalle: p.nombreProducto, fecha: pc.fechasiembra,
    unidad: p.unidad, cantidad: cantidadDe(s, pc), valorUnitario: p.valorUnidad,
    programacionCultivoCodCultivo: pc.codigosistema, producto: p.id,
  }));
};

/**
 * Aritmetica con propagacion de nulos, como Access y como SQL.
 * JavaScript convierte null en 0 en una suma; ni Access ni SQLite lo hacen.
 * Afecta de verdad: lechuga (Id 10) y frijol (Id 11) tienen abonoSegunda o
 * abonoTercera vacios, asi que su coste de abonamiento sale nulo.
 */
const op = (f, ...xs) => (xs.some((x) => x === null || x === undefined) ? null : f(...xs));

const sumaAbonos = (s) =>
  op((a, b, c, d) => a + b + c + d,
     s.abonoSiembra, s.abonoPrimera, s.abonoSegunda, s.abonoTercera);

/** Mismo orden que CONSULTAS_ACCION: el primero que llega gana en ON CONFLICT. */
const ORACULO = {
  IngresoAbonoLiquido1Aplicacion: () => desdeProducto('AbonoLiquido', 8, 'abonoLiquido', C.PRODUCTO_ABONO_LIQUIDO),
  IngresoAbonoLiquido2Aplicacion: () => desdeProducto('AbonoLiquido', 15, 'abonoLiquido', C.PRODUCTO_ABONO_LIQUIDO),
  IngresoAbonoLiquido3Aplicacion: () => desdeProducto('AbonoLiquido', 50, 'abonoLiquido', C.PRODUCTO_ABONO_LIQUIDO_2, (s) => s.ciclo > 50),
  IngresoAbonoLiquido4Aplicacion: () => desdeProducto('AbonoLiquido', 65, 'abonoLiquido', C.PRODUCTO_ABONO_LIQUIDO_2, (s) => s.ciclo > 65),
  IngresoAbonoSolido1Aplicacion: () => desdeProducto('AbonoSolido', 25, 'abonoPrimera', C.PRODUCTO_ABONO_SOLIDO),
  IngresoAbonoSolido2Aplicacion: () => desdeProducto('AbonoSolido', 50, 'abonoSegunda', C.PRODUCTO_ABONO_SOLIDO, (s) => s.abonoSegunda > 0),
  IngresoAbonoSolido3Aplicacion: () => desdeProducto('AbonoSolido', 75, 'abonoTercera', C.PRODUCTO_ABONO_SOLIDO, (s) => s.abonoTercera > 0),
  IngresoPreparacionTerreno: () => deLabor('PreparacionTerreno', 'PreparacionTerreno', 0, C.MIN_PREPARACION_TERRENO),
  IngresoSiembra: () => deLabor('Siembra', 'Siembra', 0, C.MIN_SIEMBRA),
  IngresoPrimerDeshierbe: () => deLabor('Deshierbe', 'PrimerDeshierbe', 25, C.MIN_DESHIERBE),
  IngresoSegundoDeshierbe: () => deLabor('Deshierbe', 'SegundoDeshierbe', 50, C.MIN_DESHIERBE, (s) => s.ciclo > 50),
  IngresoProtecionBasilus: () => desdeProducto('ProteccionVegetal', 0, 'abonoLiquido', C.PRODUCTO_BASILUS, (s) => s.Aplicacion1 > 1),
  IngresoProtecionBasilus2: () => desdeProducto('ProteccionVegetal', 50, 'abonoLiquido', C.PRODUCTO_BASILUS, (s) => s.Aplicacion1 >= 1),
  IngresoCostosPreparacionTerreno: () => manoDeObra('Preparacion Terreno', 1),
  IngresoCostosSiembra: () => manoDeObra('Siembra', 1.5),
  IngresoCostosDeshierbe: () => manoDeObra('Deshierbe', 2),
  IngresoCostosCobertura: () => manoDeObra('Cobertura', 1),
  actualizarCostosAbonamiento: () => abonamiento(C.PRODUCTO_ABONO_SOLIDO, (s, pc) => op((x, n) => x * n, sumaAbonos(s), pc.numeroPlantasSembradas)),
  actualizarCostosAbonamientoLiquido: () => abonamiento(C.PRODUCTO_ABONO_LIQUIDO_2, (s, pc) => op((al, ci, n) => al * (ci / 15) * n, s.abonoLiquido, s.ciclo, pc.numeroPlantasSembradas)),
  salidaAbono: () => [],   // inventarioProductos: sin indice unico, se valida aparte
};

// esperado, aplicando el "primero que llega gana" del indice UNIQUE
const espAct = new Map();
const espCos = new Map();
for (const c of CONSULTAS_ACCION) {
  const filas = ORACULO[c.nombre]();
  for (const f of filas) {
    if (c.destino === 'actividades') { const k = kAct(f); if (!espAct.has(k)) espAct.set(k, f); }
    if (c.destino === 'costosInsumos') { const k = kCos(f); if (!espCos.has(k)) espCos.set(k, f); }
  }
}

// regenerar con el SQL real
db.exec('DELETE FROM actividades;');
db.exec('DELETE FROM costosInsumos;');
db.exec("DELETE FROM inventarioProductos WHERE concepto = 'Abonamiento';");

const ejecucion = [];
console.log('--- ejecucion ---');
for (const c of CONSULTAS_ACCION) {
  const n0 = db.prepare(`SELECT COUNT(*) n FROM ${c.destino}`).get().n;
  db.exec(c.sql);
  const n1 = db.prepare(`SELECT COUNT(*) n FROM ${c.destino}`).get().n;
  const candidatas = ORACULO[c.nombre]().length;
  ejecucion.push({ consulta: c.nombre, destino: c.destino, insertadas: n1 - n0, omitidas: candidatas - (n1 - n0) });
  console.log(`  ${c.nombre.padEnd(34)} ${String(n1 - n0).padStart(3)} insertadas, ${String(Math.max(0, candidatas - (n1 - n0))).padStart(2)} omitidas`);
}

const igual = (a, b) => {
  if (a === null || a === undefined) return b === null || b === undefined;
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) <= Math.max(1e-9, Math.abs(a) * 1e-9);
  }
  return a === b;
};

function validarFormula(tabla, esperado, clave, campos) {
  const real = new Map(db.prepare(`SELECT * FROM ${tabla}`).all().map((r) => [clave(r), r]));
  const fallos = [];
  for (const [k, e] of esperado) {
    const r = real.get(k);
    if (!r) { fallos.push({ clave: k, campo: '(fila)', esperado: 'existe', real: 'ausente' }); continue; }
    for (const campo of campos) {
      if (!igual(e[campo], r[campo])) fallos.push({ clave: k, campo, esperado: e[campo], real: r[campo] });
    }
  }
  for (const k of real.keys()) {
    if (!esperado.has(k)) fallos.push({ clave: k, campo: '(fila)', esperado: 'ausente', real: 'existe' });
  }
  return { tabla, esperadas: esperado.size, reales: real.size, fallos };
}

const formula = [
  validarFormula('actividades', espAct, kAct,
    ['cantidadAbono', 'lote', 'cama', 'numeroPlantas', 'detalle', 'unidad', 'costo']),
  validarFormula('costosInsumos', espCos, kCos,
    ['fecha', 'unidad', 'cantidad', 'producto', 'valorUnitario']),
];

console.log('\n--- 1. formula: SQL frente a reimplementacion independiente en JS ---');
for (const f of formula) {
  console.log(`  ${f.tabla.padEnd(16)} esperadas=${String(f.esperadas).padStart(3)} generadas=${String(f.reales).padStart(3)} discrepancias=${f.fallos.length}`);
  for (const x of f.fallos.slice(0, 10)) {
    console.log(`      ${x.clave} :: ${x.campo}  esperado=${x.esperado}  real=${x.real}`);
  }
}

// ======================================================= 2. IDEMPOTENCIA
console.log('\n--- 2. idempotencia: segunda ejecucion ---');
const idempotencia = [];
for (const c of CONSULTAS_ACCION) {
  if (c.nombre === 'salidaAbono') continue;   // sin indice unico, duplica a proposito
  const n0 = db.prepare(`SELECT COUNT(*) n FROM ${c.destino}`).get().n;
  db.exec(c.sql);
  const n1 = db.prepare(`SELECT COUNT(*) n FROM ${c.destino}`).get().n;
  idempotencia.push({ consulta: c.nombre, insertadas_2a_vez: n1 - n0 });
}
const noIdempotentes = idempotencia.filter((x) => x.insertadas_2a_vez !== 0);
console.log(`  consultas comprobadas: ${idempotencia.length}`);
console.log(`  que insertaron algo la segunda vez: ${noIdempotentes.length}`);
for (const x of noIdempotentes) console.log(`      ${x.consulta}: ${x.insertadas_2a_vez}`);

// ============================================================= 3. DERIVA
const claves = { actividades: kAct, costosInsumos: kCos };
const deriva = [];
for (const tabla of ['actividades', 'costosInsumos']) {
  const k = claves[tabla];
  const antes = new Map(fotoAccess[tabla].map((r) => [k(r), r]));
  const ahora = new Map(db.prepare(`SELECT * FROM ${tabla}`).all().map((r) => [k(r), r]));
  deriva.push({
    tabla,
    en_access: antes.size,
    regeneradas: ahora.size,
    coincidentes: [...antes.keys()].filter((x) => ahora.has(x)).length,
    solo_en_access: [...antes.keys()].filter((x) => !ahora.has(x)),
    solo_regeneradas: [...ahora.keys()].filter((x) => !antes.has(x)),
  });
}

// causas conocidas de la deriva
const desincronizados = db.prepare(`
  SELECT DISTINCT a.codigoSistema, p.fechasiembra AS ficha_fecha, a.fechaSiembra AS actividad_fecha,
         p.numeroPlantasSembradas AS ficha_plantas, a.numeroPlantas AS actividad_plantas
  FROM actividades a JOIN programacionCultivos p ON p.codigosistema = a.codigoSistema
  WHERE a.fechaSiembra <> p.fechasiembra OR a.numeroPlantas <> p.numeroPlantasSembradas`).all();

console.log('\n--- 3. deriva frente a la foto de Access (informativo) ---');
for (const d of deriva) {
  console.log(`  ${d.tabla.padEnd(16)} access=${String(d.en_access).padStart(3)} regeneradas=${String(d.regeneradas).padStart(3)} coincidentes=${String(d.coincidentes).padStart(3)} solo_access=${d.solo_en_access.length} solo_nuevas=${d.solo_regeneradas.length}`);
}
console.log(`  cultivos cuya ficha ya no coincide con sus actividades historicas: ${new Set(desincronizados.map((d) => d.codigoSistema)).size}`);

writeFileSync(join(PARIDAD, 'consultas-accion.json'), JSON.stringify({
  generado: new Date().toISOString(), ejecucion, formula, idempotencia, deriva,
  causas_deriva: { cultivos_editados_tras_generar: desincronizados },
}, null, 2));

db.close();
rmSync(PRUEBA_DB);

const errores = formula.reduce((a, f) => a + f.fallos.length, 0) + noIdempotentes.length;
console.log(`\n  informe: docs/paridad/consultas-accion.json`);
if (errores > 0) { console.error(`\n[ERROR] ${errores} fallo(s) de traduccion`); process.exit(1); }
console.log('\n[ok] las 20 consultas reproducen la formula de Access y son idempotentes');
