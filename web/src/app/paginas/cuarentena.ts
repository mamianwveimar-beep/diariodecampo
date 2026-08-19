import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { Api } from '../nucleo/api';
import type { FilaCuarentena } from '../nucleo/tipos';

/**
 * Pantalla nueva, sin equivalente en Access: muestra lo que la migracion no
 * pudo dar por bueno. Existe para que nada quede descartado en silencio.
 */
@Component({
  selector: 'dc-cuarentena',
  template: `
    <div class="cabecera">
      <div class="eyebrow">_cuarentena</div>
      <h1>Cuarentena de la migracion</h1>
      <p class="small">
        Filas que venian de Access sin cumplir alguna regla. Ninguna se descarto: aqui esta
        cada una con lo que incumplia y lo que se hizo con ella.
      </p>
    </div>

    <div class="rejilla" style="margin-bottom:24px">
      @for (r of resumen(); track r.regla) {
        <div class="tarjeta cifra">
          <span class="n">{{ r.filas }}</span>
          <span class="l">{{ explicar(r.regla) }}</span>
        </div>
      }
    </div>

    <div class="tabla-caja">
      <table>
        <thead>
          <tr><th>Tabla</th><th>Registro</th><th>Columna</th><th>Valor</th>
              <th>Regla</th><th>Que se hizo</th><th>Motivo</th></tr>
        </thead>
        <tbody>
          @for (f of filas(); track f.id) {
            <tr>
              <td class="mono">{{ f.tabla_origen }}</td>
              <td class="num">{{ f.pk_origen }}</td>
              <td>{{ f.columna ?? '—' }}</td>
              <td class="num">{{ f.valor ?? '—' }}</td>
              <td>{{ explicar(f.regla) }}</td>
              <td><span class="etiqueta" [class.si]="f.accion === 'reparada'"
                        [class.no]="f.accion !== 'reparada'">{{ accion(f.accion) }}</span></td>
              <td style="white-space:normal">{{ motivo(f) }}</td>
            </tr>
          } @empty {
            <tr><td colspan="7" class="vacio">No hay nada en cuarentena.</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class Cuarentena implements OnInit {
  private api = inject(Api);
  filas = signal<FilaCuarentena[]>([]);

  resumen = computed(() => {
    const m = new Map<string, number>();
    for (const f of this.filas()) m.set(f.regla, (m.get(f.regla) ?? 0) + 1);
    return [...m.entries()].map(([regla, filas]) => ({ regla, filas }));
  });

  async ngOnInit() { this.filas.set(await this.api.cuarentena()); }

  explicar(regla: string): string {
    return {
      fk_producto_centinela: 'Costos con el producto 999, que era un centinela de mano de obra',
      fk_producto_inexistente: 'Costos que apuntan a un producto que no existe',
      fk_cultivo_cero: 'Movimientos de almacen sin cultivo asociado',
      fk_cultivo_inexistente: 'Movimientos de almacen de cultivos ya borrados',
      fk_semilla_inexistente: 'Lineas de pedido de semillas que ya no estan en el catalogo',
      fecha_no_interpretable: 'Fechas que no se pudieron interpretar',
      entero_a_texto: 'Telefonos y cuentas que Access guardaba como numero y truncaba',
    }[regla] ?? regla;
  }

  accion(a: string): string {
    return {
      reparada: 'Reparada',
      a_null: 'Se dejo sin asignar',
      conservada_sin_fk: 'Se conservo',
      convertida: 'Convertida',
      revisar: 'Pendiente de revisar',
    }[a] ?? a;
  }

  motivo(f: FilaCuarentena): string {
    if (!f.detalle_json) return '—';
    try { return JSON.parse(f.detalle_json).motivo ?? '—'; } catch { return f.detalle_json; }
  }
}
