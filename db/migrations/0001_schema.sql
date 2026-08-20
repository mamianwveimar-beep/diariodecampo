-- =====================================================================
-- diarioDeCampo - esquema destino (Cloudflare D1 / SQLite)
-- Fase 2. Traducido desde diarioDeCampo.accdb sha256 09ef6c52...
--
-- Se conservan los nombres exactos de Access, incluidas sus incoherencias
-- (codigosistema / codigoSistema) y el error tipografico clientes.Arcchivos:
-- SQLite no distingue mayusculas en identificadores y asi la comparacion
-- fila a fila contra el origen es directa.
--
-- Correspondencia de tipos:
--   Date/Time    -> TEXT ISO-8601 'YYYY-MM-DD'
--   Yes/No       -> INTEGER 0/1 con CHECK
--   Double       -> REAL           Single -> REAL
--   Long/Integer -> INTEGER        Currency -> INTEGER (pesos, sin centavos)
--   Text(n)      -> TEXT con CHECK de longitud
--   Attachment   -> tabla adjuntos + objeto en R2
-- =====================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- ciudad
CREATE TABLE ciudad (
  codigoCiudad  INTEGER NOT NULL PRIMARY KEY,
  nombreCiudad  TEXT CHECK (nombreCiudad IS NULL OR length(nombreCiudad) <= 255)
);

-- -------------------------------------------------------------- clientes
CREATE TABLE clientes (
  NitCedula            TEXT    NOT NULL PRIMARY KEY CHECK (length(NitCedula) <= 50),
  TipoDocumento        TEXT    DEFAULT 'CC' CHECK (TipoDocumento IS NULL OR length(TipoDocumento) <= 20),
  NombreCliente        TEXT    CHECK (NombreCliente IS NULL OR length(NombreCliente) <= 30),
  ApellidoCliente      TEXT    CHECK (ApellidoCliente IS NULL OR length(ApellidoCliente) <= 30),
  fechaNacimiento      TEXT    CHECK (fechaNacimiento IS NULL OR fechaNacimiento GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  SexoCliente          TEXT    CHECK (SexoCliente IS NULL OR length(SexoCliente) <= 10),
  CiudadCliente        INTEGER DEFAULT 5
                       REFERENCES ciudad(codigoCiudad) ON UPDATE CASCADE ON DELETE CASCADE,
  DireccionCliente     TEXT    CHECK (DireccionCliente IS NULL OR length(DireccionCliente) <= 50),
  barrioCliente        TEXT    CHECK (barrioCliente IS NULL OR length(barrioCliente) <= 255),
  CelularCliente       TEXT    CHECK (CelularCliente IS NULL OR length(CelularCliente) <= 50),
  TelefonoFijoCliente  TEXT    CHECK (TelefonoFijoCliente IS NULL OR length(TelefonoFijoCliente) <= 50),
  CorreoCliente        TEXT    CHECK (CorreoCliente IS NULL OR length(CorreoCliente) <= 50),
  PuntosCliente        TEXT    CHECK (PuntosCliente IS NULL OR length(PuntosCliente) <= 50),
  FechaAfiliacion      TEXT    CHECK (FechaAfiliacion IS NULL OR FechaAfiliacion GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  -- el nombre conserva el error tipografico del origen, a proposito
  Arcchivos            INTEGER NOT NULL DEFAULT 0 CHECK (Arcchivos IN (0,1))
);
CREATE INDEX ix_clientes_ciudad ON clientes(CiudadCliente);

-- ------------------------------------------------------------- empleados
CREATE TABLE empleados (
  id                INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  -- CORREGIDO: en Access eran Long Integer. Un movil colombiano de 10 digitos
  -- desborda un entero de 32 bits y los datos de origen ya estan mutilados
  -- (2110, 321000). Pasan a texto.
  documento         TEXT    NOT NULL,
  telefono          TEXT,
  telefono2         TEXT,
  numeroCuenta      TEXT,
  tipoDocumento     TEXT    DEFAULT 'cc' CHECK (tipoDocumento IS NULL OR length(tipoDocumento) <= 20),
  nombre            TEXT    NOT NULL CHECK (length(nombre) <= 50),
  apellido          TEXT    NOT NULL CHECK (length(apellido) <= 50),
  direccion         TEXT    CHECK (direccion IS NULL OR length(direccion) <= 100),
  fechaNacimiento   TEXT    CHECK (fechaNacimiento IS NULL OR fechaNacimiento GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  estadoCivil       TEXT    DEFAULT 'union libre' CHECK (estadoCivil IS NULL OR length(estadoCivil) <= 20),
  correo            TEXT    CHECK (correo IS NULL OR length(correo) <= 100),
  sexo              TEXT    DEFAULT 'M' CHECK (sexo IS NULL OR length(sexo) <= 10),
  arl               TEXT    CHECK (arl IS NULL OR length(arl) <= 100),
  salario           REAL    DEFAULT 0,
  auxilioTransporte INTEGER NOT NULL DEFAULT 0 CHECK (auxilioTransporte IN (0,1)),
  pension           TEXT    CHECK (pension IS NULL OR length(pension) <= 50),
  cajaCompensacion  TEXT    CHECK (cajaCompensacion IS NULL OR length(cajaCompensacion) <= 50),
  eps               TEXT    CHECK (eps IS NULL OR length(eps) <= 50),
  fechaIngreso      TEXT    CHECK (fechaIngreso IS NULL OR fechaIngreso GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  estudios          TEXT    CHECK (estudios IS NULL OR length(estudios) <= 50),
  comentario        TEXT    CHECK (comentario IS NULL OR length(comentario) <= 255),
  activo            INTEGER NOT NULL DEFAULT 0 CHECK (activo IN (0,1))
);

-- ------------------------------------------------------------- productos
CREATE TABLE productos (
  id             INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  codigoProducto TEXT    NOT NULL CHECK (length(codigoProducto) <= 50),
  nombreProducto TEXT    CHECK (nombreProducto IS NULL OR length(nombreProducto) <= 50),
  cantidadMax    INTEGER,
  CantidadMin    INTEGER,
  prevedor       TEXT    CHECK (prevedor IS NULL OR length(prevedor) <= 60),
  registro       TEXT    CHECK (registro IS NULL OR length(registro) <= 50),
  marca          TEXT    CHECK (marca IS NULL OR length(marca) <= 50),
  valorUnidad    INTEGER DEFAULT 0,
  unidad         TEXT    CHECK (unidad IS NULL OR length(unidad) <= 20),
  cantidad       REAL,
  observacion    TEXT    CHECK (observacion IS NULL OR length(observacion) <= 255)
);

-- ----------------------------------------------------------- infoSemilla
CREATE TABLE infoSemilla (
  Id                     INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  semilla                TEXT    CHECK (semilla IS NULL OR length(semilla) <= 20),
  variedad               TEXT    CHECK (variedad IS NULL OR length(variedad) <= 20),
  periodoSiembra         INTEGER,
  entrePlanta            REAL,
  entreSurcos            REAL,
  abonoSiembra           REAL,
  abonoPrimera           REAL,
  abonoSegunda           REAL,
  abonoTercera           REAL,
  calDolomita            REAL,
  abonoLiquido           REAL    DEFAULT 0,
  ciclo                  INTEGER,
  Aplicacion1            REAL,
  Aplicacion2            INTEGER,
  Aplicacion3            INTEGER DEFAULT 0,
  Poda1                  INTEGER DEFAULT 0,
  Poda2                  INTEGER DEFAULT 0,
  anchoPromedioHera      REAL    DEFAULT 0,
  Valor                  INTEGER DEFAULT 0,
  porcentajePerdida      REAL    DEFAULT 0,
  rendimiento            REAL    DEFAULT 0,
  area                   REAL,
  tiempoCosecha          REAL    DEFAULT 0,
  cantidadPeriodoSiembra REAL    DEFAULT 0,
  Activo                 INTEGER NOT NULL DEFAULT 0 CHECK (Activo IN (0,1)),
  Perdida                REAL
);
CREATE INDEX ix_infoSemilla_semilla ON infoSemilla(semilla);

-- -------------------------------------------------- programacionCultivos
CREATE TABLE programacionCultivos (
  codigosistema           INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  codSemilla              INTEGER NOT NULL
                          REFERENCES infoSemilla(Id) ON UPDATE CASCADE ON DELETE CASCADE,
  areaCultivada           REAL    DEFAULT 0,
  fechasiembra            TEXT    NOT NULL CHECK (fechasiembra GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  factura                 TEXT    CHECK (factura IS NULL OR length(factura) <= 30),
  fechaRealCosecha        TEXT    CHECK (fechaRealCosecha IS NULL OR fechaRealCosecha GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  fechafinal              TEXT    CHECK (fechafinal IS NULL OR fechafinal GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  numeroPlantasSembradas  INTEGER DEFAULT 0,
  numeroPlantasCosechadas INTEGER DEFAULT 0,
  -- CORREGIDO: lote y cama pasan a texto. En la practica son codigos de
  -- identificacion del terreno, no cantidades, y pueden llevar letras
  -- (p. ej. "A1"); un REAL los obligaba a ser siempre un numero.
  lote                    TEXT    CHECK (lote IS NULL OR length(lote) <= 20),
  cama                    TEXT    CHECK (cama IS NULL OR length(cama) <= 20),
  tipoAbono               TEXT    CHECK (tipoAbono IS NULL OR length(tipoAbono) <= 100),
  cantidadAbono0          REAL    DEFAULT 0,
  codigoSemillero         TEXT    CHECK (codigoSemillero IS NULL OR length(codigoSemillero) <= 50),
  observaciones           TEXT    CHECK (observaciones IS NULL OR length(observaciones) <= 255),
  kilosCosechados         REAL    DEFAULT 0,
  activo                  INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
  -- NUEVO (orden de siembra): lo que se PLANIFICO sembrar, frente a
  -- numeroPlantasSembradas, que es lo que de verdad entro a la cama. Access no
  -- distinguia las dos cosas, asi que el historico queda en NULL: no se sabe y
  -- no se inventa. Lo rellena "Registrar siembra" al programar.
  numeroPlantasPlanificadas INTEGER,
  -- NUEVO: plantulas que no llegaron a sembrarse por venir danadas. Es lo que
  -- explica la diferencia entre lo planificado y lo sembrado.
  plantulasDanadas          INTEGER,
  -- NUEVO: por que hubo merma. Es obligatorio en la pantalla del operario
  -- cuando lo sembrado no llega a lo planificado, y va aparte de
  -- observaciones, que es el campo libre de quien planifica.
  motivoMerma               TEXT    CHECK (motivoMerma IS NULL OR length(motivoMerma) <= 255),
  -- NUEVO: cuando el operario registro la ejecucion en campo. NULL significa
  -- que la siembra sigue pendiente de registrar, y es lo que alimenta su
  -- lista de trabajo.
  fechaRegistroSiembra      TEXT    CHECK (fechaRegistroSiembra IS NULL OR fechaRegistroSiembra GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);
CREATE INDEX ix_programacionCultivos_codSemilla ON programacionCultivos(codSemilla);

-- ----------------------------------------------------------- actividades
-- CORREGIDO: en Access la clave primaria era la compuesta de 5 campos y el
-- indice de "id" NO era unico, asi que el VBA que borra por id podia llevarse
-- varias filas. Aqui id es la clave real y la compuesta queda como UNIQUE,
-- que es lo que hace que los INSERT de las consultas de accion se salten
-- duplicados igual que en Access (via ON CONFLICT DO NOTHING).
CREATE TABLE actividades (
  id            INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  codigoSistema INTEGER NOT NULL DEFAULT 0
                REFERENCES programacionCultivos(codigosistema) ON UPDATE CASCADE ON DELETE CASCADE,
  codsemilla    INTEGER NOT NULL,
  fechaSiembra  TEXT    NOT NULL CHECK (fechaSiembra GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  semanaAbono   INTEGER NOT NULL DEFAULT 0,
  Actividad     TEXT    NOT NULL CHECK (length(Actividad) <= 50),
  cantidadAbono REAL    DEFAULT 0,
  -- lote y cama son texto, igual que en programacionCultivos
  lote          TEXT    CHECK (lote IS NULL OR length(lote) <= 20),
  cama          TEXT    CHECK (cama IS NULL OR length(cama) <= 20),
  numeroPlantas INTEGER DEFAULT 0,
  -- calculada en Access: [cantidadAbono]*[numeroPlantas]
  total         REAL    GENERATED ALWAYS AS (cantidadAbono * numeroPlantas) STORED,
  detalle       TEXT    CHECK (detalle IS NULL OR length(detalle) <= 50),
  responsable   TEXT    CHECK (responsable IS NULL OR length(responsable) <= 255),
  costo         REAL    DEFAULT 0,
  unidad        TEXT    CHECK (unidad IS NULL OR length(unidad) <= 20),
  -- NUEVO (orden de siembra): cuando el operario registro ESTA labor en campo.
  -- Tres estados a proposito:
  --   fila inexistente -> ni programada ni registrada
  --   fila con NULL    -> programada por las consultas de accion, sin ejecutar
  --   fila con fecha   -> el operario la registro, con sus cantidades reales
  -- Access no distinguia ninguno de los tres: alli existir era haberse hecho.
  -- Por eso el historico migrado queda en NULL, que es lo unico cierto.
  fechaRegistro TEXT    CHECK (fechaRegistro IS NULL OR fechaRegistro GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);
CREATE UNIQUE INDEX ux_actividades_access
  ON actividades(codigoSistema, codsemilla, fechaSiembra, semanaAbono, Actividad);
CREATE INDEX ix_actividades_codigoSistema ON actividades(codigoSistema);

-- --------------------------------------------------------------- cosecha
CREATE TABLE cosecha (
  Id                      INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  codigosistema           INTEGER DEFAULT 0
                          REFERENCES programacionCultivos(codigosistema) ON UPDATE CASCADE ON DELETE CASCADE,
  fechaCosecha            TEXT    CHECK (fechaCosecha IS NULL OR fechaCosecha GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  peso                    REAL,
  pesoPromedio            REAL,
  numeroPlantasCosechadas INTEGER,
  remision                TEXT CHECK (remision IS NULL OR length(remision) <= 255),
  factura                 TEXT CHECK (factura IS NULL OR length(factura) <= 255),
  observacion             TEXT CHECK (observacion IS NULL OR length(observacion) <= 255)
);
CREATE INDEX ix_cosecha_codigosistema ON cosecha(codigosistema);

-- --------------------------------------------------------- costosInsumos
-- CORREGIDO: Id pasa a ser la clave primaria (en Access era la compuesta).
-- La compuesta se conserva como UNIQUE para reproducir el descarte silencioso.
CREATE TABLE costosInsumos (
  Id                            INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  concepto                      TEXT    NOT NULL CHECK (length(concepto) <= 100),
  detalle                       TEXT    NOT NULL CHECK (length(detalle) <= 255),
  fecha                         TEXT    CHECK (fecha IS NULL OR fecha GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  unidad                        TEXT    CHECK (unidad IS NULL OR length(unidad) <= 20),
  cantidad                      REAL    DEFAULT 0,
  -- FK recuperada: en Access no existia y por eso convivian 50 filas con el
  -- centinela 999. La fila 999 se crea en 0003_seed_ref.sql
  producto                      INTEGER NOT NULL REFERENCES productos(id) ON UPDATE CASCADE,
  valorUnitario                 INTEGER DEFAULT 0,
  -- calculada en Access: [cantidad]*[valorUnitario]
  valorTotal                    REAL    GENERATED ALWAYS AS (cantidad * valorUnitario) STORED,
  observaciones                 TEXT,
  programacionCultivoCodCultivo INTEGER NOT NULL DEFAULT 0
                                REFERENCES programacionCultivos(codigosistema) ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE UNIQUE INDEX ux_costosInsumos_access
  ON costosInsumos(concepto, detalle, programacionCultivoCodCultivo);
CREATE INDEX ix_costosInsumos_cultivo ON costosInsumos(programacionCultivoCodCultivo);

-- --------------------------------------------------- inventarioProductos
CREATE TABLE inventarioProductos (
  Id                        INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  concepto                  TEXT    NOT NULL CHECK (length(concepto) <= 70),
  producto                  INTEGER NOT NULL
                            REFERENCES productos(id) ON UPDATE CASCADE ON DELETE CASCADE,
  ingreso                   REAL    DEFAULT 0,
  salida                    REAL    DEFAULT 0,
  -- CORREGIDO: en Access era Texto(42) con 'dd/MM/yyyy'
  fecha                     TEXT    CHECK (fecha IS NULL OR fecha GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  empleado                  INTEGER REFERENCES empleados(id) ON UPDATE CASCADE ON DELETE CASCADE,
  descripcion               TEXT    CHECK (descripcion IS NULL OR length(descripcion) <= 255),
  cliente                   TEXT    REFERENCES clientes(NitCedula) ON UPDATE CASCADE ON DELETE CASCADE,
  -- calculada en Access: [ingreso]-[salida]
  saldo                     REAL    GENERATED ALWAYS AS (ingreso - salida) STORED,
  -- FK recuperada. Sin DEFAULT 0: el 0 de Access significaba "sin cultivo"
  -- y no es una referencia valida; se carga como NULL.
  codigoSistemaProgramacion INTEGER
                            REFERENCES programacionCultivos(codigosistema) ON UPDATE CASCADE ON DELETE SET NULL
);
CREATE INDEX ix_inventarioProductos_producto ON inventarioProductos(producto);

-- ---------------------------------------------------------------- pedido
CREATE TABLE pedido (
  Id           INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  NitCedula    TEXT    REFERENCES clientes(NitCedula) ON UPDATE CASCADE ON DELETE CASCADE,
  fechaPedido  TEXT    CHECK (fechaPedido IS NULL OR fechaPedido GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  Transporte   INTEGER DEFAULT 0,
  TotalPedido  INTEGER DEFAULT 0,
  FechaEntrega TEXT    CHECK (FechaEntrega IS NULL OR FechaEntrega GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  Responsable  TEXT    CHECK (Responsable IS NULL OR length(Responsable) <= 255),
  Cancelado    INTEGER NOT NULL DEFAULT 0 CHECK (Cancelado IN (0,1)),
  Observacion  TEXT    CHECK (Observacion IS NULL OR length(Observacion) <= 255),
  Activo       INTEGER NOT NULL DEFAULT 1 CHECK (Activo IN (0,1))
);

-- --------------------------------------------------------- detallePedido
CREATE TABLE detallePedido (
  Id            INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  IdPedido      INTEGER NOT NULL DEFAULT 0
                REFERENCES pedido(Id) ON UPDATE CASCADE ON DELETE CASCADE,
  -- SIN clave foranea a proposito: las 15 filas del origen apuntan a semillas
  -- que ya no existen (Id 1, 14, 15, 16, 17, 212). Quedan registradas en
  -- _cuarentena hasta que se decida que hacer con ellas.
  IdSemilla     INTEGER,
  Cantidad      INTEGER DEFAULT 0,
  ValorUnitario INTEGER DEFAULT 0,
  -- calculada en Access: [Cantidad]*[ValorUnitario]. Currency -> entero en pesos
  SubTotal      INTEGER GENERATED ALWAYS AS (Cantidad * ValorUnitario) STORED
);
CREATE INDEX ix_detallePedido_pedido ON detallePedido(IdPedido);

-- -------------------------------------------------------------- adjuntos
-- Sustituye a los campos Attachment de Access (clientes.Carpeta,
-- empleados.archivo, infoSemilla.Archivo, productos.archivo).
CREATE TABLE adjuntos (
  id             INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  tabla          TEXT    NOT NULL CHECK (tabla IN ('clientes','empleados','infoSemilla','productos')),
  registro_id    TEXT    NOT NULL,
  nombre_archivo TEXT    NOT NULL,
  mime           TEXT    NOT NULL,
  bytes          INTEGER NOT NULL,
  sha256         TEXT    NOT NULL,
  r2_key         TEXT    NOT NULL UNIQUE,
  creado_en      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX ix_adjuntos_registro ON adjuntos(tabla, registro_id);

-- ----------------------------------------------------------- _cuarentena
-- Ninguna fila se descarta en silencio: lo que no pasa una validacion queda
-- aqui con la regla que incumplio y el valor original.
CREATE TABLE _cuarentena (
  id           INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  tabla_origen TEXT    NOT NULL,
  pk_origen    TEXT    NOT NULL,
  regla        TEXT    NOT NULL,
  columna      TEXT,
  valor        TEXT,
  accion       TEXT    NOT NULL,
  detalle_json TEXT,
  creado_en    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX ix_cuarentena_tabla ON _cuarentena(tabla_origen);
