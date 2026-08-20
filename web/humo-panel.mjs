#!/usr/bin/env node
/**
 * Prueba del panel de la finca.
 *
 * Todo lo que muestra se contrasta contra la API, calculando lo mismo por
 * separado: cuantos cultivos estan por salir, cuantas labores caen en la
 * semana en curso y cuanto cuestan. Si el panel y la base no coinciden, aqui
 * se ve.
 *
 * Marca una labor como realizada desde el panel y comprueba que llego a la
 * base; al terminar la devuelve a como estaba.
 *
 *   node web/humo-panel.mjs      (con ng serve y wrangler dev en marcha)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { hoyBogota, semanaAccess, sumarDias } from '../api/src/access-compat/fechas.mjs';

const BASE = process.env.BASE ?? 'http://localhost:4200';
const CAPTURAS = new URL('./capturas/', import.meta.url).pathname.replace(/^\//, '');
mkdirSync(CAPTURAS, { recursive: true });

const api = async (ruta, opciones) => {
  const r = await fetch(`${BASE}/api${ruta}`, opciones);
  return { estado: r.status, cuerpo: await r.json().catch(() => null) };
};

let fallos = 0;
const comprobar = (ok, texto) => {
  console.log(`  ${ok ? 'ok  ' : 'FALLA'} ${texto}`);
  if (!ok) fallos++;
};

// ------------------------- el oraculo: lo mismo, calculado por separado
const HOY = hoyBogota();
const SEMANA = semanaAccess(HOY);
const dias = (iso) => Math.round((Date.parse(iso + 'T00:00:00Z') - Date.parse(HOY + 'T00:00:00Z')) / 86400000);

const { cuerpo: cultivos } = await api('/tablas/programacionCultivos?limite=2000');
const { cuerpo: semillas } = await api('/tablas/infoSemilla');
const { cuerpo: actividades } = await api('/tablas/actividades?limite=2000');

const activos = cultivos.filter((c) => c.activo === 1);
const cosechables = activos.filter((c) => !c.fechaRealCosecha).map((c) => {
  const ciclo = semillas.find((s) => s.Id === c.codSemilla)?.ciclo ?? 0;
  const diasEnTerreno = -dias(c.fechasiembra);   // dias() mide "fecha - hoy"; invertido, es "hoy - fecha"
  return { c, faltan: dias(sumarDias(c.fechasiembra, ciclo)), ciclo, diasEnTerreno };
}).filter((x) => x.faltan > -60);

const porSalir = cosechables.filter((x) => x.faltan >= 0 && x.faltan <= 14);
const deLaSemana = actividades.filter((a) => a.semanaAbono === SEMANA);
const pendientes = deLaSemana.filter((a) => a.estado !== 'realizado' && a.estado !== 'cancelado');
const hechas = deLaSemana.filter((a) => a.estado === 'realizado');

console.log(`  (hoy ${HOY}, semana ${SEMANA})`);
comprobar(deLaSemana.length > 0,
  `la semana en curso tiene ${deLaSemana.length} labores, así que el panel no sale vacío`);

const navegador = await chromium.launch();
const pagina = await navegador.newPage({ viewport: { width: 1500, height: 1100 } });
const errores = [];
pagina.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
pagina.on('pageerror', (e) => errores.push(e.message));

let marcada = null;

try {
  await pagina.goto(`${BASE}/inicio`, { waitUntil: 'networkidle' });
  await pagina.waitForSelector('.rejilla .cifra');

  // ------------------------------------------------------------ cifras
  const cifras = await pagina.locator('.rejilla .cifra .n').allTextContents();
  const num = (t) => Number((t ?? '').replace(/[^\d]/g, ''));
  comprobar(num(cifras[0]) === activos.length,
    `cultivos activos: panel ${num(cifras[0])} · API ${activos.length}`);
  comprobar(num(cifras[1]) === porSalir.length,
    `próximos a cosecha en 14 días: panel ${num(cifras[1])} · API ${porSalir.length}`);
  comprobar(num(cifras[2]) === pendientes.length,
    `labores pendientes de la semana: panel ${num(cifras[2])} · API ${pendientes.length}`);

  // ------------------------------------------------- sin años a la vista
  const cabecera = await pagina.textContent('.cabecera');
  comprobar(/Semana \d+/.test(cabecera) && !/\b(19|20)\d{2}\b/.test(cabecera),
    `la cabecera habla del presente, sin año: «${cabecera.replace(/\s+/g, ' ').trim().slice(0, 55)}»`);

  // ------------------------------------------------------------ anillo
  const tramos = await pagina.locator('.anillo svg circle:not(.pista)').count();
  const esperados = [hechas.length, deLaSemana.length - hechas.length - deLaSemana.filter((a) => a.estado === 'cancelado').length,
                     deLaSemana.filter((a) => a.estado === 'cancelado').length].filter((n) => n > 0).length;
  comprobar(tramos === esperados,
    `el anillo dibuja un arco por cada estado con labores: ${tramos} (esperados ${esperados})`);
  const pc = Math.round((hechas.length / deLaSemana.length) * 100);
  comprobar((await pagina.textContent('.pc')).includes(String(pc)),
    `y el porcentaje central cuadra: ${await pagina.textContent('.pc')} (calculado ${pc}%)`);

  // ------------------------------------------------------------ barras
  comprobar(await pagina.locator('.barras .barra').count() === 8,
    'la gráfica de costos muestra las ocho últimas semanas');
  comprobar(await pagina.locator('.barras .barra.ahora').count() === 1,
    'con la semana en curso destacada');

  // -------------------------------------------------- proximos a cosecha
  const tarjetasCosecha = await pagina.locator('.cosecha').count();
  const esperadas = cosechables.filter((x) => x.faltan <= 30).length;
  comprobar(tarjetasCosecha === esperadas,
    `tarjetas de cosecha próxima: panel ${tarjetasCosecha} · API ${esperadas}`);
  if (tarjetasCosecha) {
    const textos = await pagina.locator('.cosecha .cuando').allTextContents();
    comprobar(textos.every((t) => /(hoy|mañana|en \d+ días|\d+ días pasada)/.test(t)),
      `los plazos se dicen en relativo: «${textos.slice(0, 3).join('», «')}»`);

    // ------------------------------------- dias en terreno y ciclo, en la primera tarjeta
    const esperadas30 = cosechables.filter((x) => x.faltan <= 30).sort((a, b) => a.faltan - b.faltan);
    const primera = esperadas30[0];
    const metricas = await pagina.locator('.cosecha').first().locator('.metrica .v').allTextContents();
    comprobar(Number(metricas[0]) === primera.diasEnTerreno,
      `días en terreno de la primera tarjeta: panel ${metricas[0]} · calculado ${primera.diasEnTerreno}`);
    const cicloEsperado = primera.ciclo || '—';
    comprobar(String(metricas[1]) === String(cicloEsperado),
      `ciclo (días) de la primera tarjeta: panel ${metricas[1]} · ficha ${cicloEsperado}`);
  }

  await pagina.screenshot({ path: `${CAPTURAS}panel.png`, fullPage: true });

  // ------------------------------------- marcar realizado desde el panel
  if (pendientes.length) {
    // El panel acota a las primeras: con cincuenta tarjetas deja de ser un
    // vistazo y se convierte en la lista densa que se queria evitar.
    const TOPE = 12;
    const antes = await pagina.locator('.labor').count();
    comprobar(antes === Math.min(pendientes.length, TOPE),
      `muestra las primeras ${antes} de ${pendientes.length} pendientes`);
    if (pendientes.length > TOPE) {
      comprobar((await pagina.textContent('body')).includes('más.'),
        'y remite al seguimiento en campo para el resto');
    }

    const puts = [];
    pagina.on('request', (r) => {
      if (r.method() === 'PUT' && r.url().includes('/api/tablas/actividades')) puts.push(r.url());
    });

    await pagina.locator('.labor').first().getByRole('button', { name: /Marcar realizado/ }).click();
    await pagina.waitForTimeout(900);

    comprobar(puts.length === 1, `marcar dispara un PUT y solo uno (${puts.length})`);
    const id = Number(puts[0].split('/').pop());
    marcada = actividades.find((a) => a.id === id);

    const { cuerpo: trasMarcar } = await api(`/tablas/actividades/${id}`);
    comprobar(trasMarcar.estado === 'realizado',
      `la labor queda realizada en la base: «${trasMarcar.estado}»`);
    // la marcada sale de la lista; si habia mas en cola, entra la siguiente,
    // asi que lo que se comprueba es que esa fila concreta ya no esta
    const siguenVisibles = await pagina.locator('.labor').count();
    comprobar(siguenVisibles === Math.min(pendientes.length - 1, TOPE),
      `la lista se recompone: ${siguenVisibles} tarjetas`);
    const textos = await pagina.locator('.labor .d').allTextContents();
    comprobar(!textos.some((t) => t.includes(`cultivo ${marcada.codigoSistema} `) &&
                                  t.includes(marcada.detalle ?? ' ')) ||
              pendientes.length > TOPE,
      'y la que se marcó ya no aparece como pendiente');
    comprobar((await pagina.textContent('.rejilla')).includes(String(pendientes.length - 1)),
      'el contador de pendientes baja');
  }
} finally {
  await navegador.close();
  if (marcada) {
    await fetch(`${BASE}/api/tablas/actividades/${marcada.id}`, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ estado: marcada.estado, fechaRegistro: marcada.fechaRegistro }),
    });
  }
}

if (marcada) {
  const { cuerpo } = await api(`/tablas/actividades/${marcada.id}`);
  comprobar(cuerpo.estado === marcada.estado, 'la prueba deja la base como estaba');
}

if (errores.length) {
  console.log('\n  errores de navegador:');
  for (const e of [...new Set(errores)].slice(0, 8)) console.log(`    ${e}`);
}
if (fallos || errores.length) {
  console.error(`\n[ERROR] ${fallos} comprobación(es) fallidas, ${errores.length} error(es) de navegador`);
  process.exit(1);
}
console.log('\n[ok] el panel refleja lo que hay en la base, y deja marcar desde él');
