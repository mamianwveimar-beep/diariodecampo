/**
 * Tipos de la API. Los nombres de campo son los de Access, conservados a
 * proposito en toda la migracion para que la comparacion contra el origen
 * sea directa (ver PLAN_MIGRACION.html).
 */

export interface Ciudad {
  codigoCiudad: number;
  nombreCiudad: string | null;
}

export interface Cliente {
  NitCedula: string;
  TipoDocumento: string | null;
  NombreCliente: string | null;
  ApellidoCliente: string | null;
  fechaNacimiento: string | null;
  SexoCliente: string | null;
  CiudadCliente: number | null;
  DireccionCliente: string | null;
  barrioCliente: string | null;
  CelularCliente: string | null;
  TelefonoFijoCliente: string | null;
  CorreoCliente: string | null;
  PuntosCliente: string | null;
  FechaAfiliacion: string | null;
  Arcchivos: number;
}

export interface Empleado {
  id: number;
  documento: string;
  telefono: string | null;
  telefono2: string | null;
  numeroCuenta: string | null;
  tipoDocumento: string | null;
  nombre: string;
  apellido: string;
  direccion: string | null;
  fechaNacimiento: string | null;
  estadoCivil: string | null;
  correo: string | null;
  sexo: string | null;
  arl: string | null;
  salario: number | null;
  auxilioTransporte: number;
  pension: string | null;
  cajaCompensacion: string | null;
  eps: string | null;
  fechaIngreso: string | null;
  estudios: string | null;
  comentario: string | null;
  activo: number;
}

export interface Producto {
  id: number;
  codigoProducto: string;
  nombreProducto: string | null;
  cantidadMax: number | null;
  CantidadMin: number | null;
  prevedor: string | null;
  registro: string | null;
  marca: string | null;
  valorUnidad: number | null;
  unidad: string | null;
  cantidad: number | null;
  observacion: string | null;
}

export interface Semilla {
  Id: number;
  semilla: string | null;
  variedad: string | null;
  periodoSiembra: number | null;
  entrePlanta: number | null;
  entreSurcos: number | null;
  abonoSiembra: number | null;
  abonoPrimera: number | null;
  abonoSegunda: number | null;
  abonoTercera: number | null;
  calDolomita: number | null;
  abonoLiquido: number | null;
  ciclo: number | null;
  Aplicacion1: number | null;
  Aplicacion2: number | null;
  Aplicacion3: number | null;
  Poda1: number | null;
  Poda2: number | null;
  anchoPromedioHera: number | null;
  Valor: number | null;
  porcentajePerdida: number | null;
  rendimiento: number | null;
  area: number | null;
  tiempoCosecha: number | null;
  cantidadPeriodoSiembra: number | null;
  Activo: number;
  Perdida: number | null;
}

export interface Cultivo {
  codigosistema: number;
  codSemilla: number;
  areaCultivada: number | null;
  fechasiembra: string;
  factura: string | null;
  fechaRealCosecha: string | null;
  fechafinal: string | null;
  numeroPlantasSembradas: number | null;
  numeroPlantasCosechadas: number | null;
  /** Codigo de identificacion, no cantidad: puede llevar letras (p. ej. "A1"). */
  lote: string | null;
  cama: string | null;
  tipoAbono: string | null;
  cantidadAbono0: number | null;
  codigoSemillero: string | null;
  observaciones: string | null;
  kilosCosechados: number | null;
  activo: number;
  /** Lo que se preveia sembrar. NULL en lo migrado: Access no lo distinguia. */
  numeroPlantasPlanificadas: number | null;
  plantulasDanadas: number | null;
  motivoMerma: string | null;
  /** Cuando el operario registro la siembra. NULL = pendiente de registrar. */
  fechaRegistroSiembra: string | null;
}

/**
 * Un cultivo con la ficha de su semilla ya resuelta, tal como lo devuelve
 * /api/ordenes. Es lo que necesita la pantalla del operario para calcular
 * los insumos sin tener que pedir la semilla aparte.
 */
export interface Orden extends Cultivo {
  semilla: string | null;
  variedad: string | null;
  ciclo: number | null;
  abonoSiembra: number | null;
  calDolomita: number | null;
  abonoLiquido: number | null;
  abonoPrimera: number | null;
  abonoSegunda: number | null;
  abonoTercera: number | null;
  Aplicacion1: number | null;
  /** m2 por planta: infoSemilla.area o entrePlanta x entreSurcos. */
  marcoSiembra: number | null;
}

/** Los tres estados que el operario puede dar a una labor en campo. */
export type EstadoActividad = 'pendiente' | 'realizado' | 'cancelado';

export interface Actividad {
  id: number;
  codigoSistema: number;
  codsemilla: number;
  fechaSiembra: string;
  semanaAbono: number;
  Actividad: string;
  cantidadAbono: number | null;
  lote: string | null;
  cama: string | null;
  numeroPlantas: number | null;
  /** Columna generada: cantidadAbono * numeroPlantas. No se escribe. */
  total: number | null;
  detalle: string | null;
  responsable: string | null;
  costo: number | null;
  unidad: string | null;
  /** NULL = programada sin registrar en campo; con fecha = el operario la registro. */
  fechaRegistro: string | null;
  /** Que dijo el operario: NULL (aun nada), pendiente, realizado o cancelado. */
  estado: EstadoActividad | null;
}

export interface Cosecha {
  Id: number;
  codigosistema: number | null;
  fechaCosecha: string | null;
  peso: number | null;
  pesoPromedio: number | null;
  numeroPlantasCosechadas: number | null;
  remision: string | null;
  factura: string | null;
  observacion: string | null;
  responsable: string | null;
  minutosTrabajo: number | null;
}

export interface Movimiento {
  Id: number;
  concepto: string;
  producto: number;
  ingreso: number | null;
  salida: number | null;
  fecha: string | null;
  empleado: number | null;
  descripcion: string | null;
  cliente: string | null;
  /** Columna generada: ingreso - salida. No se escribe. */
  saldo: number | null;
  codigoSistemaProgramacion: number | null;
}

export interface Pedido {
  Id: number;
  NitCedula: string | null;
  fechaPedido: string | null;
  Transporte: number | null;
  TotalPedido: number | null;
  FechaEntrega: string | null;
  Responsable: string | null;
  Cancelado: number;
  Observacion: string | null;
  Activo: number;
}

export interface LineaPedido {
  Id: number;
  IdPedido: number;
  IdSemilla: number | null;
  Cantidad: number | null;
  ValorUnitario: number | null;
  /** Columna generada: Cantidad * ValorUnitario. No se escribe. */
  SubTotal: number | null;
}

export interface CostoInsumo {
  Id: number;
  concepto: string;
  detalle: string;
  fecha: string | null;
  unidad: string | null;
  cantidad: number | null;
  producto: number;
  valorUnitario: number | null;
  valorTotal: number | null;
  observaciones: string | null;
  programacionCultivoCodCultivo: number;
}

export interface Adjunto {
  id: number;
  nombre_archivo: string;
  mime: string;
  bytes: number;
}

export interface FilaCuarentena {
  id: number;
  tabla_origen: string;
  pk_origen: string;
  regla: string;
  columna: string | null;
  valor: string | null;
  accion: string;
  detalle_json: string | null;
}

export interface Proceso {
  nombre: string;
  destino: string;
  descripcion: string;
}

export interface ResultadoProceso {
  consulta: string;
  destino: string;
  insertadas: number;
}

export interface ResultadoLote {
  lote: string;
  resultados: ResultadoProceso[];
  total_insertadas: number;
}

/** Fila de cCostosActividades: actividades con su gran total. */
export interface CostoActividad extends Actividad {
  GTotal: number | null;
}

/** Fila de cInventarioCampo. */
export interface InventarioCampo {
  codigosistema: number;
  codSemilla: number;
  fechasiembra: string;
  lote: string | null;
  cama: string | null;
  InicioCosecha: string | null;
  FinalCosecha: string | null;
  numeroPlantasSembradas: number | null;
  SumaDenumeroPlantasCosechadas: number | null;
  kilosCosechados: number | null;
  Pedido: number | null;
  activo: number;
  ciclo: number | null;
}

/** Fila de cProgramacionSiembra. */
export interface ProgramacionSiembra {
  semilla: string | null;
  variedad: string | null;
  Pedido: number | null;
  cantidakgTiempoCosecha: number | null;
  FrecuanciaSiembra: number | null;
  numeroLote: number | null;
  areaLote: number | null;
  numeroPlantasLote: number | null;
  TotalArea: number | null;
  metrosLinealesLote: number | null;
  TotalMetrosLineales: number | null;
}

/** Fila del informe de trazabilidad (cProgramacionCultivo). */
export interface Trazabilidad {
  codigosistema: number;
  semilla: string | null;
  variedad: string | null;
  factura: string | null;
  fechasiembra: string;
  numeroPlantasSembradas: number | null;
  lote: string | null;
  cama: string | null;
  '#dias': number | null;
  Abono25Mar: string | null;
  abonoPrimera: number | null;
  abono50Mar: string | null;
  abonoSegunda: number | null;
  abono75Mar: string | null;
  abonoTercera: number | null;
  creceMas15Lun: string | null;
  creceMas30Lun: string | null;
  produceMas50Mier: string | null;
  produceMas70Mier: string | null;
  saferMix0Lun: string | null;
  saferMix60Juev: string | null;
  sulfoCalcico45Juev: string | null;
  bordeles70Juev: string | null;
  fechaCosecha: string | null;
  numeroPlantasCosechadas: number | null;
  peso: number | null;
  remision: string | null;
  cosecha_factura: string | null;
  observacion: string | null;
}
