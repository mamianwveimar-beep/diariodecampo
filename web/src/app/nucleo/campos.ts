/**
 * Definicion de los campos de las pantallas de mantenimiento.
 *
 * Las cinco pantallas de maestros (semillas, productos, clientes, empleados
 * y almacen) comparten forma: listado, alta y edicion. En vez de escribir
 * cinco componentes casi iguales, se describen sus campos aqui y el
 * componente Maestro los pinta. Las pantallas con logica propia (siembras,
 * actividades, pedidos) si tienen su componente.
 *
 * Las reglas de obligatoriedad y las longitudes reproducen las que Access
 * tenia en la definicion de cada tabla.
 */

export type TipoCampo = 'texto' | 'numero' | 'fecha' | 'booleano' | 'area' | 'seleccion';

export interface CampoDef {
  nombre: string;
  etiqueta: string;
  tipo: TipoCampo;
  requerido?: boolean;
  /** Maximo de caracteres, tal como lo definia Access. */
  max?: number;
  /** Decimales admitidos en un campo numerico. */
  paso?: number;
  /** Opciones fijas de un desplegable. */
  opciones?: { valor: string | number; texto: string }[];
  /** Opciones cargadas de otra tabla. */
  origen?: { tabla: string; valor: string; texto: string[] };
  /** Ocupa toda la anchura del formulario. */
  ancho?: boolean;
  /** Se muestra en el listado. Por defecto, no. */
  enTabla?: boolean;
  /** Columna GENERATED en D1: se lee pero no se escribe. */
  calculado?: boolean;
  ayuda?: string;
}

export interface MaestroDef {
  tabla: string;
  pk: string;
  titulo: string;
  subtitulo: string;
  /** El pk lo asigna la base (autonumerico) y no se pide en el alta. */
  pkAutomatica: boolean;
  campos: CampoDef[];
  /** Tabla de la que cuelgan los adjuntos, si los tiene. */
  adjuntos?: boolean;
}

const SI_NO = [{ valor: 1, texto: 'Si' }, { valor: 0, texto: 'No' }];

export const MAESTROS: Record<string, MaestroDef> = {
  // ------------------------------------------------------------ semillas
  semillas: {
    tabla: 'infoSemilla', pk: 'Id', pkAutomatica: true, adjuntos: true,
    titulo: 'Semillas',
    subtitulo: 'Ficha tecnica de cada semilla: dosis de abono, ciclo y rendimiento.',
    campos: [
      { nombre: 'Id', etiqueta: 'Codigo', tipo: 'numero', enTabla: true, calculado: true },
      { nombre: 'semilla', etiqueta: 'Semilla', tipo: 'texto', max: 20, enTabla: true },
      { nombre: 'variedad', etiqueta: 'Variedad', tipo: 'texto', max: 20, enTabla: true },
      { nombre: 'ciclo', etiqueta: 'Ciclo (dias)', tipo: 'numero', enTabla: true },
      { nombre: 'periodoSiembra', etiqueta: 'Periodo de siembra (dias)', tipo: 'numero' },
      { nombre: 'entrePlanta', etiqueta: 'Entre planta (m)', tipo: 'numero', paso: 0.01 },
      { nombre: 'entreSurcos', etiqueta: 'Entre surcos (m)', tipo: 'numero', paso: 0.01 },
      { nombre: 'area', etiqueta: 'Area por planta (m2)', tipo: 'numero', paso: 0.001 },
      { nombre: 'anchoPromedioHera', etiqueta: 'Ancho medio de era (m)', tipo: 'numero', paso: 0.01 },
      {
        nombre: 'abonoSiembra', etiqueta: 'Abono en siembra (kg/planta)', tipo: 'numero', paso: 0.001,
        enTabla: true,
      },
      { nombre: 'abonoPrimera', etiqueta: 'Abono 1a (dia 25)', tipo: 'numero', paso: 0.001 },
      {
        nombre: 'abonoSegunda', etiqueta: 'Abono 2a (dia 50)', tipo: 'numero', paso: 0.001,
        ayuda: 'Si se deja vacio en vez de 0, el coste de abonamiento sale nulo. Access hace lo mismo.',
      },
      {
        nombre: 'abonoTercera', etiqueta: 'Abono 3a (dia 75)', tipo: 'numero', paso: 0.001,
        ayuda: 'Si se deja vacio en vez de 0, el coste de abonamiento sale nulo.',
      },
      { nombre: 'abonoLiquido', etiqueta: 'Abono liquido (L/planta)', tipo: 'numero', paso: 0.001 },
      { nombre: 'calDolomita', etiqueta: 'Cal dolomita', tipo: 'numero', paso: 0.001 },
      { nombre: 'Aplicacion1', etiqueta: 'Aplicacion 1 (dia)', tipo: 'numero', paso: 0.1 },
      { nombre: 'Aplicacion2', etiqueta: 'Aplicacion 2 (dia)', tipo: 'numero' },
      { nombre: 'Aplicacion3', etiqueta: 'Aplicacion 3 (dia)', tipo: 'numero' },
      { nombre: 'Poda1', etiqueta: 'Poda 1 (dia)', tipo: 'numero' },
      { nombre: 'Poda2', etiqueta: 'Poda 2 (dia)', tipo: 'numero' },
      { nombre: 'tiempoCosecha', etiqueta: 'Tiempo de cosecha (dias)', tipo: 'numero', paso: 0.1 },
      { nombre: 'cantidadPeriodoSiembra', etiqueta: 'Pedido por periodo (kg)', tipo: 'numero', paso: 0.1 },
      { nombre: 'rendimiento', etiqueta: 'Rendimiento', tipo: 'numero', paso: 0.01 },
      { nombre: 'porcentajePerdida', etiqueta: 'Perdida (%)', tipo: 'numero', paso: 0.1 },
      { nombre: 'Perdida', etiqueta: 'Perdida (factor)', tipo: 'numero', paso: 0.01 },
      { nombre: 'Valor', etiqueta: 'Valor (COP)', tipo: 'numero' },
      { nombre: 'Activo', etiqueta: 'Activa', tipo: 'seleccion', opciones: SI_NO, enTabla: true },
    ],
  },

  // ----------------------------------------------------------- productos
  productos: {
    tabla: 'productos', pk: 'id', pkAutomatica: true, adjuntos: true,
    titulo: 'Productos',
    subtitulo: 'Abonos, protecciones y demas insumos, con su precio unitario.',
    campos: [
      { nombre: 'id', etiqueta: 'Codigo', tipo: 'numero', enTabla: true, calculado: true },
      { nombre: 'codigoProducto', etiqueta: 'Referencia', tipo: 'texto', max: 50, requerido: true, enTabla: true },
      { nombre: 'nombreProducto', etiqueta: 'Nombre', tipo: 'texto', max: 50, enTabla: true },
      { nombre: 'marca', etiqueta: 'Marca', tipo: 'texto', max: 50 },
      { nombre: 'prevedor', etiqueta: 'Proveedor', tipo: 'texto', max: 60 },
      { nombre: 'registro', etiqueta: 'Registro', tipo: 'texto', max: 50 },
      { nombre: 'unidad', etiqueta: 'Unidad', tipo: 'texto', max: 20, enTabla: true },
      { nombre: 'valorUnidad', etiqueta: 'Valor unitario (COP)', tipo: 'numero', enTabla: true },
      { nombre: 'cantidad', etiqueta: 'Existencias', tipo: 'numero', paso: 0.01, enTabla: true },
      { nombre: 'CantidadMin', etiqueta: 'Minimo', tipo: 'numero' },
      { nombre: 'cantidadMax', etiqueta: 'Maximo', tipo: 'numero' },
      { nombre: 'observacion', etiqueta: 'Observacion', tipo: 'area', max: 255, ancho: true },
    ],
  },

  // ----------------------------------------------------------- clientes
  clientes: {
    tabla: 'clientes', pk: 'NitCedula', pkAutomatica: false, adjuntos: true,
    titulo: 'Clientes',
    subtitulo: 'Quien compra la produccion.',
    campos: [
      { nombre: 'NitCedula', etiqueta: 'NIT o cedula', tipo: 'texto', max: 50, requerido: true, enTabla: true },
      {
        nombre: 'TipoDocumento', etiqueta: 'Tipo de documento', tipo: 'seleccion',
        opciones: [{ valor: 'CC', texto: 'CC' }, { valor: 'CE', texto: 'CE' }, { valor: 'NIT', texto: 'NIT' }],
      },
      { nombre: 'NombreCliente', etiqueta: 'Nombre', tipo: 'texto', max: 30, enTabla: true },
      { nombre: 'ApellidoCliente', etiqueta: 'Apellido', tipo: 'texto', max: 30, enTabla: true },
      {
        nombre: 'SexoCliente', etiqueta: 'Sexo', tipo: 'seleccion',
        opciones: [{ valor: 'M', texto: 'M' }, { valor: 'F', texto: 'F' }],
      },
      { nombre: 'fechaNacimiento', etiqueta: 'Fecha de nacimiento', tipo: 'fecha' },
      {
        nombre: 'CiudadCliente', etiqueta: 'Ciudad', tipo: 'seleccion', enTabla: true,
        origen: { tabla: 'ciudad', valor: 'codigoCiudad', texto: ['nombreCiudad'] },
      },
      { nombre: 'DireccionCliente', etiqueta: 'Direccion', tipo: 'texto', max: 50 },
      { nombre: 'barrioCliente', etiqueta: 'Barrio', tipo: 'texto', max: 255 },
      { nombre: 'CelularCliente', etiqueta: 'Celular', tipo: 'texto', max: 50, enTabla: true },
      { nombre: 'TelefonoFijoCliente', etiqueta: 'Telefono fijo', tipo: 'texto', max: 50 },
      { nombre: 'CorreoCliente', etiqueta: 'Correo', tipo: 'texto', max: 50 },
      { nombre: 'PuntosCliente', etiqueta: 'Puntos', tipo: 'texto', max: 50 },
      { nombre: 'FechaAfiliacion', etiqueta: 'Fecha de afiliacion', tipo: 'fecha' },
    ],
  },

  // ---------------------------------------------------------- empleados
  empleados: {
    tabla: 'empleados', pk: 'id', pkAutomatica: true, adjuntos: true,
    titulo: 'Empleados',
    subtitulo: 'Personal de la finca.',
    campos: [
      { nombre: 'id', etiqueta: 'Codigo', tipo: 'numero', enTabla: true, calculado: true },
      {
        nombre: 'documento', etiqueta: 'Documento', tipo: 'texto', requerido: true, enTabla: true,
        ayuda: 'En Access era numerico y truncaba los moviles de 10 digitos. Ahora es texto.',
      },
      { nombre: 'tipoDocumento', etiqueta: 'Tipo de documento', tipo: 'texto', max: 20 },
      { nombre: 'nombre', etiqueta: 'Nombre', tipo: 'texto', max: 50, requerido: true, enTabla: true },
      { nombre: 'apellido', etiqueta: 'Apellido', tipo: 'texto', max: 50, requerido: true, enTabla: true },
      { nombre: 'telefono', etiqueta: 'Telefono', tipo: 'texto', enTabla: true },
      { nombre: 'telefono2', etiqueta: 'Otro telefono', tipo: 'texto' },
      { nombre: 'direccion', etiqueta: 'Direccion', tipo: 'texto', max: 100 },
      { nombre: 'correo', etiqueta: 'Correo', tipo: 'texto', max: 100 },
      { nombre: 'fechaNacimiento', etiqueta: 'Fecha de nacimiento', tipo: 'fecha' },
      { nombre: 'fechaIngreso', etiqueta: 'Fecha de ingreso', tipo: 'fecha', enTabla: true },
      {
        nombre: 'sexo', etiqueta: 'Sexo', tipo: 'seleccion',
        opciones: [{ valor: 'M', texto: 'M' }, { valor: 'F', texto: 'F' }],
      },
      { nombre: 'estadoCivil', etiqueta: 'Estado civil', tipo: 'texto', max: 20 },
      { nombre: 'estudios', etiqueta: 'Estudios', tipo: 'texto', max: 50 },
      { nombre: 'salario', etiqueta: 'Salario (COP)', tipo: 'numero', enTabla: true },
      { nombre: 'auxilioTransporte', etiqueta: 'Auxilio de transporte', tipo: 'seleccion', opciones: SI_NO },
      { nombre: 'numeroCuenta', etiqueta: 'Numero de cuenta', tipo: 'texto' },
      { nombre: 'eps', etiqueta: 'EPS', tipo: 'texto', max: 50 },
      { nombre: 'arl', etiqueta: 'ARL', tipo: 'texto', max: 100 },
      { nombre: 'pension', etiqueta: 'Pension', tipo: 'texto', max: 50 },
      { nombre: 'cajaCompensacion', etiqueta: 'Caja de compensacion', tipo: 'texto', max: 50 },
      { nombre: 'activo', etiqueta: 'Activo', tipo: 'seleccion', opciones: SI_NO, enTabla: true },
      { nombre: 'comentario', etiqueta: 'Comentario', tipo: 'area', max: 255, ancho: true },
    ],
  },

  // ------------------------------------------------------------ almacen
  almacen: {
    tabla: 'inventarioProductos', pk: 'Id', pkAutomatica: true,
    titulo: 'Almacen',
    subtitulo: 'Entradas y salidas de producto. El saldo lo calcula la base.',
    campos: [
      { nombre: 'Id', etiqueta: 'Codigo', tipo: 'numero', enTabla: true, calculado: true },
      { nombre: 'fecha', etiqueta: 'Fecha', tipo: 'fecha', enTabla: true },
      { nombre: 'concepto', etiqueta: 'Concepto', tipo: 'texto', max: 70, requerido: true, enTabla: true },
      {
        nombre: 'producto', etiqueta: 'Producto', tipo: 'seleccion', requerido: true, enTabla: true,
        origen: { tabla: 'productos', valor: 'id', texto: ['nombreProducto', 'unidad'] },
      },
      { nombre: 'ingreso', etiqueta: 'Entrada', tipo: 'numero', paso: 0.01, enTabla: true },
      { nombre: 'salida', etiqueta: 'Salida', tipo: 'numero', paso: 0.01, enTabla: true },
      {
        nombre: 'saldo', etiqueta: 'Saldo', tipo: 'numero', enTabla: true, calculado: true,
        ayuda: 'Columna calculada: entrada menos salida.',
      },
      {
        nombre: 'empleado', etiqueta: 'Empleado', tipo: 'seleccion',
        origen: { tabla: 'empleados', valor: 'id', texto: ['nombre', 'apellido'] },
      },
      {
        nombre: 'cliente', etiqueta: 'Cliente', tipo: 'seleccion',
        origen: { tabla: 'clientes', valor: 'NitCedula', texto: ['NombreCliente', 'ApellidoCliente'] },
      },
      {
        nombre: 'codigoSistemaProgramacion', etiqueta: 'Cultivo', tipo: 'seleccion',
        origen: { tabla: 'programacionCultivos', valor: 'codigosistema', texto: ['codigosistema', 'fechasiembra'] },
      },
      { nombre: 'descripcion', etiqueta: 'Descripcion', tipo: 'area', max: 255, ancho: true },
    ],
  },
};
