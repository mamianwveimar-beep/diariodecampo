INSERT INTO costosInsumos ( programacionCultivoCodCultivo, concepto, detalle, fecha, unidad, cantidad, valorUnitario, producto )
SELECT programacionCultivos.codigosistema, "Abonamiento" AS concepto, productos.nombreProducto, programacionCultivos.fechasiembra, productos.unidad, [infoSemilla]![abonoLiquido]*([infoSemilla]![ciclo]/15)*[programacionCultivos]![numeroPlantasSembradas] AS cantidad, productos.valorUnidad, productos.id
FROM productos, infoSemilla INNER JOIN programacionCultivos ON infoSemilla.Id = programacionCultivos.codSemilla
WHERE (((productos.id)=4));
