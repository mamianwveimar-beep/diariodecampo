-- =====================================================================
-- Datos de referencia que el origen daba por supuestos pero nunca creo.
-- =====================================================================

-- Las consultas IngresoCostos* de Access insertaban en costosInsumos con
-- producto = 999, un centinela para la mano de obra que nunca existio como
-- producto. Por eso 50 de las 76 filas de costosInsumos quedaban huerfanas.
-- Crear la fila da validez a la clave foranea sin alterar ningun dato.
-- El valor 8807 es el jornal por hora que las consultas llevan incrustado.
INSERT INTO productos (id, codigoProducto, nombreProducto, unidad, valorUnidad,
                       cantidad, observacion)
VALUES (999, 'MO', 'Mano de obra', 'hora', 8807, NULL,
        'Fila de referencia creada en la migracion. En Access este id era un '
        || 'centinela sin registro asociado.');

-- El contador de autonumeracion queda en 999 y el siguiente producto nuevo
-- saldria con id 1000. El ETL lo devuelve al maximo real (paso 3 de
-- etl/03-cargar.mjs), porque solo entonces existen ya las filas 2..7.
