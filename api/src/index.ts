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
import { CONSULTAS_ACCION, LOTES, porNombre, sqlPorCultivo } from './queries/consultas-accion.mjs';
import { SQL_PROGRAMACION_ABONAMIENTO, SQL_PROGRAMACION_CULTIVO } from './queries/vistas-parametrizadas.mjs';
import { hoyBogota, semanaAccess } from './access-compat/fechas.mjs';

export interface Env {
  DB: D1Database;
  ADJUNTOS: R2Bucket;
}

const app = new Hono<{ Bindings: Env }>();
app.use('/api/*', cors());

const noEncontrado = (que: string) => ({ error: `No existe ${que}.` });

/**
 * Traduce los choques de restriccion de SQLite a una respuesta que el cliente
 * pueda entender y mostrar.
 *
 * Sin esto, una clave repetida sale como un 500 sin cuerpo util: la pantalla
 * no puede decir que paso y el operario solo ve "Http failure response". Un
 * choque de restriccion lo provoca lo que se envio, asi que es 409 o 400, no
 * un fallo del servidor.
 *
 * Lo que no sea una restriccion se vuelve a lanzar tal cual: un error de
 * verdad tiene que seguir siendo un 500 y no quedar disfrazado.
 */
function comoErrorDeCliente(e: unknown): { error: string; codigo: 409 | 400 } {
  const texto = e instanceof Error ? e.message : String(e);
  if (/UNIQUE constraint failed/i.test(texto)) {
    const campos = texto.split(':').slice(1).join(':').trim();
    return { error: `Ya existe un registro con esos mismos valores (${campos}).`, codigo: 409 };
  }
  if (/FOREIGN KEY constraint failed/i.test(texto)) {
    return { error: 'Alguna referencia apunta a un registro que no existe.', codigo: 409 };
  }
  if (/CHECK constraint failed/i.test(texto)) {
    const regla = texto.split(':').slice(1).join(':').trim();
    return { error: `Un valor no cumple las reglas de la tabla (${regla}).`, codigo: 400 };
  }
  if (/NOT NULL constraint failed/i.test(texto)) {
    const campo = texto.split(':').slice(1).join(':').trim();
    return { error: `Falta un campo obligatorio (${campo}).`, codigo: 400 };
  }
  throw e;
}

/** Cada tabla apunta al cultivo con un nombre distinto, herencia de Access. */
const COLUMNA_CULTIVO: Record<string, string> = {
  actividades: 'codigoSistema',
  costosInsumos: 'programacionCultivoCodCultivo',
  inventarioProductos: 'codigoSistemaProgramacion',
};

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

  // ?cultivo= acota a las filas de un cultivo, para no traerse la tabla entera
  // al navegador. Solo vale en las tres tablas que cuelgan de
  // programacionCultivos, y el nombre de la columna sale de COLUMNA_CULTIVO,
  // nunca de lo que mande el cliente: es una lista blanca, no una cadena que
  // se concatene en el SQL.
  const cultivo = c.req.query('cultivo');
  const columna = COLUMNA_CULTIVO[tabla];
  if (cultivo != null && !columna) {
    return c.json({ error: `La tabla ${tabla} no cuelga de un cultivo.` }, 400);
  }
  if (cultivo != null && !/^[0-9]+$/.test(cultivo)) {
    return c.json({ error: 'El parametro cultivo tiene que ser un numero.' }, 400);
  }

  const sql = `SELECT * FROM ${tabla} ${cultivo != null ? `WHERE ${columna} = ?3` : ''} ` +
              `ORDER BY ${meta.pk} LIMIT ?1 OFFSET ?2`;
  const sentencia = c.env.DB.prepare(sql);
  const { results } = await (cultivo != null
    ? sentencia.bind(limite, desde, Number(cultivo))
    : sentencia.bind(limite, desde)).all();
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
  try {
    const fila = await c.env.DB.prepare(sql).bind(...cols.map((x) => cuerpo[x] ?? null)).first();
    return c.json(fila, 201);
  } catch (e) {
    const { error, codigo } = comoErrorDeCliente(e);
    return c.json({ error }, codigo);
  }
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
  try {
    const fila = await c.env.DB.prepare(sql)
      .bind(...cols.map((x) => cuerpo[x] ?? null), c.req.param('id')).first();
    return fila ? c.json(fila) : c.json(noEncontrado('ese registro'), 404);
  } catch (e) {
    const { error, codigo } = comoErrorDeCliente(e);
    return c.json({ error }, codigo);
  }
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
app.get('/api/procesos', (c) => {
  // programacionCompleta es de uso interno: lo dispara /api/ordenes/:codigo
  // para un solo cultivo. Es la union de los otros tres lotes menos
  // salidaAbono, asi que ofrecerlo aqui solo duplicaria los botones de
  // arriba, pero ejecutandose sobre TODOS los cultivos a la vez.
  const { programacionCompleta, ...lotesParaLaPantalla } = LOTES;
  return c.json({
    consultas: CONSULTAS_ACCION.map(({ nombre, destino, descripcion }) => ({ nombre, destino, descripcion })),
    lotes: lotesParaLaPantalla,
  });
});

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

// ------------------------------------------------------ orden de siembra
// Lo que el operario registra en campo. Solo puede tocar cuatro cosas —lote,
// cama, cantidad real sembrada y motivo de la merma—; el resto lo calcula el
// sistema a partir de la ficha de la semilla.

/** El cultivo con la ficha de su semilla ya resuelta: es lo que pinta la pantalla. */
// Incluye todos los campos que usan las 15 consultas de actividades de
// LOTES.programacionCompleta, para que la pantalla del operario pueda
// mostrar una vista previa de la temporada completa antes de guardar, sin
// tener que adivinar ni volver a pedir la semilla aparte.
const SQL_ORDEN = `
SELECT pc.*,
       s.semilla, s.variedad, s.ciclo,
       s.abonoSiembra, s.calDolomita, s.abonoLiquido,
       s.abonoPrimera, s.abonoSegunda, s.abonoTercera, s.Aplicacion1,
       COALESCE(s.area, s.entrePlanta * s.entreSurcos) AS marcoSiembra
FROM programacionCultivos pc
     INNER JOIN infoSemilla s ON s.Id = pc.codSemilla`;

/** Centinela de productos para las novedades sin producto de catalogo. */
const PRODUCTO_OTRO_INSUMO = 997;

async function contarDe(env: Env, tabla: string, codigo: number): Promise<number> {
  const r = await env.DB
    .prepare(`SELECT COUNT(*) AS n FROM ${tabla} WHERE ${COLUMNA_CULTIVO[tabla]} = ?1`)
    .bind(codigo).first<{ n: number }>();
  return r?.n ?? 0;
}

// El orden importa: "pendientes" tambien encajaria con ":codigo", y Hono
// resuelve por orden de registro.
app.get('/api/ordenes/pendientes', async (c) => {
  const { results } = await c.env.DB.prepare(`${SQL_ORDEN}
WHERE pc.fechaRegistroSiembra IS NULL AND pc.activo = 1
ORDER BY pc.fechasiembra DESC, pc.codigosistema DESC
LIMIT 200`).all();
  return c.json(results);
});

app.get('/api/ordenes/:codigo', async (c) => {
  const fila = await c.env.DB.prepare(`${SQL_ORDEN}\nWHERE pc.codigosistema = ?1`)
    .bind(c.req.param('codigo')).first();
  return fila ? c.json(fila) : c.json(noEncontrado('esa orden de siembra'), 404);
});

/**
 * Guarda lo que paso de verdad en campo y deja programada la temporada.
 *
 * El area y la programacion se recalculan desde la cantidad REAL sembrada, no
 * desde la planificada: es justo el motivo de que el operario la registre.
 */
app.post('/api/ordenes/:codigo', async (c) => {
  const codigo = Number(c.req.param('codigo'));
  const cuerpo = await c.req.json<{
    lote?: string | null; cama?: string | null;
    numeroPlantasSembradas?: number; plantulasDanadas?: number | null;
    motivoMerma?: string | null;
    /** Semana que el operario esta registrando: la de la siembra. */
    semana?: number;
    /** Solo las labores de esa semana, con las cantidades reales aplicadas. */
    actividades?: {
      Actividad: string; detalle?: string | null; unidad?: string | null;
      cantidadAbono?: number; costo?: number;
      /** La anadio el operario a mano: es una novedad, no sale de la ficha. */
      esAdicional?: boolean;
    }[];
  }>();

  const cultivo = await c.env.DB.prepare(`${SQL_ORDEN}\nWHERE pc.codigosistema = ?1`)
    .bind(codigo).first<Record<string, any>>();
  if (!cultivo) return c.json(noEncontrado('esa orden de siembra'), 404);
  if (cultivo.fechaRegistroSiembra) {
    return c.json({ error: `Esta siembra ya se registro el ${cultivo.fechaRegistroSiembra}.` }, 409);
  }

  const sembradas = Number(cuerpo.numeroPlantasSembradas);
  if (!Number.isFinite(sembradas) || sembradas < 0) {
    return c.json({ error: 'La cantidad real sembrada tiene que ser un numero de cero o mas.' }, 400);
  }

  // el motivo solo es obligatorio cuando falta algo frente a lo planificado
  const planificadas: number | null = cultivo.numeroPlantasPlanificadas;
  const merma = planificadas == null ? 0 : planificadas - sembradas;
  const motivo = (cuerpo.motivoMerma ?? '').trim();
  if (merma > 0 && motivo.length < 5) {
    return c.json({
      error: `Faltan ${merma} plantas frente a lo planificado: hay que explicar por que.`,
    }, 400);
  }

  const marco: number | null = cultivo.marcoSiembra;
  const area = marco ? Number((sembradas * marco).toFixed(2)) : cultivo.areaCultivada;
  const lote = cuerpo.lote ?? null;
  const cama = cuerpo.cama ?? null;

  const antes = {
    actividades: await contarDe(c.env, 'actividades', codigo),
    costosInsumos: await contarDe(c.env, 'costosInsumos', codigo),
  };

  const actualizado = await c.env.DB.prepare(`
UPDATE programacionCultivos
   SET lote = ?1, cama = ?2, numeroPlantasSembradas = ?3, plantulasDanadas = ?4,
       motivoMerma = ?5, areaCultivada = ?6, fechaRegistroSiembra = ?7
 WHERE codigosistema = ?8
RETURNING *`)
    .bind(lote, cama, sembradas, cuerpo.plantulasDanadas ?? null,
          motivo || null, area, hoyBogota(), codigo)
    .first();

  // actividades lleva copiados el numero de plantas, el lote y la cama del
  // cultivo. Si cambia lo sembrado, las filas que ya existan tienen que
  // seguirlo o su coste queda calculado sobre una cantidad que ya no es real.
  await c.env.DB.prepare(
    'UPDATE actividades SET numeroPlantas = ?1, lote = ?2, cama = ?3 WHERE codigoSistema = ?4'
  ).bind(sembradas, lote, cama, codigo).run();

  // Las labores de la semana que el operario acaba de registrar van PRIMERO,
  // con sus cantidades reales y fechaRegistro sellada. Despues corre la
  // generacion: sus filas de esa misma semana chocan contra
  // ux_actividades_access y se descartan solas, asi que lo que escribio el
  // operario gana sobre lo calculado sin necesidad de tratarlo aparte.
  const semana = Number(cuerpo.semana);
  const registradas = Number.isFinite(semana) ? (cuerpo.actividades ?? []) : [];
  if (registradas.length) {
    await c.env.DB.batch(registradas.map((a) => c.env.DB.prepare(`
INSERT INTO actividades (codigoSistema, codsemilla, fechaSiembra, semanaAbono, Actividad,
                         cantidadAbono, lote, cama, numeroPlantas, detalle, unidad, costo,
                         fechaRegistro)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
ON CONFLICT DO UPDATE SET
  cantidadAbono = excluded.cantidadAbono,
  costo         = excluded.costo,
  detalle       = excluded.detalle,
  unidad        = excluded.unidad,
  fechaRegistro = excluded.fechaRegistro`)
      .bind(codigo, cultivo.codSemilla, cultivo.fechasiembra, semana, a.Actividad,
            Number(a.cantidadAbono) || 0, lote, cama, sembradas,
            a.detalle ?? null, a.unidad ?? null, Number(a.costo) || 0, hoyBogota())));
  }

  // Las novedades que el operario anadio a mano tambien cuestan dinero, asi
  // que ademas de la labor se les abre su linea en costosInsumos. Las de la
  // ficha no: sus costos ya los generan actualizarCostosAbonamiento y las
  // IngresoCostos*, y duplicarlos aqui inflaria el coste del cultivo.
  const adicionales = registradas.filter((a) => a.esAdicional && a.Actividad?.trim());
  if (adicionales.length) {
    // El detalle es texto libre, pero muchas veces nombra un producto real.
    // Se intenta casar por nombre y solo se cae al centinela 997 cuando no
    // encaja con ninguno, para no perder el enlace cuando si existe.
    const { results: catalogo } = await c.env.DB
      .prepare('SELECT id, nombreProducto FROM productos').all<{ id: number; nombreProducto: string | null }>();
    const porNombreProducto = new Map(
      catalogo.filter((p) => p.nombreProducto)
        .map((p) => [p.nombreProducto!.trim().toLowerCase(), p.id])
    );

    await c.env.DB.batch(adicionales.map((a) => {
      const detalle = (a.detalle ?? '').trim() || a.Actividad.trim();
      const producto = porNombreProducto.get(detalle.toLowerCase()) ?? PRODUCTO_OTRO_INSUMO;
      // en actividades la cantidad se guarda por planta; aqui interesa el total
      const cantidadTotal = (Number(a.cantidadAbono) || 0) * sembradas;
      return c.env.DB.prepare(`
INSERT INTO costosInsumos (concepto, detalle, fecha, unidad, cantidad, producto,
                           valorUnitario, observaciones, programacionCultivoCodCultivo)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
ON CONFLICT DO UPDATE SET
  cantidad      = excluded.cantidad,
  valorUnitario = excluded.valorUnitario,
  unidad        = excluded.unidad,
  fecha         = excluded.fecha`)
        .bind(a.Actividad.trim().slice(0, 100), detalle.slice(0, 255), hoyBogota(),
              a.unidad ?? null, cantidadTotal, producto, Number(a.costo) || 0,
              `Novedad registrada en campo, semana ${semana}.`, codigo);
    }));
  }

  // el resto de la temporada queda PROGRAMADA, con fechaRegistro en NULL:
  // existe para poder registrarla cuando llegue su semana, pero nadie ha
  // dicho todavia que se haya hecho.
  await c.env.DB.batch(
    LOTES.programacionCompleta.map((n) =>
      c.env.DB.prepare(sqlPorCultivo(porNombre(n)!)).bind(codigo))
  );

  return c.json({
    cultivo: actualizado,
    merma,
    semanaRegistrada: registradas.length ? semana : null,
    registradas: registradas.length,
    generadas: {
      actividades: (await contarDe(c.env, 'actividades', codigo)) - antes.actividades,
      costosInsumos: (await contarDe(c.env, 'costosInsumos', codigo)) - antes.costosInsumos,
    },
  });
});

// -------------------------------------------------------------- cosechas
// El costo en tiempo de cosechar sigue el mismo patron que PreparacionTerreno,
// Siembra y Deshierbe: un jornal por minuto, no por producto.
const COSTO_MINUTO_COSECHA = 1.46;

/**
 * Recalcula, desde cero, la actividad "Cosecha" de un cultivo para la semana
 * de una fecha de cosecha dada.
 *
 * Se recalcula sumando TODAS las filas de \`cosecha\` de ese cultivo que caen
 * en esa semana, en vez de ir acumulando numero a numero en cada alta o baja:
 * asi no hay manera de que un borrado deje el acumulado desincronizado, que
 * es el motivo mas comun de que un total "que se va sumando" acabe mal.
 *
 * Si tras el recalculo no queda ninguna cosecha en esa semana, la actividad
 * se borra: no tiene sentido dejar una fila de "Cosecha" con cero plantas.
 */
async function recalcularActividadCosecha(env: Env, codigo: number, fechaCosecha: string) {
  const cultivo = await env.DB
    .prepare('SELECT codSemilla, fechasiembra, numeroPlantasSembradas FROM programacionCultivos WHERE codigosistema = ?1')
    .bind(codigo).first<{ codSemilla: number; fechasiembra: string; numeroPlantasSembradas: number | null }>();
  if (!cultivo) return;

  const semana = semanaAccess(fechaCosecha);

  // el rango de fechas que cae en esa semana, para agregar solo esas filas
  const { results: cosechas } = await env.DB.prepare(`
SELECT fechaCosecha, peso, numeroPlantasCosechadas, minutosTrabajo, responsable
  FROM cosecha WHERE codigosistema = ?1 AND fechaCosecha IS NOT NULL`).bind(codigo).all<{
    fechaCosecha: string; peso: number | null; numeroPlantasCosechadas: number | null;
    minutosTrabajo: number | null; responsable: string | null;
  }>();
  const deEstaSemana = cosechas.filter((h) => semanaAccess(h.fechaCosecha) === semana);

  if (!deEstaSemana.length) {
    await env.DB.prepare(
      `DELETE FROM actividades WHERE codigoSistema = ?1 AND semanaAbono = ?2 AND Actividad = 'Cosecha'`
    ).bind(codigo, semana).run();
    return;
  }

  const plantas = deEstaSemana.reduce((a, h) => a + (h.numeroPlantasCosechadas ?? 0), 0);
  const minutos = deEstaSemana.reduce((a, h) => a + (h.minutosTrabajo ?? 0), 0);
  // el ultimo responsable que registro esa semana, por poner algo con sentido
  // cuando varias personas cosecharon en la misma semana
  const responsable = [...deEstaSemana].reverse().find((h) => h.responsable)?.responsable ?? null;
  // cantidadAbono es minutos POR PLANTA: total (columna GENERATED) sale como
  // cantidadAbono * numeroPlantas, y asi vuelve a dar los minutos reales
  const cantidadAbono = plantas > 0 ? minutos / plantas : 0;

  const totalCosechadoHistorico = await env.DB
    .prepare('SELECT COALESCE(SUM(numeroPlantasCosechadas), 0) AS n FROM cosecha WHERE codigosistema = ?1')
    .bind(codigo).first<{ n: number }>();
  const faltan = (cultivo.numeroPlantasSembradas ?? 0) - (totalCosechadoHistorico?.n ?? 0);
  const detalle = faltan <= 0 ? 'Cosecha total' : 'Cosecha parcial';

  await env.DB.prepare(`
INSERT INTO actividades (codigoSistema, codsemilla, fechaSiembra, semanaAbono, Actividad,
                         cantidadAbono, numeroPlantas, detalle, unidad, costo, responsable,
                         estado, fechaRegistro)
VALUES (?1, ?2, ?3, ?4, 'Cosecha', ?5, ?6, ?7, 'Min', ?8, ?9, 'realizado', ?10)
ON CONFLICT DO UPDATE SET
  cantidadAbono = excluded.cantidadAbono,
  numeroPlantas = excluded.numeroPlantas,
  detalle       = excluded.detalle,
  responsable   = excluded.responsable,
  fechaRegistro = excluded.fechaRegistro`)
    .bind(codigo, cultivo.codSemilla, cultivo.fechasiembra, semana, cantidadAbono, plantas,
          detalle, COSTO_MINUTO_COSECHA, responsable, fechaCosecha)
    .run();
}

app.post('/api/cosechas', async (c) => {
  const cuerpo = await c.req.json<Partial<{
    codigosistema: number; fechaCosecha: string; peso: number; pesoPromedio: number | null;
    numeroPlantasCosechadas: number | null; remision: string | null; factura: string | null;
    observacion: string | null; responsable: string | null; minutosTrabajo: number | null;
  }>>();

  if (!cuerpo.codigosistema || !cuerpo.fechaCosecha || cuerpo.peso == null) {
    return c.json({ error: 'Hacen falta el cultivo, la fecha y el peso.' }, 400);
  }

  let fila;
  try {
    fila = await c.env.DB.prepare(`
INSERT INTO cosecha (codigosistema, fechaCosecha, peso, pesoPromedio, numeroPlantasCosechadas,
                     remision, factura, observacion, responsable, minutosTrabajo)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10) RETURNING *`)
      .bind(cuerpo.codigosistema, cuerpo.fechaCosecha, cuerpo.peso, cuerpo.pesoPromedio ?? null,
            cuerpo.numeroPlantasCosechadas ?? null, cuerpo.remision ?? null, cuerpo.factura ?? null,
            cuerpo.observacion ?? null, cuerpo.responsable ?? null, cuerpo.minutosTrabajo ?? null)
      .first();
  } catch (e) {
    const { error, codigo } = comoErrorDeCliente(e);
    return c.json({ error }, codigo);
  }

  await recalcularActividadCosecha(c.env, cuerpo.codigosistema, cuerpo.fechaCosecha);
  return c.json(fila, 201);
});

app.delete('/api/cosechas/:id', async (c) => {
  const fila = await c.env.DB
    .prepare('SELECT codigosistema, fechaCosecha FROM cosecha WHERE Id = ?1')
    .bind(c.req.param('id')).first<{ codigosistema: number | null; fechaCosecha: string | null }>();
  if (!fila) return c.json(noEncontrado('esa cosecha'), 404);

  await c.env.DB.prepare('DELETE FROM cosecha WHERE Id = ?1').bind(c.req.param('id')).run();
  if (fila.codigosistema && fila.fechaCosecha) {
    await recalcularActividadCosecha(c.env, fila.codigosistema, fila.fechaCosecha);
  }
  return c.json({ borradas: 1 });
});

app.notFound((c) => c.json({ error: 'Esa direccion no existe en la API.' }, 404));

export default app;
