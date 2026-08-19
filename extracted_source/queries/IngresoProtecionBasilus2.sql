INSERT INTO actividades ( codigosistema, codSemilla, fechasiembra, Actividad, semanaAbono, cantidadAbono, lote, cama, numeroPlantas, detalle, unidad, costo )
SELECT programacionCultivos.codigosistema, programacionCultivos.codSemilla, programacionCultivos.fechasiembra, "ProteccionVegetal" AS Actividad, Format$(([fechasiembra]+50),"ww",0,0) AS semana1, infoSemilla.abonoLiquido, programacionCultivos.lote, programacionCultivos.cama, programacionCultivos.numeroPlantasSembradas, productos.nombreProducto, productos.unidad, productos.valorUnidad
FROM productos, infoSemilla INNER JOIN programacionCultivos ON infoSemilla.[Id] = programacionCultivos.[codSemilla]
WHERE (((productos.id)=5) AND ((infoSemilla.Aplicacion1)>=1));

