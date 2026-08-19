SELECT actividades.id, actividades.codigoSistema, actividades.codsemilla, actividades.fechaSiembra, actividades.semanaAbono, actividades.Actividad, actividades.cantidadAbono, actividades.numeroPlantas, actividades.unidad, actividades.costo, actividades.total, actividades.lote, actividades.cama, actividades.detalle, actividades.responsable, [costo]*[total] AS GTotal
FROM actividades;
