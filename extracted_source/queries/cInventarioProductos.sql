SELECT DISTINCTROW inventarioProductos.Id, inventarioProductos.concepto, inventarioProductos.producto, inventarioProductos.ingreso, inventarioProductos.salida, inventarioProductos.fecha, inventarioProductos.empleado, inventarioProductos.descripcion, inventarioProductos.cliente, inventarioProductos.saldo
FROM inventarioProductos
GROUP BY inventarioProductos.Id, inventarioProductos.concepto, inventarioProductos.producto, inventarioProductos.ingreso, inventarioProductos.salida, inventarioProductos.fecha, inventarioProductos.empleado, inventarioProductos.descripcion, inventarioProductos.cliente, inventarioProductos.saldo;

