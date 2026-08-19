INSERT INTO actividades ( codigosistema, codSemilla, fechasiembra, Actividad, semanaAbono, cantidadAbono, lote, cama, numeroPlantas, detalle, costo, unidad )
SELECT programacionCultivos.codigosistema, programacionCultivos.codSemilla, programacionCultivos.fechasiembra, "Deshierbe" AS Actividad, Format$(([fechasiembra]+50),"ww",0,0) AS semana1, 1.2 AS cMin, programacionCultivos.lote, programacionCultivos.cama, programacionCultivos.numeroPlantasSembradas, "SegundoDeshierbe" AS Detalle, 1.46 AS costo, "Min" AS unidad
FROM infoSemilla INNER JOIN programacionCultivos ON infoSemilla.[Id] = programacionCultivos.[codSemilla]
WHERE (((infoSemilla.ciclo)>50));

