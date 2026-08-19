/**
 * Las dos consultas SELECT de Access que no pueden ser vistas de SQL porque
 * dependen de Date(), y una de ellas ademas de un parametro que Access pedia
 * al usuario al abrirla.
 *
 * Date() no se traduce como date('now'): los Workers corren en UTC y entre
 * las 19:00 y la medianoche hora de Colombia devolveria el dia siguiente.
 * La fecha llega siempre como parametro enlazado desde hoyBogota().
 */

/**
 * cProgramacionCultivosAbonamiento
 * Semanas de las tres aplicaciones de abono solido y dias transcurridos.
 *
 * Parametros: ?1 = hoy en formato ISO (hoyBogota())
 */
export const SQL_PROGRAMACION_ABONAMIENTO = `
SELECT pc.codigosistema,
       pc.codSemilla,
       pc.fechasiembra,
       CAST(strftime('%U', ?1) AS INTEGER) + 1                                     AS semanaActual,
       CAST(julianday(?1) - julianday(pc.fechasiembra) AS INTEGER)                 AS "#dias",
       CAST(strftime('%U', date(pc.fechasiembra, '+25 day')) AS INTEGER) + 1       AS semana1,
       CAST(strftime('%U', date(pc.fechasiembra, '+50 day')) AS INTEGER) + 1       AS semana2,
       CAST(strftime('%U', date(pc.fechasiembra, '+75 day')) AS INTEGER) + 1       AS semana3,
       s.abonoPrimera,
       s.abonoSegunda,
       s.abonoTercera,
       pc.numeroPlantasSembradas
FROM infoSemilla s
     INNER JOIN programacionCultivos pc ON s.Id = pc.codSemilla
GROUP BY pc.codigosistema, pc.codSemilla, pc.fechasiembra, s.abonoPrimera,
         s.abonoSegunda, s.abonoTercera, pc.numeroPlantasSembradas`;

/**
 * cProgramacionCultivo  -  origen del informe infTrazabilidad.
 *
 * La consulta original tiene 30 columnas calculadas encadenadas. Access
 * permite reutilizar un alias dentro del mismo SELECT y resuelve el orden por
 * su cuenta; SQLite no, de ahi las CTE escalonadas.
 *
 * Weekday() de Access devuelve 1=domingo ... 7=sabado, asi que:
 *   2 - diaSemana  ->  lunes      3 - diaSemana  ->  martes
 *   4 - diaSemana  ->  miercoles  5 - diaSemana  ->  jueves
 * que es justo lo que dicen los nombres de columna del original
 * (Abono25Mar, creceMas15Lun, produceMas50Mier, saferMix60Juev...).
 *
 * Dos rarezas del original que se conservan a proposito:
 *   - [abonoTercera]/[abonoTercera] vale 1, salvo si abonoTercera es 0 o
 *     nulo: Access da error de division por cero y SQLite devuelve NULL.
 *   - Weekday([bordeles70]) aparece antes de definir bordeles70. Aqui el
 *     orden esta resuelto y el resultado es el que Access acaba produciendo.
 *
 * Parametros: ?1 = hoy (ISO)   ?2 = fechaInicial (ISO, exclusiva)
 */
export const SQL_PROGRAMACION_CULTIVO = `
WITH base AS (
  SELECT pc.codigosistema, s.semilla, s.variedad, pc.factura, pc.fechasiembra,
         pc.numeroPlantasSembradas, pc.lote, pc.cama, pc.cantidadAbono0,
         s.abonoPrimera, s.abonoSegunda, s.abonoTercera,
         s.Aplicacion1, s.Aplicacion2,
         c.fechaCosecha, c.numeroPlantasCosechadas, c.peso, c.remision,
         c.factura AS cosecha_factura, c.observacion,
         CAST(julianday(?1) - julianday(pc.fechasiembra) AS INTEGER) AS "#dias"
  FROM infoSemilla s
       INNER JOIN programacionCultivos pc ON s.Id = pc.codSemilla
       LEFT JOIN cosecha c ON pc.codigosistema = c.codigosistema
  WHERE pc.fechasiembra > ?2
),
fechas AS (
  SELECT base.*,
         date(fechasiembra, '+25 day') AS fecha25Abono,
         date(fechasiembra, '+50 day') AS fecha50Abono,
         date(fechasiembra, '+75 day') AS fecha75Abono,
         date(fechasiembra, '+15 day') AS creceMas1,
         date(fechasiembra, '+30 day') AS creceMas2,
         date(fechasiembra, '+45 day') AS produceMas1,
         -- [abonoTercera]/[abonoTercera] + fechasiembra + 45 / + 70
         date(fechasiembra, CAST(45 + (abonoTercera / abonoTercera) AS INTEGER) || ' day') AS creceMas3,
         date(fechasiembra, CAST(70 + (abonoTercera / abonoTercera) AS INTEGER) || ' day') AS produceMas2,
         date(fechasiembra, CAST(Aplicacion1 AS INTEGER) || ' day')        AS saferMix1,
         date(fechasiembra, CAST(Aplicacion1 + 60 AS INTEGER) || ' day')   AS saferMix60dias,
         date(fechasiembra, CAST(Aplicacion2 + 45 AS INTEGER) || ' day')   AS sulfoCalcico45,
         date(fechasiembra, CAST(Aplicacion2 + 44 AS INTEGER) || ' day')   AS saferSoil,
         date(fechasiembra, CAST(Aplicacion2 + 70 AS INTEGER) || ' day')   AS bordeles70
  FROM base
),
dias AS (
  SELECT fechas.*,
         CAST(strftime('%w', fecha25Abono)   AS INTEGER) + 1 AS diaSemana,
         CAST(strftime('%w', fecha50Abono)   AS INTEGER) + 1 AS diaSemana50,
         CAST(strftime('%w', fecha75Abono)   AS INTEGER) + 1 AS diaSemana75,
         CAST(strftime('%w', creceMas1)      AS INTEGER) + 1 AS diaSemCreMas,
         CAST(strftime('%w', creceMas2)      AS INTEGER) + 1 AS diaSemCreceMas2,
         CAST(strftime('%w', produceMas1)    AS INTEGER) + 1 AS diaSemProduceMas1,
         CAST(strftime('%w', produceMas2)    AS INTEGER) + 1 AS diaSemProduceMas2,
         CAST(strftime('%w', saferMix1)      AS INTEGER) + 1 AS diaSemSaferMix1,
         CAST(strftime('%w', saferMix60dias) AS INTEGER) + 1 AS diaSemSaferMix2,
         CAST(strftime('%w', sulfoCalcico45) AS INTEGER) + 1 AS diaSemSulfoCalcico,
         CAST(strftime('%w', bordeles70)     AS INTEGER) + 1 AS diaSemBordeles70
  FROM fechas
)
SELECT codigosistema, semilla, variedad, factura, fechasiembra,
       numeroPlantasSembradas, lote, cama, "#dias", cantidadAbono0,
       fecha25Abono, diaSemana,  (3 - diaSemana)   AS diasResta,
       date(fecha25Abono, CAST(3 - diaSemana AS INTEGER)   || ' day') AS Abono25Mar, abonoPrimera,
       fecha50Abono, diaSemana50, (3 - diaSemana50) AS diasResta50,
       date(fecha50Abono, CAST(3 - diaSemana50 AS INTEGER) || ' day') AS abono50Mar, abonoSegunda,
       fecha75Abono, diaSemana75, (3 - diaSemana75) AS diasResta75,
       date(fecha75Abono, CAST(3 - diaSemana75 AS INTEGER) || ' day') AS abono75Mar, abonoTercera,
       creceMas1, diaSemCreMas,
       date(creceMas1, CAST(2 - diaSemCreMas AS INTEGER) || ' day')   AS creceMas15Lun,
       creceMas2, diaSemCreceMas2,
       date(creceMas2, CAST(2 - diaSemCreceMas2 AS INTEGER) || ' day') AS creceMas30Lun,
       creceMas3,
       produceMas1, diaSemProduceMas1,
       date(produceMas1, CAST(4 - diaSemProduceMas1 AS INTEGER) || ' day') AS produceMas50Mier,
       produceMas2, diaSemProduceMas2,
       date(produceMas2, CAST(4 - diaSemProduceMas2 AS INTEGER) || ' day') AS produceMas70Mier,
       saferMix1, diaSemSaferMix1,
       date(saferMix1, CAST(2 - diaSemSaferMix1 AS INTEGER) || ' day')  AS saferMix0Lun,
       saferMix60dias, diaSemSaferMix2,
       date(saferMix60dias, CAST(5 - diaSemSaferMix2 AS INTEGER) || ' day') AS saferMix60Juev,
       sulfoCalcico45, diaSemSulfoCalcico,
       date(sulfoCalcico45, CAST(5 - diaSemSulfoCalcico AS INTEGER) || ' day') AS sulfoCalcico45Juev,
       saferSoil,
       diaSemBordeles70, bordeles70,
       date(bordeles70, CAST(5 - diaSemBordeles70 AS INTEGER) || ' day') AS bordeles70Juev,
       fechaCosecha, numeroPlantasCosechadas, peso, remision,
       cosecha_factura, observacion
FROM dias
ORDER BY fechasiembra`;

export const VISTAS_PARAMETRIZADAS = [
  {
    nombre: 'cProgramacionCultivosAbonamiento',
    sql: SQL_PROGRAMACION_ABONAMIENTO,
    parametros: ['hoy'],
  },
  {
    nombre: 'cProgramacionCultivo',
    sql: SQL_PROGRAMACION_CULTIVO,
    parametros: ['hoy', 'fechaInicial'],
    informe: 'infTrazabilidad',
  },
];
