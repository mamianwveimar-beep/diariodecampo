#!/usr/bin/env node
/**
 * Fase 3 - Carga, cuarentena y reconciliacion.
 *
 * Construye una base SQLite local identica a la que tendra D1, carga los
 * JSON de etl/salida/datos/ aplicando las conversiones acordadas, registra
 * en _cuarentena todo lo que no pasa una validacion, y emite:
 *
 *   db/local/diariodecampo.db   base lista para consultar y comparar
 *   etl/salida/seed.sql         INSERTs para  wrangler d1 execute --file
 *   docs/paridad/reconciliacion.json + .md
 *
 * Requiere Node 22.5+ por el modulo nativo node:sqlite.
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ      = dirname(dirname(fileURLToPath(import.meta.url)));
const DATOS     = join(RAIZ, 'etl', 'salida', 'datos');
const ADJUNTOS  = join(RAIZ, 'etl', 'salida', 'adjuntos');
const MIGRACION = join(RAIZ, 'db', 'migrations');
const SALIDA_DB = join(RAIZ, 'db', 'local');
const PARIDAD   = join(RAIZ, 'docs', 'paridad');

const leerJson = (ruta) => JSON.parse(readFileSync(ruta, 'utf8'));
const tabla    = (n) => {
  const v = leerJson(join(DATOS, `${n}.json`));
  return Array.isArray(v) ? v : (v === null ? [] : [v]);   // ConvertTo-Json colapsa 1 fila
};

// ---------------------------------------------------------------- helpers
const cuarentena = [];
function encuarentenar(tabla_origen, pk_origen, regla, columna, valor, accion, detalle) {
  cuarentena.push({
    tabla_origen, pk_origen: String(pk_origen), regla, columna,
    valor: valor === null || valor === undefined ? null : String(valor),
    accion, detalle_json: detalle ? JSON.stringify(detalle) : null,
  });
}

/** Yes/No de Access -> 0/1 */
const bool = (v) => (v === true || v === 1 || v === '1' ? 1 : 0);

/** dd/MM/yyyy -> yyyy-MM-dd. Devuelve null si no encaja. */
function fechaDesdeTexto(v) {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return undefined;                       // undefined = no interpretable
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/**
 * Campos numericos de Access que en realidad son identificadores (telefonos,
 * cuentas, documentos). El 0 es el valor por defecto de Access para "vacio".
 */
const idTexto = (v) => (v === null || v === undefined || v === 0 ? null : String(v));

/**
 * lote/cama: en Access eran Double, pero son codigos de identificacion, no
 * cantidades. A diferencia de idTexto(), aqui 0 se conserva como "0" en vez
 * de convertirse en null: en programacionCultivos y actividades, 0 es un
 * valor de lote/cama real y registrado, no un "vacio" de formulario.
 */
const comoTexto = (v) => (v === null || v === undefined ? null : String(v));

const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', pdf: 'application/pdf' };

// ------------------------------------------------------- 1. base limpia
mkdirSync(SALIDA_DB, { recursive: true });
mkdirSync(PARIDAD,   { recursive: true });
const RUTA_DB = join(SALIDA_DB, 'diariodecampo.db');
if (existsSync(RUTA_DB)) rmSync(RUTA_DB);

const db = new DatabaseSync(RUTA_DB);
db.exec('PRAGMA foreign_keys = ON;');

for (const f of readdirSync(MIGRACION).filter((f) => f.endsWith('.sql')).sort()) {
  db.exec(readFileSync(join(MIGRACION, f), 'utf8'));
  console.log(`[migracion] ${f}`);
}

// --------------------------------------------------------- 2. cargar
const seed = [];   // sentencias para D1

function insertar(nombre, filas, columnas) {
  if (filas.length === 0) { console.log(`[carga]     ${nombre.padEnd(22)}    0 filas`); return 0; }
  const lista = columnas.join(', ');
  const marcas = columnas.map(() => '?').join(', ');
  const sql = `INSERT INTO ${nombre} (${lista}) VALUES (${marcas})`;
  const st = db.prepare(sql);
  for (const f of filas) {
    const vals = columnas.map((c) => (f[c] === undefined ? null : f[c]));
    st.run(...vals);
    seed.push(
      `INSERT INTO ${nombre} (${lista}) VALUES (${vals.map(litSql).join(', ')});`
    );
  }
  console.log(`[carga]     ${nombre.padEnd(22)} ${String(filas.length).padStart(4)} filas`);
  return filas.length;
}

function litSql(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

// -- ciudad ---------------------------------------------------------------
const ciudad = tabla('ciudad');
insertar('ciudad', ciudad, ['codigoCiudad', 'nombreCiudad']);

// -- clientes -------------------------------------------------------------
const clientes = tabla('clientes').map((c) => ({ ...c, Arcchivos: bool(c.Arcchivos) }));
insertar('clientes', clientes, [
  'NitCedula', 'TipoDocumento', 'NombreCliente', 'ApellidoCliente', 'fechaNacimiento',
  'SexoCliente', 'CiudadCliente', 'DireccionCliente', 'barrioCliente', 'CelularCliente',
  'TelefonoFijoCliente', 'CorreoCliente', 'PuntosCliente', 'FechaAfiliacion', 'Arcchivos',
]);

// -- empleados ------------------------------------------------------------
const empleados = tabla('empleados').map((e) => {
  for (const col of ['telefono', 'telefono2', 'numeroCuenta']) {
    if (e[col] !== null && e[col] !== undefined && e[col] !== 0) {
      encuarentenar('empleados', e.id, 'entero_a_texto', col, e[col], 'convertida',
        { motivo: 'Long Integer de 32 bits no admite un movil colombiano de 10 digitos' });
    }
  }
  return {
    ...e,
    documento: String(e.documento),
    telefono: idTexto(e.telefono),
    telefono2: idTexto(e.telefono2),
    numeroCuenta: idTexto(e.numeroCuenta),
    auxilioTransporte: bool(e.auxilioTransporte),
    activo: bool(e.activo),
  };
});
insertar('empleados', empleados, [
  'id', 'documento', 'telefono', 'telefono2', 'numeroCuenta', 'tipoDocumento', 'nombre',
  'apellido', 'direccion', 'fechaNacimiento', 'estadoCivil', 'correo', 'sexo', 'arl',
  'salario', 'auxilioTransporte', 'pension', 'cajaCompensacion', 'eps', 'fechaIngreso',
  'estudios', 'comentario', 'activo',
]);

// -- productos ------------------------------------------------------------
const productos = tabla('productos');
insertar('productos', productos, [
  'id', 'codigoProducto', 'nombreProducto', 'cantidadMax', 'CantidadMin', 'prevedor',
  'registro', 'marca', 'valorUnidad', 'unidad', 'cantidad', 'observacion',
]);
// 998 (cal dolomita) y 999 (mano de obra) se crean en 0003_seed_ref.sql
const idsProducto = new Set([...productos.map((p) => p.id), 998, 999]);

// -- infoSemilla ----------------------------------------------------------
const infoSemilla = tabla('infoSemilla').map((s) => ({ ...s, Activo: bool(s.Activo) }));
insertar('infoSemilla', infoSemilla, [
  'Id', 'semilla', 'variedad', 'periodoSiembra', 'entrePlanta', 'entreSurcos',
  'abonoSiembra', 'abonoPrimera', 'abonoSegunda', 'abonoTercera', 'calDolomita',
  'abonoLiquido', 'ciclo', 'Aplicacion1', 'Aplicacion2', 'Aplicacion3', 'Poda1', 'Poda2',
  'anchoPromedioHera', 'Valor', 'porcentajePerdida', 'rendimiento', 'area',
  'tiempoCosecha', 'cantidadPeriodoSiembra', 'Activo', 'Perdida',
]);
const idsSemilla = new Set(infoSemilla.map((s) => s.Id));

// -- programacionCultivos -------------------------------------------------
const cultivos = tabla('programacionCultivos').map((p) => ({
  ...p, activo: bool(p.activo), lote: comoTexto(p.lote), cama: comoTexto(p.cama),
}));
insertar('programacionCultivos', cultivos, [
  'codigosistema', 'codSemilla', 'areaCultivada', 'fechasiembra', 'factura',
  'fechaRealCosecha', 'fechafinal', 'numeroPlantasSembradas', 'numeroPlantasCosechadas',
  'lote', 'cama', 'tipoAbono', 'cantidadAbono0', 'codigoSemillero', 'observaciones',
  'kilosCosechados', 'activo',
]);
const idsCultivo = new Set(cultivos.map((p) => p.codigosistema));

// -- actividades ----------------------------------------------------------
const actividades = tabla('actividades').map((a) => ({
  ...a, lote: comoTexto(a.lote), cama: comoTexto(a.cama),
}));
insertar('actividades', actividades, [
  'id', 'codigoSistema', 'codsemilla', 'fechaSiembra', 'semanaAbono', 'Actividad',
  'cantidadAbono', 'lote', 'cama', 'numeroPlantas', 'detalle', 'responsable',
  'costo', 'unidad',
]);

// -- cosecha --------------------------------------------------------------
insertar('cosecha', tabla('cosecha'), [
  'Id', 'codigosistema', 'fechaCosecha', 'peso', 'pesoPromedio',
  'numeroPlantasCosechadas', 'remision', 'factura', 'observacion',
]);

// -- costosInsumos --------------------------------------------------------
const costos = tabla('costosInsumos').map((c) => {
  if (c.producto === 999) {
    encuarentenar('costosInsumos', c.Id, 'fk_producto_centinela', 'producto', 999, 'reparada',
      { motivo: 'centinela de mano de obra; la fila productos.999 se crea en 0003_seed_ref.sql' });
  } else if (!idsProducto.has(c.producto)) {
    encuarentenar('costosInsumos', c.Id, 'fk_producto_inexistente', 'producto', c.producto, 'revisar', null);
  }
  return c;
});
insertar('costosInsumos', costos, [
  'Id', 'concepto', 'detalle', 'fecha', 'unidad', 'cantidad', 'producto',
  'valorUnitario', 'observaciones', 'programacionCultivoCodCultivo',
]);

// -- inventarioProductos --------------------------------------------------
const inventario = tabla('inventarioProductos').map((m) => {
  const iso = fechaDesdeTexto(m.fecha);
  if (iso === undefined) {
    encuarentenar('inventarioProductos', m.Id, 'fecha_no_interpretable', 'fecha', m.fecha, 'a_null', null);
  }
  let cod = m.codigoSistemaProgramacion;
  if (cod === 0) {
    encuarentenar('inventarioProductos', m.Id, 'fk_cultivo_cero', 'codigoSistemaProgramacion', 0, 'a_null',
      { motivo: 'el 0 de Access significaba "sin cultivo asociado"' });
    cod = null;
  } else if (cod !== null && cod !== undefined && !idsCultivo.has(cod)) {
    encuarentenar('inventarioProductos', m.Id, 'fk_cultivo_inexistente', 'codigoSistemaProgramacion', cod, 'a_null',
      { motivo: 'cultivo borrado en cascada; el movimiento quedo colgando' });
    cod = null;
  }
  return { ...m, fecha: iso === undefined ? null : iso, codigoSistemaProgramacion: cod };
});
insertar('inventarioProductos', inventario, [
  'Id', 'concepto', 'producto', 'ingreso', 'salida', 'fecha', 'empleado',
  'descripcion', 'cliente', 'codigoSistemaProgramacion',
]);

// -- pedido ---------------------------------------------------------------
const pedidos = tabla('pedido').map((p) => ({
  ...p, Cancelado: bool(p.Cancelado), Activo: bool(p.Activo),
}));
insertar('pedido', pedidos, [
  'Id', 'NitCedula', 'fechaPedido', 'Transporte', 'TotalPedido', 'FechaEntrega',
  'Responsable', 'Cancelado', 'Observacion', 'Activo',
]);

// -- detallePedido --------------------------------------------------------
const detalles = tabla('detallePedido').map((d) => {
  if (d.IdSemilla !== null && d.IdSemilla !== undefined && !idsSemilla.has(d.IdSemilla)) {
    encuarentenar('detallePedido', d.Id, 'fk_semilla_inexistente', 'IdSemilla', d.IdSemilla, 'conservada_sin_fk',
      { motivo: 'infoSemilla solo conserva los Id 8, 9, 10 y 11', pedido: d.IdPedido });
  }
  return { ...d, SubTotal: d.SubTotal === null ? null : Math.round(d.SubTotal) };
});
insertar('detallePedido', detalles, [
  'Id', 'IdPedido', 'IdSemilla', 'Cantidad', 'ValorUnitario',
]);

// -- adjuntos -------------------------------------------------------------
const manifiesto = existsSync(join(ADJUNTOS, 'manifiesto.json')) ? leerJson(join(ADJUNTOS, 'manifiesto.json')) : [];
const adjuntos = (Array.isArray(manifiesto) ? manifiesto : [manifiesto]).map((a) => {
  const ext = a.nombre_archivo.split('.').pop().toLowerCase();
  return {
    tabla: a.tabla,
    registro_id: String(a.registro_id),
    nombre_archivo: a.nombre_archivo,
    mime: MIME[ext] ?? 'application/octet-stream',
    bytes: a.bytes,
    sha256: a.sha256,
    r2_key: `adjuntos/${a.tabla}/${a.registro_id}/${a.nombre_archivo}`,
  };
});
insertar('adjuntos', adjuntos, [
  'tabla', 'registro_id', 'nombre_archivo', 'mime', 'bytes', 'sha256', 'r2_key',
]);

// -- _cuarentena ----------------------------------------------------------
insertar('_cuarentena', cuarentena, [
  'tabla_origen', 'pk_origen', 'regla', 'columna', 'valor', 'accion', 'detalle_json',
]);

// ------------------------------------------- 3. contador de autonumeracion
// productos.999 dejo la secuencia en 999; se devuelve al maximo real.
db.exec(`UPDATE sqlite_sequence SET seq = (SELECT MAX(id) FROM productos WHERE id NOT IN (998, 999)) WHERE name = 'productos';`);
seed.push(`UPDATE sqlite_sequence SET seq = (SELECT MAX(id) FROM productos WHERE id NOT IN (998, 999)) WHERE name = 'productos';`);

// ------------------------------------------------ 4. integridad referencial
const violaciones = db.prepare('PRAGMA foreign_key_check').all();
if (violaciones.length > 0) {
  console.error('\n[ERROR] la carga dejo violaciones de clave foranea:');
  console.error(violaciones);
  process.exit(1);
}
console.log('\n[ok] PRAGMA foreign_key_check sin violaciones');

// ------------------------------------ 4b. desviacion de columnas generadas
// En Access estos cuatro campos eran calculados. Aqui son GENERATED STORED.
// actividades.total difiere en los decimales bajos porque Access hacia la
// multiplicacion en Single (float de 32 bits) y luego la ensanchaba a Double;
// SQLite la hace en doble precision. No es un error de datos, es precision.
const GENERADAS = [
  ['actividades',         'id',  'total',      (f) => f.cantidadAbono * f.numeroPlantas],
  ['costosInsumos',       'Id',  'valorTotal', (f) => f.cantidad * f.valorUnitario],
  ['inventarioProductos', 'Id',  'saldo',      (f) => f.ingreso - f.salida],
  ['detallePedido',       'Id',  'SubTotal',   (f) => f.Cantidad * f.ValorUnitario],
];
const desviaciones = [];
for (const [t, pk, col] of GENERADAS) {
  const originales = new Map(tabla(t).map((f) => [f[pk], f[col]]));
  const cargadas = db.prepare(`SELECT ${pk} AS k, ${col} AS v FROM ${t}`).all();
  let maxAbs = 0, maxRel = 0, distintas = 0;
  for (const { k, v } of cargadas) {
    const o = originales.get(k);
    if (o === null || o === undefined || v === null) continue;
    const abs = Math.abs(v - o);
    if (abs > 0) {
      distintas++;
      maxAbs = Math.max(maxAbs, abs);
      maxRel = Math.max(maxRel, Math.abs(o) > 0 ? abs / Math.abs(o) : abs);
    }
  }
  desviaciones.push({ tabla: t, columna: col, filas: cargadas.length, distintas,
                      max_absoluta: maxAbs, max_relativa: maxRel });
}
console.log('\n--- columnas generadas frente a Access ---');
for (const d of desviaciones) {
  console.log(`  ${(d.tabla + '.' + d.columna).padEnd(32)} distintas=${String(d.distintas).padStart(3)}/${String(d.filas).padStart(3)}  max_abs=${d.max_absoluta.toExponential(3)}  max_rel=${d.max_relativa.toExponential(3)}`);
}
const TOLERANCIA_REL = 1e-6;
const fueraTolerancia = desviaciones.filter((d) => d.max_relativa > TOLERANCIA_REL);
if (fueraTolerancia.length > 0) {
  console.error('\n[ERROR] columnas generadas fuera de la tolerancia de paridad (1e-6 relativa):');
  console.error(fueraTolerancia);
  process.exit(1);
}
console.log(`  todas dentro de la tolerancia de paridad (${TOLERANCIA_REL} relativa)`);

// ------------------------------------------------------ 5. reconciliacion
const CONTROLES = [
  ['actividades',          'SELECT COUNT(*) n, ROUND(SUM(total),4) s FROM actividades'],
  ['costosInsumos',        'SELECT COUNT(*) n, ROUND(SUM(valorTotal),4) s FROM costosInsumos'],
  ['cosecha',              'SELECT COUNT(*) n, ROUND(SUM(peso),4) s FROM cosecha'],
  ['programacionCultivos', 'SELECT COUNT(*) n, SUM(numeroPlantasSembradas) s FROM programacionCultivos'],
  ['inventarioProductos',  'SELECT COUNT(*) n, ROUND(SUM(ingreso)-SUM(salida),4) s FROM inventarioProductos'],
  ['detallePedido',        'SELECT COUNT(*) n, SUM(SubTotal) s FROM detallePedido'],
  ['pedido',               'SELECT COUNT(*) n, SUM(TotalPedido) s FROM pedido'],
  ['clientes',             'SELECT COUNT(*) n, NULL s FROM clientes'],
  ['empleados',            'SELECT COUNT(*) n, ROUND(SUM(salario),2) s FROM empleados'],
  ['infoSemilla',          'SELECT COUNT(*) n, ROUND(SUM(ciclo),4) s FROM infoSemilla'],
  ['productos',            'SELECT COUNT(*) n, SUM(valorUnidad) s FROM productos'],
  ['ciudad',               'SELECT COUNT(*) n, NULL s FROM ciudad'],
  ['adjuntos',             'SELECT COUNT(*) n, SUM(bytes) s FROM adjuntos'],
];
const destino = CONTROLES.map(([t, sql]) => ({ tabla: t, ...db.prepare(sql).get() }));

const origen = Object.fromEntries(
  ['actividades', 'costosInsumos', 'cosecha', 'programacionCultivos', 'inventarioProductos',
   'detallePedido', 'pedido', 'clientes', 'empleados', 'infoSemilla', 'productos', 'ciudad']
    .map((t) => [t, tabla(t).length])
);
origen.productos += 2;                       // las filas 998 (cal dolomita) y 999 (mano de obra)
origen.adjuntos = adjuntos.length;

const recon = destino.map((d) => ({
  tabla: d.tabla,
  filas_origen: origen[d.tabla] ?? null,
  filas_destino: d.n,
  coincide: (origen[d.tabla] ?? null) === d.n,
  suma_control: d.s,
}));

const vistas = ['ActualizarAbonamiento', 'cCostosActividades', 'cCostosInsumos',
                'cInventarioCampo', 'cInventarioProductos', 'cosecha Consulta',
                'cProgramacionSiembra'];
const filasVista = vistas.map((v) => ({
  vista: v,
  filas: db.prepare(`SELECT COUNT(*) n FROM "${v}"`).get().n,
}));

const resumenCuarentena = [...cuarentena.reduce((m, c) => {
  const k = `${c.tabla_origen}|${c.regla}|${c.accion}`;
  m.set(k, (m.get(k) ?? 0) + 1);
  return m;
}, new Map())].map(([k, n]) => {
  const [t, regla, accion] = k.split('|');
  return { tabla: t, regla, accion, filas: n };
});

writeFileSync(join(PARIDAD, 'reconciliacion.json'),
  JSON.stringify({ generado: new Date().toISOString(), tablas: recon, vistas: filasVista, cuarentena: resumenCuarentena, columnas_generadas: desviaciones }, null, 2));

const md = [
  '# Reconciliacion de la carga',
  '', `Generado: ${new Date().toISOString()}`, '',
  '## Filas por tabla', '',
  '| Tabla | Origen (Access) | Destino (D1) | Coincide | Suma de control |',
  '|---|---:|---:|:---:|---:|',
  ...recon.map((r) => `| \`${r.tabla}\` | ${r.filas_origen ?? '-'} | ${r.filas_destino} | ${r.coincide ? 'si' : 'NO'} | ${r.suma_control ?? '-'} |`),
  '', '## Vistas', '',
  '| Vista | Filas |', '|---|---:|',
  ...filasVista.map((v) => `| \`${v.vista}\` | ${v.filas} |`),
  '', '## Cuarentena', '',
  '| Tabla | Regla | Accion | Filas |', '|---|---|---|---:|',
  ...resumenCuarentena.map((c) => `| \`${c.tabla}\` | ${c.regla} | ${c.accion} | ${c.filas} |`),
  '',
].join('\n');
writeFileSync(join(PARIDAD, 'reconciliacion.md'), md);

// -------------------------------------------------------- 6. seed para D1
writeFileSync(join(RAIZ, 'etl', 'salida', 'seed.sql'),
  ['-- Generado por etl/03-cargar.mjs. Aplicar tras las migraciones:',
   '--   wrangler d1 execute diariodecampo --local --file=etl/salida/seed.sql',
   'PRAGMA foreign_keys = ON;', '', ...seed, ''].join('\n'));

db.close();

// ------------------------------------------------------------- 7. informe
console.log('\n--- reconciliacion ---');
for (const r of recon) {
  console.log(`  ${r.coincide ? 'ok  ' : 'FALLA'} ${r.tabla.padEnd(22)} origen=${String(r.filas_origen).padStart(4)} destino=${String(r.filas_destino).padStart(4)}  control=${r.suma_control ?? '-'}`);
}
console.log('\n--- vistas ---');
for (const v of filasVista) console.log(`  ${v.vista.padEnd(24)} ${String(v.filas).padStart(4)} filas`);
console.log('\n--- cuarentena ---');
for (const c of resumenCuarentena) console.log(`  ${c.tabla.padEnd(22)} ${c.regla.padEnd(28)} ${c.accion.padEnd(18)} ${String(c.filas).padStart(3)}`);
console.log(`\n  total en cuarentena: ${cuarentena.length}`);

const fallos = recon.filter((r) => !r.coincide);
if (fallos.length > 0) { console.error(`\n[ERROR] ${fallos.length} tabla(s) no cuadran`); process.exit(1); }
console.log('\n[ok] carga completa y reconciliada');
