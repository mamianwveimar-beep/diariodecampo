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

-- La cal dolomita vivia solo como infoSemilla.calDolomita: no habia producto,
-- ni costo, ni movimiento de almacen. La consulta IngresoCalDolomita necesita
-- un producto del que sacar nombre, unidad y precio, asi que se crea aqui.
-- valorUnidad queda en 0 A PROPOSITO: el origen nunca registro cuanto cuesta.
-- Hasta que se le ponga precio en la pantalla de Productos, la actividad se
-- genera con coste 0, que es visible, en vez de con un precio inventado.
INSERT INTO productos (id, codigoProducto, nombreProducto, unidad, valorUnidad,
                       cantidad, observacion)
VALUES (998, 'CD', 'cal dolomita', 'Kg', 0, NULL,
        'Fila de referencia creada en la migracion. Falta ponerle el precio: '
        || 'mientras valorUnidad sea 0, la actividad CalDolomita sale con coste 0.');

-- El contador de autonumeracion queda en 999 y el siguiente producto nuevo
-- saldria con id 1000. El ETL lo devuelve al maximo real (paso 3 de
-- etl/03-cargar.mjs), porque solo entonces existen ya las filas 2..7.
