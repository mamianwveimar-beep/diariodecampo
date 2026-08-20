#!/usr/bin/env node
/**
 * Prueba de la orden de siembra: la pantalla del operario.
 *
 * Programa una siembra por la API, la registra desde la pantalla con una
 * merma, y comprueba contra la API que quedo guardada y que la temporada se
 * programo sobre las plantas REALES. Deja la base como estaba.
 *
 *   node web/humo-orden.mjs      (con ng serve y wrangler dev en marcha)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4200';
const CAPTURAS = new URL('./capturas/', import.meta.url).pathname.replace(/^\//, '');
mkdirSync(CAPTURAS, { recursive: true });

const FACTURA = `ORDEN-${Date.now().toString().slice(-6)}`;
const PLANIFICADAS = 400;
const REALES = 380;
const SEMILLA_BROCOLI = 9;
const MARCO_BROCOLI = 0.16;     // m2 por planta, de infoSemilla

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

// ------------------------------------------- se programa una siembra
const alta = await api('/tablas/programacionCultivos', json({
  codSemilla: SEMILLA_BROCOLI, fechasiembra: '2026-08-19', factura: FACTURA,
  numeroPlantasPlanificadas: PLANIFICADAS, numeroPlantasSembradas: PLANIFICADAS,
  areaCultivada: PLANIFICADAS * MARCO_BROCOLI, lote: '4', cama: '4', activo: 1,
}));
const codigo = alta.cuerpo?.codigosistema;
comprobar(alta.estado === 201 && !!codigo, `siembra programada con el código ${codigo}`);

const navegador = await chromium.launch();
// tamano de movil: es donde se usa
const pagina = await navegador.newPage({ viewport: { width: 414, height: 896 } });
const errores = [];
pagina.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
pagina.on('pageerror', (e) => errores.push(e.message));

try {
  // ------------------------------------------------ aparece en la lista
  await pagina.goto(`${BASE}/orden`, { waitUntil: 'networkidle' });
  const enLista = pagina.locator('.orden-fila').filter({ hasText: 'brocoli' }).first();
  comprobar(await pagina.locator('.orden-fila').count() > 0,
    `la lista muestra ${await pagina.locator('.orden-fila').count()} siembras pendientes`);
  await pagina.screenshot({ path: `${CAPTURAS}orden-lista.png` });

  // ------------------------------------------------- la barra de filtros
  const campo = (etiqueta) =>
    pagina.locator('.barra label').filter({ hasText: etiqueta }).locator('input, select');
  const filas = () => pagina.locator('.orden-fila').count();

  const todas = await filas();
  const { cuerpo: pendientesApi } = await api('/ordenes/pendientes');

  // el oraculo es la propia API: cuantas siembras de brocoli hay pendientes
  const deBrocoli = pendientesApi.filter((o) => o.semilla === 'brocoli').length;
  await campo('Cultivo').selectOption({ label: 'brocoli' });
  await pagina.waitForTimeout(200);
  comprobar(await filas() === deBrocoli,
    `filtrar por cultivo deja ${await filas()} filas (la API dice ${deBrocoli})`);

  await pagina.getByRole('button', { name: 'Limpiar' }).click();
  await pagina.waitForTimeout(200);
  comprobar(await filas() === todas, `«Limpiar» devuelve las ${todas} filas`);

  // rango de fechas, contra el mismo oraculo
  const DESDE = '2026-08-01';
  const desdeApi = pendientesApi.filter((o) => o.fechasiembra >= DESDE).length;
  await campo('Siembra desde').fill(DESDE);
  await pagina.waitForTimeout(200);
  comprobar(await filas() === desdeApi,
    `filtrar desde ${DESDE} deja ${await filas()} filas (la API dice ${desdeApi})`);

  // rango al reves: avisa en vez de quedarse en blanco sin explicacion
  await campo('Siembra hasta').fill('2020-01-01');
  await pagina.waitForTimeout(200);
  comprobar((await pagina.textContent('body')).includes('posterior a la'),
    'avisa cuando el rango de fechas está al revés');
  comprobar(await filas() === 0 && (await pagina.textContent('body')).includes('coincide con el filtro'),
    'y dice que ninguna siembra coincide');
  await pagina.getByRole('button', { name: 'Limpiar' }).click();
  await pagina.waitForTimeout(200);

  // se entra por el codigo, que es la que acabamos de crear
  await pagina.goto(`${BASE}/orden/${codigo}`, { waitUntil: 'networkidle' });
  await pagina.waitForSelector('.tarjeta.tuyo');

  // --------------------------------------------------- solo 4 editables
  const dentro = await pagina.locator('.tarjeta.tuyo input, .tarjeta.tuyo textarea').count();
  const fuera = await pagina.locator('.tarjeta:not(.tuyo) input, .tarjeta:not(.tuyo) textarea, .tarjeta:not(.tuyo) select').count();
  comprobar(fuera === 0, `ningún campo editable fuera de la tarjeta del operario (${fuera})`);
  comprobar(dentro >= 3, `la tarjeta del operario trae sus campos (${dentro} visibles antes de la merma)`);

  // ------------------------------------- los insumos salen de la ficha
  const textoInsumos = await pagina.textContent('body');
  comprobar(textoInsumos.includes('Abono en siembra'), 'muestra el abono en siembra de la ficha');
  comprobar(textoInsumos.includes('Cal dolomita'), 'muestra la cal dolomita');
  comprobar(textoInsumos.includes('Basilus'), 'muestra el Basilus contra el trozador');

  const pesoInicial = await pagina.textContent('.carga .v');
  // 400 x (0,2 + 0,001 + 0,03) = 92,4
  comprobar(pesoInicial.replace(',', '.').includes('92.4'),
    `el peso a llevar sale de la ficha: ${pesoInicial.trim()}`);

  // ------------------------------------------------ la merma se exige
  const cantidad = pagina.locator('.paso input');
  await cantidad.fill(String(REALES));
  await cantidad.blur();
  await pagina.waitForTimeout(200);

  comprobar((await pagina.textContent('.balance')).includes('Merma de 20'),
    'el balance nombra la merma exacta');
  comprobar(await pagina.locator('textarea').isVisible(), 'aparece el motivo de la merma');
  comprobar(await pagina.getByRole('button', { name: /Guardar Registro/ }).isDisabled(),
    'el botón de guardar se bloquea sin motivo');
  comprobar((await pagina.textContent('.impedimento')).includes('motivo'),
    'y dice por qué está bloqueado');

  // los insumos siguen a la cantidad real, no a la planificada
  const pesoReal = await pagina.textContent('.carga .v');
  comprobar(pesoReal.replace(',', '.').includes('87.8'),
    `el peso se recalcula con las 380 reales: ${pesoReal.trim()}`);

  // ------------------------------------------------------- se registra
  await pagina.locator('textarea').fill('Veinte plántulas llegaron con el cepellón partido.');
  await pagina.locator('input[list="lotes-conocidos"]').fill('A1');
  await pagina.locator('input[list="camas-conocidas"]').fill('B2');
  await pagina.waitForTimeout(200);
  comprobar(await pagina.getByRole('button', { name: /Guardar Registro/ }).isEnabled(),
    'con el motivo escrito se desbloquea guardar');
  await pagina.screenshot({ path: `${CAPTURAS}orden-siembra.png`, fullPage: true });

  await pagina.getByRole('button', { name: /Guardar Registro/ }).click();
  await pagina.waitForSelector('text=Registro guardado', { timeout: 15000 });
  const resumen = await pagina.textContent('.aviso.ok');
  comprobar(/\d+ labores/.test(resumen), `confirma lo programado: «${resumen.trim().slice(0, 70)}»`);
  await pagina.screenshot({ path: `${CAPTURAS}orden-guardada.png`, fullPage: true });

  // ------------------------------------------ se comprueba en la API
  const { cuerpo: c } = await api(`/ordenes/${codigo}`);
  comprobar(c.numeroPlantasSembradas === REALES, `guarda las ${REALES} plantas reales`);
  comprobar(c.numeroPlantasPlanificadas === PLANIFICADAS, 'y conserva las planificadas para comparar');
  comprobar(c.lote === 'A1' && c.cama === 'B2', `guarda el lote y la cama del operario: ${c.lote}/${c.cama}`);
  comprobar((c.motivoMerma ?? '').startsWith('Veinte'), 'guarda el motivo de la merma');
  comprobar(!!c.fechaRegistroSiembra, `sella la fecha de registro: ${c.fechaRegistroSiembra}`);
  comprobar(Math.abs(c.areaCultivada - REALES * MARCO_BROCOLI) < 0.01,
    `recalcula el área con lo real: ${c.areaCultivada} m² (380 × 0,16 = 60,8)`);

  const { cuerpo: pend } = await api('/ordenes/pendientes');
  comprobar(pend.every((o) => o.codigosistema !== codigo), 'sale de la lista de pendientes');

  const { cuerpo: act } = await api('/vistas/cCostosActividades');
  const mias = act.filter((a) => a.codigoSistema === codigo);
  comprobar(mias.length > 0, `quedaron ${mias.length} labores programadas`);
  comprobar(mias.every((a) => a.numeroPlantas === REALES),
    'todas calculadas sobre las plantas reales, no las planificadas');
  const tipos = [...new Set(mias.map((a) => a.Actividad))];
  comprobar(tipos.includes('AbonoSiembra') && tipos.includes('CalDolomita'),
    `incluye las labores del día de siembra: ${tipos.sort().join(', ')}`);
} finally {
  await navegador.close();
  // limpiar: al borrar el cultivo se van sus actividades y costos en cascada
  if (codigo) await fetch(`${BASE}/api/tablas/programacionCultivos/${codigo}`, { method: 'DELETE' });
}

const { cuerpo: resto } = await api('/vistas/cCostosActividades');
comprobar(resto.every((a) => a.codigoSistema !== codigo), 'la prueba deja la base como estaba');

if (errores.length) {
  console.log('\n  errores de navegador:');
  for (const e of [...new Set(errores)].slice(0, 8)) console.log(`    ${e}`);
}
if (fallos || errores.length) {
  console.error(`\n[ERROR] ${fallos} comprobación(es) fallidas, ${errores.length} error(es) de navegador`);
  process.exit(1);
}
console.log('\n[ok] la orden de siembra funciona de principio a fin');
