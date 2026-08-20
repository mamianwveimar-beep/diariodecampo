#!/usr/bin/env node
/**
 * Prueba de "Configuración de costos laborales".
 *
 * Comprueba que la pantalla:
 *   - carga el jornal vigente,
 *   - calcula costoMinuto = jornalHora / 60 en pantalla, sin pedirlo aparte,
 *   - muestra la advertencia exacta que pidio el usuario,
 *   - al guardar, deja el nuevo jornal en parametrosCostos,
 *   - y que ese cambio SI afecta a actividades generadas de ahi en adelante
 *     (una consulta de accion ejecutada despues de guardar usa el nuevo
 *     costo por minuto) pero NO reescribe una actividad ya existente antes
 *     del cambio (no retroactivo).
 *
 * Deja parametrosCostos exactamente como estaba al terminar, se ejecute bien
 * o falle a medias.
 *
 *   node web/humo-configuracion.mjs   (con ng serve y wrangler dev en marcha)
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:4200';

const api = async (ruta, opciones) => {
  const r = await fetch(`${BASE}/api${ruta}`, opciones);
  return { estado: r.status, cuerpo: await r.json().catch(() => null) };
};
const json = (metodo, cuerpo) => ({
  method: metodo, headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo),
});

let fallos = 0;
const comprobar = (ok, texto) => {
  console.log(`  ${ok ? 'ok  ' : 'FALLA'} ${texto}`);
  if (!ok) fallos++;
};

// ------------------------------------------------------- estado de partida
const { cuerpo: original } = await api('/tablas/parametrosCostos/1');
comprobar(!!original?.jornalHora, `jornal original leido: ${original?.jornalHora}`);

// Un cultivo creado y con su PreparacionTerreno generada ANTES del cambio de
// jornal: su costo debe seguir intacto al final, pase lo que pase despues.
const FACTURA = `CFGCOSTOS-${Date.now().toString().slice(-6)}`;
const alta = await api('/tablas/programacionCultivos', json('POST', {
  codSemilla: 9, fechasiembra: '2026-06-01', factura: FACTURA,
  numeroPlantasSembradas: 100, areaCultivada: 16, activo: 1,
}));
const codigo = alta.cuerpo?.codigosistema;
comprobar(alta.estado === 201 && !!codigo, `cultivo de prueba creado: ${codigo}`);

const generarPreparacion = () => api('/procesos/IngresoPreparacionTerreno', json('POST', {}));

await generarPreparacion();
let { cuerpo: act } = await api('/tablas/actividades?limite=3000');
let previa = act.find((a) => a.codigoSistema === codigo && a.Actividad === 'PreparacionTerreno');
comprobar(!!previa, 'PreparacionTerreno generada ANTES de tocar el jornal');
comprobar(Math.abs((previa?.costo ?? 0) - original.costoMinuto) < 0.0001,
  `su costo usa el costoMinuto original: ${previa?.costo}`);

const NUEVO_JORNAL = 9600; // /60 = 160 exacto, sin sorpresas de redondeo
const navegador = await chromium.launch();
const pagina = await navegador.newPage({ viewport: { width: 1200, height: 900 } });
const errores = [];
pagina.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
pagina.on('pageerror', (e) => errores.push(e.message));

try {
  await pagina.goto(`${BASE}/configuracion-costos`, { waitUntil: 'networkidle' });

  const campo = pagina.locator('input[name="jornalHora"]');
  await campo.waitFor();
  comprobar(await campo.inputValue() === String(original.jornalHora),
    `el formulario carga el jornal vigente: ${await campo.inputValue()}`);

  const aviso = pagina.locator('.aviso.atencion');
  comprobar((await aviso.textContent())
      ?.includes('Este cambio afectará el cálculo de costos en el reporte de actividades de aquí en adelante') ?? false,
    'muestra la advertencia pedida, literal');

  await campo.fill(String(NUEVO_JORNAL));
  await pagina.waitForTimeout(150);
  const previsto = await pagina.locator('.tarjeta .small strong').textContent();
  comprobar((previsto ?? '').replace(/\./g, '').trim() === '160,00' || (previsto ?? '').trim() === '160.00',
    `costo por minuto previsto en pantalla, sin pedirlo aparte: ${previsto}`);

  await pagina.getByRole('button', { name: 'Guardar' }).click();
  await pagina.waitForSelector('.aviso.ok');
  comprobar(true, 'aviso de guardado visible');
} finally {
  await navegador.close();
}

// --------------------------------------------- se guardo de verdad en D1
const { cuerpo: tras } = await api('/tablas/parametrosCostos/1');
comprobar(tras.jornalHora === NUEVO_JORNAL, `jornalHora guardado: ${tras.jornalHora}`);
comprobar(Math.abs(tras.costoMinuto - 160) < 0.0001, `costoMinuto guardado = jornal/60: ${tras.costoMinuto}`);

// ------------------------- afecta lo nuevo, no reescribe lo ya generado
// Segundo cultivo, para no chocar con la fila ON CONFLICT DO NOTHING del primero.
const alta2 = await api('/tablas/programacionCultivos', json('POST', {
  codSemilla: 9, fechasiembra: '2026-06-08', factura: `${FACTURA}-2`,
  numeroPlantasSembradas: 100, areaCultivada: 16, activo: 1,
}));
const codigo2 = alta2.cuerpo?.codigosistema;
comprobar(alta2.estado === 201 && !!codigo2, `segundo cultivo creado: ${codigo2}`);

await generarPreparacion();
({ cuerpo: act } = await api('/tablas/actividades?limite=3000'));
const nueva = act.find((a) => a.codigoSistema === codigo2 && a.Actividad === 'PreparacionTerreno');
comprobar(!!nueva, 'PreparacionTerreno generada DESPUES de guardar el nuevo jornal');
comprobar(Math.abs((nueva?.costo ?? 0) - 160) < 0.0001,
  `su costo YA usa el nuevo costoMinuto (160): ${nueva?.costo}`);

previa = act.find((a) => a.codigoSistema === codigo && a.Actividad === 'PreparacionTerreno');
comprobar(Math.abs((previa?.costo ?? 0) - original.costoMinuto) < 0.0001,
  `la actividad generada ANTES no se reescribio: sigue en ${previa?.costo}`);

// -------------------------------------------------------------- limpieza
await api(`/tablas/programacionCultivos/${codigo}`, json('DELETE'));
await api(`/tablas/programacionCultivos/${codigo2}`, json('DELETE'));
await api('/tablas/parametrosCostos/1', json('PUT', {
  jornalHora: original.jornalHora, costoMinuto: original.costoMinuto,
}));

const { cuerpo: restaurado } = await api('/tablas/parametrosCostos/1');
comprobar(restaurado.jornalHora === original.jornalHora && restaurado.costoMinuto === original.costoMinuto,
  `parametrosCostos quedo como estaba: ${restaurado.jornalHora} / ${restaurado.costoMinuto}`);

const { cuerpo: resto } = await api('/tablas/actividades?limite=3000');
comprobar(!resto.some((a) => a.codigoSistema === codigo || a.codigoSistema === codigo2),
  'la prueba deja la base como estaba');

if (errores.length) {
  console.log('\n  errores de navegador:');
  for (const e of [...new Set(errores)].slice(0, 8)) console.log(`    ${e}`);
}
if (fallos || errores.length) {
  console.error(`\n[ERROR] ${fallos} comprobación(es) fallidas, ${errores.length} error(es) de navegador`);
  process.exit(1);
}
console.log('\n[ok] Configuración de costos: se guarda de verdad y afecta solo a lo generado de aquí en adelante');
