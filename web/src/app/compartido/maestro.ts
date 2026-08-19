import { Component, computed, inject, input, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../nucleo/api';
import { MAESTROS, type CampoDef, type MaestroDef } from '../nucleo/campos';
import type { Adjunto } from '../nucleo/tipos';

/**
 * Pantalla de mantenimiento generica: listado, alta, edicion y borrado.
 * La forma de cada pantalla sale de MAESTROS (nucleo/campos.ts).
 *
 * Sustituye a frmInfoSemilla, frmProductos, frmClientes y
 * frmInventarioProductos de Access, que eran cuatro formularios casi iguales.
 */
@Component({
  selector: 'dc-maestro',
  imports: [FormsModule],
  template: `
    <div class="cabecera">
      <div class="fila">
        <div>
          <div class="eyebrow">{{ def().tabla }}</div>
          <h1>{{ def().titulo }}</h1>
          <p class="small">{{ def().subtitulo }}</p>
        </div>
        <button class="primario" (click)="abrirNuevo()">Nuevo registro</button>
      </div>
    </div>

    @if (mensaje(); as m) {
      <p class="aviso ok" role="status">{{ m }}</p>
    }

    <div class="barra">
      <label class="crece">
        Buscar
        <input type="search" [ngModel]="busqueda()" (ngModelChange)="busqueda.set($event)"
               placeholder="Filtra por cualquier dato de la tabla" />
      </label>
      <span class="small">{{ filtradas().length }} de {{ filas().length }}</span>
    </div>

    <div class="tabla-caja">
      <table>
        <thead>
          <tr>
            @for (c of columnas(); track c.nombre) {
              <th [class.num]="c.tipo === 'numero'">{{ c.etiqueta }}</th>
            }
            <th></th>
          </tr>
        </thead>
        <tbody>
          @for (f of filtradas(); track f[def().pk]) {
            <tr>
              @for (c of columnas(); track c.nombre) {
                <td [class.num]="c.tipo === 'numero'">{{ mostrar(f, c) }}</td>
              }
              <td class="acciones">
                <button class="menudo" (click)="abrirEdicion(f)">Editar</button>
                <button class="menudo peligro" (click)="borrar(f)">Borrar</button>
              </td>
            </tr>
          } @empty {
            <tr><td [attr.colspan]="columnas().length + 1" class="vacio">
              {{ filas().length ? 'Ningun registro coincide con la busqueda.' : 'Todavia no hay registros.' }}
            </td></tr>
          }
        </tbody>
      </table>
    </div>

    @if (editando(); as fila) {
      <div class="velo" (click)="cerrar()">
        <div class="modal" (click)="$event.stopPropagation()">
          <h2>{{ esNuevo() ? 'Nuevo' : 'Editar' }} — {{ def().titulo }}</h2>
          <p class="small">Los campos marcados con * son obligatorios.</p>

          @if (adjuntos().length) {
            <div class="barra" style="margin-top:14px">
              @for (a of adjuntos(); track a.id) {
                <a class="boton" [href]="api.urlAdjunto(a.id)" target="_blank" rel="noopener">
                  {{ a.nombre_archivo }}
                </a>
              }
            </div>
          }

          <form class="formulario" style="margin-top:14px" (ngSubmit)="guardar()">
            @for (c of camposEditables(); track c.nombre) {
              <label [class.ancho]="c.ancho">
                {{ c.etiqueta }}{{ c.requerido ? ' *' : '' }}
                @switch (c.tipo) {
                  @case ('seleccion') {
                    <select [ngModel]="fila[c.nombre]" (ngModelChange)="cambiar(c.nombre, $event)"
                            [name]="c.nombre" [required]="!!c.requerido">
                      <option [ngValue]="null">— sin asignar —</option>
                      @for (o of opciones(c); track o.valor) {
                        <option [ngValue]="o.valor">{{ o.texto }}</option>
                      }
                    </select>
                  }
                  @case ('area') {
                    <textarea [ngModel]="fila[c.nombre]" (ngModelChange)="cambiar(c.nombre, $event)"
                              [name]="c.nombre" [maxlength]="c.max ?? null"></textarea>
                  }
                  @default {
                    <input [type]="c.tipo === 'numero' ? 'number' : c.tipo === 'fecha' ? 'date' : 'text'"
                           [ngModel]="fila[c.nombre]" (ngModelChange)="cambiar(c.nombre, $event)"
                           [name]="c.nombre" [required]="!!c.requerido"
                           [maxlength]="c.max ?? null" [step]="c.paso ?? null" />
                  }
                }
                @if (c.ayuda) { <span class="small">{{ c.ayuda }}</span> }
              </label>
            }
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
export class Maestro implements OnInit {
  /** Clave de MAESTROS: semillas, productos, clientes, empleados, almacen. */
  clave = input.required<string>();

  api = inject(Api);

  filas = signal<any[]>([]);
  busqueda = signal('');
  editando = signal<any | null>(null);
  esNuevo = signal(false);
  mensaje = signal<string | null>(null);
  errorForm = signal<string | null>(null);
  adjuntos = signal<Adjunto[]>([]);
  private listas = signal<Record<string, any[]>>({});

  def = computed<MaestroDef>(() => MAESTROS[this.clave()]);
  columnas = computed(() => this.def().campos.filter((c) => c.enTabla));
  camposEditables = computed(() =>
    this.def().campos.filter((c) => !c.calculado || (c.nombre === this.def().pk && !this.def().pkAutomatica))
  );

  filtradas = computed(() => {
    const q = this.busqueda().trim().toLowerCase();
    if (!q) return this.filas();
    return this.filas().filter((f) =>
      Object.values(f).some((v) => v != null && String(v).toLowerCase().includes(q))
    );
  });

  async ngOnInit() {
    await this.recargar();
    // desplegables que se alimentan de otras tablas
    const origenes = this.def().campos.map((c) => c.origen).filter(Boolean);
    for (const o of origenes) {
      if (this.listas()[o!.tabla]) continue;
      const datos = await this.api.listar<any>(o!.tabla);
      this.listas.update((m) => ({ ...m, [o!.tabla]: datos }));
    }
  }

  async recargar() {
    this.filas.set(await this.api.listar<any>(this.def().tabla));
  }

  opciones(c: CampoDef): { valor: any; texto: string }[] {
    if (c.opciones) return c.opciones;
    if (!c.origen) return [];
    const datos = this.listas()[c.origen.tabla] ?? [];
    return datos.map((d) => ({
      valor: d[c.origen!.valor],
      texto: c.origen!.texto.map((t) => d[t]).filter((x) => x != null).join(' · ') || String(d[c.origen!.valor]),
    }));
  }

  mostrar(fila: any, c: CampoDef): string {
    const v = fila[c.nombre];
    if (v === null || v === undefined || v === '') return '—';
    if (c.opciones) return c.opciones.find((o) => o.valor === v)?.texto ?? String(v);
    if (c.origen) return this.opciones(c).find((o) => o.valor === v)?.texto ?? String(v);
    if (c.tipo === 'numero' && typeof v === 'number') {
      return v.toLocaleString('es-CO', { maximumFractionDigits: 4 });
    }
    return String(v);
  }

  abrirNuevo() {
    const vacio: Record<string, any> = {};
    for (const c of this.camposEditables()) vacio[c.nombre] = null;
    this.esNuevo.set(true);
    this.errorForm.set(null);
    this.adjuntos.set([]);
    this.editando.set(vacio);
  }

  async abrirEdicion(fila: any) {
    this.esNuevo.set(false);
    this.errorForm.set(null);
    this.editando.set({ ...fila });
    this.adjuntos.set(
      this.def().adjuntos ? await this.api.adjuntos(this.def().tabla, fila[this.def().pk]) : []
    );
  }

  cambiar(campo: string, valor: any) {
    this.editando.update((f) => ({ ...f!, [campo]: valor === '' ? null : valor }));
  }

  cerrar() {
    this.editando.set(null);
    this.errorForm.set(null);
  }

  async guardar() {
    const fila = this.editando();
    if (!fila) return;

    const faltan = this.camposEditables()
      .filter((c) => c.requerido && (fila[c.nombre] === null || fila[c.nombre] === ''))
      .map((c) => c.etiqueta);
    if (faltan.length) {
      this.errorForm.set(`Faltan estos campos obligatorios: ${faltan.join(', ')}.`);
      return;
    }

    const cuerpo: Record<string, any> = {};
    for (const c of this.camposEditables()) {
      if (c.calculado) continue;
      cuerpo[c.nombre] = fila[c.nombre];
    }

    try {
      if (this.esNuevo()) {
        await this.api.crear(this.def().tabla, cuerpo);
        this.mensaje.set('Registro creado.');
      } else {
        await this.api.actualizar(this.def().tabla, fila[this.def().pk], cuerpo);
        this.mensaje.set('Cambios guardados.');
      }
      this.cerrar();
      await this.recargar();
      setTimeout(() => this.mensaje.set(null), 3500);
    } catch (e: any) {
      this.errorForm.set(e?.error?.error ?? 'No se pudo guardar. Revisa los datos.');
    }
  }

  async borrar(fila: any) {
    const id = fila[this.def().pk];
    if (!confirm(`Se va a borrar el registro ${id}. Esta accion no se puede deshacer.`)) return;
    await this.api.borrar(this.def().tabla, id);
    this.mensaje.set('Registro borrado.');
    await this.recargar();
    setTimeout(() => this.mensaje.set(null), 3500);
  }
}
