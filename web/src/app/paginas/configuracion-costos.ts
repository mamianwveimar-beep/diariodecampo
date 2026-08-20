import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { Api } from '../nucleo/api';
import type { ParametrosCostos } from '../nucleo/tipos';

/**
 * Pantalla nueva, sin equivalente en Access: el jornal (8.807) y el costo por
 * minuto (1,46) estaban escritos a mano dentro de las 20 consultas de accion
 * desde 2021. Ahora viven en la unica fila de parametrosCostos y esta
 * pantalla es la unica forma de corregirlos.
 *
 * costoMinuto no se pide: se deriva del jornal (jornalHora / 60, un jornal de
 * 8 horas) y se guarda ya calculado, tal como lo esperan las consultas.
 *
 * Cambiar el jornal aqui NO reescribe lo ya generado: solo afecta a las
 * actividades y costos que se calculen de aqui en adelante (procesos
 * manuales y la programacion automatica al registrar una orden de siembra).
 */
@Component({
  selector: 'dc-configuracion-costos',
  imports: [FormsModule, DecimalPipe],
  template: `
    <div class="cabecera">
      <div class="eyebrow">parametrosCostos</div>
      <h1>Configuración de costos laborales</h1>
      <p class="small">
        El jornal con el que el sistema calcula el costo de las labores de campo
        (preparación de terreno, siembra, deshierbe, cosecha…). Viene sin corregir desde 2021.
      </p>
    </div>

    @if (cargando()) {
      <p class="small">Cargando…</p>
    } @else {
      <div class="tarjeta" style="max-width:440px">
        <form class="formulario" (ngSubmit)="guardar()">
          <label class="ancho">
            Valor jornal (COP, por día de 8 horas)
            <input type="number" min="1" step="1" required
                   [ngModel]="jornalHora()" name="jornalHora" (ngModelChange)="cambiarJornal($event)" />
          </label>

          <div class="ancho small" style="color:var(--ink-3)">
            Costo por minuto: <strong class="mono">{{ costoMinutoPrevisto() | number:'1.2-2' }}</strong>
            pesos (jornal ÷ 60)
          </div>

          <p class="ancho aviso atencion">
            Este cambio afectará el cálculo de costos en el reporte de actividades de aquí en adelante.
            Lo ya registrado no se recalcula.
          </p>

          @if (error()) {
            <p class="ancho aviso error">{{ error() }}</p>
          }
          @if (guardadoOk()) {
            <p class="ancho aviso ok">Guardado. Los nuevos cálculos ya usan este jornal.</p>
          }

          <div class="ancho acciones-form">
            <button type="submit" class="primario" [disabled]="guardando() || !jornalHora()">
              {{ guardando() ? 'Guardando…' : 'Guardar' }}
            </button>
          </div>
        </form>
      </div>
    }
  `,
})
export class ConfiguracionCostos implements OnInit {
  private api = inject(Api);

  cargando = signal(true);
  guardando = signal(false);
  guardadoOk = signal(false);
  error = signal<string | null>(null);

  jornalHora = signal<number | null>(null);

  costoMinutoPrevisto = computed(() => {
    const j = this.jornalHora();
    return j ? j / 60 : 0;
  });

  async ngOnInit() {
    this.cargando.set(true);
    try {
      const p = await this.api.obtener<ParametrosCostos>('parametrosCostos', 1);
      this.jornalHora.set(p.jornalHora);
    } finally {
      this.cargando.set(false);
    }
  }

  cambiarJornal(valor: string | number) {
    this.jornalHora.set(valor === '' ? null : +valor);
    this.guardadoOk.set(false);
  }

  async guardar() {
    const jornalHora = this.jornalHora();
    if (!jornalHora) return;
    this.guardando.set(true);
    this.error.set(null);
    try {
      const costoMinuto = +(jornalHora / 60).toFixed(4);
      await this.api.actualizar<ParametrosCostos>('parametrosCostos', 1, { jornalHora, costoMinuto });
      this.guardadoOk.set(true);
    } catch (e: any) {
      this.error.set(e?.error?.error ?? 'No se pudo guardar el jornal.');
    } finally {
      this.guardando.set(false);
    }
  }
}
