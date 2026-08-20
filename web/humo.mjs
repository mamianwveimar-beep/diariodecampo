#!/usr/bin/env node
/**
 * Prueba de humo de la interfaz.
 *
 * Recorre las 11 pantallas con un navegador real, comprueba que cada una
 * pinta lo que debe, y falla si alguna suelta un error en consola.
 *
 *   node web/humo.mjs            (con ng serve y wrangler dev en marcha)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4200';
const CAPTURAS = new URL('./capturas/', import.meta.url).pathname.replace(/^\//, '');
mkdirSync(CAPTURAS, { recursive: true });

/**
 * Cuanto hay de verdad en la base. Se pregunta a la API en vez de dar por
 * supuesto el tamaño del seed: la base viva es de trabajo y su volumen cambia
 * segun lo que se registre o se borre, y un numero fijo aqui obliga a tocar
 * la prueba cada vez que eso pasa.
 */
const cuantas = async (tabla) =>
  (await (await fetch(`${BASE}/api/tablas/${tabla}?limite=2000`)).json()).length;

const CULTIVOS = await cuantas('programacionCultivos');
const LABORES = await cuantas('actividades');

/**
 * [ruta, que tiene que aparecer, cuantas filas de tabla como minimo]
 *
 * El minimo detecta una pantalla que se queda en blanco o que pierde filas por
 * el camino, no afirma cuantos datos hay. Las comprobaciones exactas viven en
 * las pruebas por funcionalidad, que ya usan la API como oraculo.
 */
const PANTALLAS = [
  ['/inicio', 'Panel de la finca', 0],
  ['/resumen', 'Resumen de la finca', CULTIVOS],
  ['/siembras', 'Siembras', CULTIVOS],
  // pagina de 25; con menos labores se muestran todas
  ['/actividades', 'Actividades y costos', Math.min(LABORES, 25)],
  ['/semillas', 'Semillas', 4],
  ['/almacen', 'Almacen', 10],
  ['/productos', 'Productos', 7],
  ['/clientes', 'Clientes', 2],
  ['/empleados', 'Empleados', 2],
  ['/pedidos', 'Pedidos', 5],
  // cInventarioCampo saca una fila por cultivo activo
  ['/informes', 'Inventario de campo', await cuantas('programacionCultivos')],
  ['/cuarentena', 'Cuarentena de la migracion', 74],
];

const navegador = await chromium.launch();
const pagina = await navegador.newPage({ viewport: { width: 1440, height: 980 } });

const errores = [];
pagina.on('console', (m) => {
  if (m.type() === 'error') errores.push(`[consola] ${m.text()}`);
});
pagina.on('pageerror', (e) => errores.push(`[excepcion] ${e.message}`));

let fallos = 0;
for (const [ruta, texto, minFilas] of PANTALLAS) {
  const antes = errores.length;
  await pagina.goto(BASE + ruta, { waitUntil: 'networkidle' });
  await pagina.waitForTimeout(400);

  const cuerpo = await pagina.textContent('body');
  const filas = await pagina.locator('tbody tr').count();
  const vacio = await pagina.locator('.vacio').count();
  const nombre = ruta.slice(1);
  await pagina.screenshot({ path: `${CAPTURAS}${nombre}.png`, fullPage: false });

  const tieneTexto = cuerpo.includes(texto);
  const suficientes = filas >= minFilas && vacio === 0;
  const limpio = errores.length === antes;
  const ok = tieneTexto && suficientes && limpio;
  if (!ok) fallos++;

  console.log(
    `  ${ok ? 'ok  ' : 'FALLA'} ${ruta.padEnd(14)} ` +
    `texto=${tieneTexto ? 'si' : 'NO'} filas=${String(filas).padStart(3)}/${minFilas} ` +
    `errores=${errores.length - antes}`
  );
}

// interaccion real: abrir el formulario de una semilla y ver sus adjuntos
await pagina.goto(BASE + '/semillas', { waitUntil: 'networkidle' });
await pagina.locator('tbody tr').first().locator('button', { hasText: 'Editar' }).click();
await pagina.waitForSelector('.modal');
const modal = await pagina.textContent('.modal');
const abreModal = modal.includes('Editar') && modal.includes('Abono');
const conAdjunto = /\.(jpg|png)/i.test(modal);
await pagina.screenshot({ path: `${CAPTURAS}semilla-formulario.png` });
console.log(`  ${abreModal ? 'ok  ' : 'FALLA'} formulario de semilla se abre con sus campos`);
console.log(`  ${conAdjunto ? 'ok  ' : 'FALLA'} el formulario enlaza la foto guardada en R2`);
if (!abreModal || !conAdjunto) fallos++;

// el informe de trazabilidad, que es el mas complejo
await pagina.goto(BASE + '/informes', { waitUntil: 'networkidle' });
await pagina.selectOption('.barra select', 'trazabilidad');
await pagina.waitForTimeout(700);
const traza = await pagina.textContent('body');
const tieneTraza = traza.includes('Trazabilidad') && traza.includes('Abono 1 (mar)');
const filasTraza = await pagina.locator('tbody tr').count();
await pagina.screenshot({ path: `${CAPTURAS}informe-trazabilidad.png` });
console.log(`  ${tieneTraza && filasTraza > 0 ? 'ok  ' : 'FALLA'} informe de trazabilidad (${filasTraza} filas)`);
if (!tieneTraza || filasTraza === 0) fallos++;

// el tema oscuro: la hoja de estilos define los dos
const oscuro = await navegador.newPage({ viewport: { width: 1440, height: 980 }, colorScheme: 'dark' });
await oscuro.goto(BASE + '/inicio', { waitUntil: 'networkidle' });
await oscuro.screenshot({ path: `${CAPTURAS}inicio-oscuro.png` });
const fondo = await oscuro.evaluate(() => getComputedStyle(document.body).backgroundColor);
const canal = Number(/rgb\((\d+)/.exec(fondo)?.[1] ?? 255);
const esOscuro = canal < 60;
console.log(`  ${esOscuro ? 'ok  ' : 'FALLA'} el tema oscuro se aplica (fondo ${fondo})`);
if (!esOscuro) fallos++;
await oscuro.close();

// el enlace del resumen debe filtrar a un solo cultivo
await pagina.goto(BASE + '/siembras?cultivo=45', { waitUntil: 'networkidle' });
await pagina.waitForTimeout(500);
const unaFila = await pagina.locator('tbody tr').count();
console.log(`  ${unaFila === 1 ? 'ok  ' : 'FALLA'} el enlace del resumen filtra a un cultivo (${unaFila} filas)`);
if (unaFila !== 1) fallos++;

await navegador.close();

if (errores.length) {
  console.log('\n  errores de navegador:');
  for (const e of [...new Set(errores)].slice(0, 12)) console.log(`    ${e}`);
}
console.log(`\n  capturas en web/capturas/`);
if (fallos > 0 || errores.length > 0) {
  console.error(`\n[ERROR] ${fallos} pantalla(s) con problemas, ${errores.length} error(es) de navegador`);
  process.exit(1);
}
console.log('\n[ok] las 11 pantallas cargan con datos y sin errores');
