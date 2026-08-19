INSERT INTO costosInsumos ( concepto, detalle, fecha, unidad, valorUnitario, programacionCultivoCodCultivo, cantidad, producto )
SELECT "Siembra" AS siembra, "Siembra" AS Detalle, programacionCultivos.fechasiembra, "hora" AS Hora, 8807 AS valor, programacionCultivos.codigosistema, ([numeroPlantasSembradas]*1.5)/60 AS cantidad, 999 AS Expr1
FROM programacionCultivos;
