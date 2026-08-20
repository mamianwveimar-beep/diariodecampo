import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api } from '../nucleo/api';
import { Buscador, type OpcionBuscador } from '../compartido/buscador';
import { hoyLocal, semanaAccess } from '../nucleo/fechas';
import type { Actividad, Cultivo, Empleado, EstadoActividad, Semilla } from '../nucleo/tipos';

/** Como se ve cada estado. El orden es el de los botones en pantalla. */
const ESTADOS: { valor: EstadoActividad; texto: string; punto: string }[] = [
  { valor: 'pendiente', texto: 'Pendiente', punto: '🟡' },
  { valor: 'realizado', texto: 'Realizado', punto: '🟢' },
  { valor: 'cancelado', texto: 'Cancelado', punto: '🔴' },
];

/** Estado del guardado de una tarjeta, para el aviso discreto. */
type Guardado = 'limpio' | 'guardando' | 'guardado' | 'error';

/**
 * Seguimiento en campo: lo que el operario abre con el movil delante de la
 * cama para ir marcando lo que va haciendo.
 *
 * A diferencia de "Actividades y costos", que es de escritorio y sirve para
 * corregir, esta pantalla solo hace una cosa: coger las labores YA programadas
 * de un cultivo en una semana y dejar decir quien las hizo y en que quedaron.
 * Por eso no crea ni borra nada, y por eso las tarjetas son grandes: se usa de
 * pie, al sol y a veces con guantes.
 *
 * Cada cambio se guarda solo, con un PUT sobre esa unica actividad. No hay
 * boton de guardar a proposito: en campo se pierde, y obligar a recordarlo es
 * la forma mas segura de que la jornada se anote a medias.
 */
@Component({
  selector: 'dc-seguimiento-campo',
  imports: [FormsModule, RouterLink, Buscador],
  template: `
    <div class="cabecera">
      <div class="fila">
        <div>
          <div class="eyebrow">actividades</div>
          <h1>Seguimiento en campo</h1>
          <p class="small">
            Lo que toca esta semana en un cultivo. Marca quién lo hizo y cómo quedó;
            se guarda solo.
          </p>
        </div>
        <a class="boton" routerLink="/actividades">Ver actividades</a>
      </div>
    </div>

    <!-- --------------------------------------------------- que cultivo -->
    <div class="barra">
      <label style="min-width:280px">Cultivo
        <dc-buscador
          [opciones]="opcionesCultivo()"
          [valor]="cultivo()"
          (valorChange)="elegirCultivo($event)"
          marcador="Busca el cultivo" />
      </label>
    </div>

    @if (!cultivo()) {
      <p class="vacio">Elige un cultivo para ver sus labores.</p>
    } @else if (cargando()) {
      <p class="small">Cargando…</p>
    } @else if (fichaCultivo(); as c) {
      <!-- ------------------------------------------------- la cabecera -->
      <section class="ficha">
        <div class="titulo">
          <span class="n">{{ nombreSemilla(c.codSemilla) }}</span>
          <span class="d">Cultivo {{ c.codigosistema }} · sembrado {{ c.fechasiembra }}</span>
        </div>
        <div class="pastillas">
          <span class="pastilla">Lote <b>{{ c.lote ?? '—' }}</b></span>
          <span class="pastilla">Cama <b>{{ c.cama ?? '—' }}</b></span>
          <span class="pastilla">{{ c.numeroPlantasSembradas ?? 0 }} plantas</span>
        </div>
      </section>

      <!-- ------------------------------------------------- las semanas -->
      @if (semanas().length) {
        <div class="semanas" role="tablist" aria-label="Semanas del cultivo">
          @for (s of semanas(); track s) {
            <button type="button" role="tab" [attr.aria-selected]="s === semana()"
                    [class.activa]="s === semana()" (click)="semana.set(s)">
              Semana {{ s }}
              @if (s === semanaDeHoy) { <span class="hoy">hoy</span> }
            </button>
          }
        </div>

        <p class="resumen">
          {{ hechas() }} de {{ deLaSemana().length }} labores hechas
          @if (canceladas()) { · {{ canceladas() }} canceladas }
        </p>

        <!-- ---------------------------------------------- las tarjetas -->
        <div class="tarjetas">
          @for (a of deLaSemana(); track a.id) {
            <article class="labor" [attr.data-estado]="estadoDe(a)">
              <header>
                <div class="que">
                  <span class="n">{{ a.Actividad }}</span>
                  <span class="d">
                    {{ a.detalle ?? 'sin detalle' }}
                    @if (a.total) { · {{ num(a.total) }} {{ a.unidad ?? '' }} }
                  </span>
                </div>
                <span class="marca" [attr.data-g]="guardadoDe(a.id)">
                  @switch (guardadoDe(a.id)) {
                    @case ('guardando') { Guardando… }
                    @case ('guardado') { Guardado ✓ }
                    @case ('error') { No se guardó }
                  }
                </span>
              </header>

              <div class="estados" role="group" [attr.aria-label]="'Estado de ' + a.Actividad">
                @for (e of estados; track e.valor) {
                  <button type="button" [class.elegido]="estadoDe(a) === e.valor"
                          [attr.aria-pressed]="estadoDe(a) === e.valor"
                          (click)="cambiarEstado(a, e.valor)">
                    <span aria-hidden="true">{{ e.punto }}</span> {{ e.texto }}
                  </button>
                }
              </div>

              <div class="campos">
                <label>
                  <span class="et">Responsable</span>
                  <input [ngModel]="a.responsable" (ngModelChange)="escribir(a, 'responsable', $event)"
                         (blur)="guardar(a, { responsable: a.responsable })"
                         list="operarios" maxlength="255" placeholder="Quién lo hizo" />
                </label>
                <label>
                  <span class="et">Cantidad aplicada ({{ a.unidad ?? 'ud' }})</span>
                  <input type="number" step="0.001" min="0" inputmode="decimal"
                         [ngModel]="a.cantidadAbono"
                         (ngModelChange)="escribir(a, 'cantidadAbono', $event === '' ? null : +$event)"
                         (blur)="guardar(a, { cantidadAbono: a.cantidadAbono ?? 0 })" />
                </label>
              </div>
            </article>
          }
        </div>
      } @else {
        <p class="vacio">
          Este cultivo todavía no tiene labores programadas. Se generan al registrar
          la siembra, o desde «Generar programación» en Actividades y costos.
        </p>
      }

      <datalist id="operarios">
        @for (e of empleados(); track e.id) {
          <option [value]="e.nombre + ' ' + e.apellido"></option>
        }
      </datalist>
    }

    @if (error(); as e) { <p class="aviso error" style="margin-top:14px">{{ e }}</p> }
  `,
  styles: `
    .ficha {
      display: flex; flex-direction: column; gap: 10px;
      background: var(--moss-soft); border: 1px solid var(--moss);
      border-radius: var(--r); padding: 14px 16px; margin-bottom: 16px;
    }
    .ficha .titulo { display: flex; flex-direction: column; }
    .ficha .titulo .n { font-family: var(--f-display); font-size: 1.3rem; font-weight: 600; color: var(--moss); }
    .ficha .titulo .d { font-size: .82rem; color: var(--ink-2); }
    .pastillas { display: flex; gap: 8px; flex-wrap: wrap; }
    .pastilla {
      background: var(--surface); border: 1px solid var(--rule);
      border-radius: 999px; padding: 5px 13px; font-size: .84rem;
    }

    .semanas { display: flex; gap: 6px; flex-wrap: wrap; overflow-x: auto; margin-bottom: 12px; }
    .semanas button {
      flex: none; min-height: 44px; padding: 0 15px; border-radius: 999px;
      font-size: .88rem; border: 1px solid var(--rule-strong); color: var(--ink-2);
    }
    .semanas button.activa {
      background: var(--moss); border-color: var(--moss); color: #fff; font-weight: 600;
    }
    .semanas .hoy {
      margin-left: 6px; font-size: .64rem; text-transform: uppercase;
      letter-spacing: .08em; opacity: .8;
    }

    .resumen { font-size: .88rem; color: var(--ink-2); margin-bottom: 12px; font-weight: 500; }

    .tarjetas { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); }

    .labor {
      display: flex; flex-direction: column; gap: 12px;
      background: var(--surface); border: 1px solid var(--rule);
      border-left: 5px solid var(--rule-strong);
      border-radius: var(--r); padding: 14px 16px;
    }
    .labor[data-estado="realizado"] { border-left-color: var(--moss); }
    .labor[data-estado="cancelado"] { border-left-color: var(--oxide); }
    .labor[data-estado="pendiente"] { border-left-color: var(--ochre); }

    .labor > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
    .labor .que { display: flex; flex-direction: column; min-width: 0; }
    .labor .que .n { font-weight: 600; font-size: 1.02rem; }
    .labor .que .d { font-size: .8rem; color: var(--ink-3); }

    .marca {
      font-size: .72rem; font-weight: 600; white-space: nowrap;
      opacity: 0; transition: opacity .2s; color: var(--ink-3);
    }
    .marca[data-g="guardando"] { opacity: 1; }
    .marca[data-g="guardado"] { opacity: 1; color: var(--moss); }
    .marca[data-g="error"] { opacity: 1; color: var(--oxide); }

    .estados { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
    .estados button {
      min-height: 52px; padding: 0 6px; font-size: .82rem; font-weight: 500;
      flex-direction: column; gap: 2px; line-height: 1.15;
    }
    .estados button.elegido {
      border-width: 2px; font-weight: 700;
      border-color: var(--moss); background: var(--moss-soft); color: var(--moss);
    }

    .campos { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .campos label { gap: 4px; }
    .campos .et {
      font-family: var(--f-mono); font-size: .62rem; letter-spacing: .1em;
      text-transform: uppercase; color: var(--ink-3);
    }
    .campos input { min-height: 46px; font-size: .95rem; }

    @media (max-width: 620px) {
      .tarjetas { grid-template-columns: 1fr; }
      .campos { grid-template-columns: 1fr; }
    }
  `,
})
export class SeguimientoCampo implements OnInit {
  private api = inject(Api);

  readonly estados = ESTADOS;

  cultivos = signal<Cultivo[]>([]);
  semillas = signal<Semilla[]>([]);
  empleados = signal<Empleado[]>([]);
  actividades = signal<Actividad[]>([]);

  cultivo = signal<number | null>(null);
  semana = signal<number | null>(null);
  cargando = signal(false);
  error = signal<string | null>(null);

  /** Por id de actividad, para el aviso discreto de cada tarjeta. */
  private guardados = signal<Record<number, Guardado>>({});
  private relojes = new Map<number, ReturnType<typeof setTimeout>>();

  semanaDeHoy = semanaAccess(hoyLocal());

  opcionesCultivo = computed<OpcionBuscador[]>(() =>
    this.cultivos()
      .filter((c) => c.activo === 1)
      .map((c) => ({
        valor: c.codigosistema,
        texto: `${c.codigosistema} · ${this.nombreSemilla(c.codSemilla)}`,
        detalle: `lote ${c.lote ?? '—'} · cama ${c.cama ?? '—'} · sembrado ${c.fechasiembra}`,
      }))
  );

  fichaCultivo = computed(() =>
    this.cultivos().find((c) => c.codigosistema === this.cultivo()) ?? null
  );

  /**
   * Las semanas que de verdad tienen labores, en orden CRONOLOGICO.
   *
   * Ordenar por el numero de semana las pone del reves en cuanto la temporada
   * cruza el ano: un cultivo sembrado en octubre va de la semana 40 a la 52 y
   * sigue en la 2 y la 3, y ordenando por numero esas dos aparecian primero.
   * Se ancla en la semana de la siembra y se cuenta hacia delante.
   */
  semanas = computed(() => {
    const c = this.fichaCultivo();
    const inicio = c ? semanaAccess(c.fechasiembra) : 1;
    const desdeLaSiembra = (s: number) => (s - inicio + 54) % 54;
    return [...new Set(this.actividades().map((a) => a.semanaAbono))]
      .sort((x, y) => desdeLaSiembra(x) - desdeLaSiembra(y));
  });

  deLaSemana = computed(() =>
    this.actividades()
      .filter((a) => a.semanaAbono === this.semana())
      .sort((a, b) => a.Actividad.localeCompare(b.Actividad))
  );

  hechas = computed(() => this.deLaSemana().filter((a) => this.estadoDe(a) === 'realizado').length);
  canceladas = computed(() => this.deLaSemana().filter((a) => this.estadoDe(a) === 'cancelado').length);

  /** Sin estado guardado, la labor esta pendiente: es lo que significa NULL. */
  estadoDe = (a: Actividad): EstadoActividad => a.estado ?? 'pendiente';
  guardadoDe = (id: number): Guardado => this.guardados()[id] ?? 'limpio';

  num = (v: number | null) =>
    v == null ? '—' : v.toLocaleString('es-CO', { maximumFractionDigits: 2 });

  nombreSemilla(id: number): string {
    const s = this.semillas().find((x) => x.Id === id);
    return s ? [s.semilla, s.variedad].filter(Boolean).join(' ') : `semilla ${id}`;
  }

  async ngOnInit() {
    const [cul, sem, emp] = await Promise.all([
      this.api.listar<Cultivo>('programacionCultivos', 2000),
      this.api.listar<Semilla>('infoSemilla'),
      this.api.listar<Empleado>('empleados'),
    ]);
    this.cultivos.set(cul);
    this.semillas.set(sem);
    this.empleados.set(emp);
  }

  async elegirCultivo(codigo: string | number | null) {
    const n = codigo == null ? null : Number(codigo);
    this.cultivo.set(n);
    this.actividades.set([]);
    this.guardados.set({});
    if (n == null) return;

    this.cargando.set(true);
    try {
      // solo las de este cultivo: el operario no necesita el resto de la finca
      const filas = await this.api.listarDeCultivo<Actividad>('actividades', n);
      this.actividades.set(filas);
      // arranca en la semana de hoy si tiene labores; si no, en la primera
      const suyas = this.semanas();
      this.semana.set(suyas.includes(this.semanaDeHoy) ? this.semanaDeHoy : (suyas[0] ?? null));
    } finally {
      this.cargando.set(false);
    }
  }

  /** Escribe en la fila que hay en memoria, sin ir todavia al servidor. */
  escribir(a: Actividad, campo: 'responsable' | 'cantidadAbono', valor: any) {
    this.actividades.update((ls) =>
      ls.map((x) => (x.id === a.id ? { ...x, [campo]: valor } : x))
    );
  }

  /**
   * Marcar el estado guarda en el acto: es el gesto principal de la pantalla
   * y no puede quedar a la espera de un blur. Ademas sella fechaRegistro, que
   * es lo que distingue "programada" de "el operario se pronuncio".
   */
  async cambiarEstado(a: Actividad, estado: EstadoActividad) {
    this.escribir(a, 'responsable', a.responsable);   // conserva lo escrito
    this.actividades.update((ls) =>
      ls.map((x) => (x.id === a.id ? { ...x, estado } : x))
    );
    await this.guardar(a, { estado, fechaRegistro: hoyLocal() });
  }

  /** PUT sobre esa unica actividad, con aviso discreto en su tarjeta. */
  async guardar(a: Actividad, cambios: Partial<Actividad>) {
    this.marcar(a.id, 'guardando');
    this.error.set(null);
    try {
      await this.api.actualizar<Actividad>('actividades', a.id, cambios);
      this.marcar(a.id, 'guardado');
      // el "Guardado ✓" se retira solo: en campo estorba mas de lo que informa
      clearTimeout(this.relojes.get(a.id));
      this.relojes.set(a.id, setTimeout(() => this.marcar(a.id, 'limpio'), 2000));
    } catch (e: any) {
      this.marcar(a.id, 'error');
      this.error.set(
        e?.error?.error ?? `No se pudo guardar «${a.Actividad}». Revisa la conexión.`
      );
    }
  }

  private marcar(id: number, g: Guardado) {
    this.guardados.update((m) => ({ ...m, [id]: g }));
  }
}
