import { semanaAccess, sumarDias } from './fechas';
import type { Orden, Producto } from './tipos';

/**
 * Vista previa, en el navegador, de la temporada que el backend va a dejar
 * programada al guardar la orden de siembra.
 *
 * FUENTE DE VERDAD: api/src/queries/consultas-accion.mjs, concretamente las
 * 15 consultas de LOTES.programacionCompleta que insertan en `actividades`.
 * Esta tabla replica sus mismos dias de desfase, productos y condiciones
 * porque el backend no genera nada hasta el POST -las filas no existen
 * todavia cuando el operario esta mirando la pantalla-, asi que no hay de
 * donde pedirle la temporada antes de guardar.
 *
 * La semana de la siembra es editable y SI se envia: es la unica que el
 * operario ya ejecuto, asi que puede corregir lo que de verdad aplico. Las
 * demas semanas son previsualizacion; al guardar quedan programadas con
 * fechaRegistro en NULL, listas para registrarse cuando toque.
 *
 * Si el calendario de consultas-accion.mjs cambia, esta tabla se desincroniza
 * en silencio. La comprobacion en web/humo-orden.mjs cierra ese hueco:
 * compara lo que esta pantalla predice contra lo que el backend deja
 * guardado de verdad, para la misma siembra.
 */
interface EntradaPlan {
  actividad: string;
  /** Id del producto en `productos`, o null para las labores en minutos. */
  productoId: number | null;
  /** Solo cuando no hay producto: detalle fijo y costo por minuto. */
  detalleFijo?: string;
  dias: number;
  /** Campo de infoSemilla del que sale la cantidad por planta. */
  campoCantidad: keyof Pick<Orden,
    'abonoSiembra' | 'calDolomita' | 'abonoLiquido' | 'abonoPrimera' | 'abonoSegunda' | 'abonoTercera'
  > | null;
  cantidadFija?: number;
  unidadFija?: string;
  tipo: 'sol' | 'liq' | 'bio' | 'min';
  /** Cuando falta, la fila siempre entra (como PreparacionTerreno o Siembra). */
  si?: (o: Orden) => boolean;
}

// El costo por minuto de las labores ('min') ya no es una constante fija
// aqui: calcularPrograma lo recibe como parametro, con el mismo valor que
// costoMinuto en parametrosCostos, para no desincronizarse cuando alguien lo
// cambia desde Configuracion de costos.
// ids del catalogo de productos, los mismos CONSTANTES de consultas-accion.mjs
const PRODUCTO_ABONO_LIQUIDO = 2, PRODUCTO_ABONO_SOLIDO = 3, PRODUCTO_ABONO_LIQUIDO_2 = 4,
      PRODUCTO_BASILUS = 5, PRODUCTO_CAL_DOLOMITA = 998;

const PLAN: EntradaPlan[] = [
  { actividad: 'PreparacionTerreno', productoId: null, detalleFijo: 'PreparacionTerreno',
    dias: 0, campoCantidad: null, cantidadFija: 1.5, unidadFija: 'Min', tipo: 'min' },
  { actividad: 'Siembra', productoId: null, detalleFijo: 'Siembra',
    dias: 0, campoCantidad: null, cantidadFija: 1.3, unidadFija: 'Min', tipo: 'min' },
  { actividad: 'AbonoSiembra', productoId: PRODUCTO_ABONO_SOLIDO,
    dias: 0, campoCantidad: 'abonoSiembra', tipo: 'sol', si: (o) => (o.abonoSiembra ?? 0) > 0 },
  { actividad: 'CalDolomita', productoId: PRODUCTO_CAL_DOLOMITA,
    dias: 0, campoCantidad: 'calDolomita', tipo: 'sol', si: (o) => (o.calDolomita ?? 0) > 0 },
  { actividad: 'ProteccionVegetal', productoId: PRODUCTO_BASILUS,
    dias: 0, campoCantidad: 'abonoLiquido', tipo: 'bio', si: (o) => (o.Aplicacion1 ?? 0) > 1 },
  { actividad: 'AbonoLiquido', productoId: PRODUCTO_ABONO_LIQUIDO,
    dias: 8, campoCantidad: 'abonoLiquido', tipo: 'liq' },
  { actividad: 'AbonoLiquido', productoId: PRODUCTO_ABONO_LIQUIDO,
    dias: 15, campoCantidad: 'abonoLiquido', tipo: 'liq' },
  { actividad: 'AbonoSolido', productoId: PRODUCTO_ABONO_SOLIDO,
    dias: 25, campoCantidad: 'abonoPrimera', tipo: 'sol' },
  { actividad: 'Deshierbe', productoId: null, detalleFijo: 'PrimerDeshierbe',
    dias: 25, campoCantidad: null, cantidadFija: 1.2, unidadFija: 'Min', tipo: 'min' },
  { actividad: 'AbonoLiquido', productoId: PRODUCTO_ABONO_LIQUIDO_2,
    dias: 50, campoCantidad: 'abonoLiquido', tipo: 'liq', si: (o) => (o.ciclo ?? 0) > 50 },
  { actividad: 'AbonoSolido', productoId: PRODUCTO_ABONO_SOLIDO,
    dias: 50, campoCantidad: 'abonoSegunda', tipo: 'sol', si: (o) => (o.abonoSegunda ?? 0) > 0 },
  { actividad: 'Deshierbe', productoId: null, detalleFijo: 'SegundoDeshierbe',
    dias: 50, campoCantidad: null, cantidadFija: 1.2, unidadFija: 'Min', tipo: 'min',
    si: (o) => (o.ciclo ?? 0) > 50 },
  { actividad: 'ProteccionVegetal', productoId: PRODUCTO_BASILUS,
    dias: 50, campoCantidad: 'abonoLiquido', tipo: 'bio', si: (o) => (o.Aplicacion1 ?? 0) >= 1 },
  { actividad: 'AbonoLiquido', productoId: PRODUCTO_ABONO_LIQUIDO_2,
    dias: 65, campoCantidad: 'abonoLiquido', tipo: 'liq', si: (o) => (o.ciclo ?? 0) > 65 },
  { actividad: 'AbonoSolido', productoId: PRODUCTO_ABONO_SOLIDO,
    dias: 75, campoCantidad: 'abonoTercera', tipo: 'sol', si: (o) => (o.abonoTercera ?? 0) > 0 },
];

export interface FilaPrograma {
  semana: number;
  fecha: string;
  actividad: string;
  detalle: string;
  tipo: 'sol' | 'liq' | 'bio' | 'min';
  /**
   * Dosis por planta, tal como se guarda en actividades.cantidadAbono. Es el
   * valor que viaja a la API: actividades.total es una columna GENERATED
   * (cantidadAbono * numeroPlantas) y no se puede escribir, asi que cuando el
   * operario corrige el total en pantalla hay que despejar la tasa.
   */
  cantidadPorPlanta: number;
  /** cantidadPorPlanta x plantas: lo que se ve y se edita en la tabla. */
  cantidad: number;
  unidad: string;
  costoUnitario: number;
  costoTotal: number;
  /** Los sólidos y biológicos entran en el peso a cargar; el minutaje no. */
  pesoKg: number;
}

/**
 * La temporada completa para `plantas` unidades, agrupable por semana en la
 * pantalla. `productos` es el catalogo ya cargado (GET /api/tablas/productos).
 * `costoMinuto` es el vigente en parametrosCostos (ver Configuracion de
 * costos); por defecto usa el valor con el que arranco el sistema en 2021,
 * para quien todavia no cargue parametrosCostos en vivo.
 */
export function calcularPrograma(
  o: Orden, plantas: number, productos: Producto[], costoMinuto = 1.46,
): FilaPrograma[] {
  if (!plantas) return [];
  const producto = (id: number) => productos.find((p) => p.id === id);

  return PLAN.filter((e) => !e.si || e.si(o)).map((e) => {
    const p = e.productoId != null ? producto(e.productoId) : null;
    const cantidad = e.campoCantidad ? (o[e.campoCantidad] ?? 0) : (e.cantidadFija ?? 0);
    const unidad = p ? (p.unidad ?? '') : (e.unidadFija ?? '');
    const costoUnitario = p ? (p.valorUnidad ?? 0) : (e.tipo === 'min' ? costoMinuto : 0);
    const total = +(cantidad * plantas).toFixed(3);
    const fecha = sumarDias(o.fechasiembra, e.dias);
    // los litros pesan como kilos, que es la aproximacion con la que se carga
    const pesoKg = e.tipo === 'sol' || e.tipo === 'liq' || e.tipo === 'bio' ? total : 0;
    return {
      semana: semanaAccess(fecha), fecha, actividad: e.actividad,
      detalle: p?.nombreProducto ?? e.detalleFijo ?? e.actividad,
      tipo: e.tipo, cantidadPorPlanta: cantidad, cantidad: total, unidad, costoUnitario,
      costoTotal: total * costoUnitario, pesoKg,
    };
  // Orden cronologico por FECHA, no por numero de semana: una temporada que
  // cruza el ano va de la semana 53 a la 2, y ordenar por el numero la dejaria
  // del reves.
  }).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.actividad.localeCompare(b.actividad));
}
