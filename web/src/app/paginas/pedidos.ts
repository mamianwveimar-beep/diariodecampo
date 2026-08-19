import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../nucleo/api';
import type { Pedido, LineaPedido, Cliente, Semilla } from '../nucleo/tipos';

/**
 * Pedidos: sustituye al formulario `pedido` y a su subformulario
 * `detallePedido Subformulario` de Access.
 *
 * Nueve de las quince lineas heredadas apuntan a semillas que ya no existen
 * (Id 1, 14, 15, 16, 17 y 212). Se conservan y se marcan en pantalla en vez
 * de esconderlas, porque son parte del historico.
 */
@Component({
  selector: 'dc-pedidos',
  imports: [FormsModule],
  template: `
    <div class="cabecera">
      <div class="fila">
        <div>
          <div class="eyebrow">pedido · detallePedido</div>
          <h1>Pedidos</h1>
          <p class="small">Pedidos de los clientes y sus lineas.</p>
        </div>
        <button class="primario" (click)="abrirNuevo()">Nuevo pedido</button>
      </div>
    </div>

    @if (mensaje(); as m) { <p class="aviso ok" role="status">{{ m }}</p> }

    @if (lineasHuerfanas() > 0) {
      <p class="aviso atencion" style="margin-bottom:18px">
        {{ lineasHuerfanas() }} lineas apuntan a semillas que ya no existen en el catalogo.
        Vienen asi desde Access y se muestran marcadas como <em>semilla desconocida</em>.
      </p>
    }

    <div class="rejilla" style="grid-template-columns: minmax(320px, 420px) 1fr; align-items:start">
      <!-- ------------------------------------------------------ cabeceras -->
      <div class="tabla-caja">
        <table>
          <thead><tr><th class="num">Nº</th><th>Cliente</th><th>Fecha</th><th class="num">Total</th></tr></thead>
          <tbody>
            @for (p of pedidos(); track p.Id) {
              <tr (click)="seleccionar(p)" style="cursor:pointer"
                  [style.background]="p.Id === seleccionado()?.Id ? 'var(--accent-soft)' : ''">
                <td class="num">{{ p.Id }}</td>
                <td>{{ nombreCliente(p.NitCedula) }}</td>
                <td>{{ p.fechaPedido }}</td>
                <td class="num">{{ moneda(totalDe(p)) }}</td>
              </tr>
            } @empty {
              <tr><td colspan="4" class="vacio">No hay pedidos.</td></tr>
            }
          </tbody>
        </table>
      </div>

      <!-- --------------------------------------------------------- detalle -->
      @if (seleccionado(); as p) {
        <div class="tarjeta">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:14px">
            <div>
              <h2>Pedido {{ p.Id }}</h2>
              <p class="small">{{ nombreCliente(p.NitCedula) }} · pedido el {{ p.fechaPedido }}
                · entrega {{ p.FechaEntrega ?? 'sin fecha' }}</p>
            </div>
            <div style="display:flex; gap:8px">
              <button class="menudo" (click)="abrirEdicion(p)">Editar</button>
              <button class="menudo peligro" (click)="borrar(p)">Borrar</button>
            </div>
          </div>

          @if (p.Observacion) { <p class="small">{{ p.Observacion }}</p> }

          <div class="tabla-caja">
            <table>
              <thead>
                <tr><th>Semilla</th><th class="num">Cantidad</th><th class="num">Valor unit.</th>
                    <th class="num">Subtotal</th><th></th></tr>
              </thead>
              <tbody>
                @for (l of lineas(); track l.Id) {
                  <tr>
                    <td>
                      @if (semillaValida(l.IdSemilla)) {
                        {{ nombreSemilla(l.IdSemilla) }}
                      } @else {
                        <span class="etiqueta no">semilla desconocida #{{ l.IdSemilla }}</span>
                      }
                    </td>
                    <td class="num">{{ l.Cantidad }}</td>
                    <td class="num">{{ moneda(l.ValorUnitario) }}</td>
                    <td class="num">{{ moneda(l.SubTotal) }}</td>
                    <td class="acciones">
                      <button class="menudo peligro" (click)="borrarLinea(l)">Quitar</button>
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="5" class="vacio">Este pedido no tiene lineas.</td></tr>
                }
              </tbody>
              @if (lineas().length) {
                <tfoot>
                  <tr>
                    <td colspan="3">Total del pedido</td>
                    <td class="num">{{ moneda(totalLineas()) }}</td>
                    <td></td>
                  </tr>
                </tfoot>
              }
            </table>
          </div>

          <h3 style="margin-top:8px">Anadir linea</h3>
          <div class="barra" style="margin-bottom:0">
            <label class="crece">Semilla
              <select [ngModel]="nueva().IdSemilla" (ngModelChange)="alElegirSemilla($event)">
                <option [ngValue]="null">— elige —</option>
                @for (s of semillas(); track s.Id) {
                  <option [ngValue]="s.Id">{{ s.semilla }} {{ s.variedad }}</option>
                }
              </select>
            </label>
            <label>Cantidad
              <input type="number" [ngModel]="nueva().Cantidad"
                     (ngModelChange)="cambiarLinea('Cantidad', $event)" />
            </label>
            <label>Valor unitario
              <input type="number" [ngModel]="nueva().ValorUnitario"
                     (ngModelChange)="cambiarLinea('ValorUnitario', $event)" />
            </label>
            <button class="primario" (click)="anadirLinea()">Anadir</button>
          </div>
          @if (errorLinea(); as e) { <p class="aviso error">{{ e }}</p> }
        </div>
      } @else {
        <div class="tarjeta"><p class="small">Elige un pedido de la lista para ver sus lineas.</p></div>
      }
    </div>

    <!-- ---------------------------------------------------- alta y edicion -->
    @if (editando(); as f) {
      <div class="velo" (click)="cerrar()">
        <div class="modal" (click)="$event.stopPropagation()">
          <h2>{{ esNuevo() ? 'Nuevo pedido' : 'Pedido ' + f.Id }}</h2>
          <form class="formulario" style="margin-top:14px">
            <label>Cliente *
              <select [ngModel]="f.NitCedula" (ngModelChange)="cambiar('NitCedula', $event)" name="cli" required>
                <option [ngValue]="null">— elige —</option>
                @for (c of clientes(); track c.NitCedula) {
                  <option [ngValue]="c.NitCedula">{{ nombreCliente(c.NitCedula) }}</option>
                }
              </select>
            </label>
            <label>Fecha del pedido
              <input type="date" [ngModel]="f.fechaPedido" (ngModelChange)="cambiar('fechaPedido', $event)" name="fp" />
            </label>
            <label>Fecha de entrega
              <input type="date" [ngModel]="f.FechaEntrega" (ngModelChange)="cambiar('FechaEntrega', $event)" name="fe" />
            </label>
            <label>Transporte
              <input type="number" [ngModel]="f.Transporte" (ngModelChange)="cambiar('Transporte', $event)" name="tr" />
            </label>
            <label>Responsable
              <input [ngModel]="f.Responsable" (ngModelChange)="cambiar('Responsable', $event)" name="rp" />
            </label>
            <label>Cancelado
              <select [ngModel]="f.Cancelado" (ngModelChange)="cambiar('Cancelado', $event)" name="ca">
                <option [ngValue]="0">No</option><option [ngValue]="1">Si</option>
              </select>
            </label>
            <label>Activo
              <select [ngModel]="f.Activo" (ngModelChange)="cambiar('Activo', $event)" name="ac">
                <option [ngValue]="1">Si</option><option [ngValue]="0">No</option>
              </select>
            </label>
            <label class="ancho">Observacion
              <textarea [ngModel]="f.Observacion" (ngModelChange)="cambiar('Observacion', $event)" name="ob"></textarea>
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
export class Pedidos implements OnInit {
  private api = inject(Api);

  pedidos = signal<Pedido[]>([]);
  todasLineas = signal<LineaPedido[]>([]);
  clientes = signal<Cliente[]>([]);
  semillas = signal<Semilla[]>([]);

  seleccionado = signal<Pedido | null>(null);
  nueva = signal<Partial<LineaPedido>>({});
  errorLinea = signal<string | null>(null);

  editando = signal<any | null>(null);
  esNuevo = signal(false);
  errorForm = signal<string | null>(null);
  mensaje = signal<string | null>(null);

  lineas = computed(() =>
    this.todasLineas().filter((l) => l.IdPedido === this.seleccionado()?.Id)
  );

  lineasHuerfanas = computed(() =>
    this.todasLineas().filter((l) => !this.semillaValida(l.IdSemilla)).length
  );

  totalLineas = () => this.lineas().reduce((a, l) => a + (l.SubTotal ?? 0), 0);
  totalDe = (p: Pedido) =>
    this.todasLineas().filter((l) => l.IdPedido === p.Id).reduce((a, l) => a + (l.SubTotal ?? 0), 0);

  moneda = (v: number | null) =>
    v == null ? '—' : v.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

  async ngOnInit() { await this.recargar(); }

  private async recargar() {
    const [ped, lin, cli, sem] = await Promise.all([
      this.api.listar<Pedido>('pedido'),
      this.api.listar<LineaPedido>('detallePedido'),
      this.api.listar<Cliente>('clientes'),
      this.api.listar<Semilla>('infoSemilla'),
    ]);
    this.pedidos.set(ped);
    this.todasLineas.set(lin);
    this.clientes.set(cli);
    this.semillas.set(sem);
    const sel = this.seleccionado();
    if (sel) this.seleccionado.set(ped.find((p) => p.Id === sel.Id) ?? null);
  }

  semillaValida = (id: number | null) => id != null && this.semillas().some((s) => s.Id === id);

  nombreSemilla(id: number | null): string {
    const s = this.semillas().find((x) => x.Id === id);
    return s ? [s.semilla, s.variedad].filter(Boolean).join(' ') : `#${id}`;
  }

  nombreCliente(nit: string | null): string {
    const c = this.clientes().find((x) => x.NitCedula === nit);
    return c ? [c.NombreCliente, c.ApellidoCliente].filter(Boolean).join(' ') || c.NitCedula : (nit ?? '—');
  }

  seleccionar(p: Pedido) {
    this.seleccionado.set(p);
    this.nueva.set({ IdPedido: p.Id });
    this.errorLinea.set(null);
  }

  alElegirSemilla(id: number) {
    const s = this.semillas().find((x) => x.Id === id);
    this.nueva.update((n) => ({ ...n, IdSemilla: id, ValorUnitario: n.ValorUnitario ?? s?.Valor ?? null }));
  }

  cambiarLinea(campo: string, valor: any) {
    this.nueva.update((n) => ({ ...n, [campo]: valor === '' ? null : valor }));
  }

  async anadirLinea() {
    const p = this.seleccionado();
    const n = this.nueva();
    if (!p) return;
    if (n.IdSemilla == null || n.Cantidad == null) {
      this.errorLinea.set('Hacen falta la semilla y la cantidad.');
      return;
    }
    try {
      await this.api.crear<LineaPedido>('detallePedido', {
        IdPedido: p.Id, IdSemilla: n.IdSemilla,
        Cantidad: n.Cantidad, ValorUnitario: n.ValorUnitario ?? 0,
      });
      this.nueva.set({ IdPedido: p.Id });
      this.errorLinea.set(null);
      await this.recargar();
    } catch (e: any) {
      this.errorLinea.set(e?.error?.error ?? 'No se pudo anadir la linea.');
    }
  }

  async borrarLinea(l: LineaPedido) {
    if (!confirm('Se va a quitar esta linea del pedido.')) return;
    await this.api.borrar('detallePedido', l.Id);
    await this.recargar();
  }

  abrirNuevo() {
    this.esNuevo.set(true);
    this.errorForm.set(null);
    this.editando.set({
      NitCedula: null, fechaPedido: null, FechaEntrega: null,
      Transporte: 0, Responsable: null, Cancelado: 0, Activo: 1, Observacion: null,
    });
  }

  abrirEdicion(p: Pedido) {
    this.esNuevo.set(false);
    this.errorForm.set(null);
    this.editando.set({ ...p });
  }

  cambiar(campo: string, valor: any) {
    this.editando.update((f) => ({ ...f!, [campo]: valor === '' ? null : valor }));
  }

  cerrar() { this.editando.set(null); this.errorForm.set(null); }

  async guardar() {
    const f = this.editando();
    if (!f) return;
    if (!f.NitCedula) { this.errorForm.set('Hace falta elegir el cliente.'); return; }
    const cuerpo = {
      NitCedula: f.NitCedula, fechaPedido: f.fechaPedido, FechaEntrega: f.FechaEntrega,
      Transporte: f.Transporte, Responsable: f.Responsable,
      Cancelado: f.Cancelado, Activo: f.Activo, Observacion: f.Observacion,
    };
    try {
      if (this.esNuevo()) {
        const creado = await this.api.crear<Pedido>('pedido', cuerpo);
        this.avisar('Pedido creado.');
        this.cerrar();
        await this.recargar();
        this.seleccionar(creado);
        return;
      }
      await this.api.actualizar<Pedido>('pedido', f.Id, cuerpo);
      this.avisar('Pedido actualizado.');
      this.cerrar();
      await this.recargar();
    } catch (e: any) {
      this.errorForm.set(e?.error?.error ?? 'No se pudo guardar el pedido.');
    }
  }

  async borrar(p: Pedido) {
    if (!confirm(`Se va a borrar el pedido ${p.Id} y sus lineas. Esta accion no se puede deshacer.`)) return;
    await this.api.borrar('pedido', p.Id);
    this.seleccionado.set(null);
    this.avisar('Pedido borrado.');
    await this.recargar();
  }

  private avisar(texto: string) {
    this.mensaje.set(texto);
    setTimeout(() => this.mensaje.set(null), 3500);
  }
}
