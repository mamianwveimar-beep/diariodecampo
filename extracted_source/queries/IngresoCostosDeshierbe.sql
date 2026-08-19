INSERT INTO costosInsumos ( concepto, detalle, fecha, unidad, valorUnitario, programacionCultivoCodCultivo, cantidad, producto )
SELECT "Deshierbe" AS deshierbe, "Deshierbe" AS Detalle, programacionCultivos.fechasiembra, "hora" AS Hora, 8807 AS valor, programacionCultivos.codigosistema, ([numeroPlantasSembradas]*2)/60 AS cantidad, 999 AS Expr1
FROM programacionCultivos;

