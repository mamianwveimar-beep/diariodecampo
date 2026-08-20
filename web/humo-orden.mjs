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

  // ----------------------------------------------- lo cerrado esta cerrado
  // Lo editable vive en dos sitios y en ninguno mas: la tarjeta del operario
  // (lote, cama, cantidad, motivo) y la semana de siembra de la programacion.
  // Todo lo que la pantalla marca como cerrado no debe tener ni un control.
  const dentro = await pagina.locator('.tarjeta.tuyo input, .tarjeta.tuyo textarea').count();
  const enCerradas = await pagina.locator(
    '.tarjeta.cerrada input, .tarjeta.cerrada textarea, .tarjeta.cerrada select').count();
  comprobar(enCerradas === 0, `ningún control en las tarjetas marcadas como cerradas (${enCerradas})`);
  comprobar(dentro >= 3, `la tarjeta del operario trae sus campos (${dentro} visibles antes de la merma)`);

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

  // ------------------------------------- pestañas de semana: vista previa
  // Las filas de la temporada todavia NO existen en la base -se generan
  // recien al guardar-, asi que esto es una prediccion calculada en el
  // navegador (web/src/app/nucleo/plan-siembra.ts). La comprobacion real es
  // mas abajo: comparar esta prediccion contra lo que el backend deja
  // guardado de verdad, para la misma siembra.
  const pestanas = pagina.locator('.pestanas-semana button');
  const nSemanas = await pestanas.count();
  comprobar(nSemanas > 1, `la vista previa ofrece ${nSemanas} pestañas de semana`);
  comprobar(await pestanas.first().evaluate((b) => b.classList.contains('activa')),
    'arranca con la primera semana activa');

  const previstoPorSemana = {};
  for (let i = 0; i < nSemanas; i++) {
    await pestanas.nth(i).click();
    await pagina.waitForTimeout(120);
    const etiqueta = (await pestanas.nth(i).textContent()).trim();
    const semana = Number(etiqueta.replace('Semana ', ''));
    comprobar(await pestanas.nth(i).evaluate((b) => b.classList.contains('activa')),
      `la pestaña ${etiqueta} queda marcada activa al pulsarla`);
    const actividades = await pagina.locator('.pestanas-semana ~ .tabla-caja tbody td:first-child').allTextContents();
    previstoPorSemana[semana] = actividades.slice().sort();
    comprobar(actividades.length > 0, `«${etiqueta}» muestra ${actividades.length} fila(s)`);
  }
  // volver a la primera pestaña antes de seguir
  await pestanas.first().click();
  await pagina.waitForTimeout(120);

  // el pie se lee por clase, no por posicion (ver el comentario de pie())
  // por clase y no por posicion: las columnas cambian entre la tabla editable
  // y la de solo lectura, y nth-child se rompia en silencio al moverlas
  const pie = (cual) => pagina.textContent(`.pestanas-semana ~ .tabla-caja tfoot td.${cual}`);
  const numero = (t) => Number((t ?? '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));

  const pesoUnaSemana = await pie('peso');
  comprobar(/\d/.test(pesoUnaSemana ?? ''), `el peso de la semana activa se recalcula: ${(pesoUnaSemana ?? '').trim()}`);

  // ------------------------------- la semana de la siembra es editable
  // Es la unica que el operario ya ejecuto, asi que puede corregir lo que de
  // verdad aplico. Las demas semanas son solo previsualizacion.
  const celdas = pagina.locator('.pestanas-semana ~ .tabla-caja tbody input');
  comprobar(await celdas.count() > 0,
    `la semana de la siembra trae ${await celdas.count()} celdas editables`);

  await pestanas.nth(1).click();
  await pagina.waitForTimeout(150);
  comprobar(await pagina.locator('.pestanas-semana ~ .tabla-caja tbody input').count() === 0,
    'las semanas futuras siguen siendo de solo lectura');
  await pestanas.first().click();
  await pagina.waitForTimeout(150);

  // corregir una cantidad y ver que el pie se recalcula solo
  const pesoAntes = numero(await pie('peso'));
  const costoAntes = numero(await pie('costo'));
  const primera = celdas.first();
  const valorOriginal = numero(await primera.inputValue());
  await primera.fill(String(valorOriginal + 10));
  await primera.blur();
  await pagina.waitForTimeout(250);

  comprobar(Math.abs(numero(await pie('peso')) - (pesoAntes + 10)) < 0.2,
    `corregir una cantidad recalcula el peso: ${pesoAntes} → ${numero(await pie('peso'))} kg`);
  comprobar(numero(await pie('costo')) > costoAntes,
    `y el costo de la semana sube con ella: ${costoAntes} → ${numero(await pie('costo'))}`);
  comprobar((await pagina.textContent('body')).includes('valores escritos a mano'),
    'avisa de que hay valores escritos a mano');

  await pagina.getByRole('button', { name: 'Volver a lo calculado' }).click();
  await pagina.waitForTimeout(250);
  comprobar(Math.abs(numero(await pie('peso')) - pesoAntes) < 0.2,
    'y se puede volver a los valores calculados');

  // dejar una correccion puesta: mas abajo se comprueba que es la que se guarda
  const actividadCorregida = (await pagina.locator('.pestanas-semana ~ .tabla-caja tbody tr')
    .first().locator('td').first().textContent()).trim();
  const cantidadCorregida = valorOriginal + 10;
  await primera.fill(String(cantidadCorregida));
  await primera.blur();
  await pagina.waitForTimeout(250);

  // ------------------------------- novedades anadidas a mano en campo
  const NOVEDAD = { actividad: 'ProteccionExtra', detalle: 'Basilus', unidad: 'Litro',
                    cantidad: 3, costo: 15000 };
  const pesoSinNovedad = numero(await pie('peso'));
  const costoSinNovedad = numero(await pie('costo'));

  await pagina.getByRole('button', { name: /Agregar actividad adicional/ }).click();
  await pagina.waitForTimeout(200);
  const fila = pagina.locator('.pestanas-semana ~ .tabla-caja tbody tr.adicional').last();
  comprobar(await fila.count() === 1, 'el botón inserta una fila vacía y editable');
  comprobar(Math.abs(numero(await pie('peso')) - pesoSinNovedad) < 0.01,
    'una fila vacía todavía no altera los totales');

  const celda = (i) => fila.locator('td').nth(i).locator('input');
  await celda(0).fill(NOVEDAD.actividad);
  await celda(1).fill(NOVEDAD.detalle);
  await celda(2).fill(String(NOVEDAD.cantidad));
  await celda(3).fill(NOVEDAD.unidad);
  await celda(4).fill(String(NOVEDAD.costo));
  await celda(4).blur();
  await pagina.waitForTimeout(250);

  comprobar(Math.abs(numero(await pie('peso')) - (pesoSinNovedad + NOVEDAD.cantidad)) < 0.2,
    `la novedad suma al peso por ser Litro: ${pesoSinNovedad} → ${numero(await pie('peso'))} kg`);
  comprobar(Math.abs(numero(await pie('costo')) - (costoSinNovedad + NOVEDAD.costo)) < 1,
    `y suma al costo de la semana: ${costoSinNovedad} → ${numero(await pie('costo'))}`);

  // una novedad en minutos no debe pesar, solo costar
  await pagina.getByRole('button', { name: /Agregar actividad adicional/ }).click();
  await pagina.waitForTimeout(200);
  const enMinutos = pagina.locator('.pestanas-semana ~ .tabla-caja tbody tr.adicional').last();
  const pesoAntesMin = numero(await pie('peso'));
  await enMinutos.locator('td').nth(0).locator('input').fill('DeshierbeExtra');
  await enMinutos.locator('td').nth(2).locator('input').fill('50');
  await enMinutos.locator('td').nth(3).locator('input').fill('Min');
  await enMinutos.locator('td').nth(3).locator('input').blur();
  await pagina.waitForTimeout(250);
  comprobar(Math.abs(numero(await pie('peso')) - pesoAntesMin) < 0.01,
    `una novedad en «Min» no suma al peso: sigue en ${numero(await pie('peso'))} kg`);

  // y se puede quitar
  await enMinutos.getByRole('button', { name: /Quitar/ }).click();
  await pagina.waitForTimeout(200);
  comprobar(await pagina.locator('.pestanas-semana ~ .tabla-caja tbody tr.adicional').count() === 1,
    'la novedad se puede quitar antes de guardar');

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

  // ------------------- la vista previa del navegador contra lo real guardado
  // Es la comprobacion que cierra el riesgo de que plan-siembra.ts (TS, en el
  // navegador) se desincronice de consultas-accion.mjs (el SQL real): si
  // alguien cambia un dia de desfase en uno y no en el otro, esto lo detecta.
  const realPorSemana = {};
  // Sin las novedades que esta misma prueba anadio a mano: lo que se compara
  // es que el CALENDARIO CALCULADO coincida, y una novedad no sale de ningun
  // calculo, asi que por definicion no esta en la previsualizacion.
  for (const a of mias.filter((x) => x.Actividad !== NOVEDAD.actividad)) {
    (realPorSemana[a.semanaAbono] ??= []).push(a.Actividad);
  }
  for (const k in realPorSemana) realPorSemana[k].sort();

  const semanasPrevistas = Object.keys(previstoPorSemana).map(Number).sort((a, b) => a - b);
  const semanasReales = Object.keys(realPorSemana).map(Number).sort((a, b) => a - b);
  comprobar(JSON.stringify(semanasPrevistas) === JSON.stringify(semanasReales),
    `las mismas semanas: previsto ${semanasPrevistas.join(',')} · real ${semanasReales.join(',')}`);

  let coincideTodo = true;
  for (const s of semanasPrevistas) {
    const previstas = previstoPorSemana[s] ?? [];
    const reales = realPorSemana[s] ?? [];
    if (JSON.stringify(previstas) !== JSON.stringify(reales)) {
      coincideTodo = false;
      console.log(`    semana ${s}: previsto [${previstas}] · real [${reales}]`);
    }
  }
  comprobar(coincideTodo, 'la vista previa del navegador coincide, semana a semana, con lo que el backend guardó');

  // ---------------- la correccion del operario gana sobre lo calculado
  const corregida = mias.find((a) => a.Actividad === actividadCorregida);
  comprobar(corregida && Math.abs(corregida.total - cantidadCorregida) < 0.2,
    `«${actividadCorregida}» se guardó con lo escrito a mano: ${corregida?.total} (se escribió ${cantidadCorregida})`);

  // --------- solo la semana de la siembra queda registrada; el resto, programada
  const { cuerpo: todasLasFilas } = await api("/tablas/actividades?limite=2000");
  const delCultivo = todasLasFilas.filter((a) => a.codigoSistema === codigo);
  const registradas = delCultivo.filter((a) => a.fechaRegistro);
  const programadas = delCultivo.filter((a) => !a.fechaRegistro);
  const semanaSiembra = Math.min(...registradas.map((a) => a.semanaAbono));
  comprobar(registradas.length > 0 && registradas.every((a) => a.semanaAbono === semanaSiembra),
    `solo la semana ${semanaSiembra} queda registrada (${registradas.length} labores con fechaRegistro)`);
  comprobar(programadas.length > 0 && programadas.every((a) => !a.fechaRegistro),
    `las otras ${programadas.length} quedan programadas, sin registrar`);

  // ------------------- la novedad queda como labor Y con su linea de costo
  const laNovedad = delCultivo.find((a) => a.Actividad === NOVEDAD.actividad);
  comprobar(!!laNovedad && !!laNovedad.fechaRegistro,
    `la novedad «${NOVEDAD.actividad}» se guardó como labor registrada`);
  comprobar(laNovedad && Math.abs(laNovedad.total - NOVEDAD.cantidad) < 0.2,
    `con la cantidad escrita: ${laNovedad?.total} ${laNovedad?.unidad}`);

  const { cuerpo: costos } = await api('/tablas/costosInsumos?limite=2000');
  const costoNovedad = costos.filter((x) => x.programacionCultivoCodCultivo === codigo)
    .find((x) => x.concepto === NOVEDAD.actividad);
  comprobar(!!costoNovedad, 'y además abrió su línea en costosInsumos');
  comprobar(costoNovedad && Math.abs(costoNovedad.valorTotal - NOVEDAD.costo) < 1,
    `con el costo que escribió el operario: ${costoNovedad?.valorTotal}`);
  comprobar(costoNovedad && costoNovedad.producto === 5,
    `y enlazada al producto real, porque el detalle era «${NOVEDAD.detalle}»: producto=${costoNovedad?.producto}`);
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
