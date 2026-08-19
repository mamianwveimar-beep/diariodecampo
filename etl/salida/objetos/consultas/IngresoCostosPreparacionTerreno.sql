INSERT INTO costosInsumos ( concepto, detalle, fecha, unidad, valorUnitario, programacionCultivoCodCultivo, cantidad, producto )
SELECT "Preparacion Terreno" AS pTerreno, "Preparacion Terreno" AS Detalle, programacionCultivos.fechasiembra, "hora" AS Hora, 8807 AS valor, programacionCultivos.codigosistema, [numeroPlantasSembradas]/60 AS cantidad, 999 AS Expr1
FROM programacionCultivos;
