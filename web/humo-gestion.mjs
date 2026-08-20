#!/usr/bin/env node
/**
 * Prueba de la gestion de actividades por cultivo.
 *
 * Comprueba las tres cosas que hacen util a esta pantalla: que el filtro
 * maestro acota contra el SERVIDOR (y no descargando la tabla entera), que se
 * pagina, y que se puede corregir o borrar una fila en pocos clics.
 *
 * Crea su propia actividad de prueba y la borra desde la interfaz, que es
 * justo el camino que hay que verificar.
 *
 *   node web/humo-gestion.mjs      (con ng serve y wrangler dev en marcha)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4200';
const CAPTURAS = new URL('./capturas/', import.meta.url).pathname.replace(/^\//, '');
mkdirSync(CAPTURAS, { recursive: true });

const LABOR = `Gestion${Date.now().toString().slice(-5)}`;

const api = async (ruta, opciones) => {
  const r = await fetch(`${BASE}/api${ruta}`, opciones);
  return { estado: r.status, cuerpo: await r.json().catch(() => null) };
};

let fallos = 0;
const comprobar = (ok, texto) => {
  console.log(`  ${ok ? 'ok  ' : 'FALLA'} ${texto}`);
  if (!ok) fallos++;
};

// ------------------------------- una actividad de prueba sobre un cultivo real
const { cuerpo: cultivos } = await api('/tablas/programacionCultivos?limite=2000');
const cultivo = cultivos.find((c) => c.activo === 1);
const alta = await api('/tablas/actividades', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    codigoSistema: cultivo.codigosistema, codsemilla: cultivo.codSemilla,
    fechaSiembra: cultivo.fechasiembra, semanaAbono: 52, Actividad: LABOR,
    cantidadAbono: 0.1, numeroPlantas: 100, detalle: 'prueba', unidad: 'Kg',
    costo: 1000, responsable: 'Antes de editar',
  }),
});
const idPrueba = alta.cuerpo?.id;
comprobar(alta.estado === 201, `actividad de prueba creada: ${idPrueba} sobre el cultivo ${cultivo.codigosistema}`);

const navegador = await chromium.launch();
const pagina = await navegador.newPage({ viewport: { width: 1600, height: 1000 } });
const errores = [];
pagina.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
pagina.on('pageerror', (e) => errores.push(e.message));

// se vigila que la peticion lleve de verdad ?cultivo=
const peticiones = [];
pagina.on('request', (r) => {
  if (r.url().includes('/api/tablas/actividades')) peticiones.push(r.url());
});

try {
  await pagina.goto(`${BASE}/actividades`, { waitUntil: 'networkidle' });
  await pagina.waitForSelector('tbody tr');

  const filas = () => pagina.locator('tbody tr').count();
  const { cuerpo: todas } = await api('/tablas/actividades?limite=2000');

  comprobar(await filas() <= 25, `pagina de 25: la tabla muestra ${await filas()} filas de ${todas.length}`);
  comprobar((await pagina.textContent('.barra')).includes(`de ${todas.length} cargadas`) ||
            (await pagina.textContent('.barra')).includes(`de ${todas.length}`),
    'el contador dice cuántas hay en total');

  // ------------------------------------------------------- paginacion
  const primeraDeLaPagina1 = await pagina.locator('tbody tr td').first().textContent();
  await pagina.getByRole('button', { name: /Siguiente/ }).click();
  await pagina.waitForTimeout(250);
  const primeraDeLaPagina2 = await pagina.locator('tbody tr td').first().textContent();
  comprobar(primeraDeLaPagina1 !== primeraDeLaPagina2,
    'la paginación cambia de página');
  // hay dos .barra (filtros y paginacion); se mira el texto de la pagina
  comprobar((await pagina.textContent('body')).includes('Página 2 de'),
    'y dice en cuál estás');
  await pagina.getByRole('button', { name: /Anterior/ }).click();
  await pagina.waitForTimeout(250);

  // ------------------------------------- el filtro maestro va al servidor
  peticiones.length = 0;
  const buscador = pagina.locator('.barra dc-buscador input');
  await buscador.click();
  await buscador.fill(String(cultivo.codigosistema));
  await pagina.waitForSelector('.opciones li:not(.ninguna)');
  await pagina.locator('.opciones li').first().click();
  await pagina.locator('h1').click();
  await pagina.waitForTimeout(600);

  comprobar(peticiones.some((u) => u.includes(`cultivo=${cultivo.codigosistema}`)),
    `al elegir cultivo se pide al servidor con ?cultivo=: ${peticiones.at(-1)?.split('/api')[1] ?? 'ninguna'}`);

  const { cuerpo: delCultivo } = await api(`/tablas/actividades?cultivo=${cultivo.codigosistema}&limite=2000`);
  const visibles = await filas();
  comprobar(visibles === Math.min(delCultivo.length, 25),
    `solo se cargan las ${delCultivo.length} del cultivo (se ven ${visibles})`);
  await pagina.screenshot({ path: `${CAPTURAS}gestion-actividades.png` });

  // ------------------------------------------------- editar en 3 clics
  const filaPrueba = pagina.locator('tbody tr').filter({ hasText: LABOR }).first();
  comprobar(await filaPrueba.count() === 1, `la actividad de prueba aparece en la tabla`);
  comprobar((await filaPrueba.textContent()).includes('Antes de editar'),
    'y muestra el responsable en su columna');

  comprobar((await filaPrueba.textContent()).includes('Sin registrar'),
    'y su estado, que al no haberse tocado sale como «Sin registrar»');

  await filaPrueba.getByRole('button', { name: 'Editar' }).click();      // 1
  await pagina.waitForSelector('.modal');
  await pagina.locator('.modal input[name="res"]').fill('Corregido en gestión');  // 2
  await pagina.locator('.modal select[name="est"]').selectOption({ label: 'Realizado' });
  await pagina.getByRole('button', { name: 'Guardar' }).click();          // 3
  await pagina.waitForTimeout(700);

  const { cuerpo: trasEditar } = await api(`/tablas/actividades/${idPrueba}`);
  comprobar(trasEditar.responsable === 'Corregido en gestión',
    `la corrección llega a la base: «${trasEditar.responsable}»`);
  comprobar(trasEditar.estado === 'realizado',
    `y el estado también se puede corregir desde aquí: «${trasEditar.estado}»`);
  comprobar((await pagina.textContent('body')).includes('Actividad actualizada'),
    'y la pantalla lo confirma');

  // ------------------------------------------------- filtro por estado
  const filaAhora = pagina.locator('tbody tr').filter({ hasText: LABOR }).first();
  comprobar((await filaAhora.textContent()).includes('Realizado'),
    'la columna de estado refleja el cambio');

  const selectEstado = pagina.locator('.barra label').filter({ hasText: 'Estado' }).locator('select');
  await selectEstado.selectOption({ label: 'Cancelado' });
  await pagina.waitForTimeout(300);
  comprobar(await pagina.locator('tbody tr').filter({ hasText: LABOR }).count() === 0,
    'filtrar por «cancelado» la deja fuera');
  await selectEstado.selectOption({ label: 'Realizado' });
  await pagina.waitForTimeout(300);
  comprobar(await pagina.locator('tbody tr').filter({ hasText: LABOR }).count() === 1,
    'y filtrar por «realizado» la trae de vuelta');
  await selectEstado.selectOption({ label: 'Todos' });
  await pagina.waitForTimeout(300);

  // ------------------------------------------------------------ borrar
  pagina.once('dialog', (d) => d.accept());
  await pagina.locator('tbody tr').filter({ hasText: LABOR }).first()
    .getByRole('button', { name: 'Borrar' }).click();
  await pagina.waitForTimeout(700);

  const { estado } = await api(`/tablas/actividades/${idPrueba}`);
  comprobar(estado === 404, 'la fila borrada ya no está en la base');
  comprobar(await pagina.locator('tbody tr').filter({ hasText: LABOR }).count() === 0,
    'ni en la tabla');
} finally {
  await navegador.close();
  await fetch(`${BASE}/api/tablas/actividades/${idPrueba}`, { method: 'DELETE' });
}

if (errores.length) {
  console.log('\n  errores de navegador:');
  for (const e of [...new Set(errores)].slice(0, 8)) console.log(`    ${e}`);
}
if (fallos || errores.length) {
  console.error(`\n[ERROR] ${fallos} comprobación(es) fallidas, ${errores.length} error(es) de navegador`);
  process.exit(1);
}
console.log('\n[ok] la gestión de actividades por cultivo funciona de principio a fin');
