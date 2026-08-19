/**
 * API de diarioDeCampo sobre Cloudflare Workers + D1 + R2.
 *
 * Todo el acceso a datos va con sentencias preparadas. El VBA original
 * concatenaba los valores del formulario dentro del SQL; aqui no hay un solo
 * caso de concatenacion con datos del usuario.
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { TABLAS, VISTAS, columnasEscribibles, columnasAlta } from './repos/tablas.mjs';
import { CONSULTAS_ACCION, LOTES, porNombre } from './queries/consultas-accion.mjs';
import { SQL_PROGRAMACION_ABONAMIENTO, SQL_PROGRAMACION_CULTIVO } from './queries/vistas-parametrizadas.mjs';
import { hoyBogota } from './access-compat/fechas.mjs';

export interface Env {
  DB: D1Database;
  ADJUNTOS: R2Bucket;
}

const app = new Hono<{ Bindings: Env }>();
app.use('/api/*', cors());

const noEncontrado = (que: string) => ({ error: `No existe ${que}.` });

// --------------------------------------------------------------- salud
app.get('/api/salud', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT COUNT(*) AS cultivos FROM programacionCultivos'
  ).all();
  return c.json({ estado: 'ok', hoy: hoyBogota(), ...results[0] });
});

// ------------------------------------------------------- CRUD generico
app.get('/api/tablas', (c) => c.json(Object.keys(TABLAS)));

app.get('/api/tablas/:tabla', async (c) => {
  const tabla = c.req.param('tabla');
  const meta = TABLAS[tabla];
  if (!meta) return c.json(noEncontrado(`la tabla ${tabla}`), 404);

  const limite = Math.min(Number(c.req.query('limite') ?? 500), 2000);
  const desde = Number(c.req.query('desde') ?? 0);
  const { results } = await c.env.DB
    .prepare(`SELECT * FROM ${tabla} ORDER BY ${meta.pk} LIMIT ?1 OFFSET ?2`)
    .bind(limite, desde).all();
  return c.json(results);
});

app.get('/api/tablas/:tabla/:id', async (c) => {
  const tabla = c.req.param('tabla');
  const meta = TABLAS[tabla];
  if (!meta) return c.json(noEncontrado(`la tabla ${tabla}`), 404);

  const fila = await c.env.DB
    .prepare(`SELECT * FROM ${tabla} WHERE ${meta.pk} = ?1`)
    .bind(c.req.param('id')).first();
  return fila ? c.json(fila) : c.json(noEncontrado('ese registro'), 404);
});

app.post('/api/tablas/:tabla', async (c) => {
  const tabla = c.req.param('tabla');
  const meta = TABLAS[tabla];
  if (!meta) return c.json(noEncontrado(`la tabla ${tabla}`), 404);

  const cuerpo = await c.req.json<Record<string, unknown>>();
  const cols = columnasAlta(tabla).filter((x) => x in cuerpo);
  if (cols.length === 0) return c.json({ error: 'No se envio ningun campo que se pueda guardar.' }, 400);

  const sql = `INSERT INTO ${tabla} (${cols.join(', ')}) ` +
              `VALUES (${cols.map((_, i) => `?${i + 1}`).join(', ')}) RETURNING *`;
  const fila = await c.env.DB.prepare(sql).bind(...cols.map((x) => cuerpo[x] ?? null)).first();
  return c.json(fila, 201);
});

app.put('/api/tablas/:tabla/:id', async (c) => {
  const tabla = c.req.param('tabla');
  const meta = TABLAS[tabla];
  if (!meta) return c.json(noEncontrado(`la tabla ${tabla}`), 404);

  const cuerpo = await c.req.json<Record<string, unknown>>();
  const cols = columnasEscribibles(tabla).filter((x) => x !== meta.pk && x in cuerpo);
  if (cols.length === 0) return c.json({ error: 'No se envio ningun campo que se pueda modificar.' }, 400);

  const sql = `UPDATE ${tabla} SET ${cols.map((x, i) => `${x} = ?${i + 1}`).join(', ')} ` +
              `WHERE ${meta.pk} = ?${cols.length + 1} RETURNING *`;
  const fila = await c.env.DB.prepare(sql)
    .bind(...cols.map((x) => cuerpo[x] ?? null), c.req.param('id')).first();
  return fila ? c.json(fila) : c.json(noEncontrado('ese registro'), 404);
});

app.delete('/api/tablas/:tabla/:id', async (c) => {
  const tabla = c.req.param('tabla');
  const meta = TABLAS[tabla];
  if (!meta) return c.json(noEncontrado(`la tabla ${tabla}`), 404);

  // En Access el borrado iba por un campo sin indice unico y podia llevarse
  // varias filas. Aqui la clave primaria garantiza que se borra exactamente una.
  const r = await c.env.DB.prepare(`DELETE FROM ${tabla} WHERE ${meta.pk} = ?1`)
    .bind(c.req.param('id')).run();
  return r.meta.changes > 0
    ? c.json({ borradas: r.meta.changes })
    : c.json(noEncontrado('ese registro'), 404);
});

// ------------------------------------------------------------- vistas
app.get('/api/vistas', (c) => c.json(VISTAS));

app.get('/api/vistas/:nombre', async (c) => {
  const nombre = c.req.param('nombre');
  if (!VISTAS.includes(nombre)) return c.json(noEncontrado(`la vista ${nombre}`), 404);
  const { results } = await c.env.DB.prepare(`SELECT * FROM "${nombre}"`).all();
  return c.json(results);
});

// ---------------------------------------------------------- informes
app.get('/api/informes/programacion-abonamiento', async (c) => {
  const { results } = await c.env.DB.prepare(SQL_PROGRAMACION_ABONAMIENTO)
    .bind(hoyBogota()).all();
  return c.json(results);
});

app.get('/api/informes/trazabilidad', async (c) => {
  const fechaInicial = c.req.query('fechaInicial') ?? '1900-01-01';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaInicial)) {
    return c.json({ error: 'fechaInicial debe tener el formato AAAA-MM-DD.' }, 400);
  }
  const { results } = await c.env.DB.prepare(SQL_PROGRAMACION_CULTIVO)
    .bind(hoyBogota(), fechaInicial).all();
  return c.json(results);
});

// ----------------------------------------- consultas de accion (procesos)
app.get('/api/procesos', (c) => c.json({
  consultas: CONSULTAS_ACCION.map(({ nombre, destino, descripcion }) => ({ nombre, destino, descripcion })),
  lotes: LOTES,
}));

/** Ejecuta una consulta de accion y dice cuantas filas entraron. */
async function ejecutarProceso(env: Env, nombre: string) {
  const consulta = porNombre(nombre);
  if (!consulta) return null;
  const antes = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${consulta.destino}`).first<{ n: number }>();
  await env.DB.prepare(consulta.sql).run();
  const despues = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${consulta.destino}`).first<{ n: number }>();
  return {
    consulta: nombre,
    destino: consulta.destino,
    insertadas: (despues?.n ?? 0) - (antes?.n ?? 0),
  };
}

app.post('/api/procesos/:nombre', async (c) => {
  const r = await ejecutarProceso(c.env, c.req.param('nombre'));
  return r ? c.json(r) : c.json(noEncontrado(`el proceso ${c.req.param('nombre')}`), 404);
});

app.post('/api/procesos/lote/:lote', async (c) => {
  const lote = c.req.param('lote');
  const nombres = LOTES[lote];
  if (!nombres) return c.json(noEncontrado(`el lote ${lote}`), 404);

  const resultados = [];
  for (const n of nombres) resultados.push(await ejecutarProceso(c.env, n));
  return c.json({
    lote,
    resultados,
    total_insertadas: resultados.reduce((a, r) => a + (r?.insertadas ?? 0), 0),
  });
});

// ---------------------------------------------------------- adjuntos
// El orden importa: Hono resuelve por orden de registro y ":tabla/:registroId"
// tambien encajaria con ":id/contenido".
app.get('/api/adjuntos/:id/contenido', async (c) => {
  const fila = await c.env.DB
    .prepare('SELECT r2_key, mime, nombre_archivo FROM adjuntos WHERE id = ?1')
    .bind(c.req.param('id')).first<{ r2_key: string; mime: string; nombre_archivo: string }>();
  if (!fila) return c.json(noEncontrado('ese adjunto'), 404);

  const objeto = await c.env.ADJUNTOS.get(fila.r2_key);
  if (!objeto) return c.json({ error: 'El archivo no esta en el almacen.' }, 404);

  return new Response(objeto.body, {
    headers: {
      'Content-Type': fila.mime,
      'Content-Disposition': `inline; filename="${fila.nombre_archivo}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
});

app.get('/api/adjuntos/:tabla/:registroId', async (c) => {
  const { results } = await c.env.DB
    .prepare('SELECT id, nombre_archivo, mime, bytes FROM adjuntos WHERE tabla = ?1 AND registro_id = ?2')
    .bind(c.req.param('tabla'), c.req.param('registroId')).all();
  return c.json(results);
});

// -------------------------------------------------------- cuarentena
app.get('/api/cuarentena', async (c) => {
  const { results } = await c.env.DB
    .prepare('SELECT * FROM _cuarentena ORDER BY tabla_origen, regla, id').all();
  return c.json(results);
});

app.notFound((c) => c.json({ error: 'Esa direccion no existe en la API.' }, 404));

export default app;
