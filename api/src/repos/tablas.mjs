/**
 * Metadatos de las tablas expuestas por la API.
 *
 * `generadas` son columnas GENERATED en D1 (eran campos calculados en Access):
 * se leen pero nunca se escriben.
 */
export const TABLAS = {
  ciudad: {
    pk: 'codigoCiudad', autonumerica: false,
    columnas: ['codigoCiudad', 'nombreCiudad'],
    generadas: [],
  },
  clientes: {
    pk: 'NitCedula', autonumerica: false,
    columnas: ['NitCedula', 'TipoDocumento', 'NombreCliente', 'ApellidoCliente',
      'fechaNacimiento', 'SexoCliente', 'CiudadCliente', 'DireccionCliente',
      'barrioCliente', 'CelularCliente', 'TelefonoFijoCliente', 'CorreoCliente',
      'PuntosCliente', 'FechaAfiliacion', 'Arcchivos'],
    generadas: [],
    booleanas: ['Arcchivos'],
  },
  empleados: {
    pk: 'id', autonumerica: true,
    columnas: ['id', 'documento', 'telefono', 'telefono2', 'numeroCuenta',
      'tipoDocumento', 'nombre', 'apellido', 'direccion', 'fechaNacimiento',
      'estadoCivil', 'correo', 'sexo', 'arl', 'salario', 'auxilioTransporte',
      'pension', 'cajaCompensacion', 'eps', 'fechaIngreso', 'estudios',
      'comentario', 'activo'],
    generadas: [],
    booleanas: ['auxilioTransporte', 'activo'],
  },
  productos: {
    pk: 'id', autonumerica: true,
    columnas: ['id', 'codigoProducto', 'nombreProducto', 'cantidadMax', 'CantidadMin',
      'prevedor', 'registro', 'marca', 'valorUnidad', 'unidad', 'cantidad', 'observacion'],
    generadas: [],
  },
  infoSemilla: {
    pk: 'Id', autonumerica: true,
    columnas: ['Id', 'semilla', 'variedad', 'periodoSiembra', 'entrePlanta', 'entreSurcos',
      'abonoSiembra', 'abonoPrimera', 'abonoSegunda', 'abonoTercera', 'calDolomita',
      'abonoLiquido', 'ciclo', 'Aplicacion1', 'Aplicacion2', 'Aplicacion3', 'Poda1',
      'Poda2', 'anchoPromedioHera', 'Valor', 'porcentajePerdida', 'rendimiento',
      'area', 'tiempoCosecha', 'cantidadPeriodoSiembra', 'Activo', 'Perdida'],
    generadas: [],
    booleanas: ['Activo'],
  },
  programacionCultivos: {
    pk: 'codigosistema', autonumerica: true,
    columnas: ['codigosistema', 'codSemilla', 'areaCultivada', 'fechasiembra', 'factura',
      'fechaRealCosecha', 'fechafinal', 'numeroPlantasSembradas', 'numeroPlantasCosechadas',
      'lote', 'cama', 'tipoAbono', 'cantidadAbono0', 'codigoSemillero', 'observaciones',
      'kilosCosechados', 'activo'],
    generadas: [],
    booleanas: ['activo'],
  },
  actividades: {
    pk: 'id', autonumerica: true,
    columnas: ['id', 'codigoSistema', 'codsemilla', 'fechaSiembra', 'semanaAbono',
      'Actividad', 'cantidadAbono', 'lote', 'cama', 'numeroPlantas', 'total',
      'detalle', 'responsable', 'costo', 'unidad'],
    generadas: ['total'],
  },
  cosecha: {
    pk: 'Id', autonumerica: true,
    columnas: ['Id', 'codigosistema', 'fechaCosecha', 'peso', 'pesoPromedio',
      'numeroPlantasCosechadas', 'remision', 'factura', 'observacion'],
    generadas: [],
  },
  costosInsumos: {
    pk: 'Id', autonumerica: true,
    columnas: ['Id', 'concepto', 'detalle', 'fecha', 'unidad', 'cantidad', 'producto',
      'valorUnitario', 'valorTotal', 'observaciones', 'programacionCultivoCodCultivo'],
    generadas: ['valorTotal'],
  },
  inventarioProductos: {
    pk: 'Id', autonumerica: true,
    columnas: ['Id', 'concepto', 'producto', 'ingreso', 'salida', 'fecha', 'empleado',
      'descripcion', 'cliente', 'saldo', 'codigoSistemaProgramacion'],
    generadas: ['saldo'],
  },
  pedido: {
    pk: 'Id', autonumerica: true,
    columnas: ['Id', 'NitCedula', 'fechaPedido', 'Transporte', 'TotalPedido',
      'FechaEntrega', 'Responsable', 'Cancelado', 'Observacion', 'Activo'],
    generadas: [],
    booleanas: ['Cancelado', 'Activo'],
  },
  detallePedido: {
    pk: 'Id', autonumerica: true,
    columnas: ['Id', 'IdPedido', 'IdSemilla', 'Cantidad', 'ValorUnitario', 'SubTotal'],
    generadas: ['SubTotal'],
  },
};

/** Vistas de solo lectura traducidas desde las consultas SELECT de Access. */
export const VISTAS = [
  'ActualizarAbonamiento', 'cCostosActividades', 'cCostosInsumos', 'cInventarioCampo',
  'cInventarioProductos', 'cosecha Consulta', 'cProgramacionSiembra',
];

/** Columnas que se pueden escribir: todo menos las generadas. */
export const columnasEscribibles = (tabla) => {
  const t = TABLAS[tabla];
  return t.columnas.filter((c) => !t.generadas.includes(c));
};

/** Columnas que acepta un alta: sin la clave si es autonumerica. */
export const columnasAlta = (tabla) => {
  const t = TABLAS[tabla];
  return columnasEscribibles(tabla).filter((c) => !(t.autonumerica && c === t.pk));
};
