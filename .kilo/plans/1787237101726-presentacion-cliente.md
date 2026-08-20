# Plan: Presentación para cliente de Diario de Campo

## Objetivo
Crear una presentación dirigida al cliente (finca/empresa agrícola) que comunique los beneficios de adoptar la aplicación web Diario de Campo, reemplazando el sistema actual en Microsoft Access.

## Contenido propuesto

### 1. Portada
- Nombre del proyecto: Diario de Campo
- Subtítulo: Del archivo de Access a la gestión agrícola moderna
- Contexto: migración verificada con paridad 1:1 contra el sistema actual

### 2. El problema hoy (Access)
- Limitaciones de Access: solo accesible desde equipos específicos, requiere instalación, dependencia de Windows, copias locales frágiles, compartir datos es manual
- La lógica agrícola está encerrada en 20 consultas de acción y VBA, invisible para el operario y riesgosa de modificar
- Datos históricos (2021) quedaron con inconsistencias heredadas del origen (12 actividades con fecha desfasada, 9 líneas de pedido huérfanas, 10 movimientos de inventario sin cultivo) que hoy se ven sin interpretación
- Sin trazabilidad de cambios ni respaldos automatizados

### 3. Qué cambia: la nueva aplicación
- Acceso desde cualquier navegador y dispositivo, en campo o en oficina
- Panel de control con métricas vivas contra la fecha actual (faltante de cosecha, labores de la semana)
- 11 pantallas unificadas que reemplazan 14 formularios Access dispersos
- 6 informes con PDF nativo del navegador

### 4. Beneficios funcionales (por rol)

**Para el operario en campo:**
- Registro de siembra por lotes en una sola pantalla (fecha y factura una vez, variedades en filas)
- Órdenes de siembra: lista de lo pendiente del día, guardado automático sin botón, trazabilidad de quién y cuándo ejecutó
- Seguimiento en campo desde el móvil: tarjetas grandes por semana, estados (pendiente / realizado / cancelado) con guardado instantáneo
- Alta de actividades por lotes: repite cabecera una vez, líneas por cama

**Para la administración:**
- Gestión de cultivos, semillas, productos, clientes y empleados en un solo lugar
- Consulta de actividades y costos filtrada por cultivo, edición y borrado en 3 clics
- Inventario y movimientos integrados
- Cuarentena visible: datos rechazados por validación con la regla incumplida y el valor original
- Informes de trazabilidad, programación de abonamiento y más, exportables a PDF

**Para la toma de decisiones:**
- Panel de control: días hasta cosecha, labores de la semana actual, peso planificado
- Gráficas de distribución de cultivos y productividad
- Resumen acumulado histórico

### 5. Beneficios técnicos y de operación
- Paridad verificada: 22 consultas de acción comparadas contra Access, 0 diferencias deliberadas; 9 vistas SELECT contrastadas fila a fila
- Sin dependencia de Access ni proveedores OLEDB; datos en la nube con Cloudflare
- Respaldo y restauración automatizados (restauración de principio a fin probada)
- Sin costo de infraestructura en el volumen actual: cabe en el plan gratuito de Cloudflare Workers/D1/R2
- Escalable: arquitectura preparada para crecimiento sin reingeniería

### 6. Garantías de migración
- Datos migrados con reconciliación, cuarentena y comparación automática
- 4 columnas calculadas preservadas como GENERATED en SQLite (mismo resultado que Access)
- Numeración de semanas fijada en domingo (regla consistente, no dependiente del equipo)
- Errores legibles: restricciones violadas devuelven 409 con mensaje claro, no 500 mudo

### 7. Próximos pasos sugeridos
1. Aprobación del corte de fecha: cuándo se deja de usar Access
2. Despliegue en Cloudflare y configuración de dominio
3. Activación de Cloudflare Access (inicio de sesión por correo, sin código adicional)
4. Capacitación breve de operarios en las 3 pantallas nuevas (siembra, orden, seguimiento)

## Formato
- Archivo: `docs/presentacion-cliente.html`
- Estilo: limpio, tipografía agrícola/serif, colores tierra (verde musgo, ocre, óxido)
- Secciones como diapositivas separadas por `<section>`
- Impresión y PDF soportados con `@media print`
- Responsive: legible en proyector y en navegador

## Validación
- Revisión por el equipo actual antes de enviar al cliente
- Verificar que las cifras mencionadas coinciden con `docs/paridad/`
- Confirmar con el cliente los nombres de roles y las pantallas que más usará
