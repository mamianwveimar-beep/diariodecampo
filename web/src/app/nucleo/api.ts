import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type * as T from './tipos';

/** En desarrollo, proxy.conf.json redirige /api al Worker del puerto 8787. */
const BASE = '/api';

@Injectable({ providedIn: 'root' })
export class Api {
  private http = inject(HttpClient);

  /** Ultimo error de red o de la API, para mostrarlo en la barra superior. */
  readonly error = signal<string | null>(null);
  readonly cargando = signal(0);

  private async pedir<R>(promesa: Promise<R>): Promise<R> {
    this.cargando.update((n) => n + 1);
    try {
      const r = await promesa;
      this.error.set(null);
      return r;
    } catch (e: any) {
      const mensaje = e?.error?.error ?? e?.message ?? 'No se pudo contactar con el servidor.';
      this.error.set(mensaje);
      throw e;
    } finally {
      this.cargando.update((n) => n - 1);
    }
  }

  // ------------------------------------------------------- CRUD generico
  listar<R>(tabla: string, limite = 500): Promise<R[]> {
    return this.pedir(firstValueFrom(
      this.http.get<R[]>(`${BASE}/tablas/${tabla}`, { params: { limite } })
    ));
  }

  /**
   * Las filas de una tabla que cuelgan de un cultivo. Evita traerse la tabla
   * entera al navegador cuando solo interesa uno: con miles de actividades
   * registradas, la diferencia es la pantalla usable o no.
   */
  listarDeCultivo<R>(tabla: string, cultivo: number, limite = 2000): Promise<R[]> {
    return this.pedir(firstValueFrom(
      this.http.get<R[]>(`${BASE}/tablas/${tabla}`, { params: { cultivo, limite } })
    ));
  }

  obtener<R>(tabla: string, id: string | number): Promise<R> {
    return this.pedir(firstValueFrom(this.http.get<R>(`${BASE}/tablas/${tabla}/${id}`)));
  }

  crear<R>(tabla: string, fila: Partial<R>): Promise<R> {
    return this.pedir(firstValueFrom(this.http.post<R>(`${BASE}/tablas/${tabla}`, fila)));
  }

  actualizar<R>(tabla: string, id: string | number, fila: Partial<R>): Promise<R> {
    return this.pedir(firstValueFrom(this.http.put<R>(`${BASE}/tablas/${tabla}/${id}`, fila)));
  }

  borrar(tabla: string, id: string | number): Promise<{ borradas: number }> {
    return this.pedir(firstValueFrom(
      this.http.delete<{ borradas: number }>(`${BASE}/tablas/${tabla}/${id}`)
    ));
  }

  // ------------------------------------------------------------- vistas
  vista<R>(nombre: string): Promise<R[]> {
    return this.pedir(firstValueFrom(
      this.http.get<R[]>(`${BASE}/vistas/${encodeURIComponent(nombre)}`)
    ));
  }

  // ----------------------------------------------------------- informes
  trazabilidad(fechaInicial: string): Promise<T.Trazabilidad[]> {
    return this.pedir(firstValueFrom(
      this.http.get<T.Trazabilidad[]>(`${BASE}/informes/trazabilidad`, { params: { fechaInicial } })
    ));
  }

  programacionAbonamiento(): Promise<any[]> {
    return this.pedir(firstValueFrom(
      this.http.get<any[]>(`${BASE}/informes/programacion-abonamiento`)
    ));
  }

  // -------------------------------------------------- orden de siembra
  /** Siembras programadas que nadie ha registrado todavia en campo. */
  ordenesPendientes(): Promise<T.Orden[]> {
    return this.pedir(firstValueFrom(this.http.get<T.Orden[]>(`${BASE}/ordenes/pendientes`)));
  }

  orden(codigo: number): Promise<T.Orden> {
    return this.pedir(firstValueFrom(this.http.get<T.Orden>(`${BASE}/ordenes/${codigo}`)));
  }

  /** Guarda lo que paso en campo y deja programada la temporada del cultivo. */
  registrarOrden(codigo: number, cuerpo: {
    lote: string | null; cama: string | null; numeroPlantasSembradas: number;
    plantulasDanadas: number | null; motivoMerma: string | null;
    /** La semana que se registra: la de la siembra, con sus labores del dia. */
    semana: number | null;
    actividades: {
      Actividad: string; detalle: string | null; unidad: string | null;
      cantidadAbono: number; costo: number;
      /** Novedad anadida a mano: ademas de la labor, abre linea en costosInsumos. */
      esAdicional: boolean;
    }[];
  }): Promise<{ cultivo: T.Cultivo; merma: number;
                semanaRegistrada: number | null; registradas: number;
                generadas: { actividades: number; costosInsumos: number } }> {
    return this.pedir(firstValueFrom(this.http.post<any>(`${BASE}/ordenes/${codigo}`, cuerpo)));
  }

  // ---------------------------------------------------------- cosechas
  /**
   * Registra una cosecha y, con ella, deja al dia la actividad "Cosecha" de
   * esa semana (minutos trabajados, plantas, y si quedo total o parcial).
   * Por eso no es api.crear('cosecha', ...): esa es la version generica, sin
   * la logica de la actividad derivada.
   */
  crearCosecha(cuerpo: Partial<T.Cosecha> & { codigosistema: number; fechaCosecha: string; peso: number }): Promise<T.Cosecha> {
    return this.pedir(firstValueFrom(this.http.post<T.Cosecha>(`${BASE}/cosechas`, cuerpo)));
  }

  borrarCosecha(id: number): Promise<{ borradas: number }> {
    return this.pedir(firstValueFrom(this.http.delete<{ borradas: number }>(`${BASE}/cosechas/${id}`)));
  }

  // ---------------------------------------------------------- procesos
  procesos(): Promise<{ consultas: T.Proceso[]; lotes: Record<string, string[]> }> {
    return this.pedir(firstValueFrom(this.http.get<any>(`${BASE}/procesos`)));
  }

  ejecutarProceso(nombre: string): Promise<T.ResultadoProceso> {
    return this.pedir(firstValueFrom(
      this.http.post<T.ResultadoProceso>(`${BASE}/procesos/${nombre}`, {})
    ));
  }

  ejecutarLote(lote: string): Promise<T.ResultadoLote> {
    return this.pedir(firstValueFrom(
      this.http.post<T.ResultadoLote>(`${BASE}/procesos/lote/${lote}`, {})
    ));
  }

  // ---------------------------------------------------------- adjuntos
  adjuntos(tabla: string, registroId: string | number): Promise<T.Adjunto[]> {
    return this.pedir(firstValueFrom(
      this.http.get<T.Adjunto[]>(`${BASE}/adjuntos/${tabla}/${registroId}`)
    ));
  }

  urlAdjunto(id: number): string {
    return `${BASE}/adjuntos/${id}/contenido`;
  }

  // -------------------------------------------------------- cuarentena
  cuarentena(): Promise<T.FilaCuarentena[]> {
    return this.pedir(firstValueFrom(this.http.get<T.FilaCuarentena[]>(`${BASE}/cuarentena`)));
  }

  salud(): Promise<{ estado: string; hoy: string; cultivos: number }> {
    return this.pedir(firstValueFrom(this.http.get<any>(`${BASE}/salud`)));
  }
}
