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
npm run paridad  # las 22 consultas de acción frente a un oráculo independiente

cd ../web
npm run humo          # recorre las 12 pantallas con un navegador real
npm run humo:siembra  # rellena y guarda un alta de siembra por lotes
npm run humo:actividad # alta por lotes de labores, con una línea que falla a propósito
npm run humo:orden    # registra una orden y compara la vista previa por semana
                       # contra lo que el backend deja guardado de verdad
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
| `GET /api/ordenes/pendientes` | Siembras que nadie ha registrado en campo |
| `GET /api/ordenes/:codigo` | Una orden, con la ficha de su semilla resuelta |
| `POST /api/ordenes/:codigo` | Registra la siembra y programa la temporada del cultivo |
| `GET /api/procesos` | Catálogo de las 22 consultas de acción |
| `POST /api/procesos/:nombre` | Ejecuta una; devuelve cuántas filas entraron |
| `POST /api/procesos/lote/:lote` | Ejecuta un lote, como las macros de Access |
| `GET /api/adjuntos/:tabla/:registroId` | Adjuntos de un registro |
| `GET /api/adjuntos/:id/contenido` | Descarga el archivo desde R2 |
| `GET /api/cuarentena` | Las 74 filas que no pasaron una validación |

## La interfaz

Los 14 formularios de Access se consolidan en 11 pantallas, más cuatro nuevas:
el alta de siembra por lotes, el alta de actividades por lotes, la orden de
siembra y la cuarentena. Los tres subformularios dejan de
ser objetos aparte y viven dentro de su pantalla contenedora.

| Pantalla | Sustituye a |
|---|---|
| Inicio | `InicioDiarioCampo` |
| Registrar siembra | — (nueva: alta por lotes) |
| Órdenes de siembra | — (nueva: el registro del operario en campo) |
| Registrar actividades | — (nueva: alta por lotes de labores) |
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

### Orden de siembra

Programar una siembra y ejecutarla son dos momentos distintos, y hasta ahora
el sistema solo conocía el primero. **Órdenes de siembra** es la pantalla del
operario: lista las siembras que nadie ha registrado todavía en campo y, al
elegir una, deja anotar lo que de verdad pasó.

Lo que la ordena es el permiso, y es toda su idea visual: **el operario solo
puede tocar cuatro cosas** —lote, cama, cantidad real sembrada y el motivo de
la merma—, y lo demás se marca como cerrado con la etiqueta de quién lo pone.
Los insumos del día de siembra y el peso que hay que cargar al campo salen de
la ficha de la semilla y se recalculan con las plantas reales.

- El **motivo de la merma es obligatorio** cuando lo sembrado no llega a lo
  planificado. El botón se bloquea y dice por qué; el backend lo rechaza
  igualmente, así que la regla no depende de la pantalla.
- Al guardar, **queda programada la temporada completa de ese cultivo**: las 21
  consultas idempotentes acotadas a él con `sqlPorCultivo()`. Ya no hace falta
  pulsar «Generar programación».
- La programación se calcula sobre las **plantas reales**, no las planificadas,
  y el área se recalcula igual. Las actividades que ya existieran se ponen al
  día con la cantidad, el lote y la cama que registró el operario.
- `salidaAbono` queda **fuera** de ese lote: es la única consulta sin
  `ON CONFLICT`, y repetirla duplicaría el movimiento de almacén.
- `fechaRegistroSiembra` a NULL es lo que mantiene una siembra en la lista.
  Registrar dos veces devuelve un 409, no un duplicado.

La tarjeta **Programación de la temporada** muestra, por semana, lo que se va
a generar —actividades, cantidades y el peso de esa semana—, con pestañas como
las de Actividades y costos. **La semana de la siembra es editable**: son las
labores que el operario acaba de ejecutar, así que puede corregir la cantidad
y el costo reales si no coinciden con lo calculado, y el pie recalcula el peso
y el costo de la semana en vivo. Las demás semanas son previsualización de solo
lectura, y la etiqueta de la tarjeta lo dice según la que estés viendo.

Al guardar, **solo la semana de la siembra viaja en el POST y solo esa queda
registrada** (`actividades.fechaRegistro` con fecha). El resto de la temporada
se programa igual pero con `fechaRegistro` en NULL: existe para registrarse
cuando llegue su semana, pero nadie ha dicho todavía que se haya hecho. Son
tres estados y los tres significan algo distinto —fila inexistente, fila sin
registrar, fila registrada—, donde Access solo tenía uno.

Dentro de esa semana hay un botón **Agregar actividad adicional**, para las
novedades que no salen de ninguna ficha: una preparación extra por suelo
húmedo, un Basilus por hallazgo de plaga. Esas filas traen los cinco campos
abiertos —actividad, detalle, cantidad, unidad y costo— y suman al peso y al
costo de la semana en cuanto se escriben.

**Una novedad se guarda dos veces, y a propósito**: como labor en
`actividades` y además como línea propia en `costosInsumos`, porque también
cuesta dinero. Las de la ficha no abren línea de costo: sus costos ya los
generan `actualizarCostosAbonamiento` y las `IngresoCostos*`, y duplicarlos
inflaría el coste del cultivo.

Como `costosInsumos.producto` es `NOT NULL` con clave foránea y el detalle es
texto libre, el backend intenta primero casar ese detalle con un
`nombreProducto` del catálogo —así una novedad de «Basilus» queda enlazada al
producto real— y solo cuando no encaja usa `productos.997` («Otro insumo»), la
tercera fila de referencia junto a la cal dolomita y la mano de obra.

**Solo `Kg` y `Litro` suman al peso** que se carga al campo. El minutaje de
mano de obra cuesta pero no se lleva al hombro, y como la unidad de una
novedad la escribe el operario, la regla mira la unidad y no el tipo de labor.

Dos detalles más. Las filas del operario se insertan **antes**
que la generación automática, así que las que ésta produciría para esa misma
semana chocan contra `ux_actividades_access` y se descartan solas: lo escrito a
mano gana sobre lo calculado sin tratarlo aparte. Y como `actividades.total` es
una columna GENERATED, lo que se envía no es el total que se ve sino la tasa
por planta y el costo unitario, despejados de lo que escribió el operario.

Las filas todavía no existen en la base cuando se ven -el backend las crea
recién al guardar-, así que la previsualización la calcula
`web/src/app/nucleo/plan-siembra.ts` en el propio navegador, replicando los
mismos días de desfase y condiciones de `consultas-accion.mjs`. Guardar sigue
programando el resto de la temporada; lo que cambia es qué queda registrado.

Esa duplicación de lógica —el calendario vive escrito dos veces, una en SQL
y otra en TypeScript— es una decisión consciente, no un descuido: no hay forma
de previsualizar sin ejecutar sin repetir la fórmula en alguna parte, y
repetirla en un módulo puro y comentado es más simple que exponer un endpoint
de "simulación" que ande generando y deshaciendo filas reales. El riesgo que
abre -que las dos copias se desincronicen- lo cierra `humo-orden.mjs`: compara,
semana a semana, lo que la pantalla predijo contra lo que el backend dejó
guardado de verdad para esa misma siembra.

### Alta de actividades por lotes

**Registrar actividades** es la hermana de «Registrar siembra» y comparte su
forma: una cabecera con la fecha, el tipo de labor y el insumo, y una línea por
cada cama a la que se le hace. Sirve para las labores recurrentes —la segunda
abonada, el abono líquido, un deshierbe— sin repetir la cabecera en cada fila.

La diferencia con la siembra es de dónde salen los datos: allí la línea **crea**
el cultivo, aquí lo **elige**, y de él hereda semilla, fecha de siembra, plantas,
lote y cama. Por eso lo que se hereda de la línea anterior es la dosis y el
responsable, no la cama: la cama ya viene dada por el cultivo.

Dos campos del esquema se confunden con facilidad, y confundirlos rompe el
índice único y los informes:

- `fechaSiembra` es la del **cultivo**, no la de la labor. Sale de cada línea.
- `semanaAbono` es la semana de la **labor**, calculada de la fecha de la
  cabecera con la misma regla de domingo que usa el backend.

El guardado va línea a línea: si una falla, las demás entran igual y la fallida
se queda en pantalla, editable y con su motivo. El caso típico es repetir el
mismo cultivo dos veces en la misma jornada, que choca contra
`ux_actividades_access`; la pantalla lo avisa antes de intentarlo.

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
- **Los choques de restricción son 409, no 500.** El CRUD genérico traduce los
  errores de SQLite (`UNIQUE`, `FOREIGN KEY`, `CHECK`, `NOT NULL`) a una respuesta
  con cuerpo legible. Antes salían como un 500 mudo y la pantalla solo podía
  enseñar «Http failure response», que no le dice nada a nadie. Lo que no es una
  restricción se vuelve a lanzar y sigue siendo un 500, para no disfrazar un
  fallo de verdad.
- **Las consultas de acción usan `ON CONFLICT DO NOTHING`**, que reproduce el
  descarte silencioso de Access ante la clave compuesta, pero informando de
  cuántas filas se omitieron.
- **Nada se descarta en silencio en la carga:** lo que no pasa una validación
  queda en `_cuarentena` con la regla incumplida y el valor original.
- **Lo planificado y lo sembrado son dos columnas distintas.** Access solo
  tenía `numeroPlantasSembradas`, así que no había forma de saber si una siembra
  había salido corta. **Registrar siembra** escribe las dos con el mismo valor
  y la orden del operario las separa: `numeroPlantasSembradas` pasa a ser lo que
  de verdad entró y `numeroPlantasPlanificadas` se queda como estaba. El histórico
  migrado las tiene en NULL —no se sabe y no se inventa—, y para esas siembras
  la pantalla compara contra lo que llevaran anotado, y lo dice.
- **Se añaden dos consultas de acción que Access no tenía**, y son la única
  divergencia deliberada en la generación de actividades: `IngresoAbonoSiembra`
  y `IngresoCalDolomita`. `infoSemilla` guardaba `abonoSiembra` y `calDolomita`
  desde 2021, pero ninguna consulta generaba una labor con ellos: `abonoSiembra`
  solo entraba en la suma de `actualizarCostosAbonamiento`, y `calDolomita` no se
  usaba en ninguna parte. Son los dos insumos que se aplican al sembrar, así que
  ahora generan su actividad como cualquier otro abonamiento. **Un valor en 0 o
  vacío significa que esa semilla no lo usa** y queda fuera sola, igual que
  `abonoSegunda` y `abonoTercera`: de ahí que la dolomita solo salga para cebolla
  y brócoli. La comparación de las 9 vistas contra Access sigue en 0 diferencias
  porque estas consultas solo producen filas cuando se ejecutan; la foto migrada
  no se toca.
- **`lote` y `cama` son texto, no número**, en `programacionCultivos` y en
  `actividades`. En Access eran `Double`, pero en la práctica son códigos de
  identificación del terreno, no cantidades, y pueden llevar letras (`A1`,
  `L-09`). La cama se sigue autoincrementando sola al añadir una línea en
  **Registrar siembra**, pero solo cuando el valor anterior es un número puro;
  si trae letras, se copia tal cual porque no hay una forma automática de
  saber cuál es «la siguiente».

## Evidencia de paridad

`docs/paridad/` recoge lo que se ha comparado y con qué resultado:

| Archivo | Qué demuestra |
|---|---|
| `reconciliacion.md` | Filas y sumas de control, Access frente a D1, tabla por tabla |
| `vistas.md` | Las 9 consultas SELECT ejecutadas en el motor de Access y comparadas fila a fila. 58 columnas en trazabilidad, 0 diferencias |
| `consultas-accion.json` | Las 22 consultas de acción frente a una reimplementación independiente |

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
5. **El precio de la cal dolomita.** El origen nunca lo registró: no había
   producto, ni costo, ni movimiento de almacén. La migración crea
   `productos.998` con `valorUnidad = 0` a propósito, así que las actividades
   `CalDolomita` salen con coste 0 —visible— en vez de con un precio inventado.
   En cuanto se le ponga precio en la pantalla de Productos, el coste sale solo.
6. **Con qué día empieza la semana.** Está fijado en domingo para no partir el
   histórico, pero si la finca cuenta las semanas de lunes a domingo, se
   cambia `PRIMER_DIA_SEMANA` a 1 y se regeneran las actividades.
7. **Usuarios y permisos** para el despliegue en la nube. Hoy no hay ninguna
   autenticación: ver [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md).
