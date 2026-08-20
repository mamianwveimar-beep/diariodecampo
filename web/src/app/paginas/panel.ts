import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from '../nucleo/api';
import { hoyLocal, semanaAccess, sumarDias } from '../nucleo/fechas';
import type { Actividad, Cultivo, EstadoActividad, Producto, Semilla } from '../nucleo/tipos';

/** Un cultivo con lo que hace falta para saber cuando sale. */
interface Cosechable {
  cultivo: Cultivo;
  nombre: string;
  fechaCosecha: string;
  /** Negativo si la fecha estimada ya paso. */
  faltan: number;
  /** Dias corridos desde la siembra hasta hoy. */
  diasEnTerreno: number;
  /** Ciclo planificado de la ficha, en dias. 0 si la semilla no lo trae. */
  ciclo: number;
}

/**
 * Panel de la finca: el estado de hoy de un vistazo.
 *
 * Sustituye al antiguo "Resumen de la finca", que contaba totales acumulados
 * -kilos historicos, filas en cuarentena- pero no decia nada sobre que hay
 * que hacer hoy. Aqui todo se mide contra la fecha actual: cuanto falta para
 * cada cosecha y que labores caen en la semana en curso.
 *
 * Las graficas van en SVG a mano y no con una libreria. Son dos, y meter
 * ApexCharts o Chart.js sumaria mas peso que toda la aplicacion junta para
 * dibujar un anillo y ocho barras; ademas asi salen bien por impresora con
 * las reglas @media print que ya tiene styles.css.
 */
@Component({
  selector: 'dc-panel',
  imports: [RouterLink],
  template: `
    <div class="cabecera">
      <div class="eyebrow">Semana {{ semana }} · {{ diaDeHoy }}</div>
      <h1>Panel de la finca</h1>
      <p class="small">Lo que hay en campo ahora mismo y lo que toca esta semana.</p>
    </div>

    @if (cargando()) {
      <p class="small">Cargando…</p>
    } @else {

    <!-- ------------------------------------------------------- cifras -->
    <div class="rejilla" style="margin-bottom:22px">
      <div class="tarjeta cifra">
        <span class="n">{{ activos().length }}</span>
        <span class="l">Cultivos activos en campo</span>
      </div>
      <div class="tarjeta cifra" [class.urgente]="porSalir().length > 0">
        <span class="n">{{ porSalir().length }}</span>
        <span class="l">Próximos a cosecha, en 14 días o menos</span>
      </div>
      <div class="tarjeta cifra">
        <span class="n">{{ pendientes().length }}</span>
        <span class="l">Labores pendientes esta semana</span>
      </div>
      <div class="tarjeta cifra">
        <span class="n">{{ pesos(costoSemana()) }}</span>
        <span class="l">Costo programado de la semana</span>
      </div>
    </div>

    @if (bajoMinimos().length) {
      <p class="aviso atencion" style="margin-bottom:22px">
        <span><strong>Existencias bajo mínimos:</strong> {{ bajoMinimos().join(', ') }}.</span>
      </p>
    }

    <!-- ------------------------------------------------------ graficas -->
    <div class="graficas">
      <section class="tarjeta">
        <h2>Avance de la semana</h2>
        @if (deLaSemana().length) {
          <div class="anillo">
            <svg viewBox="0 0 120 120" role="img"
                 [attr.aria-label]="'Avance: ' + hechas().length + ' de ' + deLaSemana().length + ' labores hechas'">
              <circle cx="60" cy="60" r="52" class="pista" />
              @for (t of tramos(); track t.clase) {
                <circle cx="60" cy="60" r="52" [attr.class]="t.clase"
                        [attr.stroke-dasharray]="t.largo + ' ' + (perimetro - t.largo)"
                        [attr.stroke-dashoffset]="-t.desde" />
              }
              <text x="60" y="56" class="pc">{{ porcentaje() }}%</text>
              <text x="60" y="74" class="pie">hecho</text>
            </svg>
            <ul class="leyenda">
              @for (l of leyenda(); track l.clase) {
                <li><span class="punto" [attr.data-c]="l.clase"></span>{{ l.texto }}</li>
              }
            </ul>
          </div>
        } @else {
          <p class="small">No hay labores programadas para esta semana.</p>
        }
      </section>

      <section class="tarjeta">
        <h2>Costo por semana</h2>
        <p class="small">
          Las últimas ocho, incluida la actual. La más alta llega a
          <b>{{ pesos(techoSemanas()) }}</b>.
        </p>
        <div class="barras">
          @for (b of porSemana(); track b.semana) {
            <div class="barra" [class.ahora]="b.semana === semana"
                 [title]="'Semana ' + b.semana + ': ' + pesos(b.costo)">
              <span class="palo" [style.height.%]="b.alto"></span>
              <span class="eje">{{ b.semana }}</span>
            </div>
          }
        </div>
      </section>
    </div>

    <!-- --------------------------------------------- proximos a cosecha -->
    <section style="margin-top:26px">
      <div class="titulo-seccion">
        <h2>Próximos a cosecha</h2>
        <a class="small" routerLink="/siembras">Ver todas las siembras</a>
      </div>
      @if (proximos().length) {
        <div class="tarjetas">
          @for (c of proximos(); track c.cultivo.codigosistema) {
            <article class="cosecha" [attr.data-urgencia]="urgencia(c.faltan)">
              <header>
                <span class="n">{{ c.nombre }}</span>
                <span class="cuando">{{ cuando(c.faltan) }}</span>
              </header>
              <p class="d">
                Cultivo {{ c.cultivo.codigosistema }} ·
                lote {{ c.cultivo.lote ?? '—' }} · cama {{ c.cultivo.cama ?? '—' }}
              </p>
              <p class="d">{{ c.cultivo.numeroPlantasSembradas ?? 0 }} plantas</p>
              <div class="metricas">
                <span class="metrica">
                  <span class="v">{{ c.diasEnTerreno }}</span>
                  <span class="k">días en terreno</span>
                </span>
                <span class="metrica">
                  <span class="v">{{ c.ciclo || '—' }}</span>
                  <span class="k">ciclo (días)</span>
                </span>
              </div>
            </article>
          }
        </div>
      } @else {
        <p class="vacio">Ningún cultivo cierra ciclo en el próximo mes.</p>
      }
    </section>

    <!-- ------------------------------------------ labores de la semana -->
    <section style="margin-top:26px">
      <div class="titulo-seccion">
        <h2>Labores de esta semana</h2>
        <a class="small" routerLink="/seguimiento">Abrir seguimiento en campo</a>
      </div>
      @if (pendientes().length) {
        <div class="tarjetas">
          @for (a of primerasPendientes(); track a.id) {
            <article class="labor">
              <div class="que">
                <span class="n">{{ a.Actividad }}</span>
                <span class="d">
                  {{ a.detalle ?? 'sin detalle' }} ·
                  cultivo {{ a.codigoSistema }} · lote {{ a.lote ?? '—' }} · cama {{ a.cama ?? '—' }}
                </span>
              </div>
              <button class="primario" (click)="marcarHecha(a)" [disabled]="guardando().has(a.id)">
                {{ guardando().has(a.id) ? 'Guardando…' : 'Marcar realizado' }}
              </button>
            </article>
          }
        </div>
        @if (pendientes().length > primerasPendientes().length) {
          <p class="small" style="margin-top:12px">
            Y {{ pendientes().length - primerasPendientes().length }} más.
            <a routerLink="/seguimiento">Verlas todas en seguimiento en campo</a>,
            que es donde se marcan cama por cama.
          </p>
        }
      } @else if (deLaSemana().length) {
        <p class="aviso ok" role="status">
          <span>Todo lo de esta semana está registrado. {{ hechas().length }} labores hechas.</span>
        </p>
      } @else {
        <p class="vacio">No hay labores programadas para esta semana.</p>
      }
    </section>

    @if (error(); as e) { <p class="aviso error" style="margin-top:16px">{{ e }}</p> }
    }
  `,
  styles: `
    .cifra.urgente .n { color: var(--ochre); }

    .graficas { display: grid; gap: 16px; grid-template-columns: minmax(0,1fr) minmax(0,1.4fr); }

    .anillo { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
    .anillo svg { width: 148px; height: 148px; flex: none; }
    .anillo circle { fill: none; stroke-width: 14; transform: rotate(-90deg); transform-origin: 60px 60px; }
    .pista { stroke: var(--surface-2); }
    .hecho { stroke: var(--moss); }
    .falta { stroke: var(--ochre); }
    .anula { stroke: var(--oxide); }
    .pc { text-anchor: middle; font-size: 24px; font-weight: 600; fill: var(--ink); font-family: var(--f-mono); }
    .pie { text-anchor: middle; font-size: 10px; fill: var(--ink-3); }
    .leyenda { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 7px; font-size: .85rem; }
    .leyenda li { display: flex; align-items: center; gap: 8px; }
    .punto { width: 10px; height: 10px; border-radius: 3px; flex: none; }
    .punto[data-c="hecho"] { background: var(--moss); }
    .punto[data-c="falta"] { background: var(--ochre); }
    .punto[data-c="anula"] { background: var(--oxide); }

    .barras { display: flex; align-items: flex-end; gap: 8px; height: 190px; margin-top: 10px; }
    /* min-width:0 es lo que impide que el contenido ensanche la columna y
       empuje la ultima fuera del recuadro */
    .barra {
      flex: 1 1 0; min-width: 0; display: flex; flex-direction: column;
      align-items: center; height: 100%; gap: 4px;
    }
    .barra .palo {
      width: 100%; background: var(--accent-soft); border-radius: 3px 3px 0 0;
      margin-top: auto; min-height: 2px;
    }
    .barra.ahora .palo { background: var(--moss); }
    .barra .eje { font-family: var(--f-mono); font-size: .68rem; color: var(--ink-3); }
    .barra.ahora .eje { color: var(--moss); font-weight: 600; }

    .titulo-seccion {
      display: flex; align-items: baseline; justify-content: space-between;
      gap: 12px; margin-bottom: 12px;
    }

    .tarjetas { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); }

    .cosecha, .labor {
      background: var(--surface); border: 1px solid var(--rule); border-radius: var(--r);
      padding: 13px 15px; display: flex; flex-direction: column; gap: 5px;
      border-left: 5px solid var(--rule-strong);
    }
    .cosecha[data-urgencia="pasada"] { border-left-color: var(--oxide); }
    .cosecha[data-urgencia="ya"]     { border-left-color: var(--ochre); }
    .cosecha[data-urgencia="pronto"] { border-left-color: var(--moss); }

    .cosecha > header { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
    .cosecha .n, .labor .n { font-weight: 600; font-size: 1rem; }
    .cosecha .cuando { font-family: var(--f-mono); font-size: .78rem; font-weight: 600; white-space: nowrap; }
    .cosecha[data-urgencia="pasada"] .cuando { color: var(--oxide); }
    .cosecha[data-urgencia="ya"] .cuando { color: var(--ochre); }
    .cosecha .d, .labor .d { font-size: .78rem; color: var(--ink-3); }

    .metricas { display: flex; gap: 14px; margin-top: 4px; padding-top: 8px; border-top: 1px solid var(--rule); }
    .metrica { display: flex; flex-direction: column; gap: 1px; }
    .metrica .v {
      font-family: var(--f-mono); font-variant-numeric: tabular-nums;
      font-size: .95rem; font-weight: 600;
    }
    .metrica .k {
      font-family: var(--f-mono); font-size: .62rem; letter-spacing: .07em;
      text-transform: uppercase; color: var(--ink-3);
    }

    .labor { flex-direction: row; align-items: center; justify-content: space-between; gap: 12px; }
    .labor .que { display: flex; flex-direction: column; min-width: 0; }
    .labor button { flex: none; min-height: 44px; }

    @media (max-width: 900px) {
      .graficas { grid-template-columns: 1fr; }
      .labor { flex-direction: column; align-items: stretch; }
      .labor button { width: 100%; }
    }
  `,
})
export class Panel implements OnInit {
  private api = inject(Api);

  cultivos = signal<Cultivo[]>([]);
  semillas = signal<Semilla[]>([]);
  actividades = signal<Actividad[]>([]);
  productos = signal<Producto[]>([]);
  cargando = signal(true);
  error = signal<string | null>(null);
  guardando = signal(new Set<number>());

  readonly hoy = hoyLocal();
  readonly semana = semanaAccess(this.hoy);
  readonly perimetro = 2 * Math.PI * 52;

  /** Sin el año: el panel habla del presente, no de un calendario. */
  readonly diaDeHoy = new Intl.DateTimeFormat('es-CO', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  }).format(new Date(this.hoy + 'T00:00:00Z'));

  activos = computed(() => this.cultivos().filter((c) => c.activo === 1));

  nombreSemilla(id: number): string {
    const s = this.semillas().find((x) => x.Id === id);
    return s ? [s.semilla, s.variedad].filter(Boolean).join(' ') : `semilla ${id}`;
  }

  /**
   * La cosecha estimada sale de la ficha: fecha de siembra mas el ciclo. Los
   * que ya la cosecharon de verdad quedan fuera; para los demas se cuenta
   * cuanto falta desde hoy.
   */
  cosechables = computed<Cosechable[]>(() =>
    this.activos()
      .filter((c) => !c.fechaRealCosecha)
      .map((c) => {
        const ciclo = this.semillas().find((s) => s.Id === c.codSemilla)?.ciclo ?? 0;
        const fechaCosecha = sumarDias(c.fechasiembra, ciclo);
        const faltan = Math.round(
          (Date.parse(fechaCosecha + 'T00:00:00Z') - Date.parse(this.hoy + 'T00:00:00Z')) / 86400000
        );
        const diasEnTerreno = Math.round(
          (Date.parse(this.hoy + 'T00:00:00Z') - Date.parse(c.fechasiembra + 'T00:00:00Z')) / 86400000
        );
        return {
          cultivo: c, nombre: this.nombreSemilla(c.codSemilla), fechaCosecha, faltan,
          diasEnTerreno, ciclo,
        };
      })
      .filter((c) => c.faltan > -60)     // lo muy pasado ya no es noticia
      .sort((a, b) => a.faltan - b.faltan)
  );

  porSalir = computed(() => this.cosechables().filter((c) => c.faltan >= 0 && c.faltan <= 14));
  proximos = computed(() => this.cosechables().filter((c) => c.faltan <= 30));

  // ------------------------------------------------- labores de la semana
  deLaSemana = computed(() => this.actividades().filter((a) => a.semanaAbono === this.semana));
  private conEstado = (e: EstadoActividad) => this.deLaSemana().filter((a) => a.estado === e);
  hechas = computed(() => this.conEstado('realizado'));
  anuladas = computed(() => this.conEstado('cancelado'));
  /** Pendiente es tanto lo marcado asi como lo que nadie ha tocado todavia. */
  pendientes = computed(() =>
    this.deLaSemana().filter((a) => a.estado !== 'realizado' && a.estado !== 'cancelado')
  );

  /**
   * Solo un primer puñado: con cincuenta tarjetas el panel deja de ser un
   * vistazo y se convierte en la lista densa que queriamos evitar. El resto
   * se marca en "Seguimiento en campo", que esta hecha para eso.
   */
  primerasPendientes = computed(() => this.pendientes().slice(0, 12));

  costoSemana = computed(() =>
    this.deLaSemana().reduce((t, a) => t + (a.costo ?? 0) * (a.total ?? 0), 0)
  );

  porcentaje = computed(() => {
    const n = this.deLaSemana().length;
    return n ? Math.round((this.hechas().length / n) * 100) : 0;
  });

  /** Los tres arcos del anillo, encadenados sobre el perimetro. */
  tramos = computed(() => {
    const n = this.deLaSemana().length;
    if (!n) return [];
    const partes = [
      { clase: 'hecho', cuantas: this.hechas().length },
      { clase: 'anula', cuantas: this.anuladas().length },
      { clase: 'falta', cuantas: this.pendientes().length },
    ];
    let desde = 0;
    return partes.filter((p) => p.cuantas > 0).map((p) => {
      const largo = (p.cuantas / n) * this.perimetro;
      const tramo = { clase: p.clase, largo, desde };
      desde += largo;
      return tramo;
    });
  });

  leyenda = computed(() => [
    { clase: 'hecho', texto: `${this.hechas().length} realizadas` },
    { clase: 'falta', texto: `${this.pendientes().length} pendientes` },
    { clase: 'anula', texto: `${this.anuladas().length} canceladas` },
  ]);

  /** Costo de las ocho ultimas semanas, con la actual la ultima. */
  porSemana = computed(() => {
    const semanas = Array.from({ length: 8 }, (_, i) => this.semana - 7 + i)
      .map((s) => ((s - 1 + 54) % 54) + 1);      // envuelve al cruzar el ano
    const filas = semanas.map((s) => ({
      semana: s,
      costo: this.actividades()
        .filter((a) => a.semanaAbono === s)
        .reduce((t, a) => t + (a.costo ?? 0) * (a.total ?? 0), 0),
      alto: 0,
    }));
    const techo = Math.max(...filas.map((f) => f.costo), 1);
    for (const f of filas) f.alto = (f.costo / techo) * 100;
    return filas;
  });

  techoSemanas = computed(() => Math.max(...this.porSemana().map((f) => f.costo), 0));

  bajoMinimos = computed(() =>
    this.productos()
      .filter((p) => p.CantidadMin != null && p.cantidad != null && p.cantidad < p.CantidadMin)
      .map((p) => p.nombreProducto ?? `producto ${p.id}`)
  );

  // --------------------------------------------------------------- texto
  urgencia = (faltan: number) =>
    faltan < 0 ? 'pasada' : faltan <= 14 ? 'ya' : 'pronto';

  cuando(faltan: number): string {
    if (faltan < 0) return `${-faltan} días pasada`;
    if (faltan === 0) return 'hoy';
    if (faltan === 1) return 'mañana';
    return `en ${faltan} días`;
  }

  pesos = (v: number) =>
    v.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

  async ngOnInit() {
    try {
      const [cul, sem, act, pro] = await Promise.all([
        this.api.listar<Cultivo>('programacionCultivos', 2000),
        this.api.listar<Semilla>('infoSemilla'),
        this.api.listar<Actividad>('actividades', 2000),
        this.api.listar<Producto>('productos', 200),
      ]);
      this.cultivos.set(cul);
      this.semillas.set(sem);
      this.actividades.set(act);
      this.productos.set(pro);
    } finally {
      this.cargando.set(false);
    }
  }

  /** Igual que en seguimiento: se guarda al momento, sin boton de confirmar. */
  async marcarHecha(a: Actividad) {
    this.guardando.update((s) => new Set(s).add(a.id));
    this.error.set(null);
    try {
      await this.api.actualizar<Actividad>('actividades', a.id, {
        estado: 'realizado', fechaRegistro: this.hoy,
      });
      this.actividades.update((ls) =>
        ls.map((x) => (x.id === a.id ? { ...x, estado: 'realizado' as EstadoActividad } : x))
      );
    } catch (e: any) {
      this.error.set(e?.error?.error ?? `No se pudo marcar «${a.Actividad}».`);
    } finally {
      this.guardando.update((s) => { const n = new Set(s); n.delete(a.id); return n; });
    }
  }
}
