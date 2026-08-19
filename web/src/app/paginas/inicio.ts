import { Component, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from '../nucleo/api';
import type { InventarioCampo } from '../nucleo/tipos';

/** Sustituye al formulario InicioDiarioCampo de Access. */
@Component({
  selector: 'dc-inicio',
  imports: [RouterLink],
  template: `
    <div class="cabecera">
      <div class="eyebrow">Diario de campo</div>
      <h1>Resumen de la finca</h1>
      <p class="small">Datos al {{ hoy() || '—' }}, hora de Colombia.</p>
    </div>

    <div class="rejilla" style="margin-bottom:26px">
      <div class="tarjeta cifra">
        <span class="n">{{ cultivosActivos() }}</span>
        <span class="l">Cultivos activos en campo</span>
      </div>
      <div class="tarjeta cifra">
        <span class="n">{{ plantasEnPie() }}</span>
        <span class="l">Plantas sembradas sin cosechar</span>
      </div>
      <div class="tarjeta cifra">
        <span class="n">{{ kilos() }}</span>
        <span class="l">Kilos cosechados acumulados</span>
      </div>
      <div class="tarjeta cifra">
        <span class="n">{{ cuarentena() }}</span>
        <span class="l">Filas en cuarentena de la migracion</span>
      </div>
    </div>

    @if (bajoMinimos().length) {
      <div class="aviso atencion" style="margin-bottom:26px">
        <strong>Existencias bajo minimos:</strong>
        {{ bajoMinimos().join(', ') }}.
      </div>
    }

    <h2 style="margin-bottom:12px">Cultivos en campo</h2>
    <div class="tabla-caja">
      <table>
        <thead>
          <tr>
            <th>Cultivo</th><th>Siembra</th><th>Lote</th><th>Cama</th>
            <th class="num">Sembradas</th><th class="num">Cosechadas</th>
            <th class="num">Kilos</th><th>Inicio cosecha</th>
          </tr>
        </thead>
        <tbody>
          @for (c of campo(); track c.codigosistema) {
            <tr>
              <td><a [routerLink]="['/siembras']" [queryParams]="{ cultivo: c.codigosistema }">{{ c.codigosistema }}</a></td>
              <td>{{ c.fechasiembra }}</td>
              <td class="num">{{ c.lote }}</td>
              <td class="num">{{ c.cama }}</td>
              <td class="num">{{ c.numeroPlantasSembradas }}</td>
              <td class="num">{{ c.SumaDenumeroPlantasCosechadas ?? '—' }}</td>
              <td class="num">{{ c.kilosCosechados ?? '—' }}</td>
              <td>{{ c.InicioCosecha ?? 'sin cosechar' }}</td>
            </tr>
          } @empty {
            <tr><td colspan="8" class="vacio">No hay cultivos activos.</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class Inicio implements OnInit {
  private api = inject(Api);

  hoy = signal('');
  campo = signal<InventarioCampo[]>([]);
  cuarentena = signal(0);
  bajoMinimos = signal<string[]>([]);

  cultivosActivos = () => this.campo().length;
  kilos = () =>
    this.campo().reduce((a, c) => a + (c.kilosCosechados ?? 0), 0)
      .toLocaleString('es-CO', { maximumFractionDigits: 2 });
  plantasEnPie = () =>
    this.campo()
      .reduce((a, c) => a + ((c.numeroPlantasSembradas ?? 0) - (c.SumaDenumeroPlantasCosechadas ?? 0)), 0)
      .toLocaleString('es-CO');

  async ngOnInit() {
    const [salud, campo, cuarentena, productos] = await Promise.all([
      this.api.salud(),
      this.api.vista<InventarioCampo>('cInventarioCampo'),
      this.api.cuarentena(),
      this.api.listar<any>('productos'),
    ]);
    this.hoy.set(salud.hoy);
    this.campo.set(campo);
    this.cuarentena.set(cuarentena.length);
    this.bajoMinimos.set(
      productos
        .filter((p) => p.cantidad != null && p.CantidadMin != null && p.cantidad < p.CantidadMin)
        .map((p) => `${p.nombreProducto} (${p.cantidad})`)
    );
  }
}
