export declare const ZONA: string;
/** Equivalente de Date() de Access, en zona America/Bogota. */
export declare function hoyBogota(ahora?: Date): string;
/** Equivalente de Format$(fecha,"ww",0,0) de Access. */
export declare function semanaAccess(iso: string): number;
/** Equivalente de Weekday(fecha) de Access: 1 = domingo ... 7 = sabado. */
export declare function diaSemanaAccess(iso: string): number;
export declare function sumarDias(iso: string, dias: number): string;
export declare function SQL_SEMANA(expr: string): string;
export declare function SQL_DIA_SEMANA(expr: string): string;
export declare function SQL_MAS_DIAS(expr: string, n: number): string;
export declare function SQL_MAS_DIAS_EXPR(expr: string, nExpr: string): string;
