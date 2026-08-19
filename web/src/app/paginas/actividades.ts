import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../nucleo/api';
import type { CostoActividad, Cultivo, Semilla, Proceso, ResultadoProceso } from '../nucleo/tipos';

/**
 * Actividades y costos: sustituye a Frm_Costos + SubFrm_Costos +
 * Frm_DatosCostos de Access, y al boton que llamaba a Macro3.
 *
 * Los procesos son las 20 consultas de accion traducidas. Cada una dice
 * cuantas filas inserto; las repetidas se descartan por el indice UNIQUE,
 * igual que hacia Access, pero aqui se ve.
 */
@Component({
  selector: 'dc-actividades',
  imports: [FormsModule],
  template: `
    <div class="cabecera">
      <div class="fila">
        <div>
          <div class="eyebrow">actividades · cCostosActividades</div>
          <h1>Actividades y costos</h1>
          <p class="small">Labores programadas por cultivo, con su coste.</p>
        </div>
        <div style="display:flex; gap:10px">
          <button (click)="panelProcesos.set(!panelProcesos())">Generar programacion</button>
          <button class="primario" (click)="abrirNuevo()">Nueva actividad</button>
        </div>
      </div>
    </div>

    @if (mensaje(); as m) { <p class="aviso ok" role="status">{{ m }}</p> }

    <!-- --------------------------------------------------------- procesos -->
    @if (panelProcesos()) {
      <div class="tarjeta" style="margin-bottom:22px">
        <h2>Generar programacion automatica</h2>
        <p class="small">
          Estas son las consultas que Access ejecutaba desde sus macros. Calculan las labores
          y los costes de cada cultivo a partir de la ficha de la semilla. Volver a lanzarlas
          no duplica nada: las filas que ya existen se descartan.
        </p>

        <div class="barra" style="margin-top:6px; margin-bottom:0">
          @for (l of lotes(); track l) {
            <button class="primario" (click)="lanzarLote(l)" [disabled]="ocupado()">
              {{ nombreLote(l) }}
            </button>
          }
        </div>

        @if (resultados().length) {
          <div class="tabla-caja" style="margin-top:12px">
            <table>
              <thead><tr><th>Consulta</th><th>Destino</th><th class="num">Filas nuevas</th></tr></thead>
              <tbody>
                @for (r of resultados(); track r.consulta) {
                  <tr>
                    <td>{{ r.consulta }}</td>
                    <td>{{ r.destino }}</td>
                    <td class="num">{{ r.insertadas }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }

        <details style="margin-top:10px">
          <summary class="small">Ver las {{ procesos().length }} consultas por separado</summary>
          <div class="tabla-caja" style="margin-top:10px">
            <table>
              <thead><tr><th>Consulta</th><th>Que hace</th><th></th></tr></thead>
              <tbody>
                @for (p of procesos(); track p.nombre) {
                  <tr>
                    <td class="mono" style="font-size:.8rem">{{ p.nombre }}</td>
                    <td style="white-space:normal">{{ p.descripcion }}</td>
                    <td class="acciones">
                      <button class="menudo" (click)="lanzarUno(p.nombre)" [disabled]="ocupado()">Ejecutar</button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </details>
      </div>
    }

    <!-- --------------------------------------------------------- listado -->
    <div class="barra">
      <label>Cultivo
        <select [ngModel]="cultivoFiltro()" (ngModelChange)="cultivoFiltro.set($event)">
          <option [ngValue]="null">Todos</option>
          @for (c of cultivos(); track c.codigosistema) {
            <option [ngValue]="c.codigosistema">{{ c.codigosistema }} · {{ c.fechasiembra }}</option>
          }
        </select>
      </label>
      <label>Actividad
        <select [ngModel]="tipoFiltro()" (ngModelChange)="tipoFiltro.set($event)">
          <option [ngValue]="null">Todas</option>
          @for (t of tipos(); track t) { <option [ngValue]="t">{{ t }}</option> }
        </select>
      </label>
      <label>Semana<input type="number" [ngModel]="semanaFiltro()"
             (ngModelChange)="semanaFiltro.set($event)" placeholder="p. ej. 44" /></label>
      <button (click)="limpiar()">Limpiar</button>
      <span class="small">{{ filtradas().length }} de {{ actividades().length }} · coste total
        {{ costeTotal() }}</span>
    </div>

    <div class="tabla-caja">
      <table>
        <thead>
          <tr>
            <th class="num">Cultivo</th><th>Semilla</th><th>Siembra</th><th class="num">Semana</th>
            <th>Actividad</th><th>Detalle</th><th class="num">Cantidad</th><th>Unidad</th>
            <th class="num">Plantas</th><th class="num">Total</th><th class="num">Coste unit.</th>
            <th class="num">Coste</th><th></th>
          </tr>
        </thead>
        <tbody>
          @for (a of filtradas(); track a.id) {
            <tr>
              <td class="num">{{ a.codigoSistema }}</td>
              <td>{{ nombreSemilla(a.codsemilla) }}</td>
              <td>{{ a.fechaSiembra }}</td>
              <td class="num">{{ a.semanaAbono }}</td>
              <td>{{ a.Actividad }}</td>
              <td>{{ a.detalle ?? '—' }}</td>
              <td class="num">{{ a.cantidadAbono }}</td>
              <td>{{ a.unidad ?? '—' }}</td>
              <td class="num">{{ a.numeroPlantas }}</td>
              <td class="num">{{ redondear(a.total) }}</td>
              <td class="num">{{ a.costo }}</td>
              <td class="num">{{ redondear(a.GTotal) }}</td>
              <td class="acciones">
                <button class="menudo" (click)="abrirEdicion(a)">Editar</button>
                <button class="menudo peligro" (click)="borrar(a)">Borrar</button>
              </td>
            </tr>
          } @empty {
            <tr><td colspan="13" class="vacio">Ninguna actividad coincide con el filtro.</td></tr>
          }
        </tbody>
      </table>
    </div>

    <!-- ---------------------------------------------------- alta y edicion -->
    @if (editando(); as f) {
      <div class="velo" (click)="cerrar()">
        <div class="modal" (click)="$event.stopPropagation()">
          <h2>{{ esNuevo() ? 'Nueva actividad' : 'Actividad ' + f.id }}</h2>
          <p class="small">
            El total es una columna calculada por la base: cantidad por numero de plantas.
          </p>
          <form class="formulario" style="margin-top:14px">
            <label>Cultivo *
              <select [ngModel]="f.codigoSistema" (ngModelChange)="alCambiarCultivo($event)"
                      name="cul" required [disabled]="!esNuevo()">
                <option [ngValue]="null">— elige —</option>
                @for (c of cultivos(); track c.codigosistema) {
                  <option [ngValue]="c.codigosistema">{{ c.codigosistema }} · {{ c.fechasiembra }}</option>
                }
              </select>
            </label>
            <label>Actividad *
              <input [ngModel]="f.Actividad" (ngModelChange)="cambiar('Actividad', $event)"
                     name="act" required maxlength="50" list="tipos-actividad" />
              <datalist id="tipos-actividad">
                @for (t of tipos(); track t) { <option [value]="t"></option> }
              </datalist>
            </label>
            <label>Semana *
              <input type="number" [ngModel]="f.semanaAbono" (ngModelChange)="cambiar('semanaAbono', $event)"
                     name="sem" required />
            </label>
            <label>Detalle
              <input [ngModel]="f.detalle" (ngModelChange)="cambiar('detalle', $event)" name="det" maxlength="50" />
            </label>
            <label>Cantidad
              <input type="number" step="0.001" [ngModel]="f.cantidadAbono"
                     (ngModelChange)="cambiar('cantidadAbono', $event)" name="can" />
            </label>
            <label>Unidad
              <input [ngModel]="f.unidad" (ngModelChange)="cambiar('unidad', $event)" name="uni" maxlength="20" />
            </label>
            <label>Plantas
              <input type="number" [ngModel]="f.numeroPlantas" (ngModelChange)="cambiar('numeroPlantas', $event)"
                     name="pla" />
            </label>
            <label>Coste unitario
              <input type="number" step="0.01" [ngModel]="f.costo" (ngModelChange)="cambiar('costo', $event)"
                     name="cos" />
            </label>
            <label>Responsable
              <input [ngModel]="f.responsable" (ngModelChange)="cambiar('responsable', $event)"
                     name="res" maxlength="255" />
            </label>
          </form>
          @if (errorForm(); as e) { <p class="aviso error" style="margin-top:14px">{{ e }}</p> }
          <div class="acciones-form">
            <button type="button" (click)="cerrar()">Cancelar</button>
            <button type="button" class="primario" (click)="guardar()">Guardar</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class Actividades implements OnInit {
  private api = inject(Api);

  actividades = signal<CostoActividad[]>([]);
  cultivos = signal<Cultivo[]>([]);
  semillas = signal<Semilla[]>([]);
  procesos = signal<Proceso[]>([]);
  lotes = signal<string[]>([]);
  resultados = signal<ResultadoProceso[]>([]);

  panelProcesos = signal(false);
  ocupado = signal(false);
  cultivoFiltro = signal<number | null>(null);
  tipoFiltro = signal<string | null>(null);
  semanaFiltro = signal<number | null>(null);

  editando = signal<any | null>(null);
  esNuevo = signal(false);
  errorForm = signal<string | null>(null);
  mensaje = signal<string | null>(null);

  tipos = computed(() => [...new Set(this.actividades().map((a) => a.Actividad))].sort());

  filtradas = computed(() => {
    const c = this.cultivoFiltro(), t = this.tipoFiltro(), s = this.semanaFiltro();
    return this.actividades().filter((a) =>
      (c == null || a.codigoSistema === c) &&
      (t == null || a.Actividad === t) &&
      (s == null || Number(s) === a.semanaAbono)
    );
  });

  costeTotal = () =>
    this.filtradas().reduce((a, x) => a + (x.GTotal ?? 0), 0)
      .toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

  redondear = (v: number | null) =>
    v == null ? '—' : v.toLocaleString('es-CO', { maximumFractionDigits: 2 });

  async ngOnInit() {
    const [act, cul, sem, proc] = await Promise.all([
      this.api.vista<CostoActividad>('cCostosActividades'),
      this.api.listar<Cultivo>('programacionCultivos'),
      this.api.listar<Semilla>('infoSemilla'),
      this.api.procesos(),
    ]);
    this.actividades.set(act);
    this.cultivos.set(cul);
    this.semillas.set(sem);
    this.procesos.set(proc.consultas);
    this.lotes.set(Object.keys(proc.lotes));
  }

  nombreSemilla(id: number): string {
    const s = this.semillas().find((x) => x.Id === id);
    return s ? [s.semilla, s.variedad].filter(Boolean).join(' ') : `#${id}`;
  }

  nombreLote(l: string): string {
    const nombres: Record<string, string> = {
      actividades: 'Labores de campo',
      abonamiento: 'Costos de abonamiento',
      costosManoDeObra: 'Costos de mano de obra',
      inventario: 'Salida de abono del almacen',
    };
    return nombres[l] ?? l;
  }

  limpiar() { this.cultivoFiltro.set(null); this.tipoFiltro.set(null); this.semanaFiltro.set(null); }

  async lanzarLote(lote: string) {
    this.ocupado.set(true);
    try {
      const r = await this.api.ejecutarLote(lote);
      this.resultados.set(r.resultados);
      this.avisar(
        r.total_insertadas === 0
          ? 'No habia nada nuevo que generar: ya estaba todo.'
          : `Se generaron ${r.total_insertadas} filas nuevas.`
      );
      await this.recargar();
    } finally { this.ocupado.set(false); }
  }

  async lanzarUno(nombre: string) {
    this.ocupado.set(true);
    try {
      const r = await this.api.ejecutarProceso(nombre);
      this.resultados.set([r]);
      this.avisar(
        r.insertadas === 0 ? 'No habia nada nuevo que generar.' : `Se generaron ${r.insertadas} filas.`
      );
      await this.recargar();
    } finally { this.ocupado.set(false); }
  }

  private async recargar() {
    this.actividades.set(await this.api.vista<CostoActividad>('cCostosActividades'));
  }

  abrirNuevo() {
    this.esNuevo.set(true);
    this.errorForm.set(null);
    this.editando.set({
      codigoSistema: null, codsemilla: null, fechaSiembra: '', semanaAbono: null,
      Actividad: '', cantidadAbono: null, lote: 0, cama: 0, numeroPlantas: null,
      detalle: null, responsable: null, costo: null, unidad: null,
    });
  }

  abrirEdicion(a: CostoActividad) {
    this.esNuevo.set(false);
    this.errorForm.set(null);
    this.editando.set({ ...a });
  }

  /** Al elegir cultivo se copian su semilla, fecha, lote, cama y plantas. */
  alCambiarCultivo(codigo: number) {
    const c = this.cultivos().find((x) => x.codigosistema === codigo);
    this.editando.update((f) => ({
      ...f!, codigoSistema: codigo,
      codsemilla: c?.codSemilla ?? null,
      fechaSiembra: c?.fechasiembra ?? '',
      lote: c?.lote ?? 0, cama: c?.cama ?? 0,
      numeroPlantas: f!.numeroPlantas ?? c?.numeroPlantasSembradas ?? null,
    }));
  }

  cambiar(campo: string, valor: any) {
    this.editando.update((f) => ({ ...f!, [campo]: valor === '' ? null : valor }));
  }

  cerrar() { this.editando.set(null); this.errorForm.set(null); }

  async guardar() {
    const f = this.editando();
    if (!f) return;
    if (f.codigoSistema == null || !f.Actividad || f.semanaAbono == null || !f.fechaSiembra) {
      this.errorForm.set('Hacen falta el cultivo, la actividad y la semana.');
      return;
    }
    const cuerpo = {
      codigoSistema: f.codigoSistema, codsemilla: f.codsemilla, fechaSiembra: f.fechaSiembra,
      semanaAbono: f.semanaAbono, Actividad: f.Actividad, cantidadAbono: f.cantidadAbono,
      lote: f.lote, cama: f.cama, numeroPlantas: f.numeroPlantas, detalle: f.detalle,
      responsable: f.responsable, costo: f.costo, unidad: f.unidad,
    };
    try {
      if (this.esNuevo()) {
        await this.api.crear('actividades', cuerpo);
        this.avisar('Actividad registrada.');
      } else {
        await this.api.actualizar('actividades', f.id, cuerpo);
        this.avisar('Actividad actualizada.');
      }
      this.cerrar();
      await this.recargar();
    } catch (e: any) {
      const msg = e?.error?.error ?? '';
      this.errorForm.set(
        msg.includes('UNIQUE')
          ? 'Ya existe una actividad de ese tipo para ese cultivo en esa semana. ' +
            'Access tenia la misma restriccion, pero la descartaba sin avisar.'
          : msg || 'No se pudo guardar la actividad.'
      );
    }
  }

  async borrar(a: CostoActividad) {
    if (!confirm(`Se va a borrar la actividad ${a.id}. Esta accion no se puede deshacer.`)) return;
    await this.api.borrar('actividades', a.id);
    this.avisar('Actividad borrada.');
    await this.recargar();
  }

  private avisar(texto: string) {
    this.mensaje.set(texto);
    setTimeout(() => this.mensaje.set(null), 4000);
  }
}
