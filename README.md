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
| 5 | Frontend Angular | Pendiente |
| 6 | Los 6 informes y su PDF | Pendiente |
| 7 | Aceptación con el usuario | Pendiente |
| 8 | Despliegue en Cloudflare | Pendiente |

## Estructura

```
origen/          el .accdb congelado, con su hash SHA-256
db/migrations/   esquema versionado: la única fuente de verdad
db/local/        base SQLite generada por el ETL (no se versiona)
etl/             extracción del .accdb y carga en D1
api/             Worker: Hono + D1 + R2
docs/paridad/    evidencia de equivalencia Access ↔ D1
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
```

## Comprobaciones

```bash
cd api
npm test        # equivalencias de fecha de Access sobre SQLite
npm run paridad # las 20 consultas de acción frente a un oráculo independiente
```

Ambas se apoyan en `db/local/diariodecampo.db`, así que hay que ejecutar antes
`node etl/03-cargar.mjs`.

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

## Decisiones que conviene conocer

- **Los nombres de Access se conservan tal cual**, incluidas sus incoherencias
  (`codigosistema` frente a `codigoSistema`) y el error tipográfico
  `clientes.Arcchivos`. SQLite no distingue mayúsculas en identificadores, y
  así la comparación contra el origen es directa.
- **`Date()` nunca se traduce como `date('now')`.** Los Workers corren en UTC y
  entre las 19:00 y la medianoche hora de Colombia devolverían el día
  siguiente. La fecha se calcula con `hoyBogota()` y se pasa como parámetro.
- **`Format$(fecha,"ww",0,0)` es `strftime('%U') + 1`**, verificado contra las
  156 filas de `actividades` que tienen semana calculada.
- **Cuatro columnas son `GENERATED`** porque en Access eran campos calculados:
  `actividades.total`, `costosInsumos.valorTotal`, `inventarioProductos.saldo`
  y `detallePedido.SubTotal`. Se leen pero no se escriben.
- **Las consultas de acción usan `ON CONFLICT DO NOTHING`**, que reproduce el
  descarte silencioso de Access ante la clave compuesta, pero informando de
  cuántas filas se omitieron.
- **Nada se descarta en silencio en la carga:** lo que no pasa una validación
  queda en `_cuarentena` con la regla incumplida y el valor original.

## Pendiente de decidir

Está detallado al final del plan. Lo que bloquea la fase 7:

1. Las **9 líneas de pedido** que apuntan a semillas borradas (Id 1, 14, 15,
   16, 17 y 212). Las otras 6 líneas son válidas.
2. Los **10 movimientos de inventario** cuyo cultivo ya no existe.
3. **Lechuga y fríjol** tienen `abonoSegunda` o `abonoTercera` vacíos en vez de
   cero, así que su coste de abonamiento sale nulo. Access hacía lo mismo.
4. Si siguen vigentes el **jornal de 8.807 pesos** y el **costo de 1,46** por
   minuto, incrustados desde 2021.
5. **Usuarios y permisos** para el despliegue en la nube. Hoy no hay ninguna
   autenticación.
