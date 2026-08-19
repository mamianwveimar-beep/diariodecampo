/**
 * Equivalencias de Access sobre SQLite.
 *   node --test api/test/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { semanaAccess, diaSemanaAccess, sumarDias, hoyBogota, SQL_SEMANA } from '../src/access-compat/fechas.mjs';
import { SQL_PROGRAMACION_ABONAMIENTO, SQL_PROGRAMACION_CULTIVO } from '../src/queries/vistas-parametrizadas.mjs';

const RAIZ = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const abrir = () => new DatabaseSync(join(RAIZ, 'db', 'local', 'diariodecampo.db'), { readOnly: true });

/**
 * Fixture generado con el propio motor de Access sobre el .accdb congelado
 * (etl/05-volcar-consultas-access.ps1 usa la misma tecnica). Cada entrada
 * lleva lo que devuelve Format$(d,"ww",...) con las cuatro combinaciones de
 * argumentos, para poder demostrar cual es la que aplica.
 */
const SEMANAS = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'semanas-access.json'), 'utf8')
);

test('semanaAccess reproduce Format$(d,"ww",1,1) de Access en las 785 fechas del fixture', () => {
  assert.ok(SEMANAS.length >= 785, `el fixture deberia tener 785 fechas, tiene ${SEMANAS.length}`);
  const malas = SEMANAS.filter((f) => semanaAccess(f.d) !== f.dom_ene1);
  assert.equal(malas.length, 0, `fechas que no coinciden: ${JSON.stringify(malas.slice(0, 5))}`);
});

test('la expresion SQL de la semana da lo mismo que la de JavaScript', () => {
  const db = abrir();
  // ?1 numerado a proposito: SQL_SEMANA repite la expresion dos veces
  const st = db.prepare(`SELECT ${SQL_SEMANA('?1')} AS w`);
  for (const f of SEMANAS) assert.equal(st.get(f.d).w, semanaAccess(f.d), `semana de ${f.d}`);
  db.close();
});

test('strftime(%U)+1 NO sirve: falla en los anios que empiezan en domingo', () => {
  // Documenta por que la expresion es mas larga de lo que parece necesario.
  const db = abrir();
  const st = db.prepare("SELECT CAST(strftime('%U', ?1) AS INTEGER) + 1 AS w");
  const fallos = SEMANAS.filter((f) => st.get(f.d).w !== semanaAccess(f.d));
  assert.ok(fallos.length > 0, 'si %U+1 acertara siempre, la expresion larga sobraria');
  assert.ok(fallos.every((f) => f.d.startsWith('2023')),
    `los fallos deberian estar en 2023, que empieza en domingo: ${JSON.stringify(fallos.slice(0, 3))}`);
  db.close();
});

test('Access numeraba las semanas segun la configuracion del equipo', () => {
  // La razon de que PRIMER_DIA_SEMANA exista y este fijado. Sobre las mismas
  // fechas, las dos reglas de Access no coinciden entre si.
  const coinciden = SEMANAS.filter((f) => f.dom_ene1 === f.lun_ene1).length;
  assert.ok(coinciden < SEMANAS.length,
    'domingo y lunes deberian diferir en algunas fechas; si no, no habria nada que fijar');
});

test('diaSemanaAccess coincide con strftime(%w)+1 y usa 1=domingo', () => {
  const db = abrir();
  const st = db.prepare("SELECT CAST(strftime('%w', ?) AS INTEGER) + 1 AS d");
  for (let d = 0; d < 400; d++) {
    const iso = sumarDias('2021-01-01', d);
    assert.equal(diaSemanaAccess(iso), st.get(iso).d, `dia de ${iso}`);
  }
  // 2021-10-25 fue lunes -> Access devuelve 2
  assert.equal(diaSemanaAccess('2021-10-25'), 2);
  // 2021-10-24 fue domingo -> Access devuelve 1
  assert.equal(diaSemanaAccess('2021-10-24'), 1);
  db.close();
});

test('semanaAccess reproduce semanaAbono de las actividades migradas', () => {
  const db = abrir();
  // desfases que usan las consultas de accion de Access
  const DESFASES = [0, 8, 15, 25, 50, 65, 75];
  const filas = db.prepare(
    "SELECT fechaSiembra, semanaAbono, Actividad FROM actividades WHERE Actividad <> 'otros'"
  ).all();
  assert.ok(filas.length >= 156, `esperaba al menos 156 filas, hay ${filas.length}`);

  const sinExplicar = filas.filter(
    (f) => !DESFASES.some((d) => semanaAccess(sumarDias(f.fechaSiembra, d)) === f.semanaAbono)
  );
  assert.equal(sinExplicar.length, 0,
    `filas cuya semana no encaja con ningun desfase: ${JSON.stringify(sinExplicar.slice(0, 5))}`);
  db.close();
});

test('hoyBogota devuelve el dia de Colombia, no el de UTC', () => {
  // 2021-11-05 01:30 UTC son todavia las 20:30 del 4 de noviembre en Bogota
  assert.equal(hoyBogota(new Date('2021-11-05T01:30:00Z')), '2021-11-04');
  // a las 06:00 UTC ya es dia 5 en ambos husos
  assert.equal(hoyBogota(new Date('2021-11-05T06:00:00Z')), '2021-11-05');
  assert.match(hoyBogota(), /^\d{4}-\d{2}-\d{2}$/);
});

test('cProgramacionCultivosAbonamiento devuelve una fila por cultivo', () => {
  const db = abrir();
  const filas = db.prepare(SQL_PROGRAMACION_ABONAMIENTO).all(hoyBogota());
  const cultivos = db.prepare('SELECT COUNT(*) n FROM programacionCultivos').get().n;
  assert.equal(filas.length, cultivos);
  for (const f of filas) {
    assert.equal(f.semana1, semanaAccess(sumarDias(f.fechasiembra, 25)));
    assert.equal(f.semana2, semanaAccess(sumarDias(f.fechasiembra, 50)));
    assert.equal(f.semana3, semanaAccess(sumarDias(f.fechasiembra, 75)));
  }
  db.close();
});

test('cProgramacionCultivo alinea cada labor a su dia de la semana', () => {
  const db = abrir();
  const filas = db.prepare(SQL_PROGRAMACION_CULTIVO).all(hoyBogota(), '2000-01-01');
  assert.ok(filas.length > 0, 'la consulta no devolvio filas');

  for (const f of filas) {
    // los nombres del original prometen un dia concreto de la semana
    assert.equal(diaSemanaAccess(f.Abono25Mar), 3, `Abono25Mar deberia caer en martes: ${f.Abono25Mar}`);
    assert.equal(diaSemanaAccess(f.abono50Mar), 3, `abono50Mar deberia caer en martes: ${f.abono50Mar}`);
    assert.equal(diaSemanaAccess(f.abono75Mar), 3, `abono75Mar deberia caer en martes: ${f.abono75Mar}`);
    assert.equal(diaSemanaAccess(f.creceMas15Lun), 2, `creceMas15Lun deberia caer en lunes: ${f.creceMas15Lun}`);
    assert.equal(diaSemanaAccess(f.creceMas30Lun), 2, `creceMas30Lun deberia caer en lunes: ${f.creceMas30Lun}`);
    assert.equal(diaSemanaAccess(f.produceMas50Mier), 4, `produceMas50Mier deberia caer en miercoles: ${f.produceMas50Mier}`);
    // las columnas que dependen de Aplicacion1/Aplicacion2 pueden ser nulas
    if (f.saferMix0Lun) assert.equal(diaSemanaAccess(f.saferMix0Lun), 2);
    if (f.saferMix60Juev) assert.equal(diaSemanaAccess(f.saferMix60Juev), 5);
    if (f.sulfoCalcico45Juev) assert.equal(diaSemanaAccess(f.sulfoCalcico45Juev), 5);
    if (f.bordeles70Juev) assert.equal(diaSemanaAccess(f.bordeles70Juev), 5);
  }
  db.close();
});

test('cProgramacionCultivo respeta el parametro fechaInicial', () => {
  const db = abrir();
  const todas = db.prepare(SQL_PROGRAMACION_CULTIVO).all(hoyBogota(), '2000-01-01');
  const desdeNoviembre = db.prepare(SQL_PROGRAMACION_CULTIVO).all(hoyBogota(), '2021-11-01');
  assert.ok(desdeNoviembre.length < todas.length, 'el filtro no redujo el resultado');
  for (const f of desdeNoviembre) assert.ok(f.fechasiembra > '2021-11-01');
  db.close();
});
