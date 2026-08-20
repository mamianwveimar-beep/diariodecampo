# Plan: Interfaz de configuración de costos de mano de obra

## Objetivo
Crear una pantalla de configuración donde el usuario ingrese el jornal por hora (salario), y el sistema derive automáticamente el costo por minuto. Todos los cálculos de mano de obra (Preparación de terreno, Siembra, Deshierbe, Cosecha) deben usar ese valor.

## Estado actual del problema
- El costo por minuto (1,46 $) y el jornal (8.807 $/h) están hardcodeados en 4 sitios:
  - `api/src/queries/consultas-accion.mjs`: constantes `JORNAL_HORA` y `COSTO_MINUTO`
  - `api/src/index.ts`: `COSTO_MINUTO_COSECHA = 1.46`
  - `web/src/app/nucleo/plan-siembra.ts`: `COSTO_MINUTO = 1.46`
  - `db/migrations/0003_seed_ref.sql`: seed inicial
- La tabla `parametrosCostos` existe en D1 con columnas `jornalHora` y `costoMinuto`, pero **no se usa** en la lógica de cálculo.
- La pantalla nueva debe reemplazar estos valores hardcodeados por valores dinámicos.

## Decisiones tomadas

1. **Forma de cálculo**: El usuario ingresa `jornalHora` (salario por hora). `costoMinuto` se calcula como `jornalHora / 60`. No se edita directamente.
2. **Alcance del cambio**: Al cambiar el jornal, **solo afecta actividades nuevas** generadas a partir de ese momento. No se recalcula el histórico.
3. **Quién edita**: Solo administración. Sin permisos granulares todavía.
4. **Pantalla**: Componente nuevo `Configuracion` en ruta `/configuracion`, dentro del grupo `Gestión` del menú lateral.

## Tareas de implementación

### Backend (`api/`)

**1.1 Leer parámetros al construir consultas de acción**
- En `api/src/queries/consultas-accion.mjs`:
  - `construirConsultasAccion()` ya recibe `jornalHora` y `costoMinuto` como parámetros.
  - En `api/src/index.ts`, antes de ejecutar cualquier proceso, leer `SELECT jornalHora, costoMinuto FROM parametrosCostos WHERE id = 1`.
  - Pasar esos valores a `construirConsultasAccion()` en vez de los defaults.
- En `api/src/index.ts` línea 480: reemplazar `const COSTO_MINUTO_COSECHA = 1.46;` por el valor leído de `parametrosCostos`.

**1.2 Exponer endpoint de parámetros**
- El CRUD genérico ya expone `/api/tablas/parametrosCostos`. Verificar que funciona para GET/PUT.
- Si no está en `TABLAS`, agregarlo en `api/src/repos/tablas.mjs`.

**1.3 Actualizar seed**
- En `db/migrations/0003_seed_ref.sql`, el seed actual es correcto (1 fila con `jornalHora = 8807`, `costoMinuto = 1.46`).

### Frontend (`web/`)

**2.1 Nueva pantalla `Configuracion`**
- Archivo: `web/src/app/paginas/configuracion.ts`
- Ruta: `/configuracion` en `web/src/app/app.routes.ts`
- Menú: agregar `<a routerLink="/configuracion">Configuración</a>` en el grupo `Gestión` de `web/src/app/app.ts`

**2.2 Contenido de la pantalla**
- Mostrar una tarjeta con:
  - Campo editable: `Jornal por hora (COP)` — número entero, requerido, mayor a 0.
  - Campo solo lectura: `Costo por minuto (COP)` — calculado como `jornalHora / 60`, mostrado con 2 decimales.
  - Botón `Guardar`.
- Al guardar, hacer `PUT /api/tablas/parametrosCostos/1` con `{ jornalHora: valor }`.
- `costoMinuto` no se envía: se calcula en el backend al leer el registro, o se calcula en el frontend solo para mostrar.

**2.3 Consumir parámetros en el frontend**
- En `web/src/app/nucleo/plan-siembra.ts`:
  - Reemplazar `const COSTO_MINUTO = 1.46;` por un valor leído de la API.
  - Opción A: cargar `parametrosCostos/1` al iniciar la app (en `Api` o en `PlanSiembra`).
  - Opción B: inyectar el valor desde un servicio global.
- En `web/src/app/nucleo/plan-siembra.ts` líneas 51, 53, 67, 73, 117: usar el valor dinámico en lugar de la constante.

**2.4 Actualizar tipos si es necesario**
- Verificar que `web/src/app/nucleo/tipos.ts` tenga definido `ParametrosCostos` o usar `any` para la respuesta del CRUD genérico.

## Flujo de datos

```
Usuario edita "Jornal por hora" en /configuracion
  -> PUT /api/tablas/parametrosCostos/1 { jornalHora: 10000 }
  -> D1 actualiza la fila id=1
  -> Siguiente ejecución de proceso o registro de actividad lee jornalHora=10000
  -> costoMinuto = 10000 / 60 = 166.67
  -> Actividades nuevas usan 166.67 $/min
```

## Validación

1. **Manual**:
   - Ir a `/configuracion`, cambiar jornal a 10000, guardar.
   - Registrar una siembra, ver que el costo de PreparaciónTerreno/Siembra sale con el nuevo valor.
   - Ejecutar un proceso de acción desde `/api/procesos` y verificar que las filas insertadas usan el nuevo costo.

2. **Automatizada**:
   - Actualizar `web/humo-orden.mjs` línea 90: en vez de esperar 1.46, leer el valor actual de `parametrosCostos` y usarlo como expected.
   - Actualizar `web/humo-cosecha.mjs` línea 10, 90: mismo cambio.
   - Actualizar `api/test/paridad-consultas.mjs`: los tests de paridad usan `CONSTANTES.COSTO_MINUTO` como expected; deberían leer el seed actual (1.46) o mantener el hardcodeo porque el seed no cambia en tests.

## Riesgos y mitigaciones

- **Riesgo**: El backend cachea las consultas de acción al iniciar. Si el Worker se cachea, un cambio de jornal no se refleja hasta reiniciar.
  - **Mitigación**: En Cloudflare Workers, el código se vuelve a cargar en cada deploy. En local con `wrangler dev`, se recarga al cambiar archivos. No hay problema en práctica.
- **Riesgo**: El frontend lee `COSTO_MINUTO` al cargar la página. Si el usuario cambia el jornal en otra pestaña, esta pestaña no se actualiza.
  - **Mitigación**: No es un problema real porque el jornal no cambia varias veces al día. Si se desea, se puede recargar el valor al abrir `Registrar siembra` o `Registrar actividades`.

## Archivos afectados

| Archivo | Cambio |
|---|---|
| `api/src/queries/consultas-accion.mjs` | Leer parámetros en vez de defaults |
| `api/src/index.ts` | Pasar parámetros a `construirConsultasAccion()`; reemplazar `COSTO_MINUTO_COSECHA` |
| `api/src/repos/tablas.mjs` | Verificar que `parametrosCostos` esté en `TABLAS` |
| `web/src/app/app.routes.ts` | Agregar ruta `/configuracion` |
| `web/src/app/app.ts` | Agregar link en menú `Gestión` |
| `web/src/app/paginas/configuracion.ts` | Nuevo componente |
| `web/src/app/nucleo/plan-siembra.ts` | Reemplazar constante por valor dinámico |
| `web/src/app/nucleo/api.ts` | Opcional: método `parametrosCostos()` |
| `web/humo-orden.mjs` | Leer valor esperado de parámetros |
| `web/humo-cosecha.mjs` | Leer valor esperado de parámetros |
