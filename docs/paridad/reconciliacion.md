# Reconciliacion de la carga

Generado: 2026-08-20T01:03:41.520Z

## Filas por tabla

| Tabla | Origen (Access) | Destino (D1) | Coincide | Suma de control |
|---|---:|---:|:---:|---:|
| `actividades` | 157 | 157 | si | 18808.88 |
| `costosInsumos` | 76 | 76 | si | 7197099.0583 |
| `cosecha` | 7 | 7 | si | 12 |
| `programacionCultivos` | 15 | 15 | si | 3686 |
| `inventarioProductos` | 10 | 10 | si | 598.72 |
| `detallePedido` | 15 | 15 | si | 94280 |
| `pedido` | 5 | 5 | si | 4800 |
| `clientes` | 2 | 2 | si | - |
| `empleados` | 2 | 2 | si | 2500000 |
| `infoSemilla` | 4 | 4 | si | 289 |
| `productos` | 8 | 8 | si | 26807 |
| `ciudad` | 5 | 5 | si | - |
| `adjuntos` | 8 | 8 | si | 1426352 |

## Vistas

| Vista | Filas |
|---|---:|
| `ActualizarAbonamiento` | 15 |
| `cCostosActividades` | 157 |
| `cCostosInsumos` | 76 |
| `cInventarioCampo` | 15 |
| `cInventarioProductos` | 10 |
| `cosecha Consulta` | 7 |
| `cProgramacionSiembra` | 4 |

## Cuarentena

| Tabla | Regla | Accion | Filas |
|---|---|---|---:|
| `empleados` | entero_a_texto | convertida | 5 |
| `costosInsumos` | fk_producto_centinela | reparada | 50 |
| `inventarioProductos` | fk_cultivo_cero | a_null | 2 |
| `inventarioProductos` | fk_cultivo_inexistente | a_null | 8 |
| `detallePedido` | fk_semilla_inexistente | conservada_sin_fk | 9 |
