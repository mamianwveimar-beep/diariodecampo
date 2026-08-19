INSERT INTO actividades ( codigosistema, codSemilla, fechasiembra, Actividad, semanaAbono, cantidadAbono, lote, cama, numeroPlantas, detalle, unidad, costo )
SELECT programacionCultivos.codigosistema, programacionCultivos.codSemilla, programacionCultivos.fechasiembra, "AbonoLiquido" AS Actividad, Format$(([fechasiembra]+65),"ww",0,0) AS semana1, infoSemilla.abonoLiquido, programacionCultivos.lote, programacionCultivos.cama, programacionCultivos.numeroPlantasSembradas, productos.nombreProducto, productos.unidad, productos.valorUnidad
FROM productos, infoSemilla INNER JOIN programacionCultivos ON infoSemilla.[Id] = programacionCultivos.[codSemilla]
WHERE (((productos.id)=4) AND ((infoSemilla.ciclo)>65));
