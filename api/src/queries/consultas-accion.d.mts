export interface ConsultaAccion {
  nombre: string;
  destino: 'actividades' | 'costosInsumos' | 'inventarioProductos';
  descripcion: string;
  sql: string;
  /** SQL original de Access, para poder auditar la traduccion. */
  origenAccess: string;
}
export declare const CONSTANTES: Record<string, number>;
/**
 * Construye las 22 consultas con el jornal y el costo por minuto vigentes.
 * Sin argumentos, usa los valores por defecto de CONSTANTES.
 */
export declare function construirConsultasAccion(jornalHora?: number, costoMinuto?: number): ConsultaAccion[];
/** El catalogo con los valores por defecto. Ver construirConsultasAccion(). */
export declare const CONSULTAS_ACCION: ConsultaAccion[];
/**
 * `programacionCompleta` se declara aparte porque siempre existe: es el lote
 * que dispara la orden de siembra, y dejarlo como opcional obligaria a un
 * `?? []` que convertiria una errata en un silencio.
 */
export declare const LOTES: Record<string, string[] | undefined>
  & { programacionCompleta: string[] };
export declare function porNombre(consultas: ConsultaAccion[], nombre: string): ConsultaAccion | undefined;
/**
 * La misma consulta acotada a un cultivo. El SQL devuelto espera el
 * codigosistema enlazado como ?1.
 */
export declare function sqlPorCultivo(consulta: ConsultaAccion): string;
