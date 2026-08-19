-- =====================================================================
-- Vistas traducidas desde las consultas SELECT de Access.
--
-- De las 9 consultas SELECT del origen, 7 se traducen a vistas.
-- Las otras 2 (cProgramacionCultivo y cProgramacionCultivosAbonamiento)
-- usan Date(), que en un Worker resolveria en UTC y adelantaria el dia
-- entre las 19:00 y medianoche hora de Colombia. Van como funciones
-- parametrizadas en api/src/queries/, no como vistas.
--
-- Equivalencias verificadas contra los datos reales:
--   Format$(d,"ww",0,0)  ->  CAST(strftime('%U', d) AS INTEGER) + 1
--   Weekday(d)           ->  CAST(strftime('%w', d) AS INTEGER) + 1
--   [fecha] + n          ->  date(fecha, '+n day')
-- =====================================================================

-- ------------------------------------------------- ActualizarAbonamiento
CREATE VIEW ActualizarAbonamiento AS
SELECT pc.codigosistema,
       pc.codSemilla,
       pc.fechasiembra,
       CAST(strftime('%U', date(pc.fechasiembra, '+25 day')) AS INTEGER) + 1 AS semana1,
       s.abonoPrimera,
       pc.numeroPlantasSembradas,
       pc.lote,
       pc.cama
FROM infoSemilla s
     INNER JOIN programacionCultivos pc ON s.Id = pc.codSemilla;

-- ---------------------------------------------------- cCostosActividades
-- Origen de infCostosActividadesXSemana e infoCostosActividadesXCultivo.
CREATE VIEW cCostosActividades AS
SELECT a.id,
       a.codigoSistema,
       a.codsemilla,
       a.fechaSiembra,
       a.semanaAbono,
       a.Actividad,
       a.cantidadAbono,
       a.numeroPlantas,
       a.unidad,
       a.costo,
       a.total,
       a.lote,
       a.cama,
       a.detalle,
       a.responsable,
       a.costo * a.total AS GTotal
FROM actividades a;

-- -------------------------------------------------------- cCostosInsumos
CREATE VIEW cCostosInsumos AS
SELECT ci.Id,
       ci.concepto,
       ci.detalle,
       ci.fecha,
       ci.unidad,
       ci.cantidad,
       ci.valorUnitario,
       ci.programacionCultivoCodCultivo,
       ci.valorTotal,
       ci.observaciones,
       pc.codSemilla
FROM programacionCultivos pc
     INNER JOIN costosInsumos ci ON pc.codigosistema = ci.programacionCultivoCodCultivo
GROUP BY ci.Id, ci.concepto, ci.detalle, ci.fecha, ci.unidad, ci.cantidad,
         ci.valorUnitario, ci.programacionCultivoCodCultivo, ci.valorTotal,
         ci.observaciones, pc.codSemilla;

-- ------------------------------------------------------- cInventarioCampo
-- Origen de infInventarioCampo. En Access el filtro iba en HAVING sobre
-- activo=True; aqui activo es 0/1.
CREATE VIEW cInventarioCampo AS
SELECT pc.codigosistema,
       pc.codSemilla,
       pc.fechasiembra,
       pc.lote,
       pc.cama,
       MIN(c.fechaCosecha) AS InicioCosecha,
       MAX(c.fechaCosecha) AS FinalCosecha,
       pc.numeroPlantasSembradas,
       SUM(c.numeroPlantasCosechadas) AS SumaDenumeroPlantasCosechadas,
       SUM(c.peso) AS kilosCosechados,
       s.cantidadPeriodoSiembra AS Pedido,
       pc.activo,
       s.ciclo
FROM infoSemilla s
     INNER JOIN programacionCultivos pc ON s.Id = pc.codSemilla
     LEFT JOIN cosecha c ON pc.codigosistema = c.codigosistema
GROUP BY pc.codigosistema, pc.codSemilla, pc.fechasiembra, pc.lote, pc.cama,
         pc.numeroPlantasSembradas, s.cantidadPeriodoSiembra, pc.activo, s.ciclo
HAVING pc.activo = 1;

-- --------------------------------------------------- cInventarioProductos
-- Origen de infInventarioProductos. El DISTINCTROW de Access no tiene
-- equivalente ni efecto aqui: el GROUP BY sobre todas las columnas basta.
CREATE VIEW cInventarioProductos AS
SELECT ip.Id,
       ip.concepto,
       ip.producto,
       ip.ingreso,
       ip.salida,
       ip.fecha,
       ip.empleado,
       ip.descripcion,
       ip.cliente,
       ip.saldo
FROM inventarioProductos ip
GROUP BY ip.Id, ip.concepto, ip.producto, ip.ingreso, ip.salida, ip.fecha,
         ip.empleado, ip.descripcion, ip.cliente, ip.saldo;

-- ------------------------------------------------------- cosecha Consulta
-- El nombre lleva un espacio en el origen; se conserva entrecomillado.
CREATE VIEW "cosecha Consulta" AS
SELECT c.Id,
       c.codigosistema,
       c.fechaCosecha,
       c.peso,
       c.pesoPromedio,
       c.numeroPlantasCosechadas,
       c.remision,
       c.factura,
       c.observacion
FROM cosecha c;

-- ---------------------------------------------------- cProgramacionSiembra
-- Origen de infProgramacionSiembra. Access permite reutilizar un alias
-- calculado dentro del mismo SELECT; SQLite no, de ahi la CTE.
-- Nota: si Perdida, area o anchoPromedioHera valen 0, Access da error de
-- division por cero y SQLite devuelve NULL. Es la unica diferencia de
-- comportamiento conocida en esta vista.
CREATE VIEW cProgramacionSiembra AS
WITH base AS (
  SELECT semilla, variedad, cantidadPeriodoSiembra, tiempoCosecha, periodoSiembra,
         ciclo, Perdida, area, anchoPromedioHera
  FROM infoSemilla
  WHERE cantidadPeriodoSiembra <> 0
),
calc AS (
  SELECT base.*,
         cantidadPeriodoSiembra * (tiempoCosecha / 7.0)                  AS cantidakgTiempoCosecha,
         (ciclo * 1.0) / tiempoCosecha                                   AS numeroLote,
         ((tiempoCosecha / 7.0) * cantidadPeriodoSiembra) / Perdida      AS areaLote
  FROM base
)
SELECT semilla,
       variedad,
       cantidadPeriodoSiembra                     AS Pedido,
       cantidakgTiempoCosecha,
       periodoSiembra                             AS FrecuanciaSiembra,
       numeroLote,
       areaLote,
       areaLote / area                            AS numeroPlantasLote,
       areaLote * numeroLote                      AS TotalArea,
       areaLote / anchoPromedioHera               AS metrosLinealesLote,
       (areaLote / anchoPromedioHera) * numeroLote AS TotalMetrosLineales,
       cantidadPeriodoSiembra
FROM calc;
