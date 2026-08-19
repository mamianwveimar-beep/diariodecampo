INSERT INTO costosInsumos ( programacionCultivoCodCultivo, concepto, detalle, fecha, unidad, cantidad, valorUnitario, producto )
SELECT programacionCultivos.codigosistema, "Abonamiento" AS Concepto, productos.nombreProducto, programacionCultivos.fechasiembra, productos.unidad, (([infoSemilla]![abonoSiembra]+[infoSemilla]![abonoPrimera]+[infoSemilla]![abonoSegunda]+[infoSemilla]![abonoTercera])*[programacionCultivos]![numeroPlantasSembradas]) AS Cantidad, productos.valorUnidad, productos.id
FROM productos, infoSemilla INNER JOIN programacionCultivos ON infoSemilla.Id = programacionCultivos.codSemilla
WHERE (((productos.id)=3));
