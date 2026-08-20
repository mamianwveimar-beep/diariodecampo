import { SQL_SEMANA } from '../access-compat/fechas.mjs';

/**
 * Las 20 consultas de accion de Access, traducidas 1:1, mas 2 anadidas aqui.
 *
 * Cada entrada lleva el SQL original de Access en `origenAccess` para poder
 * auditar la traduccion sin abrir el .accdb. Las dos nuevas lo marcan como
 * NUEVA: no existen en el origen, y son la unica divergencia deliberada de
 * esta tabla frente a Access (ver README).
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
 * Ese cambio local ya se hizo: JORNAL_HORA y COSTO_MINUTO ahora viven en
 * parametrosCostos, y construirConsultasAccion() es lo que deja el resto de
 * este fichero igual, sustituyendo esos dos valores por los que se le pasen.
 */

/** Valores que Access llevaba escritos dentro de las consultas. */
export const CONSTANTES = {
  PRODUCTO_ABONO_LIQUIDO: 2,      // multimineral
  PRODUCTO_ABONO_SOLIDO: 3,       // abono solido 1
  PRODUCTO_ABONO_LIQUIDO_2: 4,    // multimineral 2
  PRODUCTO_BASILUS: 5,            // Basilus
  PRODUCTO_CAL_DOLOMITA: 998,     // fila de referencia creada en la migracion
  PRODUCTO_MANO_DE_OBRA: 999,     // fila de referencia creada en la migracion
  JORNAL_HORA: 8807,              // valor por defecto: ver parametrosCostos
  COSTO_MINUTO: 1.46,             // valor por defecto: ver parametrosCostos
  MIN_PREPARACION_TERRENO: 1.5,
  MIN_SIEMBRA: 1.3,
  MIN_DESHIERBE: 1.2,
  MINUTOS_POR_HORA: 60,
};

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
 * Construye las 22 consultas de accion con el jornal y el costo por minuto
 * vigentes. Los demas valores (ids de producto, minutos por labor) son fijos
 * y no cambian de una llamada a otra.
 *
 * Se reconstruye el array entero en cada llamada -en vez de, por ejemplo,
 * mutar un JORNAL_HORA compartido- porque las consultas son texto SQL con
 * los valores ya escritos dentro (interpolados, no parametros ligados): una
 * vez construido un string no hay forma de "actualizarlo", asi que la unica
 * manera de que un cambio de jornal se refleje es generar el texto de nuevo.
 *
 * @param {number} [jornalHora] pesos por hora en las consultas IngresoCostos*
 * @param {number} [costoMinuto] pesos por minuto en las labores de campo
 */
export function construirConsultasAccion(
  jornalHora = CONSTANTES.JORNAL_HORA,
  costoMinuto = CONSTANTES.COSTO_MINUTO,
) {
  const C = { ...CONSTANTES, JORNAL_HORA: jornalHora, COSTO_MINUTO: costoMinuto };

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
  const consultas = [
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

    // ------------------------------------- el dia de la siembra (2, nuevas)
    // infoSemilla traia abonoSiembra y calDolomita desde 2021, pero ninguna
    // consulta de Access generaba una actividad con ellos: abonoSiembra solo
    // entraba en la suma de actualizarCostosAbonamiento y calDolomita no se
    // usaba en ninguna parte. Son los dos insumos que se aplican al sembrar,
    // asi que aqui pasan a generar su labor como cualquier otro abonamiento.
    // Un valor en 0 o vacio significa que esa semilla no lo usa, igual que
    // abonoSegunda y abonoTercera.
    {
      nombre: 'IngresoAbonoSiembra',
      destino: 'actividades',
      descripcion: 'Abono aplicado al sembrar, la semana de la siembra. Solo si abonoSiembra > 0.',
      sql: actividadDesdeProducto({
        actividad: 'AbonoSiembra', dias: 0, campoCantidad: 'abonoSiembra',
        productoId: C.PRODUCTO_ABONO_SOLIDO, filtro: 's.abonoSiembra > 0',
      }),
      origenAccess: 'NUEVA: Access nunca genero esta actividad.',
    },
    {
      nombre: 'IngresoCalDolomita',
      destino: 'actividades',
      descripcion: 'Encalado con cal dolomita al sembrar. Solo si calDolomita > 0.',
      sql: actividadDesdeProducto({
        actividad: 'CalDolomita', dias: 0, campoCantidad: 'calDolomita',
        productoId: C.PRODUCTO_CAL_DOLOMITA, filtro: 's.calDolomita > 0',
      }),
      origenAccess: 'NUEVA: Access nunca genero esta actividad.',
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

  return consultas;
}

/**
 * El catalogo con los valores por defecto (los mismos con los que arranca
 * parametrosCostos). Sigue existiendo para quien no necesita valores en
 * vivo: la prueba de paridad contra Access, y el catalogo descriptivo de
 * GET /api/procesos, cuyo texto no depende del jornal ni del costo.
 *
 * Lo que SI ejecuta dinero de verdad (los procesos manuales y la
 * programacion automatica al registrar una orden de siembra) llama a
 * construirConsultasAccion() con los valores que haya en ese momento en
 * parametrosCostos -ver api/src/index.ts-, no a esta constante.
 */
export const CONSULTAS_ACCION = construirConsultasAccion();

/** Lotes tal como los agrupaban las macros de Access. */
export const LOTES = {
  abonamiento: ['actualizarCostosAbonamiento', 'actualizarCostosAbonamientoLiquido'],
  actividades: [
    'IngresoPreparacionTerreno', 'IngresoSiembra',
    'IngresoAbonoSiembra', 'IngresoCalDolomita',
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

  // Lo que se genera solo al registrar una siembra en campo. Es la union de
  // los tres lotes anteriores MENOS salidaAbono, que es la unica consulta sin
  // ON CONFLICT: reejecutarla duplica el movimiento de almacen, asi que no
  // puede colgar de una accion que el operario puede repetir.
  programacionCompleta: [
    'IngresoPreparacionTerreno', 'IngresoSiembra',
    'IngresoAbonoSiembra', 'IngresoCalDolomita',
    'IngresoAbonoSolido1Aplicacion', 'IngresoAbonoSolido2Aplicacion', 'IngresoAbonoSolido3Aplicacion',
    'IngresoAbonoLiquido1Aplicacion', 'IngresoAbonoLiquido2Aplicacion',
    'IngresoAbonoLiquido3Aplicacion', 'IngresoAbonoLiquido4Aplicacion',
    'IngresoPrimerDeshierbe', 'IngresoSegundoDeshierbe',
    'IngresoProtecionBasilus', 'IngresoProtecionBasilus2',
    'IngresoCostosPreparacionTerreno', 'IngresoCostosSiembra',
    'IngresoCostosDeshierbe', 'IngresoCostosCobertura',
    'actualizarCostosAbonamiento', 'actualizarCostosAbonamientoLiquido',
  ],
};

/**
 * La misma consulta, acotada a un cultivo.
 *
 * Todas las consultas comparten la forma `... INNER JOIN programacionCultivos pc
 * ... WHERE <cond> [ON CONFLICT DO NOTHING]`, asi que acotar es anadir un
 * predicado mas sobre pc. Se comprueba la forma antes de tocarla y se falla
 * ruidosamente si algun dia deja de cumplirse, en vez de devolver un SQL que
 * ignore el cultivo en silencio y programe la finca entera.
 *
 * El parametro va numerado (?1) a proposito: SQL_SEMANA repite su expresion,
 * y un `?` suelto se enlazaria mal.
 *
 * @param {{nombre: string, sql: string}} consulta
 * @returns {string}
 */
export function sqlPorCultivo(consulta) {
  const { nombre, sql } = consulta;
  // unas llegan a programacionCultivos por INNER JOIN y otras por FROM
  // directo; lo que importa es que este el alias pc y haya un WHERE al que
  // encadenar el predicado.
  const tieneAlias = sql.includes('programacionCultivos pc');
  const tieneWhere = sql.includes('\nWHERE ');
  if (!tieneAlias || !tieneWhere) {
    throw new Error(
      'No se puede acotar ' + nombre + ' a un cultivo: ya no tiene el alias pc ' +
      'sobre programacionCultivos y el WHERE que esta funcion da por supuestos.'
    );
  }
  const predicado = '\n  AND pc.codigosistema = ?1';
  return sql.includes('\nON CONFLICT')
    ? sql.replace('\nON CONFLICT', predicado + '\nON CONFLICT')
    : sql + predicado;
}

/**
 * Busca por nombre dentro de un catalogo de consultas. Recibe el catalogo
 * como argumento -en vez de cerrar sobre CONSULTAS_ACCION- para que sirva
 * igual con el catalogo por defecto que con uno construido con parametros
 * en vivo.
 */
export const porNombre = (consultas, nombre) => consultas.find((c) => c.nombre === nombre);
