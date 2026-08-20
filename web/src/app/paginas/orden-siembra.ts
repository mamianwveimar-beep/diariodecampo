import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Api } from '../nucleo/api';
import type { CostoActividad, Cultivo, Orden } from '../nucleo/tipos';

/**
 * Orden de siembra: lo que el operario registra en campo, con el movil.
 *
 * La pantalla se organiza alrededor de los permisos, y esa es toda su idea:
 * el operario solo puede tocar cuatro cosas —lote, cama, cantidad real
 * sembrada y el motivo de la merma—, y todo lo demas sale de la ficha de la
 * semilla y se marca como cerrado. Asi no hace falta explicar nada: se ve.
 *
 * Al guardar, el backend deja programada la temporada entera de ese cultivo
 * (POST /api/ordenes/:codigo), calculada sobre las plantas que de verdad
 * entraron, no sobre las que se habian planificado.
 *
 * Sin codigo en la ruta muestra la lista de siembras pendientes; con codigo,
 * la orden. Es el mismo componente porque es el mismo trabajo: elegir una
 * cama y registrarla.
 */
@Component({
  selector: 'dc-orden-siembra',
  imports: [FormsModule, RouterLink],
  template: `
    <!-- ==================================================== la lista -->
    @if (!codigo()) {
      <div class="cabecera">
        <div class="fila">
          <div>
            <div class="eyebrow">programacionCultivos</div>
            <h1>Órdenes de siembra</h1>
            <p class="small">
              Siembras programadas que todavía nadie ha registrado en campo.
              Elige la cama que acabas de sembrar.
            </p>
          </div>
          <a class="boton" routerLink="/siembras/nueva">Programar siembra</a>
        </div>
      </div>

      @if (cargando()) {
        <p class="small">Cargando…</p>
      } @else if (!pendientes().length) {
        <p class="aviso ok" role="status">
          No queda ninguna siembra por registrar. Todo lo programado ya está anotado en campo.
        </p>
      } @else {
        <div class="barra">
          <label>Cultivo
            <select [ngModel]="semillaFiltro()" (ngModelChange)="semillaFiltro.set($event)">
              <option [ngValue]="null">Todos</option>
              @for (s of semillasPendientes(); track s.id) {
                <option [ngValue]="s.id">{{ s.nombre }}</option>
              }
            </select>
          </label>
          <label>Lote
            <select [ngModel]="loteFiltro()" (ngModelChange)="loteFiltro.set($event)">
              <option [ngValue]="null">Todos</option>
              @for (l of lotesPendientes(); track l) { <option [ngValue]="l">{{ l }}</option> }
            </select>
          </label>
          <label>Siembra desde<input type="date" [ngModel]="desdeFiltro()"
                 (ngModelChange)="desdeFiltro.set($event || null)" /></label>
          <label>Siembra hasta<input type="date" [ngModel]="hastaFiltro()"
                 (ngModelChange)="hastaFiltro.set($event || null)" /></label>
          <button (click)="limpiar()">Limpiar</button>
          <span class="small">{{ filtradas().length }} de {{ pendientes().length }} ·
            {{ num(totalPlantas(), 0) }} plantas por registrar</span>
          @if (rangoInvertido()) {
            <span class="small" style="color:var(--ochre)">
              La fecha «desde» es posterior a la «hasta», por eso no sale nada.
            </span>
          }
        </div>

        @if (!filtradas().length) {
          <p class="vacio">Ninguna siembra coincide con el filtro.</p>
        }

        <div class="lista-ordenes">
          @for (o of filtradas(); track o.codigosistema) {
            <a class="orden-fila" [routerLink]="['/orden', o.codigosistema]">
              <span class="izq">
                <span class="n">{{ nombre(o) }}</span>
                <span class="d">
                  {{ o.fechasiembra }} ·
                  lote {{ o.lote ?? '—' }} · cama {{ o.cama ?? '—' }}
                  @if (o.factura) { · {{ o.factura }} }
                </span>
              </span>
              <span class="der">
                <span class="mono cifra">{{ referencia(o) }}</span>
                <span class="u">plantas</span>
              </span>
            </a>
          }
        </div>
      }
    }

    <!-- ==================================================== la orden -->
    @if (codigo() && orden(); as o) {
      <div class="cabecera">
        <div class="fila">
          <div>
            <div class="eyebrow">
              Orden {{ o.codigosistema }} · lote {{ loteMostrado() }} · cama {{ camaMostrada() }}
            </div>
            <h1>Orden de siembra</h1>
          </div>
          <a class="boton" routerLink="/orden">Volver a la lista</a>
        </div>
      </div>

      @if (resultado(); as r) {
        <!-- ------------------------------------------- ya registrada -->
        <div class="aviso ok" role="status" style="margin-bottom:18px">
          <span>
            <strong>Registro guardado.</strong>
            Quedaron programadas {{ r.generadas.actividades }} labores y
            {{ r.generadas.costosInsumos }} líneas de costo para este cultivo.
          </span>
        </div>

        @if (generadas().length) {
          <div class="tarjeta" style="margin-bottom:18px">
            <h2>Lo que queda programado</h2>
            <p class="small">Calculado sobre las {{ r.cultivo.numeroPlantasSembradas }} plantas que sembraste.</p>
            <div class="tabla-caja">
              <table>
                <thead>
                  <tr>
                    <th class="num">Semana</th><th>Actividad</th><th>Detalle</th>
                    <th class="num">Cantidad</th><th>Unidad</th><th class="num">Coste</th>
                  </tr>
                </thead>
                <tbody>
                  @for (a of generadas(); track a.id) {
                    <tr>
                      <td class="num">{{ a.semanaAbono }}</td>
                      <td>{{ a.Actividad }}</td>
                      <td>{{ a.detalle ?? '—' }}</td>
                      <td class="num">{{ redondear(a.total) }}</td>
                      <td>{{ a.unidad ?? '—' }}</td>
                      <td class="num">{{ redondear(a.GTotal) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }

        <div class="barra">
          <a class="boton primario" routerLink="/orden">Registrar la siguiente cama</a>
          <a class="boton" [routerLink]="['/actividades']">Ver actividades y costos</a>
        </div>
      } @else {
        <!-- ---------------------------------------------- el cultivo -->
        <section class="tarjeta cerrada" style="margin-bottom:16px">
          <div class="cab">
            <h2>{{ nombre(o) }}</h2>
            <span class="candado">Lo fija el sistema</span>
          </div>
          <div class="datos">
            <div><span class="k">Fecha de siembra</span><span class="v">{{ o.fechasiembra }}</span></div>
            <div><span class="k">Ciclo</span><span class="v">{{ o.ciclo ?? '—' }} días</span></div>
            <div>
              <span class="k">Planificado</span>
              <span class="v">
                @if (o.numeroPlantasPlanificadas != null) {
                  <span class="mono">{{ o.numeroPlantasPlanificadas }}</span> plantas
                } @else { — }
              </span>
            </div>
            <div><span class="k">Área sembrada</span><span class="v"><span class="mono">{{ num(area()) }}</span> m²</span></div>
          </div>
          @if (o.numeroPlantasPlanificadas == null) {
            <p class="small">
              Esta siembra se programó antes de que existiera la cantidad planificada,
              así que no hay con qué comparar. Se toma como referencia lo que tenía anotado.
            </p>
          }
        </section>

        <!-- ------------------------------------------ los cuatro datos -->
        <section class="tarjeta tuyo">
          <div class="cab">
            <h2>Lo que registras tú</h2>
            <span class="marca-tuyo">4 datos</span>
          </div>

          <div class="par">
            <label class="campo">
              <span class="et">Lote</span>
              <input [ngModel]="lote()" (ngModelChange)="lote.set($event || null)"
                     maxlength="20" list="lotes-conocidos" placeholder="p. ej. 4 o A1" />
              <datalist id="lotes-conocidos">
                @for (l of lotesConocidos(); track l) { <option [value]="l"></option> }
              </datalist>
            </label>
            <label class="campo">
              <span class="et">Cama</span>
              <input [ngModel]="cama()" (ngModelChange)="cama.set($event || null)"
                     maxlength="20" list="camas-conocidas" placeholder="p. ej. 4 o B2" />
              <datalist id="camas-conocidas">
                @for (c of camasConocidas(); track c) { <option [value]="c"></option> }
              </datalist>
            </label>
          </div>

          <div class="estrella">
            <span class="et">Cantidad real sembrada</span>
            <div class="paso">
              <button type="button" (click)="ajustar(-10)" aria-label="Restar diez plantas">−</button>
              <input type="number" min="0" [ngModel]="real()" (ngModelChange)="cambiarReal($event)"
                     inputmode="numeric" aria-label="Cantidad real sembrada, en plantas" />
              <button type="button" (click)="ajustar(10)" aria-label="Sumar diez plantas">+</button>
            </div>
            <p class="balance" [class.ok]="merma() === 0" [class.merma]="merma() > 0"
               [class.extra]="merma() < 0">
              <span>
                @if (merma() === 0) { Coincide con la referencia }
                @else if (merma() > 0) { Merma de {{ merma() }} plantas }
                @else { {{ -merma() }} plantas de más }
              </span>
              <span class="mono">{{ num(real() ?? 0, 0) }} / {{ num(referencia(o), 0) }}</span>
            </p>
          </div>

          @if (merma() > 0) {
            <label class="campo">
              <span class="et">Motivo de la merma de {{ merma() }} plantas · obligatorio</span>
              <textarea [ngModel]="motivo()" (ngModelChange)="motivo.set($event)" maxlength="255"
                rows="3"
                placeholder="Por qué faltaron plantas: plántulas dañadas, cepellón partido, bandeja incompleta…"></textarea>
              <span class="small">{{ (motivo() ?? '').length }} / 255</span>
            </label>
            <label class="campo">
              <span class="et">Plántulas dañadas</span>
              <input type="number" min="0" [ngModel]="danadas()"
                     (ngModelChange)="danadas.set($event === '' ? null : +$event)" inputmode="numeric" />
            </label>
          }
        </section>

        <!-- -------------------------------------------------- insumos -->
        <section class="tarjeta cerrada" style="margin-top:16px">
          <div class="cab">
            <h2>Insumos de la siembra</h2>
            <span class="candado">Calculado</span>
          </div>
          @if (insumos().length) {
            <p class="small">
              Salen de la ficha de {{ o.semilla }}, multiplicados por las plantas que sembraste.
            </p>
            <div class="insumos">
              @for (i of insumos(); track i.nombre) {
                <div class="insumo">
                  <span class="txt">
                    <span class="n">{{ i.nombre }}</span>
                    <span class="d mono">{{ num(i.tasa, 3) }} {{ i.unidad }}/planta</span>
                  </span>
                  <span class="tot">
                    <span class="g mono">{{ num(i.total) }}</span><span class="u">{{ i.unidad }}</span>
                  </span>
                </div>
              }
            </div>
            <div class="carga">
              <span class="k">Peso a llevar al campo</span>
              <span class="v mono">{{ num(peso(), 1) }} kg</span>
            </div>
            <p class="small">Los líquidos se cuentan a 1 kg por litro, que es como se carga.</p>
          } @else {
            <p class="small">
              La ficha de {{ o.semilla }} no tiene dosis de siembra registradas,
              así que no hay insumos que preparar.
            </p>
          }
        </section>

        <p class="small" style="margin-top:16px">
          Al guardar queda programada la temporada completa de este cultivo —abonos,
          deshierbes y protección, con sus costos—, calculada sobre las plantas que
          de verdad sembraste.
        </p>

        @if (error(); as e) { <p class="aviso error" style="margin-top:14px">{{ e }}</p> }

        <div class="acciones-orden">
          <button class="primario" (click)="guardar()" [disabled]="guardando() || !puedeGuardar()">
            {{ guardando() ? 'Guardando…' : 'Guardar Registro de Actividad' }}
          </button>
          @if (!puedeGuardar() && !guardando()) {
            <span class="impedimento">{{ impedimento() }}</span>
          }
        </div>
      }
    }
  `,
  styles: `
    /* ------------------------------------------------- lista de ordenes */
    .lista-ordenes { display: flex; flex-direction: column; gap: 8px; }
    .orden-fila {
      display: flex; align-items: center; justify-content: space-between; gap: 14px;
      padding: 14px 16px; min-height: 64px;
      background: var(--surface); border: 1px solid var(--rule); border-radius: var(--r);
      text-decoration: none; color: var(--ink);
    }
    .orden-fila:hover { background: var(--surface-2); border-color: var(--rule-strong); }
    .orden-fila .izq { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
    .orden-fila .izq .n { font-weight: 600; }
    .orden-fila .izq .d { font-size: .82rem; color: var(--ink-2); }
    .orden-fila .der { display: flex; flex-direction: column; align-items: flex-end; line-height: 1.1; }
    .orden-fila .der .cifra { font-size: 1.1rem; font-weight: 600; }
    .orden-fila .der .u { font-size: .72rem; color: var(--ink-3); }

    /* ------------------------------------------- cerrado frente a tuyo */
    .tarjeta .cab {
      display: flex; align-items: center; justify-content: space-between;
      gap: 10px; flex-wrap: wrap;
    }
    .candado, .marca-tuyo {
      font-family: var(--f-mono); font-size: .64rem; font-weight: 500;
      letter-spacing: .09em; text-transform: uppercase;
      padding: 3px 9px; border-radius: 999px; white-space: nowrap;
    }
    .candado { background: var(--surface-2); color: var(--ink-3); border: 1px solid var(--rule); }
    .marca-tuyo { background: var(--moss-soft); color: var(--moss); border: 1px solid var(--moss); }

    .tarjeta.cerrada { background: var(--surface); }
    .tarjeta.tuyo { border: 2px solid var(--moss); }

    .datos {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 1px; background: var(--rule); border: 1px solid var(--rule);
      border-radius: var(--r); overflow: hidden;
    }
    .datos > div { background: var(--surface-2); padding: 10px 13px; display: flex; flex-direction: column; }
    .datos .k {
      font-family: var(--f-mono); font-size: .62rem; letter-spacing: .1em;
      text-transform: uppercase; color: var(--ink-3);
    }
    .datos .v { font-size: .95rem; font-weight: 600; }

    /* ------------------------------------------------------- controles */
    .par { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
    .campo { display: flex; flex-direction: column; gap: 5px; }
    .campo .et {
      font-family: var(--f-mono); font-size: .64rem; font-weight: 500;
      letter-spacing: .1em; text-transform: uppercase; color: var(--ink-2);
    }
    .campo input, .campo textarea { min-height: 48px; font-size: 1rem; }
    .campo textarea { min-height: 84px; }

    .estrella { display: flex; flex-direction: column; gap: 9px; }
    .paso { display: flex; gap: 9px; }
    .paso button {
      flex: none; width: 58px; min-height: 68px; font-size: 1.5rem; padding: 0;
      border: 1px solid var(--rule-strong); color: var(--moss);
    }
    .paso button:hover { background: var(--moss-soft); }
    .paso input {
      flex: 1; min-width: 0; min-height: 68px; text-align: center;
      font-family: var(--f-mono); font-variant-numeric: tabular-nums;
      font-size: 1.9rem; font-weight: 600; padding: 0 6px;
    }

    .balance {
      display: flex; align-items: center; justify-content: space-between; gap: 10px;
      padding: 10px 13px; border-radius: var(--r); font-size: .87rem; font-weight: 500;
    }
    .balance.ok    { background: var(--moss-soft);  color: var(--moss); }
    .balance.merma { background: var(--ochre-soft); color: var(--ochre); }
    .balance.extra { background: var(--accent-soft); color: var(--accent); }

    /* --------------------------------------------------------- insumos */
    .insumos { display: flex; flex-direction: column; }
    .insumo {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 11px 0; border-bottom: 1px solid var(--rule);
    }
    .insumo:last-child { border-bottom: none; }
    .insumo .txt { display: flex; flex-direction: column; min-width: 0; }
    .insumo .txt .n { font-weight: 600; font-size: .92rem; }
    .insumo .txt .d { font-size: .76rem; color: var(--ink-3); }
    .insumo .tot { text-align: right; }
    .insumo .tot .g { font-size: 1.05rem; font-weight: 600; }
    .insumo .tot .u { font-size: .72rem; color: var(--ink-3); margin-left: 3px; }

    .carga {
      display: flex; align-items: baseline; justify-content: space-between; gap: 12px;
      padding: 12px 14px; border-radius: var(--r);
      background: var(--moss-soft); color: var(--moss);
    }
    .carga .k { font-size: .85rem; font-weight: 600; }
    .carga .v { font-size: 1.5rem; font-weight: 600; }

    /* -------------------------------------------------------- acciones */
    .acciones-orden {
      display: flex; flex-direction: column; align-items: stretch; gap: 8px;
      margin-top: 18px;
    }
    .acciones-orden button { min-height: 56px; font-size: 1rem; }
    /* verde y no el azul del resto: aqui el boton es el gesto de "hecho",
       y va en el mismo color con el que la pantalla marca lo que es tuyo. */
    .acciones-orden button.primario {
      background: var(--moss); border-color: var(--moss); color: #fff;
    }
    .acciones-orden button.primario:hover:not(:disabled) { filter: brightness(1.08); }
    .impedimento { font-size: .82rem; color: var(--oxide); text-align: center; }

    @media (max-width: 620px) {
      .paso button { width: 52px; }
      .paso input { font-size: 1.6rem; }
    }
  `,
})
export class OrdenSiembra implements OnInit {
  private api = inject(Api);
  private ruta = inject(ActivatedRoute);
  private router = inject(Router);

  codigo = signal<number | null>(null);
  orden = signal<Orden | null>(null);
  pendientes = signal<Orden[]>([]);
  cultivos = signal<Cultivo[]>([]);
  generadas = signal<CostoActividad[]>([]);

  // filtros de la lista, los mismos que en Actividades y costos
  semillaFiltro = signal<number | null>(null);
  loteFiltro = signal<string | null>(null);
  desdeFiltro = signal<string | null>(null);
  hastaFiltro = signal<string | null>(null);

  cargando = signal(false);
  guardando = signal(false);
  error = signal<string | null>(null);
  resultado = signal<{
    cultivo: Cultivo; merma: number;
    generadas: { actividades: number; costosInsumos: number };
  } | null>(null);

  // los cuatro datos del operario
  lote = signal<string | null>(null);
  cama = signal<string | null>(null);
  real = signal<number | null>(null);
  motivo = signal<string | null>(null);
  danadas = signal<number | null>(null);

  /**
   * Contra que se compara lo sembrado. Lo normal es la cantidad planificada,
   * pero las siembras anteriores a esta pantalla no la tienen: entonces se
   * usa lo que llevaban anotado, que es lo unico que se sabe.
   */
  referencia = (o: Orden) => o.numeroPlantasPlanificadas ?? o.numeroPlantasSembradas ?? 0;

  /** Solo las semillas que de verdad estan pendientes: la lista no ofrece vacio. */
  semillasPendientes = computed(() => {
    const vistas = new Map<number, string>();
    for (const o of this.pendientes()) vistas.set(o.codSemilla, this.nombre(o));
    return [...vistas].map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  });

  lotesPendientes = computed(() =>
    [...new Set(this.pendientes().map((o) => o.lote).filter((x): x is string => !!x))]
      .sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
  );

  /**
   * El rango va sobre fechasiembra. Las fechas son ISO 'YYYY-MM-DD', asi que
   * compararlas como texto ya ordena bien y no hace falta construir un Date
   * por fila en cada repintado.
   */
  filtradas = computed(() => {
    const sem = this.semillaFiltro(), lote = this.loteFiltro();
    const desde = this.desdeFiltro(), hasta = this.hastaFiltro();
    return this.pendientes().filter((o) =>
      (sem == null || o.codSemilla === sem) &&
      (lote == null || o.lote === lote) &&
      (!desde || o.fechasiembra >= desde) &&
      (!hasta || o.fechasiembra <= hasta)
    );
  });

  /** Un rango al reves da cero filas sin motivo visible; conviene decirlo. */
  rangoInvertido = computed(() => {
    const d = this.desdeFiltro(), h = this.hastaFiltro();
    return Boolean(d && h && d > h);
  });

  totalPlantas = computed(() =>
    this.filtradas().reduce((a, o) => a + this.referencia(o), 0)
  );

  merma = computed(() => {
    const o = this.orden();
    if (!o) return 0;
    return this.referencia(o) - (this.real() ?? 0);
  });

  area = computed(() => {
    const o = this.orden();
    if (!o?.marcoSiembra) return o?.areaCultivada ?? 0;
    return +(((this.real() ?? 0) * o.marcoSiembra)).toFixed(2);
  });

  loteMostrado = computed(() => this.lote() || '—');
  camaMostrada = computed(() => this.cama() || '—');

  lotesConocidos = computed(() =>
    [...new Set(this.cultivos().map((c) => c.lote).filter((x): x is string => !!x))].sort()
  );
  camasConocidas = computed(() =>
    [...new Set(this.cultivos().map((c) => c.cama).filter((x): x is string => !!x))].sort()
  );

  /**
   * Los insumos que se aplican el dia de la siembra, sacados de la ficha.
   * abonoLiquido entra aqui porque es la dosis de Basilus contra el trozador,
   * que es la unica proteccion que va el mismo dia de la siembra.
   */
  insumos = computed(() => {
    const o = this.orden();
    const n = this.real() ?? 0;
    if (!o || !n) return [];
    const filas: { nombre: string; tasa: number; unidad: string; total: number; solido: boolean }[] = [];
    const anadir = (nombre: string, tasa: number | null, unidad: string, solido: boolean) => {
      if (tasa == null || tasa <= 0) return;
      filas.push({ nombre, tasa, unidad, total: +(tasa * n).toFixed(2), solido });
    };
    anadir('Abono en siembra', o.abonoSiembra, 'kg', true);
    anadir('Cal dolomita', o.calDolomita, 'kg', true);
    anadir('Basilus (trozador)', o.abonoLiquido, 'L', false);
    return filas;
  });

  /** Los litros se cuentan a 1 kg/L: es la aproximacion con la que se carga. */
  peso = computed(() =>
    +this.insumos().reduce((a, i) => a + i.total, 0).toFixed(1)
  );

  puedeGuardar = computed(() => {
    if (this.real() == null || (this.real() ?? -1) < 0) return false;
    if (this.merma() > 0 && (this.motivo() ?? '').trim().length < 5) return false;
    return true;
  });

  impedimento = computed(() => {
    if (this.real() == null) return 'Falta la cantidad real sembrada.';
    if (this.merma() > 0 && (this.motivo() ?? '').trim().length < 5) {
      return 'Falta el motivo de la merma.';
    }
    return '';
  });

  /** Numeros con coma decimal, como el resto de la aplicacion. */
  num = (v: number | null, decimales = 2) =>
    v == null ? '—' : v.toLocaleString('es-CO', { maximumFractionDigits: decimales });

  redondear = (v: number | null) =>
    v == null ? '—' : v.toLocaleString('es-CO', { maximumFractionDigits: 2 });

  nombre = (o: Orden) => [o.semilla, o.variedad].filter(Boolean).join(' ') || `Semilla ${o.codSemilla}`;

  async ngOnInit() {
    this.ruta.paramMap.subscribe(async (p) => {
      const c = p.get('codigo');
      this.codigo.set(c ? Number(c) : null);
      this.resultado.set(null);
      this.error.set(null);
      await this.cargar();
    });
  }

  private async cargar() {
    this.cargando.set(true);
    try {
      const c = this.codigo();
      if (c == null) {
        this.pendientes.set(await this.api.ordenesPendientes());
        return;
      }
      const [o, cultivos] = await Promise.all([
        this.api.orden(c),
        this.api.listar<Cultivo>('programacionCultivos', 2000),
      ]);
      this.orden.set(o);
      this.cultivos.set(cultivos);
      // los cuatro campos arrancan con lo que ya tenia la programacion
      this.lote.set(o.lote);
      this.cama.set(o.cama);
      this.real.set(this.referencia(o));
      this.motivo.set(null);
      this.danadas.set(null);
    } finally {
      this.cargando.set(false);
    }
  }

  limpiar() {
    this.semillaFiltro.set(null);
    this.loteFiltro.set(null);
    this.desdeFiltro.set(null);
    this.hastaFiltro.set(null);
  }

  cambiarReal(valor: any) {
    this.real.set(valor === '' || valor == null ? null : Math.max(0, Number(valor)));
  }

  ajustar(delta: number) {
    this.real.set(Math.max(0, (this.real() ?? 0) + delta));
  }

  async guardar() {
    const c = this.codigo();
    if (c == null || !this.puedeGuardar()) return;
    this.guardando.set(true);
    this.error.set(null);
    try {
      const r = await this.api.registrarOrden(c, {
        lote: this.lote(),
        cama: this.cama(),
        numeroPlantasSembradas: this.real()!,
        plantulasDanadas: this.danadas(),
        motivoMerma: this.motivo(),
      });
      this.resultado.set(r);
      // se traen las labores que acaban de quedar programadas, para verlas
      const todas = await this.api.vista<CostoActividad>('cCostosActividades');
      this.generadas.set(
        todas.filter((a) => a.codigoSistema === c)
          .sort((a, b) => a.semanaAbono - b.semanaAbono)
      );
    } catch (e: any) {
      this.error.set(e?.error?.error ?? 'No se pudo guardar el registro.');
    } finally {
      this.guardando.set(false);
    }
  }
}
