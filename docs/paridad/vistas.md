# Paridad de las consultas SELECT

Generado: 2026-08-20T01:10:16.155Z
Tolerancia numerica: 0.000001 relativa.
Access ejecutado con fecha 2026-08-19 y fechaInicial 1900-01-01.

| Consulta | Filas Access | Filas D1 | Columnas | Diferencias | Divergencias previstas | Resultado |
|---|---:|---:|---:|---:|---:|:---:|
| `ActualizarAbonamiento` | 15 | 15 | 8 | 0 | 0 | igual |
| `cCostosActividades` | 157 | 157 | 16 | 0 | 0 | igual |
| `cCostosInsumos` | 76 | 76 | 11 | 0 | 0 | igual |
| `cInventarioCampo` | 15 | 15 | 13 | 0 | 0 | igual |
| `cInventarioProductos` | 10 | 10 | 10 | 0 | 10 | igual |
| `cosecha Consulta` | 7 | 7 | 9 | 0 | 0 | igual |
| `cProgramacionSiembra` | 4 | 4 | 12 | 0 | 0 | igual |
| `cProgramacionCultivosAbonamiento` | 15 | 15 | 12 | 0 | 1 | igual |
| `cProgramacionCultivo` | 20 | 20 | 58 | 0 | 0 | igual |

## Divergencias deliberadas

No son fallos: la migracion se aparta de Access a proposito y se comprueba
que la diferencia sea exactamente la prevista.

### `cInventarioProductos` — 10 valores

En Access era Texto(42) con formato dd/MM/yyyy; en D1 es una fecha real. Mismo dia, distinta representacion.

### `cProgramacionCultivosAbonamiento` — 1 valores

Access numera la semana segun la configuracion regional del equipo, que aqui esta en lunes. La migracion la fija en domingo, que es la regla con la que se generaron las 157 actividades existentes. Se comprueba que D1 devuelve exactamente la regla de domingo.
