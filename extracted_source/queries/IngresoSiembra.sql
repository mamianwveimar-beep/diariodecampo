INSERT INTO actividades ( codigosistema, codSemilla, fechasiembra, Actividad, semanaAbono, cantidadAbono, lote, cama, numeroPlantas, detalle, costo, unidad )
SELECT programacionCultivos.codigosistema, programacionCultivos.codSemilla, programacionCultivos.fechasiembra, "Siembra" AS Actividad, Format$(([fechasiembra]),"ww",0,0) AS semana1, 1.3 AS cMin, programacionCultivos.lote, programacionCultivos.cama, programacionCultivos.numeroPlantasSembradas, "Siembra" AS Detalle, 1.46 AS costo, "Min" AS unidad
FROM infoSemilla INNER JOIN programacionCultivos ON infoSemilla.[Id] = programacionCultivos.[codSemilla];

