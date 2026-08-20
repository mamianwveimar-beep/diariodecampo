import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../nucleo/api';
import { Buscador, type OpcionBuscador } from '../compartido/buscador';
import { hoyLocal } from '../nucleo/fechas';
import type { Cultivo, Semilla } from '../nucleo/tipos';

/** Una linea del detalle: acaba siendo una fila de programacionCultivos. */
interface Linea {
  clave: number;
  codSemilla: number | null;
  numeroPlantasSembradas: number | null;
  /** Codigo de identificacion, no cantidad: puede llevar letras (p. ej. "A1"). */
  lote: string | null;
  cama: string | null;
  areaCultivada: number | null;
  /** El usuario toco el area a mano: deja de recalcularse sola. */
  areaManual: boolean;
  codigoSemillero: string | null;
  observaciones: string | null;
  estado: 'pendiente' | 'guardada' | 'error';
  error?: string;
}

/**
 * Alta de una siembra completa: una cabecera con la fecha y la factura, y
 * tantas lineas como variedades se siembren ese dia.
 *
 * Cada linea se guarda como un cultivo de programacionCultivos, compartiendo
 * fecha y factura con las demas. Es la forma en que se siembra de verdad
 * —una jornada, una factura, varias camas— y evita repetir la cabecera una
 * vez por cultivo, que es lo que obligaba a hacer Frm_Datos en Access.
 */
@Component({
  selector: 'dc-siembra-lote',
  imports: [FormsModule, RouterLink, Buscador],
  template: `
    <div class="cabecera">
      <div class="fila">
        <div>
          <div class="eyebrow">programacionCultivos</div>
          <h1>Registrar siembra</h1>
          <p class="small">
            Una fecha y una factura para toda la siembra; una línea por cada variedad,
            lote y cama. Cada línea se guarda como un cultivo.
          </p>
        </div>
        <a class="boton" routerLink="/siembras">Ver siembras</a>
      </div>
    </div>

    @if (resultado(); as r) {
      <div class="aviso" [class.ok]="!r.fallidas" [class.atencion]="r.fallidas" role="status">
        <span>
          <strong>{{ r.guardadas }} de {{ r.total }} líneas guardadas.</strong>
          @if (r.fallidas) {
            {{ r.fallidas }} no se pudieron guardar; siguen abajo con el motivo.
          } @else {
            Los cultivos ya están en la lista de siembras.
          }
        </span>
      </div>
    }

    <!-- ------------------------------------------------------- cabecera -->
    <div class="tarjeta" style="margin-bottom:22px">
      <h2>Datos de la siembra</h2>
      <div class="formulario">
        <label>
          Fecha de siembra *
          <input type="date" [ngModel]="fecha()" (ngModelChange)="fecha.set($event)" required />
        </label>
        <label>
          Número de factura
          <input [ngModel]="factura()" (ngModelChange)="factura.set($event)"
                 maxlength="30" placeholder="p. ej. fac 02511" />
        </label>
        <div class="cifra" style="align-self:end">
          <span class="n">{{ lineas().length }}</span>
          <span class="l">líneas · {{ totalPlantas() }} plantas · {{ totalArea() }} m²</span>
        </div>
      </div>
      <p class="small">Todos los cultivos se registran como activos.</p>
    </div>

    <!-- --------------------------------------------------------- detalle -->
    <div class="tabla-caja">
      <table>
        <thead>
          <tr>
            <th style="min-width:230px">Semilla *</th>
            <th class="num" style="min-width:110px">Plantas *</th>
            <th style="min-width:90px">Lote</th>
            <th style="min-width:90px">Cama</th>
            <th class="num" style="min-width:130px">Área (m²)</th>
            <th style="min-width:150px">Cód. semillero</th>
            <th style="min-width:180px">Observaciones</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          @for (l of lineas(); track l.clave) {
            <tr [style.opacity]="l.estado === 'guardada' ? .55 : 1">
              <td>
                <dc-buscador
                  [opciones]="opcionesSemilla()"
                  [valor]="l.codSemilla"
                  (valorChange)="elegirSemilla(l, $event)"
                  [deshabilitado]="l.estado === 'guardada'"
                  marcador="Busca la semilla" />
              </td>
              <td>
                <input type="number" min="1" class="dcha" [ngModel]="l.numeroPlantasSembradas"
                       (ngModelChange)="cambiarPlantas(l, $event)"
                       [disabled]="l.estado === 'guardada'" />
              </td>
              <td>
                <input type="text" [ngModel]="l.lote"
                       (ngModelChange)="cambiar(l, 'lote', $event)"
                       maxlength="20" placeholder="p. ej. 7 o A1"
                       [disabled]="l.estado === 'guardada'" />
              </td>
              <td>
                <input type="text" [ngModel]="l.cama"
                       (ngModelChange)="cambiar(l, 'cama', $event)"
                       maxlength="20" placeholder="p. ej. 1 o B2"
                       [disabled]="l.estado === 'guardada'" />
              </td>
              <td>
                <div class="area">
                  <input type="number" step="0.01" class="dcha" [ngModel]="l.areaCultivada"
                         (ngModelChange)="cambiarArea(l, $event)"
                         [disabled]="l.estado === 'guardada'"
                         [title]="l.areaManual ? 'Valor escrito a mano' : 'Calculado: plantas × marco de siembra'" />
                  @if (l.areaManual) {
                    <button type="button" class="menudo" (click)="recalcularArea(l)"
                            [disabled]="l.estado === 'guardada'"
                            title="Volver al área calculada">↺</button>
                  }
                </div>
              </td>
              <td>
                <input [ngModel]="l.codigoSemillero"
                       (ngModelChange)="cambiar(l, 'codigoSemillero', $event)"
                       maxlength="50" [disabled]="l.estado === 'guardada'" />
              </td>
              <td>
                <input [ngModel]="l.observaciones"
                       (ngModelChange)="cambiar(l, 'observaciones', $event)"
                       maxlength="255" [disabled]="l.estado === 'guardada'" />
              </td>
              <td class="acciones">
                @if (l.estado === 'guardada') {
                  <span class="etiqueta si">guardada</span>
                } @else {
                  <button class="menudo peligro" (click)="quitar(l)"
                          [disabled]="lineas().length === 1">Quitar</button>
                }
              </td>
            </tr>
            @if (l.error) {
              <tr>
                <td colspan="8" style="padding-top:0">
                  <p class="aviso error" style="margin:0">{{ l.error }}</p>
                </td>
              </tr>
            }
            @if (pistaDe(l); as pista) {
              <tr>
                <td colspan="8" style="padding-top:0; border-bottom:none">
                  <span class="small">{{ pista }}</span>
                </td>
              </tr>
            }
          }
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            <td class="num">{{ totalPlantas() }}</td>
            <td colspan="2"></td>
            <td class="num">{{ totalArea() }}</td>
            <td colspan="3"></td>
          </tr>
        </tfoot>
      </table>
    </div>

    <div class="barra" style="margin-top:16px; justify-content:space-between">
      <button (click)="anadirLinea()">Añadir línea</button>
      <div style="display:flex; gap:10px">
        <a class="boton" routerLink="/siembras">Cancelar</a>
        <button class="primario" (click)="guardar()" [disabled]="guardando() || !hayQueGuardar()">
          {{ guardando() ? 'Guardando…' : 'Guardar siembra' }}
        </button>
      </div>
    </div>

    @if (errorGeneral(); as e) {
      <p class="aviso error" style="margin-top:14px">{{ e }}</p>
    }
  `,
  styles: `
    td .dcha { text-align: right; }
    td input { padding: 5px 8px; font-size: .86rem; }
    .area { display: flex; gap: 4px; align-items: center; }
    .area button { padding: 3px 7px; line-height: 1; }
  `,
})
export class SiembraLote implements OnInit {
  private api = inject(Api);
  private router = inject(Router);

  semillas = signal<Semilla[]>([]);
  fecha = signal(hoyLocal());
  factura = signal<string | null>(null);
  lineas = signal<Linea[]>([]);
  guardando = signal(false);
  errorGeneral = signal<string | null>(null);
  resultado = signal<{ total: number; guardadas: number; fallidas: number } | null>(null);

  private siguienteClave = 1;

  opcionesSemilla = computed<OpcionBuscador[]>(() =>
    this.semillas()
      .filter((s) => s.Activo === 1)
      .map((s) => ({
        valor: s.Id,
        texto: [s.semilla, s.variedad].filter(Boolean).join(' · ') || `Semilla ${s.Id}`,
        detalle: this.fichaSemilla(s),
      }))
  );

  totalPlantas = computed(() =>
    this.lineas().reduce((a, l) => a + (Number(l.numeroPlantasSembradas) || 0), 0)
      .toLocaleString('es-CO')
  );

  totalArea = computed(() =>
    this.lineas().reduce((a, l) => a + (Number(l.areaCultivada) || 0), 0)
      .toLocaleString('es-CO', { maximumFractionDigits: 2 })
  );

  hayQueGuardar = computed(() => this.lineas().some((l) => l.estado !== 'guardada'));

  async ngOnInit() {
    this.semillas.set(await this.api.listar<Semilla>('infoSemilla'));
    this.anadirLinea();
  }

  private fichaSemilla(s: Semilla): string {
    const partes = [];
    if (s.ciclo) partes.push(`ciclo ${s.ciclo} días`);
    const marco = this.marcoDe(s);
    if (marco) partes.push(`marco ${marco} m²/planta`);
    return partes.join(' · ');
  }

  /**
   * Metros cuadrados que ocupa una planta. infoSemilla.area ya lo trae; si
   * falta, se deduce del marco de siembra (distancia entre plantas por
   * distancia entre surcos), que es de donde sale ese valor.
   */
  private marcoDe(s: Semilla | undefined): number | null {
    if (!s) return null;
    if (s.area != null && s.area > 0) return s.area;
    if (s.entrePlanta != null && s.entreSurcos != null) return s.entrePlanta * s.entreSurcos;
    return null;
  }

  pistaDe(l: Linea): string | null {
    if (l.estado === 'guardada' || l.codSemilla == null) return null;
    const s = this.semillas().find((x) => x.Id === l.codSemilla);
    const marco = this.marcoDe(s);
    if (marco == null) {
      return `La ficha de ${s?.semilla ?? 'esta semilla'} no tiene marco de siembra, ` +
             `así que el área no se puede calcular. Escríbela a mano.`;
    }
    if (l.areaManual && l.numeroPlantasSembradas) {
      const calculada = +(l.numeroPlantasSembradas * marco).toFixed(2);
      if (calculada !== l.areaCultivada) {
        return `El área calculada para ${l.numeroPlantasSembradas} plantas sería ${calculada} m². ` +
               `Estás usando ${l.areaCultivada ?? 0} m².`;
      }
    }
    return null;
  }

  anadirLinea() {
    const ultima = this.lineas().at(-1);
    this.lineas.update((ls) => [...ls, {
      clave: this.siguienteClave++,
      codSemilla: null,
      numeroPlantasSembradas: null,
      // el lote suele repetirse en la misma jornada; la cama avanza
      lote: ultima?.lote ?? null,
      cama: this.incrementarCama(ultima?.cama ?? null),
      areaCultivada: null,
      areaManual: false,
      codigoSemillero: null,
      observaciones: null,
      estado: 'pendiente',
    }]);
  }

  /**
   * La cama es texto libre (puede llevar letras), asi que solo se puede
   * avanzar sola cuando es un numero puro. Si trae letras, se repite tal
   * cual: no hay forma automatica de saber cual es "la siguiente".
   */
  private incrementarCama(valor: string | null): string | null {
    if (valor == null || valor === '') return null;
    return /^\d+$/.test(valor) ? String(Number(valor) + 1) : valor;
  }

  quitar(l: Linea) {
    this.lineas.update((ls) => ls.filter((x) => x.clave !== l.clave));
  }

  /**
   * Todos los cambios van por la clave de la linea, nunca por el objeto que
   * llega de la plantilla: ese puede ser una copia anterior, y entonces un
   * `{...l}` reintroduce valores viejos. Aqui siempre se parte del estado
   * vigente.
   */
  private actualizar(clave: number, cambios: Partial<Linea>) {
    this.lineas.update((ls) =>
      ls.map((x) => (x.clave === clave ? { ...x, ...cambios, error: undefined } : x))
    );
  }

  private linea(clave: number): Linea | undefined {
    return this.lineas().find((x) => x.clave === clave);
  }

  cambiar(l: Linea, campo: 'lote' | 'cama' | 'codigoSemillero' | 'observaciones', valor: any) {
    this.actualizar(l.clave, { [campo]: valor === '' ? null : valor } as Partial<Linea>);
  }

  elegirSemilla(l: Linea, codSemilla: string | number | null) {
    this.actualizar(l.clave, { codSemilla: codSemilla == null ? null : Number(codSemilla) });
    this.recalcularSiProcede(l.clave);
  }

  cambiarPlantas(l: Linea, valor: any) {
    this.actualizar(l.clave, {
      numeroPlantasSembradas: valor === '' || valor == null ? null : Number(valor),
    });
    this.recalcularSiProcede(l.clave);
  }

  cambiarArea(l: Linea, valor: any) {
    // escribir el area a mano la desengancha del calculo
    this.actualizar(l.clave, {
      areaCultivada: valor === '' || valor == null ? null : Number(valor),
      areaManual: true,
    });
  }

  recalcularArea(l: Linea) {
    this.actualizar(l.clave, { areaManual: false });
    this.recalcularSiProcede(l.clave);
  }

  /** Área = plantas × marco de siembra, salvo que el usuario la haya escrito. */
  private recalcularSiProcede(clave: number) {
    const l = this.linea(clave);
    if (!l || l.areaManual) return;
    const marco = this.marcoDe(this.semillas().find((s) => s.Id === l.codSemilla));
    const plantas = Number(l.numeroPlantasSembradas) || 0;
    if (marco == null || !plantas) { this.actualizar(clave, { areaCultivada: null }); return; }
    this.actualizar(clave, { areaCultivada: +(plantas * marco).toFixed(2) });
  }

  async guardar() {
    this.errorGeneral.set(null);
    this.resultado.set(null);

    if (!this.fecha()) {
      this.errorGeneral.set('Hace falta la fecha de siembra.');
      return;
    }
    const pendientes = this.lineas().filter((l) => l.estado !== 'guardada');
    const incompletas = pendientes.filter(
      (l) => l.codSemilla == null || !l.numeroPlantasSembradas
    );
    if (incompletas.length) {
      this.errorGeneral.set(
        `${incompletas.length} línea(s) sin semilla o sin número de plantas. ` +
        `Complétalas o quítalas antes de guardar.`
      );
      return;
    }

    this.guardando.set(true);
    let guardadas = 0, fallidas = 0;
    try {
      for (const l of pendientes) {
        try {
          await this.api.crear<Cultivo>('programacionCultivos', {
            codSemilla: l.codSemilla!,
            fechasiembra: this.fecha(),
            factura: this.factura() || null,
            // al programar, lo planificado y lo sembrado son lo mismo. Los dos
            // se separan cuando el operario registra la orden en campo: alli
            // numeroPlantasSembradas pasa a ser lo que de verdad entro, y
            // numeroPlantasPlanificadas se queda como estaba para poder
            // comparar. Escribir los dos ahora evita que los informes que ya
            // existen vean un nulo.
            numeroPlantasSembradas: l.numeroPlantasSembradas!,
            numeroPlantasPlanificadas: l.numeroPlantasSembradas!,
            lote: l.lote,
            cama: l.cama,
            areaCultivada: l.areaCultivada ?? 0,
            codigoSemillero: l.codigoSemillero || null,
            observaciones: l.observaciones || null,
            activo: 1,
          });
          this.actualizar(l.clave, { estado: 'guardada' });
          guardadas++;
        } catch (e: any) {
          this.actualizar(l.clave, {
            estado: 'error',
            error: e?.error?.error ?? 'No se pudo guardar esta línea.',
          });
          fallidas++;
        }
      }
    } finally {
      this.guardando.set(false);
    }

    this.resultado.set({ total: pendientes.length, guardadas, fallidas });
    if (!fallidas) setTimeout(() => this.router.navigate(['/siembras']), 1600);
  }
}
