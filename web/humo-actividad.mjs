#!/usr/bin/env node
/**
 * Prueba del alta por lotes de actividades.
 *
 * Rellena la cabecera, anade tres lineas sobre cultivos reales y comprueba
 * contra la API que se guardaron con la semana de la JORNADA y la fecha de
 * siembra del CULTIVO, que es la confusion que rompe el indice unico.
 *
 * Comprueba tambien lo que hace util a esta pantalla: que una linea que falla
 * no se lleve por delante a las demas.
 *
 *   node web/humo-actividad.mjs      (con ng serve y wrangler dev en marcha)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4200';
const CAPTURAS = new URL('./capturas/', import.meta.url).pathname.replace(/^\//, '');
mkdirSync(CAPTURAS, { recursive: true });

// una actividad que no exista para nadie, para no chocar con lo ya generado
const LABOR = `PruebaHumo${Date.now().toString().slice(-5)}`;
const FECHA = '2026-11-18';          // semana 47 con domingo como primer dia
const SEMANA_ESPERADA = 47;
const DOSIS = 0.05;

const api = async (ruta, opciones) => {
  const r = await fetch(`${BASE}/api${ruta}`, opciones);
  return { estado: r.status, cuerpo: await r.json().catch(() => null) };
};

let fallos = 0;
const comprobar = (ok, texto) => {
  console.log(`  ${ok ? 'ok  ' : 'FALLA'} ${texto}`);
  if (!ok) fallos++;
};

const { cuerpo: cultivos } = await api('/tablas/programacionCultivos?limite=2000');
const activos = cultivos.filter((c) => c.activo === 1).slice(0, 2);
comprobar(activos.length === 2, `hay cultivos activos para la prueba: ${activos.map((c) => c.codigosistema).join(', ')}`);

const navegador = await chromium.launch();
const pagina = await navegador.newPage({ viewport: { width: 1500, height: 1000 } });
const errores = [];
// el 409 de la linea repetida lo provoca la prueba a proposito, y el
// navegador registra en consola cualquier respuesta que no sea 2xx
pagina.on('console', (m) => {
  if (m.type() === 'error' && !/status of 409/.test(m.text())) errores.push(m.text());
});
pagina.on('pageerror', (e) => errores.push(e.message));

const creadas = [];

try {
  await pagina.goto(`${BASE}/actividades/nueva`, { waitUntil: 'networkidle' });
  await pagina.waitForSelector('.tabla-caja tbody tr');

  // ------------------------------------------------------- cabecera
  await pagina.fill('input[type="date"]', FECHA);
  await pagina.waitForTimeout(200);
  comprobar((await pagina.textContent('.cifra .n')).trim() === String(SEMANA_ESPERADA),
    `la semana se calcula sola de la fecha: ${(await pagina.textContent('.cifra .n')).trim()} (esperada ${SEMANA_ESPERADA})`);

  await pagina.fill('input[list="tipos-labor"]', LABOR);

  // el producto rellena detalle, unidad y costo
  const buscadorProducto = pagina.locator('.tarjeta dc-buscador input');
  await buscadorProducto.click();
  await buscadorProducto.fill('abono solido');
  await pagina.waitForSelector('.opciones li:not(.ninguna)');
  await pagina.locator('.opciones li').first().click();
  await pagina.locator('h1').click();          // cerrar el desplegable
  await pagina.waitForTimeout(200);

  const unidad = await pagina.locator('input[list="unidades"]').inputValue();
  const costo = await pagina.locator('.tarjeta input[type="number"]').inputValue();
  comprobar(unidad === 'Kg' && Number(costo) === 2500,
    `el producto rellena unidad y costo: ${unidad} / ${costo}`);

  // ------------------------------------------------------- las lineas
  const fila = (i) => pagina.locator('.tabla-caja tbody tr').nth(i);
  const elegirCultivo = async (i, codigo) => {
    const b = fila(i).locator('dc-buscador input');
    await b.click();
    await b.fill(String(codigo));
    await pagina.waitForSelector('.opciones li:not(.ninguna)');
    await pagina.locator('.opciones li').first().click();
    await pagina.locator('h1').click();        // cerrar el desplegable
    await pagina.waitForTimeout(150);
  };

  await elegirCultivo(0, activos[0].codigosistema);
  const plantas0 = (await fila(0).locator('td').nth(3).textContent()).trim();
  comprobar(Number(plantas0.replace(/\D/g, '')) === activos[0].numeroPlantasSembradas,
    `elegir el cultivo trae sus plantas: ${plantas0}`);
  const lote0 = await fila(0).locator('td').nth(1).locator('input').inputValue();
  comprobar(lote0 === String(activos[0].lote ?? ''), `y su lote: «${lote0}»`);

  // la dosis se escribe una vez y se hereda en la siguiente linea
  await fila(0).locator('td').nth(4).locator('input').fill(String(DOSIS));
  await fila(0).locator('td').nth(4).locator('input').blur();
  await pagina.waitForTimeout(150);
  const total0 = (await fila(0).locator('td').nth(5).textContent()).trim();
  const esperado0 = DOSIS * activos[0].numeroPlantasSembradas;
  comprobar(Math.abs(Number(total0.replace(/\./g, '').replace(',', '.')) - esperado0) < 0.1,
    `el total se calcula: ${DOSIS} × ${activos[0].numeroPlantasSembradas} = ${total0}`);

  await pagina.getByRole('button', { name: 'Añadir línea' }).click();
  await pagina.waitForTimeout(150);
  const dosisHeredada = await fila(1).locator('td').nth(4).locator('input').inputValue();
  comprobar(Number(dosisHeredada) === DOSIS, `la dosis se hereda de la línea anterior: ${dosisHeredada}`);
  await elegirCultivo(1, activos[1].codigosistema);

  // tercera linea: se repite el primer cultivo A PROPOSITO, para que falle
  await pagina.getByRole('button', { name: 'Añadir línea' }).click();
  await pagina.waitForTimeout(150);
  await elegirCultivo(2, activos[0].codigosistema);
  await pagina.waitForTimeout(200);
  comprobar((await pagina.textContent('body')).includes('está en más de una línea'),
    'avisa de que un cultivo repetido va a fallar');

  await pagina.screenshot({ path: `${CAPTURAS}actividad-lote.png` });

  // --------------------------------------------------------- guardar
  await pagina.getByRole('button', { name: 'Guardar actividades' }).click();
  await pagina.waitForSelector('text=líneas guardadas', { timeout: 15000 });
  // [role=status] es el resumen de la cabecera; .aviso a secas tambien
  // encaja con el error de cada fila, que va justo debajo
  const resumen = await pagina.textContent('.aviso[role="status"]');
  comprobar(resumen.includes('2 de 3'),
    `las 2 buenas entran y la repetida no: «${resumen.trim().slice(0, 60)}»`);
  comprobar((await pagina.textContent('body')).includes('ya tiene una actividad'),
    'y la fallida explica el motivo en su propia fila');
  comprobar(await pagina.locator('.etiqueta.si').count() === 2,
    'las dos guardadas quedan marcadas como tal');
  await pagina.screenshot({ path: `${CAPTURAS}actividad-lote-guardada.png` });

  // ------------------------------------------ comprobar contra la API
  const { cuerpo: acts } = await api('/tablas/actividades?limite=2000');
  const mias = acts.filter((a) => a.Actividad === LABOR);
  creadas.push(...mias.map((a) => a.id));
  comprobar(mias.length === 2, `la API devuelve 2 actividades «${LABOR}»`);
  comprobar(mias.every((a) => a.semanaAbono === SEMANA_ESPERADA),
    `las dos con la semana de la JORNADA (${SEMANA_ESPERADA}), no la de la siembra`);

  for (const a of mias) {
    const c = activos.find((x) => x.codigosistema === a.codigoSistema);
    comprobar(a.fechaSiembra === c.fechasiembra,
      `el cultivo ${a.codigoSistema} conserva SU fecha de siembra: ${a.fechaSiembra}`);
  }
  const uno = mias.find((a) => a.codigoSistema === activos[0].codigosistema);
  comprobar(Math.abs(uno.total - DOSIS * activos[0].numeroPlantasSembradas) < 0.1,
    `el total generado por la base cuadra: ${uno.total}`);
  comprobar(uno.detalle === 'abono solido 1' && uno.unidad === 'Kg' && uno.costo === 2500,
    `el insumo de la cabecera llega a todas: ${uno.detalle} / ${uno.unidad} / ${uno.costo}`);
  comprobar(uno.fechaRegistro === FECHA,
    `queda registrada, no programada: fechaRegistro=${uno.fechaRegistro}`);
} finally {
  await navegador.close();
  for (const id of creadas) {
    await fetch(`${BASE}/api/tablas/actividades/${id}`, { method: 'DELETE' });
  }
}

const { cuerpo: resto } = await api('/tablas/actividades?limite=2000');
comprobar(!resto.some((a) => a.Actividad === LABOR), 'la prueba deja la base como estaba');

if (errores.length) {
  console.log('\n  errores de navegador:');
  for (const e of [...new Set(errores)].slice(0, 8)) console.log(`    ${e}`);
}
if (fallos || errores.length) {
  console.error(`\n[ERROR] ${fallos} comprobación(es) fallidas, ${errores.length} error(es) de navegador`);
  process.exit(1);
}
console.log('\n[ok] el alta por lotes de actividades funciona de principio a fin');
