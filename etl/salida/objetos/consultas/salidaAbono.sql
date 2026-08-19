INSERT INTO inventarioProductos ( concepto, fecha, salida, producto, codigoSistemaProgramacion )
SELECT "Abonamiento" AS Expr1, programacionCultivos.fechasiembra, (([infoSemilla]![abonoSiembra]+[infoSemilla]![abonoPrimera]+[infoSemilla]![abonoSegunda]+[infoSemilla]![abonoTercera])*[programacionCultivos]![numeroPlantasSembradas]/1000) AS Expr3, productos.id, programacionCultivos.codigosistema
FROM productos, infoSemilla INNER JOIN programacionCultivos ON infoSemilla.Id = programacionCultivos.codSemilla
WHERE (((productos.id)=3));
