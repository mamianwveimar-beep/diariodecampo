import { SQL_SEMANA } from '../access-compat/fechas.mjs';

/**
 * Las 20 consultas de accion de Access, traducidas 1:1.
 *
 * Cada entrada lleva el SQL original de Access en `origenAccess` para poder
 * auditar la traduccion sin abrir el .accdb.
 *
 * Sobre ON CONFLICT DO NOTHING: en Access, actividades y costosInsumos tenian
 * clave primaria compuesta, asi que al reejecutar una consulta las filas
 * repetidas se descartaban sin avisar. Aqui esa combinacion es un indice
 * UNIQUE y el descarte es explicito: cada funcion devuelve cuantas filas
 * inserto y cuantas omitio.
 *
 * Los valores incrustados (ids de producto 2/3/4/5, jornal 8807, costo 1.46,
 * desfases en dias) se mantienen tal cual estaban en Access, agrupados en
 * CONSTANTES para que sacarlos a una tabla de parametros sea un cambio local.
 */

/** Valores que Access llevaba escritos dentro de las consultas. */
export const CONSTANTES = {
  PRODUCTO_ABONO_LIQUIDO: 2,      // multimineral
  PRODUCTO_ABONO_SOLIDO: 3,       // abono solido 1
  PRODUCTO_ABONO_LIQUIDO_2: 4,    // multimineral 2
  PRODUCTO_BASILUS: 5,            // Basilus
  PRODUCTO_MANO_DE_OBRA: 999,     // fila de referencia creada en la migracion
  JORNAL_HORA: 8807,              // pesos/hora en las consultas IngresoCostos*
  COSTO_MINUTO: 1.46,             // pesos/minuto en las labores de campo
  MIN_PREPARACION_TERRENO: 1.5,
  MIN_SIEMBRA: 1.3,
  MIN_DESHIERBE: 1.2,
  MINUTOS_POR_HORA: 60,
};

const C = CONSTANTES;

// Columnas de destino, en el mismo orden que usaba Access.
const COLS_ACTIVIDADES =
  'codigoSistema, codsemilla, fechaSiembra, Actividad, semanaAbono, cantidadAbono, ' +
  'lote, cama, numeroPlantas, detalle, unidad, costo';

const COLS_COSTOS =
  'concepto, detalle, fecha, unidad, valorUnitario, programacionCultivoCodCultivo, ' +
  'cantidad, producto';

/**
 * Semana de Access: Format$(expr,"ww",0,0), con lunes como primer dia de la
 * semana y semana 1 = la que contiene el 1 de enero. Ver la explicacion y la
 * comprobacion sobre 785 fechas en access-compat/fechas.mjs.
 */
const sem = (dias) => {
  const f = dias === 0 ? 'pc.fechasiembra' : `date(pc.fechasiembra, '+${dias} day')`;
  return SQL_SEMANA(f);
};

/**
 * Inserta en actividades a partir de un producto del catalogo.
 * Reproduce el patron comun de IngresoAbono* e IngresoProtecion*.
 */
function actividadDesdeProducto({ actividad, dias, campoCantidad, productoId, filtro }) {
  return `
INSERT INTO actividades (${COLS_ACTIVIDADES})
SELECT pc.codigosistema,
       pc.codSemilla,
       pc.fechasiembra,
       '${actividad}',
       ${sem(dias)},
       s.${campoCantidad},
       pc.lote,
       pc.cama,
       pc.numeroPlantasSembradas,
       p.nombreProducto,
       p.unidad,
       p.valorUnidad
FROM productos p, infoSemilla s
     INNER JOIN programacionCultivos pc ON s.Id = pc.codSemilla
WHERE p.id = ${productoId}${filtro ? `\n  AND ${filtro}` : ''}
ON CONFLICT DO NOTHING`;
}

/**
 * Inserta en actividades una labor de campo con cantidad y costo fijos.
 * Reproduce IngresoPreparacionTerreno, IngresoSiembra y los deshierbes.
 */
function actividadDeLabor({ actividad, detalle, dias, minutos, filtro }) {
  return `
INSERT INTO actividades (${COLS_ACTIVIDADES})
SELECT pc.codigosistema,
       pc.codSemilla,
       pc.fechasiembra,
       '${actividad}',
       ${sem(dias)},
       ${minutos},
       pc.lote,
       pc.cama,
       pc.numeroPlantasSembradas,
       '${detalle}',
       'Min',
       ${C.COSTO_MINUTO}
FROM infoSemilla s
     INNER JOIN programacionCultivos pc ON s.Id = pc.codSemilla
WHERE ${filtro ?? 'true'}
ON CONFLICT DO NOTHING`;
}

/**
 * Inserta un costo de mano de obra en costosInsumos.
 * Reproduce las cuatro consultas IngresoCostos*.
 */
function costoManoDeObra({ concepto, factorMinutos }) {
  return `
INSERT INTO costosInsumos (${COLS_COSTOS})
SELECT '${concepto}',
       '${concepto}',
       pc.fechasiembra,
       'hora',
       ${C.JORNAL_HORA},
       pc.codigosistema,
       (pc.numeroPlantasSembradas * ${factorMinutos}) / ${C.MINUTOS_POR_HORA}.0,
       ${C.PRODUCTO_MANO_DE_OBRA}
FROM programacionCultivos pc
WHERE true
ON CONFLICT DO NOTHING`;
}

/** @type {{nombre: string, destino: string, descripcion: string, sql: string, origenAccess: string}[]} */
export const CONSULTAS_ACCION = [
  // ------------------------------------------------- abono liquido (4)
  {
    nombre: 'IngresoAbonoLiquido1Aplicacion',
    destino: 'actividades',
    descripcion: 'Primera aplicacion de abono liquido, 8 dias tras la siembra.',
    sql: actividadDesdeProducto({
      actividad: 'AbonoLiquido', dias: 8, campoCantidad: 'abonoLiquido',
      productoId: C.PRODUCTO_ABONO_LIQUIDO,
    }),
    origenAccess:
      'INSERT INTO actividades (...) SELECT ... "AbonoLiquido", Format$(([fechasiembra]+8),"ww",0,0), ' +
      'infoSemilla.abonoLiquido, ... WHERE productos.id=2',
  },
  {
    nombre: 'IngresoAbonoLiquido2Aplicacion',
    destino: 'actividades',
    descripcion: 'Segunda aplicacion de abono liquido, 15 dias tras la siembra.',
    sql: actividadDesdeProducto({
      actividad: 'AbonoLiquido', dias: 15, campoCantidad: 'abonoLiquido',
      productoId: C.PRODUCTO_ABONO_LIQUIDO,
    }),
    origenAccess: '... Format$(([fechasiembra]+15),"ww",0,0) ... WHERE productos.id=2',
  },
  {
    nombre: 'IngresoAbonoLiquido3Aplicacion',
    destino: 'actividades',
    descripcion: 'Tercera aplicacion, 50 dias. Solo para ciclos de mas de 50 dias.',
    sql: actividadDesdeProducto({
      actividad: 'AbonoLiquido', dias: 50, campoCantidad: 'abonoLiquido',
      productoId: C.PRODUCTO_ABONO_LIQUIDO_2, filtro: 's.ciclo > 50',
    }),
    origenAccess: '... WHERE productos.id=4 AND infoSemilla.ciclo>50',
  },
  {
    nombre: 'IngresoAbonoLiquido4Aplicacion',
    destino: 'actividades',
    descripcion: 'Cuarta aplicacion, 65 dias. Solo para ciclos de mas de 65 dias.',
    sql: actividadDesdeProducto({
      actividad: 'AbonoLiquido', dias: 65, campoCantidad: 'abonoLiquido',
      productoId: C.PRODUCTO_ABONO_LIQUIDO_2, filtro: 's.ciclo > 65',
    }),
    origenAccess: '... WHERE productos.id=4 AND infoSemilla.ciclo>65',
  },

  // -------------------------------------------------- abono solido (3)
  {
    nombre: 'IngresoAbonoSolido1Aplicacion',
    destino: 'actividades',
    descripcion: 'Primer abonamiento solido, 25 dias tras la siembra.',
    sql: actividadDesdeProducto({
      actividad: 'AbonoSolido', dias: 25, campoCantidad: 'abonoPrimera',
      productoId: C.PRODUCTO_ABONO_SOLIDO,
    }),
    origenAccess: '... infoSemilla.abonoPrimera ... WHERE productos.id=3',
  },
  {
    nombre: 'IngresoAbonoSolido2Aplicacion',
    destino: 'actividades',
    descripcion: 'Segundo abonamiento solido, 50 dias. Solo si abonoSegunda > 0.',
    sql: actividadDesdeProducto({
      actividad: 'AbonoSolido', dias: 50, campoCantidad: 'abonoSegunda',
      productoId: C.PRODUCTO_ABONO_SOLIDO, filtro: 's.abonoSegunda > 0',
    }),
    origenAccess: '... WHERE infoSemilla.abonoSegunda>0 AND productos.id=3',
  },
  {
    nombre: 'IngresoAbonoSolido3Aplicacion',
    destino: 'actividades',
    descripcion: 'Tercer abonamiento solido, 75 dias. Solo si abonoTercera > 0.',
    sql: actividadDesdeProducto({
      actividad: 'AbonoSolido', dias: 75, campoCantidad: 'abonoTercera',
      productoId: C.PRODUCTO_ABONO_SOLIDO, filtro: 's.abonoTercera > 0',
    }),
    origenAccess: '... WHERE infoSemilla.abonoTercera>0 AND productos.id=3',
  },

  // ------------------------------------------------ labores de campo (6)
  {
    nombre: 'IngresoPreparacionTerreno',
    destino: 'actividades',
    descripcion: 'Preparacion del terreno, la semana de la siembra.',
    sql: actividadDeLabor({
      actividad: 'PreparacionTerreno', detalle: 'PreparacionTerreno',
      dias: 0, minutos: C.MIN_PREPARACION_TERRENO,
    }),
    origenAccess: '... "PreparacionTerreno", Format$(([fechasiembra]),"ww",0,0), 1.5, ..., 1.46, "Min"',
  },
  {
    nombre: 'IngresoSiembra',
    destino: 'actividades',
    descripcion: 'Siembra, la semana de la siembra.',
    sql: actividadDeLabor({
      actividad: 'Siembra', detalle: 'Siembra', dias: 0, minutos: C.MIN_SIEMBRA,
    }),
    origenAccess: '... "Siembra", Format$(([fechasiembra]),"ww",0,0), 1.3, ..., 1.46, "Min"',
  },
  {
    nombre: 'IngresoPrimerDeshierbe',
    destino: 'actividades',
    descripcion: 'Primer deshierbe, 25 dias tras la siembra.',
    sql: actividadDeLabor({
      actividad: 'Deshierbe', detalle: 'PrimerDeshierbe',
      dias: 25, minutos: C.MIN_DESHIERBE,
    }),
    origenAccess: '... "Deshierbe", Format$(([fechasiembra]+25),"ww",0,0), 1.2, "PrimerDeshierbe"',
  },
  {
    nombre: 'IngresoSegundoDeshierbe',
    destino: 'actividades',
    descripcion: 'Segundo deshierbe, 50 dias. Solo para ciclos de mas de 50 dias.',
    sql: actividadDeLabor({
      actividad: 'Deshierbe', detalle: 'SegundoDeshierbe',
      dias: 50, minutos: C.MIN_DESHIERBE, filtro: 's.ciclo > 50',
    }),
    origenAccess: '... "SegundoDeshierbe" ... WHERE infoSemilla.ciclo>50',
  },
  {
    nombre: 'IngresoProtecionBasilus',
    destino: 'actividades',
    descripcion: 'Proteccion vegetal con Basilus, la semana de la siembra.',
    sql: actividadDesdeProducto({
      actividad: 'ProteccionVegetal', dias: 0, campoCantidad: 'abonoLiquido',
      productoId: C.PRODUCTO_BASILUS, filtro: 's.Aplicacion1 > 1',
    }),
    origenAccess: '... WHERE productos.id=5 AND infoSemilla.Aplicacion1>1',
  },
  {
    nombre: 'IngresoProtecionBasilus2',
    destino: 'actividades',
    descripcion: 'Segunda proteccion con Basilus, 50 dias tras la siembra.',
    sql: actividadDesdeProducto({
      actividad: 'ProteccionVegetal', dias: 50, campoCantidad: 'abonoLiquido',
      productoId: C.PRODUCTO_BASILUS, filtro: 's.Aplicacion1 >= 1',
    }),
    origenAccess: '... WHERE productos.id=5 AND infoSemilla.Aplicacion1>=1',
  },

  // ------------------------------------- costos de mano de obra (4)
  {
    nombre: 'IngresoCostosPreparacionTerreno',
    destino: 'costosInsumos',
    descripcion: 'Costo de mano de obra de la preparacion: 1 minuto por planta.',
    sql: costoManoDeObra({ concepto: 'Preparacion Terreno', factorMinutos: 1 }),
    origenAccess: '... "hora", 8807, ..., [numeroPlantasSembradas]/60, 999',
  },
  {
    nombre: 'IngresoCostosSiembra',
    destino: 'costosInsumos',
    descripcion: 'Costo de mano de obra de la siembra: 1,5 minutos por planta.',
    sql: costoManoDeObra({ concepto: 'Siembra', factorMinutos: 1.5 }),
    origenAccess: '... ([numeroPlantasSembradas]*1.5)/60, 999',
  },
  {
    nombre: 'IngresoCostosDeshierbe',
    destino: 'costosInsumos',
    descripcion: 'Costo de mano de obra del deshierbe: 2 minutos por planta.',
    sql: costoManoDeObra({ concepto: 'Deshierbe', factorMinutos: 2 }),
    origenAccess: '... ([numeroPlantasSembradas]*2)/60, 999',
  },
  {
    nombre: 'IngresoCostosCobertura',
    destino: 'costosInsumos',
    descripcion: 'Costo de mano de obra de la cobertura: 1 minuto por planta.',
    sql: costoManoDeObra({ concepto: 'Cobertura', factorMinutos: 1 }),
    origenAccess: '... [numeroPlantasSembradas]/60, 999',
  },

  // ----------------------------------- costos de abonamiento (2)
  {
    nombre: 'actualizarCostosAbonamiento',
    destino: 'costosInsumos',
    descripcion: 'Costo del abono solido: suma de las cuatro dosis por planta.',
    sql: `
INSERT INTO costosInsumos (programacionCultivoCodCultivo, concepto, detalle, fecha,
                           unidad, cantidad, valorUnitario, producto)
SELECT pc.codigosistema,
       'Abonamiento',
       p.nombreProducto,
       pc.fechasiembra,
       p.unidad,
       (s.abonoSiembra + s.abonoPrimera + s.abonoSegunda + s.abonoTercera)
         * pc.numeroPlantasSembradas,
       p.valorUnidad,
       p.id
FROM productos p, infoSemilla s
     INNER JOIN programacionCultivos pc ON s.Id = pc.codSemilla
WHERE p.id = ${C.PRODUCTO_ABONO_SOLIDO}
ON CONFLICT DO NOTHING`,
    origenAccess:
      '(([infoSemilla]![abonoSiembra]+[abonoPrimera]+[abonoSegunda]+[abonoTercera])' +
      '*[programacionCultivos]![numeroPlantasSembradas]) ... WHERE productos.id=3',
  },
  {
    nombre: 'actualizarCostosAbonamientoLiquido',
    destino: 'costosInsumos',
    descripcion: 'Costo del abono liquido: una dosis cada 15 dias de ciclo.',
    sql: `
INSERT INTO costosInsumos (programacionCultivoCodCultivo, concepto, detalle, fecha,
                           unidad, cantidad, valorUnitario, producto)
SELECT pc.codigosistema,
       'Abonamiento',
       p.nombreProducto,
       pc.fechasiembra,
       p.unidad,
       s.abonoLiquido * (s.ciclo / 15.0) * pc.numeroPlantasSembradas,
       p.valorUnidad,
       p.id
FROM productos p, infoSemilla s
     INNER JOIN programacionCultivos pc ON s.Id = pc.codSemilla
WHERE p.id = ${C.PRODUCTO_ABONO_LIQUIDO_2}
ON CONFLICT DO NOTHING`,
    origenAccess:
      '[abonoLiquido]*([ciclo]/15)*[numeroPlantasSembradas] ... WHERE productos.id=4',
  },

  // ------------------------------------------ salida de inventario (1)
  {
    nombre: 'salidaAbono',
    destino: 'inventarioProductos',
    descripcion: 'Descarga del abono solido consumido, en kilos.',
    // Sin ON CONFLICT: inventarioProductos no tiene indice unico, igual que en
    // Access. Reejecutar duplica los movimientos, tal cual pasa hoy.
    sql: `
INSERT INTO inventarioProductos (concepto, fecha, salida, producto, codigoSistemaProgramacion)
SELECT 'Abonamiento',
       pc.fechasiembra,
       (s.abonoSiembra + s.abonoPrimera + s.abonoSegunda + s.abonoTercera)
         * pc.numeroPlantasSembradas / 1000.0,
       p.id,
       pc.codigosistema
FROM productos p, infoSemilla s
     INNER JOIN programacionCultivos pc ON s.Id = pc.codSemilla
WHERE p.id = ${C.PRODUCTO_ABONO_SOLIDO}`,
    origenAccess:
      '(([abonoSiembra]+[abonoPrimera]+[abonoSegunda]+[abonoTercera])' +
      '*[numeroPlantasSembradas]/1000) ... WHERE productos.id=3',
  },
];

/** Lotes tal como los agrupaban las macros de Access. */
export const LOTES = {
  abonamiento: ['actualizarCostosAbonamiento', 'actualizarCostosAbonamientoLiquido'],
  actividades: [
    'IngresoPreparacionTerreno', 'IngresoSiembra',
    'IngresoAbonoSolido1Aplicacion', 'IngresoAbonoSolido2Aplicacion', 'IngresoAbonoSolido3Aplicacion',
    'IngresoAbonoLiquido1Aplicacion', 'IngresoAbonoLiquido2Aplicacion',
    'IngresoAbonoLiquido3Aplicacion', 'IngresoAbonoLiquido4Aplicacion',
    'IngresoPrimerDeshierbe', 'IngresoSegundoDeshierbe',
    'IngresoProtecionBasilus', 'IngresoProtecionBasilus2',
  ],
  costosManoDeObra: [
    'IngresoCostosPreparacionTerreno', 'IngresoCostosSiembra',
    'IngresoCostosDeshierbe', 'IngresoCostosCobertura',
  ],
  inventario: ['salidaAbono'],
};

export const porNombre = (nombre) => CONSULTAS_ACCION.find((c) => c.nombre === nombre);
