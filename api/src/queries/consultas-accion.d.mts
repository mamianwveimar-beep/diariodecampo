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
export declare const LOTES: Record<string, string[] | undefined>;
export declare function porNombre(nombre: string): ConsultaAccion | undefined;
