#!/usr/bin/env node
/**
 * Prueba de la actividad "Cosecha" generada al registrar una cosecha.
 *
 * Programa un cultivo, registra dos cosechas parciales desde la pantalla
 * "Siembras" (modal "Cosechas") y comprueba contra la API que:
 *   - se genera UNA actividad "Cosecha" por semana, acumulando plantas y
 *     minutos en vez de pisarlos,
 *   - el detalle dice "parcial" o "total" segun lo que falte,
 *   - el costo sale a 1,46 $/minuto, igual que las demas labores por tiempo,
 *   - la fila de Siembras (Cosechadas/Faltan/Kilos) se actualiza sin recargar,
 *   - borrar la cosecha recalcula la actividad.
 *
 *   node web/humo-cosecha.mjs      (con ng serve y wrangler dev en marcha)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4200';
const CAPTURAS = new URL('./capturas/', import.meta.url).pathname.replace(/^\//, '');
mkdirSync(CAPTURAS, { recursive: true });

const FACTURA = `COSECHA-${Date.now().toString().slice(-6)}`;
const FECHA_SIEMBRA = '2026-06-01';
const PLANTAS = 100;

const api = async (ruta, opciones) => {
  const r = await fetch(`${BASE}/api${ruta}`, opciones);
  return { estado: r.status, cuerpo: await r.json().catch(() => null) };
};
const json = (cuerpo) => ({
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo),
});

let fallos = 0;
const comprobar = (ok, texto) => {
  console.log(`  ${ok ? 'ok  ' : 'FALLA'} ${texto}`);
  if (!ok) fallos++;
};

// ------------------------------------------------------- cultivo de prueba
const alta = await api('/tablas/programacionCultivos', json({
  codSemilla: 9, fechasiembra: FECHA_SIEMBRA, factura: FACTURA,
  numeroPlantasPlanificadas: PLANTAS, numeroPlantasSembradas: PLANTAS,
  areaCultivada: 16, activo: 1,
}));
const codigo = alta.cuerpo?.codigosistema;
comprobar(alta.estado === 201 && !!codigo, `cultivo de prueba creado: ${codigo}`);

const navegador = await chromium.launch();
const pagina = await navegador.newPage({ viewport: { width: 1500, height: 1000 } });
const errores = [];
pagina.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
pagina.on('pageerror', (e) => errores.push(e.message));

try {
  await pagina.goto(`${BASE}/siembras`, { waitUntil: 'networkidle' });
  await pagina.waitForSelector('tbody tr');

  const fila = pagina.locator('tbody tr').filter({ hasText: FACTURA }).first();
  comprobar(await fila.count() === 1, 'el cultivo de prueba aparece en Siembras');

  // antes de cosechar: las tres celdas en blanco, no en cero
  const celdasAntes = await fila.locator('td').allTextContents();
  comprobar(celdasAntes[7].trim() === '—' && celdasAntes[8].trim() === '—' && celdasAntes[9].trim() === '—',
    'sin cosechas todavía, Cosechadas/Faltan/Kilos muestran —');

  await fila.getByRole('button', { name: 'Cosechas' }).click();
  await pagina.waitForSelector('.modal');

  const escribir = async (name, valor) => { await pagina.locator(`.modal [name="${name}"]`).fill(String(valor)); };

  // ------------------------------------------------- primera cosecha, parcial
  await escribir('fc', '2026-08-17');
  await escribir('peso', '8');
  await escribir('npc', '40');
  await escribir('respCosecha', 'Jose Rivera');
  await escribir('minCosecha', '60');
  await pagina.getByRole('button', { name: 'Anadir cosecha' }).click();
  await pagina.waitForTimeout(500);

  comprobar((await pagina.textContent('.modal')).includes('Jose Rivera'),
    'la cosecha aparece en la lista del modal, con su responsable');

  let { cuerpo: act } = await api('/tablas/actividades?limite=2000');
  let cosecha = act.find((a) => a.codigoSistema === codigo && a.Actividad === 'Cosecha');
  comprobar(!!cosecha, 'se generó la actividad «Cosecha»');
  comprobar(cosecha?.numeroPlantas === 40, `con 40 plantas: ${cosecha?.numeroPlantas}`);
  comprobar(cosecha?.detalle === 'Cosecha parcial', `detalle: ${cosecha?.detalle} (40 de 100)`);
  comprobar(Math.abs((cosecha?.costo ?? 0) - 1.46) < 0.001, `costo por minuto: ${cosecha?.costo}`);

  // ------------------------------------------------ segunda, misma semana
  await escribir('fc', '2026-08-18');
  await escribir('peso', '6');
  await escribir('npc', '60');
  await escribir('respCosecha', 'Mario Ramirez');
  await escribir('minCosecha', '90');
  await pagina.getByRole('button', { name: 'Anadir cosecha' }).click();
  await pagina.waitForTimeout(500);

  ({ cuerpo: act } = await api('/tablas/actividades?limite=2000'));
  const filasCosecha = act.filter((a) => a.codigoSistema === codigo && a.Actividad === 'Cosecha');
  comprobar(filasCosecha.length === 1, `sigue habiendo UNA sola fila Cosecha (${filasCosecha.length})`);
  cosecha = filasCosecha[0];
  comprobar(cosecha.numeroPlantas === 100, `plantas acumuladas: 40+60=${cosecha.numeroPlantas}`);
  comprobar(Math.abs(cosecha.total - 150) < 0.01, `minutos acumulados: 60+90=${cosecha.total}`);
  comprobar(cosecha.detalle === 'Cosecha total', `las 100 completas: ${cosecha.detalle}`);

  // ------------------------------------- Siembras se actualiza sin recargar
  const celdasDespues = await fila.locator('td').allTextContents();
  comprobar(celdasDespues[7].trim() === '100', `Cosechadas en Siembras: ${celdasDespues[7].trim()}`);
  comprobar(celdasDespues[8].trim() === '0', `Faltan en Siembras: ${celdasDespues[8].trim()}`);
  comprobar(Number(celdasDespues[9].trim()) === 14, `Kilos en Siembras: ${celdasDespues[9].trim()} (8+6)`);

  await pagina.screenshot({ path: `${CAPTURAS}siembras-cosecha-actividad.png` });

  // ------------------------------------------- borrar recalcula, no rompe
  await pagina.once('dialog', (d) => d.accept());
  await pagina.locator('.modal tbody tr').first().getByRole('button', { name: 'Borrar' }).click();
  await pagina.waitForTimeout(500);

  ({ cuerpo: act } = await api('/tablas/actividades?limite=2000'));
  cosecha = act.find((a) => a.codigoSistema === codigo && a.Actividad === 'Cosecha');
  comprobar(cosecha?.numeroPlantas === 60, `tras borrar la primera, quedan 60: ${cosecha?.numeroPlantas}`);
  comprobar(cosecha?.detalle === 'Cosecha parcial', `vuelve a parcial: ${cosecha?.detalle}`);
} finally {
  await navegador.close();
  await fetch(`${BASE}/api/tablas/programacionCultivos/${codigo}`, { method: 'DELETE' });
}

const { cuerpo: resto } = await api('/tablas/actividades?limite=2000');
comprobar(!resto.some((a) => a.codigoSistema === codigo), 'la prueba deja la base como estaba');

if (errores.length) {
  console.log('\n  errores de navegador:');
  for (const e of [...new Set(errores)].slice(0, 8)) console.log(`    ${e}`);
}
if (fallos || errores.length) {
  console.error(`\n[ERROR] ${fallos} comprobación(es) fallidas, ${errores.length} error(es) de navegador`);
  process.exit(1);
}
console.log('\n[ok] la actividad «Cosecha» se genera, acumula y recalcula bien desde la pantalla');
