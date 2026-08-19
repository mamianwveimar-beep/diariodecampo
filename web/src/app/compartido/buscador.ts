import { Component, computed, ElementRef, input, model, signal, viewChild } from '@angular/core';

export interface OpcionBuscador {
  valor: string | number;
  texto: string;
  /** Segunda linea, para desambiguar (variedad, unidad, codigo...). */
  detalle?: string;
}

/**
 * Desplegable con buscador: se escribe para filtrar y se elige con el raton
 * o con el teclado. Sustituye al cuadro combinado de Access, que obligaba a
 * recorrer la lista entera.
 */
@Component({
  selector: 'dc-buscador',
  template: `
    <div class="buscador" [class.abierto]="abierto()">
      <input
        #entrada
        type="text"
        role="combobox"
        aria-autocomplete="list"
        [attr.aria-expanded]="abierto()"
        [attr.aria-activedescendant]="abierto() && resaltada() >= 0 ? id + '-op-' + resaltada() : null"
        [placeholder]="marcador()"
        [value]="textoVisible()"
        [disabled]="deshabilitado()"
        (input)="alEscribir($any($event.target).value)"
        (focus)="abrir()"
        (blur)="alSalir()"
        (keydown)="alTeclear($event)" />

      @if (valor() !== null && valor() !== undefined && !abierto()) {
        <button type="button" class="limpiar" (click)="limpiar()" aria-label="Quitar seleccion">×</button>
      }

      @if (abierto()) {
        <ul class="opciones" role="listbox">
          @for (o of filtradas(); track o.valor; let i = $index) {
            <li
              [id]="id + '-op-' + i"
              role="option"
              [attr.aria-selected]="o.valor === valor()"
              [class.resaltada]="i === resaltada()"
              (mousedown)="elegir(o)"
              (mouseenter)="resaltada.set(i)">
              <span class="t">{{ o.texto }}</span>
              @if (o.detalle) { <span class="d">{{ o.detalle }}</span> }
            </li>
          } @empty {
            <li class="ninguna">Ninguna coincidencia con «{{ busqueda() }}»</li>
          }
        </ul>
      }
    </div>
  `,
  styles: `
    .buscador { position: relative; }
    .buscador input { width: 100%; }
    .limpiar {
      position: absolute; right: 4px; top: 50%; transform: translateY(-50%);
      border: none; background: none; padding: 0 6px; font-size: 1.1rem;
      line-height: 1; color: var(--ink-3); cursor: pointer;
    }
    .limpiar:hover { color: var(--oxide); background: none; }
    .opciones {
      position: absolute; z-index: 20; top: calc(100% + 2px); left: 0; right: 0;
      max-height: 260px; overflow-y: auto; margin: 0; padding: 4px;
      list-style: none; background: var(--surface); border: 1px solid var(--rule-strong);
      border-radius: var(--r); box-shadow: var(--sombra);
    }
    .opciones li {
      padding: 6px 9px; border-radius: 3px; cursor: pointer;
      display: flex; flex-direction: column; gap: 1px; font-size: .88rem;
    }
    .opciones li.resaltada { background: var(--accent-soft); color: var(--accent); }
    .opciones li.ninguna { color: var(--ink-3); cursor: default; font-style: italic; }
    .opciones .d { font-size: .78rem; color: var(--ink-3); }
    .opciones li.resaltada .d { color: var(--accent); }
  `,
})
export class Buscador {
  opciones = input.required<OpcionBuscador[]>();
  marcador = input('Escribe para buscar');
  deshabilitado = input(false);
  valor = model<string | number | null>(null);

  private entrada = viewChild<ElementRef<HTMLInputElement>>('entrada');
  readonly id = `bus-${Math.random().toString(36).slice(2, 8)}`;

  abierto = signal(false);
  busqueda = signal('');
  resaltada = signal(0);

  private elegida = computed(() =>
    this.opciones().find((o) => o.valor === this.valor()) ?? null
  );

  /** Con el desplegable cerrado se ve la eleccion; abierto, lo que se teclea. */
  textoVisible = computed(() =>
    this.abierto() ? this.busqueda() : (this.elegida()?.texto ?? '')
  );

  filtradas = computed(() => {
    const q = this.busqueda().trim().toLowerCase();
    if (!q) return this.opciones();
    return this.opciones().filter(
      (o) => `${o.texto} ${o.detalle ?? ''}`.toLowerCase().includes(q)
    );
  });

  abrir() {
    this.busqueda.set('');
    this.resaltada.set(Math.max(0, this.filtradas().findIndex((o) => o.valor === this.valor())));
    this.abierto.set(true);
  }

  alEscribir(texto: string) {
    this.busqueda.set(texto);
    this.abierto.set(true);
    this.resaltada.set(0);
  }

  alSalir() {
    // el mousedown de la opcion se dispara antes que el blur, asi que aqui
    // solo hay que cerrar
    this.abierto.set(false);
    this.busqueda.set('');
  }

  elegir(o: OpcionBuscador) {
    this.valor.set(o.valor);
    this.abierto.set(false);
    this.busqueda.set('');
    this.entrada()?.nativeElement.blur();
  }

  limpiar() {
    this.valor.set(null);
    this.busqueda.set('');
  }

  alTeclear(e: KeyboardEvent) {
    const lista = this.filtradas();
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!this.abierto()) { this.abrir(); return; }
        this.resaltada.update((i) => Math.min(i + 1, lista.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.resaltada.update((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        if (this.abierto() && lista[this.resaltada()]) {
          e.preventDefault();
          this.elegir(lista[this.resaltada()]);
        }
        break;
      case 'Escape':
        this.abierto.set(false);
        this.busqueda.set('');
        break;
    }
  }
}
