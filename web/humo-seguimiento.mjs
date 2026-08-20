#!/usr/bin/env node
/**
 * Prueba del seguimiento en campo.
 *
 * Lo que hace util a esta pantalla es que marcar un estado se guarda solo, sin
 * boton. Eso es lo que se comprueba: se toca un boton en el navegador y se
 * pregunta a la API si quedo guardado, sin pulsar nada mas.
 *
 * Devuelve al final las filas que toco a su estado original.
 *
 *   node web/humo-seguimiento.mjs      (con ng serve y wrangler dev en marcha)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

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

// un cultivo que tenga labores programadas
const { cuerpo: todas } = await api('/tablas/actividades?limite=2000');
const porCultivo = {};
for (const a of todas) (porCultivo[a.codigoSistema] ??= []).push(a);
const codigo = Number(Object.keys(porCultivo).sort((a, b) => porCultivo[b].length - porCultivo[a].length)[0]);
const suyas = porCultivo[codigo];
comprobar(suyas.length > 0, `el cultivo ${codigo} tiene ${suyas.length} labores programadas`);

const tocadas = [];   // {id, estado, responsable, cantidadAbono} originales

const navegador = await chromium.launch();
// tamano de tablet en vertical: es donde se usa esto
const pagina = await navegador.newPage({ viewport: { width: 820, height: 1180 } });
const errores = [];
pagina.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
pagina.on('pageerror', (e) => errores.push(e.message));

const puts = [];
pagina.on('request', (r) => {
  if (r.method() === 'PUT' && r.url().includes('/api/tablas/actividades')) puts.push(r.url());
});

try {
  await pagina.goto(`${BASE}/seguimiento`, { waitUntil: 'networkidle' });
  comprobar((await pagina.textContent('body')).includes('Elige un cultivo'),
    'sin cultivo, pide elegir uno antes de nada');

  const buscador = pagina.locator('.barra dc-buscador input');
  await buscador.click();
  await buscador.fill(String(codigo));
  await pagina.waitForSelector('.opciones li:not(.ninguna)');
  await pagina.locator('.opciones li').first().click();
  await pagina.locator('h1').click();
  await pagina.waitForSelector('.labor');

  // ------------------------------------------------------- la cabecera
  const ficha = await pagina.textContent('.ficha');
  comprobar(ficha.includes('Lote') && ficha.includes('Cama'),
    `la cabecera muestra el contexto del cultivo: «${ficha.replace(/\s+/g, ' ').trim().slice(0, 70)}»`);

  // ------------------------------------------------------- las semanas
  const semanas = await pagina.locator('.semanas button').count();
  const semanasReales = new Set(suyas.map((a) => a.semanaAbono)).size;
  comprobar(semanas === semanasReales,
    `una pestaña por cada semana con labores: ${semanas} (la API dice ${semanasReales})`);
  comprobar(await pagina.locator('.semanas button.activa').count() === 1,
    'y arranca con una semana ya elegida');

  // En orden CRONOLOGICO, no numerico: una temporada que cruza el ano va de la
  // semana 40 a la 52 y sigue en la 2 y la 3. Anclando en la primera pestaña,
  // la distancia hasta cada siguiente tiene que crecer siempre.
  const etiquetas = (await pagina.locator('.semanas button').allTextContents())
    .map((t) => Number((t.match(/\d+/) ?? [0])[0]));
  const distancia = (s) => (s - etiquetas[0] + 54) % 54;
  const creciente = etiquetas.every(
    (s, i) => i === 0 || distancia(s) > distancia(etiquetas[i - 1])
  );
  comprobar(creciente,
    `las semanas van en orden cronológico, no numérico: ${etiquetas.join(', ')}`);

  const tarjetas = await pagina.locator('.labor').count();
  comprobar(tarjetas > 0, `la semana activa muestra ${tarjetas} labores como tarjetas`);
  comprobar(await pagina.locator('.labor').first().locator('.estados button').count() === 3,
    'cada tarjeta trae los tres estados');

  await pagina.screenshot({ path: `${CAPTURAS}seguimiento-campo.png`, fullPage: true });

  // ------------------------- marcar realizado se guarda solo, sin boton
  const tarjeta = pagina.locator('.labor').first();
  const nombre = (await tarjeta.locator('.que .n').textContent()).trim();

  puts.length = 0;
  await tarjeta.getByRole('button', { name: /Realizado/ }).click();
  await pagina.waitForTimeout(900);

  comprobar(puts.length === 1, `marcar dispara un PUT y solo uno (${puts.length})`);

  // El id sale de la URL del PUT, no de buscar por nombre: la misma actividad
  // se repite en varias semanas y buscarla por nombre daba con otra fila.
  const idTocado = Number(puts[0].split('/').pop());
  const original = todas.find((x) => x.id === idTocado);
  comprobar(!!original, `el PUT va sobre la labor «${nombre}» de la semana activa (id ${idTocado})`);
  tocadas.push(original);
  comprobar((await pagina.textContent('body')).includes('Guardado'),
    'la tarjeta avisa de que se guardó');

  const { cuerpo: trasMarcar } = await api(`/tablas/actividades/${original.id}`);
  comprobar(trasMarcar.estado === 'realizado',
    `la API confirma el estado sin pulsar ningún botón de guardar: «${trasMarcar.estado}»`);
  comprobar(!!trasMarcar.fechaRegistro,
    `y sella cuándo se pronunció: ${trasMarcar.fechaRegistro}`);
  comprobar(await tarjeta.locator('.estados button.elegido').count() === 1,
    'el botón elegido queda marcado');

  const contador = await pagina.textContent('.resumen');
  comprobar(/[1-9]\d* de \d+ labores hechas/.test(contador),
    `el resumen de la semana se actualiza: «${contador.trim()}»`);

  // ------------------------------------------- cancelado tambien guarda
  await tarjeta.getByRole('button', { name: /Cancelado/ }).click();
  await pagina.waitForTimeout(900);
  const { cuerpo: trasCancelar } = await api(`/tablas/actividades/${original.id}`);
  comprobar(trasCancelar.estado === 'cancelado', `cancelar también se guarda: «${trasCancelar.estado}»`);

  // --------------------------------- el responsable se guarda al salir
  await tarjeta.locator('input[list="operarios"]').fill('Prueba de campo');
  await tarjeta.locator('input[list="operarios"]').blur();
  await pagina.waitForTimeout(900);
  const { cuerpo: trasResponsable } = await api(`/tablas/actividades/${original.id}`);
  comprobar(trasResponsable.responsable === 'Prueba de campo',
    `el responsable se guarda al salir del campo: «${trasResponsable.responsable}»`);

  await pagina.screenshot({ path: `${CAPTURAS}seguimiento-campo-marcado.png`, fullPage: true });

  // -------------------------- lo que no se toca no se cambia
  const otra = suyas.find((a) => a.id !== original.id);
  if (otra) {
    const { cuerpo: sinTocar } = await api(`/tablas/actividades/${otra.id}`);
    comprobar(sinTocar.estado == null,
      'las labores que no se tocaron siguen sin estado, no se marcan solas');
  }
} finally {
  await navegador.close();
  // devolver las filas tocadas a como estaban
  for (const a of tocadas) {
    await fetch(`${BASE}/api/tablas/actividades/${a.id}`, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        estado: a.estado, fechaRegistro: a.fechaRegistro,
        responsable: a.responsable, cantidadAbono: a.cantidadAbono,
      }),
    });
  }
}

for (const a of tocadas) {
  const { cuerpo } = await api(`/tablas/actividades/${a.id}`);
  comprobar(cuerpo.estado === a.estado && cuerpo.responsable === a.responsable,
    'la prueba deja la base como estaba');
}

if (errores.length) {
  console.log('\n  errores de navegador:');
  for (const e of [...new Set(errores)].slice(0, 8)) console.log(`    ${e}`);
}
if (fallos || errores.length) {
  console.error(`\n[ERROR] ${fallos} comprobación(es) fallidas, ${errores.length} error(es) de navegador`);
  process.exit(1);
}
console.log('\n[ok] el seguimiento en campo guarda solo, sin botón');
