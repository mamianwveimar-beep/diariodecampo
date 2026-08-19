import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../nucleo/api';
import type { CostoActividad, InventarioCampo, ProgramacionSiembra, Trazabilidad } from '../nucleo/tipos';

interface ColumnaInf {
  campo: string;
  titulo: string;
  num?: boolean;
  /** Se suma en el subtotal del grupo y en el total general. */
  suma?: boolean;
  decimales?: number;
}

interface InformeDef {
  clave: string;
  titulo: string;
  origen: string;
  descripcion: string;
  columnas: ColumnaInf[];
  /** Campo por el que se agrupa, si el informe lleva subtotales. */
  agrupa?: { campo: string; titulo: string };
  /** El informe pide una fecha inicial. */
  pideFecha?: boolean;
}

const INFORMES: InformeDef[] = [
  {
    clave: 'inventarioCampo',
    titulo: 'Inventario de campo',
    origen: 'cInventarioCampo',
    descripcion: 'Cultivos activos, lo sembrado frente a lo cosechado.',
    columnas: [
      { campo: 'codigosistema', titulo: 'Cultivo', num: true },
      { campo: 'fechasiembra', titulo: 'Siembra' },
      { campo: 'lote', titulo: 'Lote', num: true },
      { campo: 'cama', titulo: 'Cama', num: true },
      { campo: 'ciclo', titulo: 'Ciclo', num: true },
      { campo: 'numeroPlantasSembradas', titulo: 'Sembradas', num: true, suma: true },
      { campo: 'SumaDenumeroPlantasCosechadas', titulo: 'Cosechadas', num: true, suma: true },
      { campo: 'kilosCosechados', titulo: 'Kilos', num: true, suma: true, decimales: 2 },
      { campo: 'InicioCosecha', titulo: 'Inicio cosecha' },
      { campo: 'FinalCosecha', titulo: 'Fin cosecha' },
      { campo: 'Pedido', titulo: 'Pedido (kg)', num: true },
    ],
  },
  {
    clave: 'costosPorSemana',
    titulo: 'Costos de actividades por semana',
    origen: 'cCostosActividades',
    descripcion: 'Lo que cuesta cada semana del calendario agricola.',
    agrupa: { campo: 'semanaAbono', titulo: 'Semana' },
    columnas: [
      { campo: 'codigoSistema', titulo: 'Cultivo', num: true },
      { campo: 'fechaSiembra', titulo: 'Siembra' },
      { campo: 'Actividad', titulo: 'Actividad' },
      { campo: 'detalle', titulo: 'Detalle' },
      { campo: 'cantidadAbono', titulo: 'Cantidad', num: true, decimales: 3 },
      { campo: 'unidad', titulo: 'Unidad' },
      { campo: 'numeroPlantas', titulo: 'Plantas', num: true },
      { campo: 'total', titulo: 'Total', num: true, suma: true, decimales: 2 },
      { campo: 'costo', titulo: 'Coste unit.', num: true },
      { campo: 'GTotal', titulo: 'Coste', num: true, suma: true, decimales: 0 },
    ],
  },
  {
    clave: 'costosPorCultivo',
    titulo: 'Costos de actividades por cultivo',
    origen: 'cCostosActividades',
    descripcion: 'Lo que lleva gastado cada cultivo.',
    agrupa: { campo: 'codigoSistema', titulo: 'Cultivo' },
    columnas: [
      { campo: 'semanaAbono', titulo: 'Semana', num: true },
      { campo: 'fechaSiembra', titulo: 'Siembra' },
      { campo: 'Actividad', titulo: 'Actividad' },
      { campo: 'detalle', titulo: 'Detalle' },
      { campo: 'cantidadAbono', titulo: 'Cantidad', num: true, decimales: 3 },
      { campo: 'unidad', titulo: 'Unidad' },
      { campo: 'numeroPlantas', titulo: 'Plantas', num: true },
      { campo: 'total', titulo: 'Total', num: true, suma: true, decimales: 2 },
      { campo: 'costo', titulo: 'Coste unit.', num: true },
      { campo: 'GTotal', titulo: 'Coste', num: true, suma: true, decimales: 0 },
    ],
  },
  {
    clave: 'inventarioProductos',
    titulo: 'Inventario de productos',
    origen: 'cInventarioProductos',
    descripcion: 'Movimientos de almacen con su saldo.',
    columnas: [
      { campo: 'Id', titulo: 'Nº', num: true },
      { campo: 'fecha', titulo: 'Fecha' },
      { campo: 'concepto', titulo: 'Concepto' },
      { campo: 'producto', titulo: 'Producto', num: true },
      { campo: 'descripcion', titulo: 'Descripcion' },
      { campo: 'ingreso', titulo: 'Entrada', num: true, suma: true, decimales: 2 },
      { campo: 'salida', titulo: 'Salida', num: true, suma: true, decimales: 2 },
      { campo: 'saldo', titulo: 'Saldo', num: true, suma: true, decimales: 2 },
    ],
  },
  {
    clave: 'programacionSiembra',
    titulo: 'Programacion de siembra',
    origen: 'cProgramacionSiembra',
    descripcion: 'Cuanta area y cuantos metros lineales hacen falta por semilla.',
    agrupa: { campo: 'semilla', titulo: 'Semilla' },
    columnas: [
      { campo: 'variedad', titulo: 'Variedad' },
      { campo: 'Pedido', titulo: 'Pedido (kg)', num: true, decimales: 1 },
      { campo: 'cantidakgTiempoCosecha', titulo: 'Kg por cosecha', num: true, decimales: 2 },
      { campo: 'FrecuanciaSiembra', titulo: 'Frecuencia (dias)', num: true },
      { campo: 'numeroLote', titulo: 'Nº de lotes', num: true, decimales: 2 },
      { campo: 'areaLote', titulo: 'Area por lote', num: true, decimales: 2 },
      { campo: 'numeroPlantasLote', titulo: 'Plantas por lote', num: true, decimales: 0 },
      { campo: 'TotalArea', titulo: 'Area total', num: true, suma: true, decimales: 2 },
      { campo: 'metrosLinealesLote', titulo: 'Metros por lote', num: true, decimales: 2 },
      { campo: 'TotalMetrosLineales', titulo: 'Metros totales', num: true, suma: true, decimales: 2 },
    ],
  },
  {
    clave: 'trazabilidad',
    titulo: 'Trazabilidad',
    origen: 'cProgramacionCultivo',
    descripcion:
      'Calendario completo de cada cultivo: abonos, crecimiento, proteccion y cosecha. ' +
      'Cada labor cae en el dia de la semana que promete su nombre.',
    pideFecha: true,
    columnas: [
      { campo: 'codigosistema', titulo: 'Cultivo', num: true },
      { campo: 'semilla', titulo: 'Semilla' },
      { campo: 'variedad', titulo: 'Variedad' },
      { campo: 'fechasiembra', titulo: 'Siembra' },
      { campo: '#dias', titulo: 'Dias', num: true },
      { campo: 'numeroPlantasSembradas', titulo: 'Plantas', num: true, suma: true },
      { campo: 'Abono25Mar', titulo: 'Abono 1 (mar)' },
      { campo: 'abono50Mar', titulo: 'Abono 2 (mar)' },
      { campo: 'abono75Mar', titulo: 'Abono 3 (mar)' },
      { campo: 'creceMas15Lun', titulo: 'CreceMas 15 (lun)' },
      { campo: 'creceMas30Lun', titulo: 'CreceMas 30 (lun)' },
      { campo: 'produceMas50Mier', titulo: 'ProduceMas 50 (mie)' },
      { campo: 'produceMas70Mier', titulo: 'ProduceMas 70 (mie)' },
      { campo: 'saferMix0Lun', titulo: 'SaferMix (lun)' },
      { campo: 'saferMix60Juev', titulo: 'SaferMix 60 (jue)' },
      { campo: 'sulfoCalcico45Juev', titulo: 'Sulfocalcico 45 (jue)' },
      { campo: 'bordeles70Juev', titulo: 'Bordeles 70 (jue)' },
      { campo: 'fechaCosecha', titulo: 'Cosecha' },
      { campo: 'peso', titulo: 'Peso', num: true, suma: true, decimales: 2 },
    ],
  },
];

/** Sustituye a los 6 informes de Access. */
@Component({
  selector: 'dc-informes',
  imports: [FormsModule],
  template: `
    <div class="cabecera">
      <div class="fila">
        <div>
          <div class="eyebrow">{{ def().origen }}</div>
          <h1>{{ def().titulo }}</h1>
          <p class="small">{{ def().descripcion }}</p>
        </div>
        <button (click)="imprimir()">Imprimir o guardar en PDF</button>
      </div>
    </div>

    <div class="barra">
      <label>Informe
        <select [ngModel]="clave()" (ngModelChange)="cambiarInforme($event)">
          @for (i of informes; track i.clave) { <option [value]="i.clave">{{ i.titulo }}</option> }
        </select>
      </label>
      @if (def().pideFecha) {
        <label>Sembrados despues de
          <input type="date" [ngModel]="fechaInicial()" (ngModelChange)="cambiarFecha($event)" />
        </label>
      }
      <span class="small">{{ filas().length }} filas</span>
    </div>

    @if (!filas().length) {
      <div class="tabla-caja"><p class="vacio">Este informe no tiene datos que mostrar.</p></div>
    } @else {
      <div class="tabla-caja">
        <table>
          <thead>
            <tr>
              @for (c of def().columnas; track c.campo) {
                <th [class.num]="c.num">{{ c.titulo }}</th>
              }
            </tr>
          </thead>

          @if (def().agrupa) {
            @for (g of grupos(); track g.clave) {
              <tbody>
                <tr>
                  <td [attr.colspan]="def().columnas.length"
                      style="background:var(--accent-soft); color:var(--accent); font-weight:600">
                    {{ def().agrupa!.titulo }} {{ g.clave }} — {{ g.filas.length }} registros
                  </td>
                </tr>
                @for (f of g.filas; track $index) {
                  <tr>
                    @for (c of def().columnas; track c.campo) {
                      <td [class.num]="c.num">{{ celda(f, c) }}</td>
                    }
                  </tr>
                }
                <tr>
                  @for (c of def().columnas; track c.campo) {
                    <td [class.num]="c.num" style="background:var(--surface-2); font-weight:600">
                      {{ c.suma ? formato(g.sumas[c.campo], c) : ($first ? 'Subtotal' : '') }}
                    </td>
                  }
                </tr>
              </tbody>
            }
          } @else {
            <tbody>
              @for (f of filas(); track $index) {
                <tr>
                  @for (c of def().columnas; track c.campo) {
                    <td [class.num]="c.num">{{ celda(f, c) }}</td>
                  }
                </tr>
              }
            </tbody>
          }

          <tfoot>
            <tr>
              @for (c of def().columnas; track c.campo) {
                <td [class.num]="c.num">{{ c.suma ? formato(totales()[c.campo], c) : ($first ? 'Total general' : '') }}</td>
              }
            </tr>
          </tfoot>
        </table>
      </div>
    }
  `,
})
export class Informes {
  private api = inject(Api);
  informes = INFORMES;

  clave = signal('inventarioCampo');
  fechaInicial = signal('2000-01-01');
  filas = signal<any[]>([]);

  def = computed<InformeDef>(() => INFORMES.find((i) => i.clave === this.clave())!);

  grupos = computed(() => {
    const d = this.def();
    if (!d.agrupa) return [];
    const mapa = new Map<any, any[]>();
    for (const f of this.filas()) {
      const k = f[d.agrupa.campo];
      if (!mapa.has(k)) mapa.set(k, []);
      mapa.get(k)!.push(f);
    }
    return [...mapa.entries()]
      .sort((a, b) => (a[0] > b[0] ? 1 : a[0] < b[0] ? -1 : 0))
      .map(([clave, filas]) => ({ clave, filas, sumas: this.sumar(filas) }));
  });

  totales = computed(() => this.sumar(this.filas()));

  constructor() { this.cargar(); }

  private sumar(filas: any[]): Record<string, number> {
    const acc: Record<string, number> = {};
    for (const c of this.def().columnas) {
      if (!c.suma) continue;
      acc[c.campo] = filas.reduce((a, f) => a + (Number(f[c.campo]) || 0), 0);
    }
    return acc;
  }

  celda(fila: any, c: ColumnaInf): string {
    const v = fila[c.campo];
    if (v === null || v === undefined || v === '') return '—';
    return c.num ? this.formato(Number(v), c) : String(v);
  }

  formato(v: number | undefined, c: ColumnaInf): string {
    if (v === undefined || v === null || Number.isNaN(v)) return '—';
    return v.toLocaleString('es-CO', {
      minimumFractionDigits: c.decimales ?? 0,
      maximumFractionDigits: c.decimales ?? 2,
    });
  }

  async cambiarInforme(clave: string) { this.clave.set(clave); await this.cargar(); }
  async cambiarFecha(f: string) { this.fechaInicial.set(f); await this.cargar(); }

  private async cargar() {
    const d = this.def();
    this.filas.set(
      d.pideFecha
        ? await this.api.trazabilidad(this.fechaInicial())
        : await this.api.vista<any>(d.origen)
    );
  }

  imprimir() { window.print(); }
}
