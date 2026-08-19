import { Component, computed, inject, input, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api } from '../nucleo/api';
import type { Cultivo, Semilla, Cosecha } from '../nucleo/tipos';

/**
 * Siembras: sustituye a Frm_Siembra + SubFrm_Siembra + Frm_Datos +
 * Frm_DatosCosecha de Access, que eran cuatro formularios encadenados.
 *
 * Un cambio deliberado respecto al original: Access buscaba con
 * `fechasiembra LIKE '*texto*'`, una comparacion de texto sobre un campo de
 * fecha. Aqui es un filtro por rango, que es lo que se queria hacer.
 */
@Component({
  selector: 'dc-siembras',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="cabecera">
      <div class="fila">
        <div>
          <div class="eyebrow">programacionCultivos</div>
          <h1>Siembras</h1>
          <p class="small">Cada cultivo programado, con sus cosechas.</p>
        </div>
        <a class="boton primario" routerLink="/siembras/nueva">Registrar siembra</a>
      </div>
    </div>

    @if (mensaje(); as m) { <p class="aviso ok" role="status">{{ m }}</p> }

    <div class="barra">
      <label>Sembradas desde<input type="date" [ngModel]="desde()" (ngModelChange)="desde.set($event)" /></label>
      <label>Hasta<input type="date" [ngModel]="hasta()" (ngModelChange)="hasta.set($event)" /></label>
      <label>Semilla
        <select [ngModel]="semillaFiltro()" (ngModelChange)="semillaFiltro.set($event)">
          <option [ngValue]="null">Todas</option>
          @for (s of semillas(); track s.Id) {
            <option [ngValue]="s.Id">{{ s.semilla }} {{ s.variedad }}</option>
          }
        </select>
      </label>
      <label>Estado
        <select [ngModel]="soloActivos()" (ngModelChange)="soloActivos.set($event)">
          <option [ngValue]="true">Solo activos</option>
          <option [ngValue]="false">Todos</option>
        </select>
      </label>
      <button (click)="limpiar()">Limpiar</button>
      <span class="small">{{ filtrados().length }} de {{ cultivos().length }}</span>
    </div>

    <div class="tabla-caja">
      <table>
        <thead>
          <tr>
            <th>Codigo</th><th>Semilla</th><th>Siembra</th><th>Factura</th>
            <th class="num">Plantas</th><th class="num">Lote</th><th class="num">Cama</th>
            <th class="num">Kilos</th><th>Activo</th><th></th>
          </tr>
        </thead>
        <tbody>
          @for (c of filtrados(); track c.codigosistema) {
            <tr>
              <td class="num">{{ c.codigosistema }}</td>
              <td>{{ nombreSemilla(c.codSemilla) }}</td>
              <td>{{ c.fechasiembra }}</td>
              <td>{{ c.factura ?? '—' }}</td>
              <td class="num">{{ c.numeroPlantasSembradas }}</td>
              <td class="num">{{ c.lote }}</td>
              <td class="num">{{ c.cama }}</td>
              <td class="num">{{ c.kilosCosechados }}</td>
              <td><span class="etiqueta" [class.si]="c.activo === 1" [class.no]="c.activo !== 1">
                {{ c.activo === 1 ? 'Si' : 'No' }}</span></td>
              <td class="acciones">
                <button class="menudo" (click)="verCosechas(c)">Cosechas</button>
                <button class="menudo" (click)="abrirEdicion(c)">Editar</button>
                <button class="menudo peligro" (click)="borrar(c)">Borrar</button>
              </td>
            </tr>
          } @empty {
            <tr><td colspan="10" class="vacio">Ninguna siembra coincide con el filtro.</td></tr>
          }
        </tbody>
      </table>
    </div>

    <!-- ---------------------------------------------------- alta y edicion -->
    @if (editando(); as f) {
      <div class="velo" (click)="cerrar()">
        <div class="modal" (click)="$event.stopPropagation()">
          <h2>{{ esNuevo() ? 'Nueva siembra' : 'Siembra ' + f.codigosistema }}</h2>
          <p class="small">Los campos marcados con * son obligatorios.</p>
          <form class="formulario" style="margin-top:14px">
            <label>Semilla *
              <select [ngModel]="f.codSemilla" (ngModelChange)="cambiar('codSemilla', $event)" name="codSemilla" required>
                <option [ngValue]="null">— elige —</option>
                @for (s of semillas(); track s.Id) {
                  <option [ngValue]="s.Id">{{ s.semilla }} {{ s.variedad }}</option>
                }
              </select>
            </label>
            <label>Fecha de siembra *
              <input type="date" [ngModel]="f.fechasiembra" (ngModelChange)="cambiar('fechasiembra', $event)"
                     name="fechasiembra" required />
            </label>
            <label>Plantas sembradas *
              <input type="number" [ngModel]="f.numeroPlantasSembradas"
                     (ngModelChange)="cambiar('numeroPlantasSembradas', $event)" name="plantas" required />
            </label>
            <label>Lote
              <input type="number" step="0.01" [ngModel]="f.lote" (ngModelChange)="cambiar('lote', $event)" name="lote" />
            </label>
            <label>Cama
              <input type="number" step="0.01" [ngModel]="f.cama" (ngModelChange)="cambiar('cama', $event)" name="cama" />
            </label>
            <label>Factura
              <input [ngModel]="f.factura" (ngModelChange)="cambiar('factura', $event)" name="factura" maxlength="30" />
            </label>
            <label>Area cultivada
              <input type="number" step="0.01" [ngModel]="f.areaCultivada"
                     (ngModelChange)="cambiar('areaCultivada', $event)" name="area" />
            </label>
            <label>Codigo de semillero
              <input [ngModel]="f.codigoSemillero" (ngModelChange)="cambiar('codigoSemillero', $event)"
                     name="semillero" maxlength="50" />
            </label>
            <label>Activo
              <select [ngModel]="f.activo" (ngModelChange)="cambiar('activo', $event)" name="activo">
                <option [ngValue]="1">Si</option><option [ngValue]="0">No</option>
              </select>
            </label>
            <label class="ancho">Observaciones
              <textarea [ngModel]="f.observaciones" (ngModelChange)="cambiar('observaciones', $event)"
                        name="obs" maxlength="255"></textarea>
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

    <!-- -------------------------------------------------------- cosechas -->
    @if (cultivoCosechas(); as cul) {
      <div class="velo" (click)="cerrarCosechas()">
        <div class="modal" (click)="$event.stopPropagation()">
          <h2>Cosechas del cultivo {{ cul.codigosistema }}</h2>
          <p class="small">{{ nombreSemilla(cul.codSemilla) }} · sembrado el {{ cul.fechasiembra }}
            · {{ cul.numeroPlantasSembradas }} plantas</p>

          <div class="tabla-caja" style="margin-top:14px">
            <table>
              <thead>
                <tr><th>Fecha</th><th class="num">Peso (kg)</th><th class="num">Peso medio</th>
                    <th class="num">Plantas</th><th>Remision</th><th>Factura</th><th></th></tr>
              </thead>
              <tbody>
                @for (h of cosechas(); track h.Id) {
                  <tr>
                    <td>{{ h.fechaCosecha }}</td>
                    <td class="num">{{ h.peso }}</td>
                    <td class="num">{{ h.pesoPromedio ?? '—' }}</td>
                    <td class="num">{{ h.numeroPlantasCosechadas ?? '—' }}</td>
                    <td>{{ h.remision ?? '—' }}</td>
                    <td>{{ h.factura ?? '—' }}</td>
                    <td class="acciones">
                      <button class="menudo peligro" (click)="borrarCosecha(h)">Borrar</button>
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="7" class="vacio">Este cultivo aun no tiene cosechas.</td></tr>
                }
              </tbody>
              @if (cosechas().length) {
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td class="num">{{ totalPeso() }}</td>
                    <td></td>
                    <td class="num">{{ totalPlantas() }}</td>
                    <td colspan="3"></td>
                  </tr>
                </tfoot>
              }
            </table>
          </div>

          <h3 style="margin-top:20px">Registrar una cosecha</h3>
          <form class="formulario" style="margin-top:10px">
            <label>Fecha *<input type="date" [ngModel]="nueva().fechaCosecha"
                   (ngModelChange)="cambiarCosecha('fechaCosecha', $event)" name="fc" required /></label>
            <label>Peso (kg) *<input type="number" step="0.01" [ngModel]="nueva().peso"
                   (ngModelChange)="cambiarCosecha('peso', $event)" name="peso" required /></label>
            <label>Peso medio<input type="number" step="0.01" [ngModel]="nueva().pesoPromedio"
                   (ngModelChange)="cambiarCosecha('pesoPromedio', $event)" name="pp" /></label>
            <label>Plantas cosechadas<input type="number" [ngModel]="nueva().numeroPlantasCosechadas"
                   (ngModelChange)="cambiarCosecha('numeroPlantasCosechadas', $event)" name="npc" /></label>
            <label>Remision<input [ngModel]="nueva().remision"
                   (ngModelChange)="cambiarCosecha('remision', $event)" name="rem" /></label>
            <label>Factura<input [ngModel]="nueva().factura"
                   (ngModelChange)="cambiarCosecha('factura', $event)" name="fac" /></label>
            <label class="ancho">Observacion<textarea [ngModel]="nueva().observacion"
                   (ngModelChange)="cambiarCosecha('observacion', $event)" name="obs2"></textarea></label>
          </form>
          @if (errorCosecha(); as e) { <p class="aviso error" style="margin-top:14px">{{ e }}</p> }
          <div class="acciones-form">
            <button type="button" (click)="cerrarCosechas()">Cerrar</button>
            <button type="button" class="primario" (click)="guardarCosecha()">Anadir cosecha</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class Siembras implements OnInit {
  private api = inject(Api);

  /** Llega como parametro de consulta desde el resumen de inicio. */
  cultivo = input<string | undefined>(undefined);

  cultivos = signal<Cultivo[]>([]);
  semillas = signal<Semilla[]>([]);
  cosechas = signal<Cosecha[]>([]);

  desde = signal('');
  hasta = signal('');
  semillaFiltro = signal<number | null>(null);
  codigoFiltro = signal<number | null>(null);
  soloActivos = signal(true);

  editando = signal<any | null>(null);
  esNuevo = signal(false);
  errorForm = signal<string | null>(null);
  mensaje = signal<string | null>(null);

  cultivoCosechas = signal<Cultivo | null>(null);
  nueva = signal<Partial<Cosecha>>({});
  errorCosecha = signal<string | null>(null);

  filtrados = computed(() => {
    const d = this.desde(), h = this.hasta(), s = this.semillaFiltro();
    const cod = this.codigoFiltro(), act = this.soloActivos();
    return this.cultivos().filter((c) =>
      (!d || c.fechasiembra >= d) &&
      (!h || c.fechasiembra <= h) &&
      (s == null || c.codSemilla === s) &&
      (cod == null || c.codigosistema === cod) &&
      (!act || c.activo === 1)
    );
  });

  totalPeso = () =>
    this.cosechas().reduce((a, c) => a + (c.peso ?? 0), 0).toLocaleString('es-CO', { maximumFractionDigits: 2 });
  totalPlantas = () => this.cosechas().reduce((a, c) => a + (c.numeroPlantasCosechadas ?? 0), 0);

  async ngOnInit() {
    // si se llega desde el resumen con ?cultivo=NN, se muestra solo ese
    const pedido = this.cultivo();
    if (pedido) { this.codigoFiltro.set(Number(pedido)); this.soloActivos.set(false); }

    const [cultivos, semillas] = await Promise.all([
      this.api.listar<Cultivo>('programacionCultivos'),
      this.api.listar<Semilla>('infoSemilla'),
    ]);
    this.cultivos.set(cultivos);
    this.semillas.set(semillas);
  }

  nombreSemilla(id: number): string {
    const s = this.semillas().find((x) => x.Id === id);
    return s ? [s.semilla, s.variedad].filter(Boolean).join(' ') : `#${id}`;
  }

  limpiar() {
    this.desde.set(''); this.hasta.set('');
    this.semillaFiltro.set(null); this.codigoFiltro.set(null); this.soloActivos.set(true);
  }

  abrirNuevo() {
    this.esNuevo.set(true);
    this.errorForm.set(null);
    this.editando.set({
      codSemilla: null, fechasiembra: '', numeroPlantasSembradas: null,
      lote: 0, cama: 0, factura: null, areaCultivada: 0,
      codigoSemillero: null, observaciones: null, activo: 1,
    });
  }

  abrirEdicion(c: Cultivo) {
    this.esNuevo.set(false);
    this.errorForm.set(null);
    this.editando.set({ ...c });
  }

  cambiar(campo: string, valor: any) {
    this.editando.update((f) => ({ ...f!, [campo]: valor === '' ? null : valor }));
  }

  cerrar() { this.editando.set(null); this.errorForm.set(null); }

  async guardar() {
    const f = this.editando();
    if (!f) return;
    if (f.codSemilla == null || !f.fechasiembra || f.numeroPlantasSembradas == null) {
      this.errorForm.set('Hacen falta la semilla, la fecha de siembra y el numero de plantas.');
      return;
    }
    const cuerpo = {
      codSemilla: f.codSemilla, fechasiembra: f.fechasiembra,
      numeroPlantasSembradas: f.numeroPlantasSembradas, lote: f.lote, cama: f.cama,
      factura: f.factura, areaCultivada: f.areaCultivada, codigoSemillero: f.codigoSemillero,
      observaciones: f.observaciones, activo: f.activo,
    };
    try {
      if (this.esNuevo()) {
        await this.api.crear<Cultivo>('programacionCultivos', cuerpo);
        this.avisar('Siembra registrada.');
      } else {
        await this.api.actualizar<Cultivo>('programacionCultivos', f.codigosistema, cuerpo);
        this.avisar('Siembra actualizada.');
      }
      this.cerrar();
      this.cultivos.set(await this.api.listar<Cultivo>('programacionCultivos'));
    } catch (e: any) {
      this.errorForm.set(e?.error?.error ?? 'No se pudo guardar la siembra.');
    }
  }

  async borrar(c: Cultivo) {
    if (!confirm(
      `Se va a borrar el cultivo ${c.codigosistema} y, en cascada, sus actividades, ` +
      `costos y cosechas. Esta accion no se puede deshacer.`
    )) return;
    await this.api.borrar('programacionCultivos', c.codigosistema);
    this.avisar('Cultivo borrado.');
    this.cultivos.set(await this.api.listar<Cultivo>('programacionCultivos'));
  }

  // -------------------------------------------------------------- cosechas
  async verCosechas(c: Cultivo) {
    this.cultivoCosechas.set(c);
    this.nueva.set({ codigosistema: c.codigosistema });
    this.errorCosecha.set(null);
    const todas = await this.api.listar<Cosecha>('cosecha');
    this.cosechas.set(todas.filter((h) => h.codigosistema === c.codigosistema));
  }

  cerrarCosechas() { this.cultivoCosechas.set(null); this.cosechas.set([]); }

  cambiarCosecha(campo: string, valor: any) {
    this.nueva.update((n) => ({ ...n, [campo]: valor === '' ? null : valor }));
  }

  async guardarCosecha() {
    const c = this.cultivoCosechas();
    const n = this.nueva();
    if (!c) return;
    if (!n.fechaCosecha || n.peso == null) {
      this.errorCosecha.set('Hacen falta al menos la fecha y el peso.');
      return;
    }
    try {
      await this.api.crear<Cosecha>('cosecha', { ...n, codigosistema: c.codigosistema });
      this.nueva.set({ codigosistema: c.codigosistema });
      this.errorCosecha.set(null);
      await this.verCosechas(c);
      this.avisar('Cosecha registrada.');
    } catch (e: any) {
      this.errorCosecha.set(e?.error?.error ?? 'No se pudo registrar la cosecha.');
    }
  }

  async borrarCosecha(h: Cosecha) {
    if (!confirm('Se va a borrar esta cosecha. Esta accion no se puede deshacer.')) return;
    await this.api.borrar('cosecha', h.Id);
    const c = this.cultivoCosechas();
    if (c) await this.verCosechas(c);
  }

  private avisar(texto: string) {
    this.mensaje.set(texto);
    setTimeout(() => this.mensaje.set(null), 3500);
  }
}
