#!/usr/bin/env node
/**
 * Fase 7 - Paridad de las consultas SELECT: Access frente a D1.
 *
 * Compara fila a fila y columna a columna el resultado que da el motor de
 * Access con el que da la base migrada. Requiere haber ejecutado antes:
 *
 *   powershell -File etl/05-volcar-consultas-access.ps1
 *   node etl/03-cargar.mjs
 *
 * Tolerancia: 1e-6 relativa en los numeros. Access calculaba varias columnas
 * en precision Single y arrastra ruido de coma flotante que no es un error
 * de datos (ver docs/paridad/reconciliacion.md).
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SQL_PROGRAMACION_ABONAMIENTO, SQL_PROGRAMACION_CULTIVO }
  from '../api/src/queries/vistas-parametrizadas.mjs';
import { hoyBogota, semanaAccess, sumarDias } from '../api/src/access-compat/fechas.mjs';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const ACCESS = join(RAIZ, 'etl', 'salida', 'paridad');
const PARIDAD = join(RAIZ, 'docs', 'paridad');
const DB = join(RAIZ, 'db', 'local', 'diariodecampo.db');
const TOLERANCIA = 1e-6;

if (!existsSync(join(ACCESS, '_meta.json'))) {
  console.error('Falta el volcado de Access. Ejecuta: powershell -File etl/05-volcar-consultas-access.ps1');
  process.exit(1);
}
if (!existsSync(DB)) {
  console.error('Falta db/local/diariodecampo.db. Ejecuta: node etl/03-cargar.mjs');
  process.exit(1);
}
mkdirSync(PARIDAD, { recursive: true });

const db = new DatabaseSync(DB, { readOnly: true });
const meta = JSON.parse(readFileSync(join(ACCESS, '_meta.json'), 'utf8'));

/**
 * Las 9 consultas, con la clave por la que se emparejan las filas y las
 * columnas que Access nombra de otra forma.
 */
const CASOS = [
  {
    nombre: 'ActualizarAbonamiento',
    clave: (r) => `${r.codigosistema}`,
    d1: () => db.prepare('SELECT * FROM ActualizarAbonamiento').all(),
  },
  {
    nombre: 'cCostosActividades',
    clave: (r) => `${r.id}`,
    d1: () => db.prepare('SELECT * FROM cCostosActividades').all(),
  },
  {
    nombre: 'cCostosInsumos',
    clave: (r) => `${r.Id}`,
    d1: () => db.prepare('SELECT * FROM cCostosInsumos').all(),
  },
  {
    nombre: 'cInventarioCampo',
    clave: (r) => `${r.codigosistema}`,
    d1: () => db.prepare('SELECT * FROM cInventarioCampo').all(),
  },
  {
    nombre: 'cInventarioProductos',
    clave: (r) => `${r.Id}`,
    d1: () => db.prepare('SELECT * FROM cInventarioProductos').all(),
  },
  {
    nombre: 'cosecha Consulta',
    archivo: 'cosecha Consulta',
    clave: (r) => `${r.Id}`,
    d1: () => db.prepare('SELECT * FROM "cosecha Consulta"').all(),
  },
  {
    nombre: 'cProgramacionSiembra',
    clave: (r) => `${r.semilla}`,
    d1: () => db.prepare('SELECT * FROM cProgramacionSiembra').all(),
  },
  {
    nombre: 'cProgramacionCultivosAbonamiento',
    clave: (r) => `${r.codigosistema}`,
    d1: () => db.prepare(SQL_PROGRAMACION_ABONAMIENTO).all(hoyBogota()),
  },
  {
    nombre: 'cProgramacionCultivo',
    // el LEFT JOIN con cosecha puede dar varias filas por cultivo
    clave: (r) => `${r.codigosistema}|${r.fechaCosecha ?? ''}|${r.peso ?? ''}`,
    d1: () => db.prepare(SQL_PROGRAMACION_CULTIVO).all(hoyBogota(), meta.fechaInicial),
    // Access cualifica los nombres que aparecen en las dos tablas del JOIN, y
    // autonombra Expr1009 la primera de las dos veces que el original
    // selecciona cantidadAbono0.
    alias: {
      'programacionCultivos.factura': 'factura',
      'cosecha.factura': 'cosecha_factura',
      Expr1009: 'cantidadAbono0',
    },
  },
];

/** Access desambigua los nombres repetidos; aqui se ignoran esos duplicados. */
const esDuplicado = (col) => /__\d+$/.test(col);

/**
 * Columnas donde D1 y Access difieren a proposito. No cuentan como fallo,
 * pero se comprueba que la diferencia sea exactamente la esperada.
 */
const DIVERGENCIAS = {
  cInventarioProductos: {
    fecha: {
      motivo: 'En Access era Texto(42) con formato dd/MM/yyyy; en D1 es una fecha real. ' +
              'Mismo dia, distinta representacion.',
      // dd/MM/yyyy -> yyyy-MM-dd
      equivale: (access, d1) => {
        const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(access));
        if (!m) return false;
        return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` === d1;
      },
    },
  },
};

const MOTIVO_SEMANA =
  'Access numera la semana segun la configuracion regional del equipo, que aqui esta en lunes. ' +
  'La migracion la fija en domingo, que es la regla con la que se generaron las 157 actividades ' +
  'existentes. Se comprueba que D1 devuelve exactamente la regla de domingo.';

for (const col of ['semana1', 'semana2', 'semana3', 'semanaActual']) {
  DIVERGENCIAS.cProgramacionCultivosAbonamiento ??= {};
  DIVERGENCIAS.cProgramacionCultivosAbonamiento[col] = { motivo: MOTIVO_SEMANA, semana: col };
}
DIVERGENCIAS.ActualizarAbonamiento = { semana1: { motivo: MOTIVO_SEMANA, semana: 'semana1' } };

const DIAS_DE_SEMANA = { semana1: 25, semana2: 50, semana3: 75 };

function iguales(a, b) {
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;
  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isNaN(a) && Number.isNaN(b)) return true;
    return Math.abs(a - b) <= Math.max(TOLERANCIA, Math.abs(a) * TOLERANCIA);
  }
  // Access puede devolver un numero donde D1 devuelve texto y al reves
  const na = Number(a), nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && a !== '' && b !== '') {
    return Math.abs(na - nb) <= Math.max(TOLERANCIA, Math.abs(na) * TOLERANCIA);
  }
  return String(a) === String(b);
}

const informe = [];
let fallos = 0;

for (const caso of CASOS) {
  const archivo = join(ACCESS, `${caso.archivo ?? caso.nombre}.json`);
  const access = JSON.parse(readFileSync(archivo, 'utf8'));
  const d1 = caso.d1();

  // columnas comparables: las que existen en los dos lados
  const colsAccess = access.length ? Object.keys(access[0]).filter((c) => !esDuplicado(c)) : [];
  const colsD1 = d1.length ? Object.keys(d1[0]) : [];
  const mapaD1 = new Map(colsD1.map((c) => [c.toLowerCase(), c]));
  // el alias traduce el nombre de Access al de D1 cuando no coinciden
  const alias = caso.alias ?? {};
  const enD1 = (col) => mapaD1.get((alias[col] ?? col).toLowerCase());

  const comunes = colsAccess.filter((c) => enD1(c));
  const soloAccess = colsAccess.filter((c) => !enD1(c));
  const usadas = new Set(comunes.map((c) => enD1(c).toLowerCase()));
  const soloD1 = colsD1.filter((c) => !usadas.has(c.toLowerCase()));

  const mapaFilasAccess = new Map(access.map((r) => [caso.clave(r), r]));
  const mapaFilasD1 = new Map(d1.map((r) => [caso.clave(r), r]));

  const filasSoloAccess = [...mapaFilasAccess.keys()].filter((k) => !mapaFilasD1.has(k));
  const filasSoloD1 = [...mapaFilasD1.keys()].filter((k) => !mapaFilasAccess.has(k));

  const divergenciasDef = DIVERGENCIAS[caso.nombre] ?? {};
  const diferencias = [];
  const divergencias = [];
  const divergenciasMal = [];

  for (const [k, ra] of mapaFilasAccess) {
    const rd = mapaFilasD1.get(k);
    if (!rd) continue;
    for (const col of comunes) {
      const va = ra[col];
      const vd = rd[enD1(col)];
      if (iguales(va, vd)) continue;

      const div = divergenciasDef[col];
      if (!div) { diferencias.push({ fila: k, columna: col, access: va, d1: vd }); continue; }

      // divergencia esperada: se comprueba que sea exactamente la prevista
      let correcta;
      if (div.equivale) correcta = div.equivale(va, vd);
      else if (div.semana) {
        const dias = DIAS_DE_SEMANA[div.semana];
        correcta = div.semana === 'semanaActual'
          ? vd === semanaAccess(meta.hoy)
          : vd === semanaAccess(sumarDias(rd.fechasiembra, dias));
      } else correcta = false;

      (correcta ? divergencias : divergenciasMal)
        .push({ fila: k, columna: col, access: va, d1: vd, motivo: div.motivo });
    }
  }

  const ok = filasSoloAccess.length === 0 && filasSoloD1.length === 0
    && diferencias.length === 0 && divergenciasMal.length === 0;
  if (!ok) fallos++;

  informe.push({
    consulta: caso.nombre,
    filas_access: access.length,
    filas_d1: d1.length,
    columnas_comparadas: comunes.length,
    columnas_solo_access: soloAccess,
    columnas_solo_d1: soloD1,
    filas_solo_access: filasSoloAccess,
    filas_solo_d1: filasSoloD1,
    diferencias,
    divergencias_previstas: divergencias.length,
    divergencias_no_previstas: divergenciasMal,
    motivos: [...new Set(divergencias.map((d) => d.motivo))],
    ok,
  });

  console.log(
    `  ${ok ? 'ok  ' : 'FALLA'} ${caso.nombre.padEnd(34)} ` +
    `filas ${String(access.length).padStart(3)}/${String(d1.length).padStart(3)} ` +
    `cols ${String(comunes.length).padStart(2)} ` +
    `dif ${String(diferencias.length + divergenciasMal.length).padStart(3)}` +
    (divergencias.length ? `  (+${divergencias.length} divergencias previstas)` : '') +
    (soloAccess.length ? `  (solo Access: ${soloAccess.join(', ')})` : '')
  );
  for (const d of [...diferencias, ...divergenciasMal].slice(0, 5)) {
    console.log(`         fila ${d.fila} :: ${d.columna}  access=${d.access}  d1=${d.d1}`);
  }
  const totalMal = diferencias.length + divergenciasMal.length;
  if (totalMal > 5) console.log(`         ... y ${totalMal - 5} mas`);
}

db.close();

writeFileSync(join(PARIDAD, 'vistas.json'),
  JSON.stringify({ generado: new Date().toISOString(), tolerancia: TOLERANCIA, meta, informe }, null, 2));

const md = [
  '# Paridad de las consultas SELECT',
  '', `Generado: ${new Date().toISOString()}`,
  `Tolerancia numerica: ${TOLERANCIA} relativa.`,
  `Access ejecutado con fecha ${meta.hoy} y fechaInicial ${meta.fechaInicial}.`, '',
  '| Consulta | Filas Access | Filas D1 | Columnas | Diferencias | Divergencias previstas | Resultado |',
  '|---|---:|---:|---:|---:|---:|:---:|',
  ...informe.map((i) =>
    `| \`${i.consulta}\` | ${i.filas_access} | ${i.filas_d1} | ${i.columnas_comparadas} | ` +
    `${i.diferencias.length + i.divergencias_no_previstas.length + i.filas_solo_access.length + i.filas_solo_d1.length} | ` +
    `${i.divergencias_previstas} | ${i.ok ? 'igual' : 'REVISAR'} |`),
  '',
];

const conDivergencias = informe.filter((i) => i.divergencias_previstas > 0);
if (conDivergencias.length) {
  md.push('## Divergencias deliberadas', '',
    'No son fallos: la migracion se aparta de Access a proposito y se comprueba',
    'que la diferencia sea exactamente la prevista.', '');
  for (const i of conDivergencias) {
    md.push(`### \`${i.consulta}\` — ${i.divergencias_previstas} valores`, '');
    for (const m of i.motivos) md.push(m, '');
  }
}
const conExtras = informe.filter((i) => i.columnas_solo_access.length);
if (conExtras.length) {
  md.push('## Columnas que solo existen en Access', '');
  for (const i of conExtras) md.push(`- \`${i.consulta}\`: ${i.columnas_solo_access.join(', ')}`);
  md.push('');
}
writeFileSync(join(PARIDAD, 'vistas.md'), md.join('\n'));

console.log(`\n  informe: docs/paridad/vistas.json y vistas.md`);
if (fallos > 0) {
  console.error(`\n[ERROR] ${fallos} consulta(s) con diferencias`);
  process.exit(1);
}
console.log('\n[ok] las 9 consultas devuelven lo mismo en Access y en D1');
