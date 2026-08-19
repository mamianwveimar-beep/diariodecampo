export interface MetaTabla {
  pk: string;
  autonumerica: boolean;
  columnas: string[];
  /** Columnas GENERATED en D1 (campos calculados en Access): nunca se escriben. */
  generadas: string[];
  booleanas?: string[];
}
export declare const TABLAS: Record<string, MetaTabla | undefined>;
export declare const VISTAS: string[];
export declare function columnasEscribibles(tabla: string): string[];
export declare function columnasAlta(tabla: string): string[];
