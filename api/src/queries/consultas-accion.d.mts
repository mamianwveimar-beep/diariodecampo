export interface ConsultaAccion {
  nombre: string;
  destino: 'actividades' | 'costosInsumos' | 'inventarioProductos';
  descripcion: string;
  sql: string;
  /** SQL original de Access, para poder auditar la traduccion. */
  origenAccess: string;
}
export declare const CONSTANTES: Record<string, number>;
export declare const CONSULTAS_ACCION: ConsultaAccion[];
/**
 * `programacionCompleta` se declara aparte porque siempre existe: es el lote
 * que dispara la orden de siembra, y dejarlo como opcional obligaria a un
 * `?? []` que convertiria una errata en un silencio.
 */
export declare const LOTES: Record<string, string[] | undefined>
  & { programacionCompleta: string[] };
export declare function porNombre(nombre: string): ConsultaAccion | undefined;
/**
 * La misma consulta acotada a un cultivo. El SQL devuelto espera el
 * codigosistema enlazado como ?1.
 */
export declare function sqlPorCultivo(consulta: ConsultaAccion): string;
