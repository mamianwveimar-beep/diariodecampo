SELECT programacionCultivos.codigosistema, programacionCultivos.codSemilla, programacionCultivos.fechasiembra, Format$(([fechasiembra]+25),"ww",0,0) AS semana1, infoSemilla.abonoPrimera, programacionCultivos.numeroPlantasSembradas, programacionCultivos.lote, programacionCultivos.cama
FROM infoSemilla INNER JOIN programacionCultivos ON infoSemilla.[Id] = programacionCultivos.[codSemilla];
