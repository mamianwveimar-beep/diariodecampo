#!/usr/bin/env node
/**
 * Prueba de la pantalla de alta de siembra por lotes.
 *
 * Rellena la cabecera, añade tres líneas con el buscador, comprueba que el
 * área se calcula y se puede sobrescribir, guarda, y verifica contra la API
 * que los cultivos existen con los valores correctos.
 *
 *   node web/humo-siembra.mjs      (con ng serve y wrangler dev en marcha)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4200';
const CAPTURAS = new URL('./capturas/', import.meta.url).pathname.replace(/^\//, '');
mkdirSync(CAPTURAS, { recursive: true });

const FACTURA = `PRUEBA-${Date.now().toString().slice(-6)}`;
const FECHA = '2026-03-09';

const navegador = await chromium.launch();
const pagina = await navegador.newPage({ viewport: { width: 1500, height: 1000 } });
const errores = [];
pagina.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
pagina.on('pageerror', (e) => errores.push(e.message));

let fallos = 0;
const comprobar = (ok, texto) => {
  console.log(`  ${ok ? 'ok  ' : 'FALLA'} ${texto}`);
  if (!ok) fallos++;
};

await pagina.goto(`${BASE}/siembras/nueva`, { waitUntil: 'networkidle' });

// ------------------------------------------------------------- cabecera
await pagina.fill('input[type="date"]', FECHA);
await pagina.fill('input[placeholder^="p. ej. fac"]', FACTURA);

const fila = (i) => pagina.locator('tbody tr').nth(i);

/** Elige una semilla escribiendo en el buscador de la fila i. */
async function elegirSemilla(i, texto) {
  const buscador = fila(i).locator('dc-buscador input');
  await buscador.click();
  await buscador.fill(texto);
  await pagina.waitForSelector('.opciones li:not(.ninguna)');
  await pagina.locator('.opciones li').first().click();
}

async function escribir(i, columna, valor) {
  await fila(i).locator('td').nth(columna).locator('input').fill(String(valor));
  await fila(i).locator('td').nth(columna).locator('input').blur();
}

const COL = { plantas: 1, lote: 2, cama: 3, area: 4, semillero: 5 };

// ------------------------------------------------------- linea 1: cebolla
await elegirSemilla(0, 'cebolla');
await escribir(0, COL.plantas, 250);
await pagina.waitForTimeout(150);
let area = await fila(0).locator('td').nth(COL.area).locator('input').inputValue();
// cebolla: entrePlanta 0.3 x entreSurcos 0.4 = 0.12 m2/planta -> 250 * 0.12 = 30
comprobar(Number(area) === 30, `el área se calcula sola: 250 plantas × 0,12 = ${area} m² (esperado 30)`);

await escribir(0, COL.lote, 7);
await escribir(0, COL.cama, 1);
await escribir(0, COL.semillero, 'SEM-A1');

// el buscador filtra de verdad
const buscador = fila(0).locator('dc-buscador input');
await buscador.click();
await buscador.fill('zzzz-no-existe');
await pagina.waitForTimeout(200);
const sinCoincidencias = await pagina.locator('.opciones li.ninguna').count();
comprobar(sinCoincidencias === 1, 'el buscador avisa cuando no hay coincidencias');
await pagina.keyboard.press('Escape');
await pagina.locator('h1').click();

// ------------------------------------------------------- linea 2: brocoli
await pagina.getByRole('button', { name: 'Añadir línea' }).click();
await elegirSemilla(1, 'brocoli');
await escribir(1, COL.plantas, 100);
await pagina.waitForTimeout(150);
const areaBrocoli = await fila(1).locator('td').nth(COL.area).locator('input').inputValue();
comprobar(Number(areaBrocoli) === 16, `brócoli: 100 × 0,16 = ${areaBrocoli} m² (esperado 16)`);

// la cama se autoincrementa respecto a la linea anterior
const cama2 = await fila(1).locator('td').nth(COL.cama).locator('input').inputValue();
comprobar(Number(cama2) === 2, `la cama avanza sola de la línea anterior: ${cama2}`);

// sobrescribir el area a mano
await escribir(1, COL.area, 12.5);
await pagina.waitForTimeout(150);
const areaManual = await fila(1).locator('td').nth(COL.area).locator('input').inputValue();
comprobar(Number(areaManual) === 12.5, 'el área admite un valor escrito a mano');
const avisoDesvio = await pagina.textContent('body');
comprobar(avisoDesvio.includes('El área calculada'), 'avisa de que el área difiere de la calculada');

// y se puede volver al calculo
await fila(1).locator('td').nth(COL.area).locator('button').click();
await pagina.waitForTimeout(150);
const areaVuelta = await fila(1).locator('td').nth(COL.area).locator('input').inputValue();
comprobar(Number(areaVuelta) === 16, `el botón devuelve al área calculada: ${areaVuelta}`);

// ------------------------------------------------------ linea 3: lechuga
await pagina.getByRole('button', { name: 'Añadir línea' }).click();
await elegirSemilla(2, 'lechuga');
await escribir(2, COL.plantas, 60);
await escribir(2, COL.semillero, 'SEM-C3');

await pagina.screenshot({ path: `${CAPTURAS}siembra-lote.png` });

// ----------------------------------------------------------- validacion
await pagina.getByRole('button', { name: 'Añadir línea' }).click();   // linea vacia
await pagina.getByRole('button', { name: 'Guardar siembra' }).click();
await pagina.waitForTimeout(400);
const textoValidacion = await pagina.textContent('body');
comprobar(textoValidacion.includes('sin semilla o sin número de plantas'),
  'no deja guardar con una línea incompleta');

// quitar la linea vacia y guardar
await fila(3).getByRole('button', { name: 'Quitar' }).click();
await pagina.getByRole('button', { name: 'Guardar siembra' }).click();
await pagina.waitForSelector('text=líneas guardadas', { timeout: 10000 });
const resumen = await pagina.textContent('.aviso');
comprobar(resumen.includes('3 de 3'), `se guardaron las 3 líneas: «${resumen.trim().slice(0, 60)}»`);
await pagina.screenshot({ path: `${CAPTURAS}siembra-lote-guardada.png` });

// ------------------------------------------- comprobar contra la API real
const cultivos = await (await fetch(`${BASE}/api/tablas/programacionCultivos?limite=2000`)).json();
const nuevos = cultivos.filter((c) => c.factura === FACTURA);
comprobar(nuevos.length === 3, `la API devuelve 3 cultivos con la factura ${FACTURA}`);
comprobar(nuevos.every((c) => c.fechasiembra === FECHA), 'los 3 comparten la fecha de la cabecera');
comprobar(nuevos.every((c) => c.activo === 1), 'los 3 entran activos');

const cebolla = nuevos.find((c) => c.numeroPlantasSembradas === 250);
comprobar(!!cebolla && cebolla.areaCultivada === 30 && cebolla.lote === 7
  && cebolla.cama === 1 && cebolla.codigoSemillero === 'SEM-A1',
  `la línea de cebolla llega completa: ${JSON.stringify(cebolla && {
    plantas: cebolla.numeroPlantasSembradas, area: cebolla.areaCultivada,
    lote: cebolla.lote, cama: cebolla.cama, semillero: cebolla.codigoSemillero })}`);

const brocoli = nuevos.find((c) => c.numeroPlantasSembradas === 100);
comprobar(!!brocoli && brocoli.areaCultivada === 16, `el área del brócoli se guarda: ${brocoli?.areaCultivada}`);

// limpiar lo que ha creado la prueba
for (const c of nuevos) {
  await fetch(`${BASE}/api/tablas/programacionCultivos/${c.codigosistema}`, { method: 'DELETE' });
}
const quedan = (await (await fetch(`${BASE}/api/tablas/programacionCultivos?limite=2000`)).json())
  .filter((c) => c.factura === FACTURA).length;
comprobar(quedan === 0, 'la prueba deja la base como estaba');

await navegador.close();

if (errores.length) {
  console.log('\n  errores de navegador:');
  for (const e of [...new Set(errores)].slice(0, 8)) console.log(`    ${e}`);
}
if (fallos || errores.length) {
  console.error(`\n[ERROR] ${fallos} comprobación(es) fallidas, ${errores.length} error(es) de navegador`);
  process.exit(1);
}
console.log('\n[ok] el alta de siembra por lotes funciona de principio a fin');
