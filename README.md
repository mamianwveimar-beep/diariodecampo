# diarioDeCampo

Migración de `diarioDeCampo.accdb` (Microsoft Access) a una aplicación web con
**Angular** y **Cloudflare Workers + D1 + R2**.

El plan completo está en [PLAN_MIGRACION.html](PLAN_MIGRACION.html).

## Estado

| Fase | Qué es | Estado |
|---|---|---|
| 0 | Congelar el origen | Hecha |
| 1 | Re-extracción del `.accdb` | Hecha |
| 2 | Esquema de D1 | Hecha |
| 3 | ETL, cuarentena y reconciliación | Hecha |
| 4 | Worker, API y lógica agrícola | Hecha |
| 5 | Frontend Angular | Hecha |
| 6 | Los 6 informes y su PDF | Hecha |
| 7 | Aceptación | Hecha la parte automática; falta tu revisión |
| 8 | Despliegue en Cloudflare | Preparado; falta la cuenta y la autenticación |

## Estructura

```
origen/            el .accdb congelado, con su hash SHA-256
db/migrations/     esquema versionado: la única fuente de verdad
db/local/          base SQLite generada por el ETL (no se versiona)
etl/               extracción del .accdb y carga en D1
api/               Worker: Hono + D1 + R2
web/               aplicación Angular
docs/paridad/      evidencia de equivalencia Access ↔ D1
extracted_source/  extracción antigua, defectuosa. Solo referencia histórica
```

## Puesta en marcha

Requisitos: Node 22.5 o superior (por `node:sqlite`), y Microsoft Access con
el proveedor ACE OLEDB 16 solo si hay que volver a extraer del `.accdb`.

```bash
# 1. Re-extraer del .accdb (solo si cambió el origen). Requiere Windows + Access
powershell -File etl/01-extraer.ps1          # datos, esquema y adjuntos
powershell -File etl/02-extraer-objetos.ps1  # formularios, informes y VBA

# 2. Construir la base local y el seed, con reconciliación
node etl/03-cargar.mjs

# 3. Levantar la API contra D1 local
cd api
npm install
npm run migrar:local
npm run sembrar:local
node ../etl/04-subir-adjuntos.mjs    # las 8 fotos al R2 local
npm run dev                          # http://127.0.0.1:8787

# 4. Levantar la interfaz, en otra terminal
cd web
npm install
npm start                            # http://localhost:4200
```

`web/proxy.conf.json` redirige `/api` al Worker, así que en desarrollo basta
con tener los dos procesos en marcha.

## Comprobaciones

```bash
cd api
npm test         # equivalencias de fecha de Access sobre SQLite
npm run paridad  # las 20 consultas de acción frente a un oráculo independiente

cd ../web
npm run humo          # recorre las 12 pantallas con un navegador real
npm run humo:siembra  # rellena y guarda un alta de siembra por lotes
```

Las dos primeras se apoyan en `db/local/diariodecampo.db`, así que hay que
ejecutar antes `node etl/03-cargar.mjs`. La prueba de humo necesita el Worker
y `ng serve` en marcha, y deja capturas en `web/capturas/`.

Y la comparación contra el propio motor de Access, que es el núcleo de la
fase 7:

```bash
powershell -File etl/05-volcar-consultas-access.ps1   # ejecuta las 9 consultas en Access
node etl/06-comparar-paridad.mjs                      # compara fila a fila con D1
node etl/07-respaldo.mjs ensayo                       # respalda, restaura y compara
```

## La API

| Ruta | Qué hace |
|---|---|
| `GET /api/salud` | Estado y fecha de hoy en hora de Colombia |
| `GET /api/tablas` | Las 12 tablas expuestas |
| `GET /api/tablas/:tabla` | Listado con `limite` y `desde` |
| `GET·POST·PUT·DELETE /api/tablas/:tabla/:id` | Alta, consulta, edición y borrado |
| `GET /api/vistas/:nombre` | Las 7 vistas traducidas de Access |
| `GET /api/informes/trazabilidad?fechaInicial=` | `cProgramacionCultivo` |
| `GET /api/informes/programacion-abonamiento` | `cProgramacionCultivosAbonamiento` |
| `GET /api/procesos` | Catálogo de las 20 consultas de acción |
| `POST /api/procesos/:nombre` | Ejecuta una; devuelve cuántas filas entraron |
| `POST /api/procesos/lote/:lote` | Ejecuta un lote, como las macros de Access |
| `GET /api/adjuntos/:tabla/:registroId` | Adjuntos de un registro |
| `GET /api/adjuntos/:id/contenido` | Descarga el archivo desde R2 |
| `GET /api/cuarentena` | Las 74 filas que no pasaron una validación |

## La interfaz

Los 14 formularios de Access se consolidan en 11 pantallas, más dos nuevas:
el alta de siembra por lotes y la cuarentena. Los tres subformularios dejan de
ser objetos aparte y viven dentro de su pantalla contenedora.

| Pantalla | Sustituye a |
|---|---|
| Inicio | `InicioDiarioCampo` |
| Registrar siembra | — (nueva: alta por lotes) |
| Siembras y cosechas | `Frm_Siembra`, `SubFrm_Siembra`, `Frm_Datos`, `Frm_DatosCosecha` |
| Actividades y costos | `Frm_Costos`, `SubFrm_Costos`, `Frm_DatosCostos`, `Macro3` |
| Semillas | `frmInfoSemilla` |
| Movimientos | `frmInventarioProductos` |
| Productos | `frmProductos` |
| Clientes | `frmClientes` |
| Pedidos | `pedido`, `detallePedido Subformulario` |
| Empleados | — (Access no tenía formulario) |
| Informes | los 6 informes |
| Cuarentena | — (nueva) |

Cinco de esas pantallas (semillas, productos, clientes, empleados y almacén)
comparten forma, así que las genera un único componente a partir de las
definiciones de `web/src/app/nucleo/campos.ts`, en vez de repetir cinco
formularios casi iguales.

Los informes se imprimen con el diálogo del navegador, que en la práctica es
el que genera el PDF. `styles.css` lleva reglas `@media print` que ocultan la
navegación y los filtros.

### Alta de siembra por lotes

En Access, sembrar cinco variedades el mismo día obligaba a abrir `Frm_Datos`
cinco veces y reescribir la fecha y la factura en cada una. La pantalla
**Registrar siembra** tiene una cabecera —fecha y factura— y una línea por
variedad, lote y cama; cada línea se guarda como un cultivo de
`programacionCultivos`. No hace falta ningún cambio de esquema: es la misma
tabla, capturada como se siembra de verdad.

Detalles que conviene conocer:

- La semilla se elige con un **buscador**, no con una lista larga: se escribe
  y se filtra, con teclado o ratón.
- El **área se calcula sola**: plantas × marco de siembra, donde el marco es
  `infoSemilla.area` o, si falta, `entrePlanta × entreSurcos`. Para la cebolla
  son 0,12 m² por planta, así que 250 plantas dan 30 m².
- Ese cálculo **se puede sobrescribir**. Al hacerlo, el campo se desengancha,
  aparece un aviso con lo que habría dado el cálculo, y un botón devuelve al
  valor calculado.
- El **lote se hereda** de la línea anterior y la **cama se autoincrementa**,
  que es como se rellena una jornada de siembra.
- **Todos los cultivos entran activos.**
- Si una línea falla al guardar, las demás se guardan igual y la fallida se
  queda en pantalla con el motivo.

## Decisiones que conviene conocer

- **Los nombres de Access se conservan tal cual**, incluidas sus incoherencias
  (`codigosistema` frente a `codigoSistema`) y el error tipográfico
  `clientes.Arcchivos`. SQLite no distingue mayúsculas en identificadores, y
  así la comparación contra el origen es directa.
- **`Date()` nunca se traduce como `date('now')`.** Los Workers corren en UTC y
  entre las 19:00 y la medianoche hora de Colombia devolverían el día
  siguiente. La fecha se calcula con `hoyBogota()` y se pasa como parámetro.
- **La numeración de semanas de Access dependía del equipo.** `Format$(d,"ww",0,0)`
  no significa «domingo», sino «usa la configuración regional de Windows».
  Comprobado cambiando `iFirstDayOfWeek` en el registro: la misma fecha,
  2021-11-14, devuelve **47** con domingo y **46** con lunes. La migración lo
  fija de una vez en domingo (`PRIMER_DIA_SEMANA` en `access-compat/fechas.mjs`),
  que es la regla con la que se generaron las 157 actividades existentes:
  156/156 encajan, mientras que con lunes solo 142/156.
- **Tampoco vale `strftime('%U') + 1`.** Acierta casi siempre, pero se desvía
  una unidad en los años que empiezan en domingo, como 2023. Sobre el fixture
  de 785 fechas acierta 665/785; la expresión que usamos, 785/785.
- **Cuatro columnas son `GENERATED`** porque en Access eran campos calculados:
  `actividades.total`, `costosInsumos.valorTotal`, `inventarioProductos.saldo`
  y `detallePedido.SubTotal`. Se leen pero no se escriben.
- **Las consultas de acción usan `ON CONFLICT DO NOTHING`**, que reproduce el
  descarte silencioso de Access ante la clave compuesta, pero informando de
  cuántas filas se omitieron.
- **Nada se descarta en silencio en la carga:** lo que no pasa una validación
  queda en `_cuarentena` con la regla incumplida y el valor original.

## Evidencia de paridad

`docs/paridad/` recoge lo que se ha comparado y con qué resultado:

| Archivo | Qué demuestra |
|---|---|
| `reconciliacion.md` | Filas y sumas de control, Access frente a D1, tabla por tabla |
| `vistas.md` | Las 9 consultas SELECT ejecutadas en el motor de Access y comparadas fila a fila. 58 columnas en trazabilidad, 0 diferencias |
| `consultas-accion.json` | Las 20 consultas de acción frente a una reimplementación independiente |

Las divergencias que quedan son **deliberadas y verificadas una a una**: la
fecha del almacén (texto en Access, fecha real aquí) y la numeración de semana
que Access dejaba a merced del equipo.

## Pendiente de decidir

Está detallado al final del plan.

1. Las **9 líneas de pedido** que apuntan a semillas borradas (Id 1, 14, 15,
   16, 17 y 212). Las otras 6 líneas son válidas.
2. Los **10 movimientos de inventario** cuyo cultivo ya no existe.
3. **Lechuga y fríjol** tienen `abonoSegunda` o `abonoTercera` vacíos en vez de
   cero, así que su coste de abonamiento sale nulo. Access hacía lo mismo.
4. Si siguen vigentes el **jornal de 8.807 pesos** y el **costo de 1,46** por
   minuto, incrustados desde 2021.
5. **Con qué día empieza la semana.** Está fijado en domingo para no partir el
   histórico, pero si la finca cuenta las semanas de lunes a domingo, se
   cambia `PRIMER_DIA_SEMANA` a 1 y se regeneran las actividades.
6. **Usuarios y permisos** para el despliegue en la nube. Hoy no hay ninguna
   autenticación: ver [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md).
