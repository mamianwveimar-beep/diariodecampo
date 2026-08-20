import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../nucleo/api';
import { Buscador, type OpcionBuscador } from '../compartido/buscador';
import { hoyLocal, semanaAccess } from '../nucleo/fechas';
import type { Actividad, Cultivo, Empleado, Producto, Semilla } from '../nucleo/tipos';

/** Una linea del detalle: acaba siendo una fila de actividades. */
interface Linea {
  clave: number;
  /** El cultivo al que se le hace la labor. Manda: de el salen los demas. */
  codigoSistema: number | null;
  // copiados del cultivo al elegirlo; lote y cama se pueden corregir
  codsemilla: number | null;
  fechaSiembra: string;
  numeroPlantas: number | null;
  lote: string | null;
  cama: string | null;
  // propios de la labor
  cantidadAbono: number | null;
  responsable: string | null;
  estado: 'pendiente' | 'guardada' | 'error';
  error?: string;
}

/**
 * Alta por lotes de las labores de una semana: una cabecera con la fecha, el
 * tipo de actividad y el insumo, y una linea por cada cama a la que se le
 * hace esa labor.
 *
 * Es la hermana de "Registrar siembra" y comparte su forma, pero con un
 * cambio que conviene tener claro: aqui el cultivo ya existe, asi que la
 * linea no lo crea sino que lo elige, y de el hereda semilla, fecha de
 * siembra, plantas, lote y cama. Lo unico que se inventa es la labor.
 *
 * Dos campos del esquema piden atencion, porque confundirlos rompe el indice
 * unico y los informes:
 *
 *   fechaSiembra  es la del CULTIVO, no la de la labor. Sale de la linea.
 *   semanaAbono   es la semana de la LABOR, calculada de la fecha de la
 *                 cabecera con la misma regla de domingo que el backend.
 *
 * El guardado va linea a linea, como en la siembra: si una falla, las demas
 * entran igual y la fallida se queda en pantalla con su motivo.
 */
@Component({
  selector: 'dc-actividad-lote',
  imports: [FormsModule, RouterLink, Buscador],
  template: `
    <div class="cabecera">
      <div class="fila">
        <div>
          <div class="eyebrow">actividades</div>
          <h1>Registrar actividades</h1>
          <p class="small">
            Una fecha y un tipo de labor para toda la jornada; una línea por cada cama
            a la que se le hace. Cada línea se guarda como una actividad.
          </p>
        </div>
        <a class="boton" routerLink="/actividades">Ver actividades</a>
      </div>
    </div>

    @if (resultado(); as r) {
      <div class="aviso" [class.ok]="!r.fallidas" [class.atencion]="r.fallidas" role="status">
        <span>
          <strong>{{ r.guardadas }} de {{ r.total }} líneas guardadas.</strong>
          @if (r.fallidas) {
            {{ r.fallidas }} no se pudieron guardar; siguen abajo con el motivo.
          } @else {
            Las actividades ya están en la lista.
          }
        </span>
      </div>
    }

    <!-- ------------------------------------------------------- cabecera -->
    <div class="tarjeta" style="margin-bottom:22px">
      <h2>Datos de la jornada</h2>
      <div class="formulario">
        <label>
          Fecha de la actividad *
          <input type="date" [ngModel]="fecha()" (ngModelChange)="fecha.set($event)" required />
        </label>
        <label>
          Actividad *
          <input [ngModel]="actividad()" (ngModelChange)="actividad.set($event)"
                 list="tipos-labor" maxlength="50" required placeholder="p. ej. Deshierbe" />
          <datalist id="tipos-labor">
            @for (t of tiposActividad; track t) { <option [value]="t"></option> }
          </datalist>
        </label>
        <div class="cifra" style="align-self:end">
          <span class="n">{{ semana() ?? '—' }}</span>
          <span class="l">semana de abono · {{ lineas().length }} líneas</span>
        </div>
      </div>

      <h3 style="margin-top:6px">Insumo aplicado</h3>
      <p class="small">
        Elige el producto y se rellenan solos el detalle, la unidad y el costo. Si la
        labor no lleva insumo —un deshierbe, por ejemplo—, déjalo vacío y escribe la
        unidad y el costo a mano.
      </p>
      <div class="formulario">
        <label>
          Producto
          <dc-buscador
            [opciones]="opcionesProducto()"
            [valor]="productoId()"
            (valorChange)="elegirProducto($event)"
            marcador="Busca el insumo" />
        </label>
        <label>
          Detalle
          <input [ngModel]="detalle()" (ngModelChange)="detalle.set($event)" maxlength="50" />
        </label>
        <label>
          Unidad
          <input [ngModel]="unidad()" (ngModelChange)="unidad.set($event)"
                 maxlength="20" list="unidades" placeholder="Kg, Litro, Min" />
          <datalist id="unidades">
            @for (u of unidadesConocidas(); track u) { <option [value]="u"></option> }
          </datalist>
        </label>
        <label>
          Costo por unidad
          <input type="number" step="0.01" min="0" [ngModel]="costo()"
                 (ngModelChange)="costo.set($event === '' ? null : +$event)" />
        </label>
      </div>
    </div>

    <!-- --------------------------------------------------------- detalle -->
    <div class="tabla-caja">
      <table>
        <thead>
          <tr>
            <th style="min-width:250px">Cultivo *</th>
            <th style="min-width:90px">Lote</th>
            <th style="min-width:90px">Cama</th>
            <th class="num" style="min-width:110px">Plantas</th>
            <th class="num" style="min-width:120px">Dosis/planta</th>
            <th class="num" style="min-width:110px">Total</th>
            <th class="num" style="min-width:110px">Costo</th>
            <th style="min-width:160px">Responsable</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          @for (l of lineas(); track l.clave) {
            <tr [style.opacity]="l.estado === 'guardada' ? .55 : 1">
              <td>
                <dc-buscador
                  [opciones]="opcionesCultivo()"
                  [valor]="l.codigoSistema"
                  (valorChange)="elegirCultivo(l, $event)"
                  [deshabilitado]="l.estado === 'guardada'"
                  marcador="Busca el cultivo" />
              </td>
              <td>
                <input [ngModel]="l.lote" (ngModelChange)="cambiar(l, 'lote', $event)"
                       maxlength="20" [disabled]="l.estado === 'guardada'" />
              </td>
              <td>
                <input [ngModel]="l.cama" (ngModelChange)="cambiar(l, 'cama', $event)"
                       maxlength="20" [disabled]="l.estado === 'guardada'" />
              </td>
              <td class="num">{{ l.numeroPlantas ?? '—' }}</td>
              <td>
                <input type="number" step="0.001" min="0" class="dcha"
                       [ngModel]="l.cantidadAbono"
                       (ngModelChange)="cambiar(l, 'cantidadAbono', $event === '' ? null : +$event)"
                       [disabled]="l.estado === 'guardada'" />
              </td>
              <td class="num">{{ num(totalDe(l)) }}</td>
              <td class="num">{{ num(costoDe(l), 0) }}</td>
              <td>
                <input [ngModel]="l.responsable"
                       (ngModelChange)="cambiar(l, 'responsable', $event)"
                       maxlength="255" list="responsables"
                       [disabled]="l.estado === 'guardada'" />
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
                <td colspan="9" style="padding-top:0">
                  <p class="aviso error" style="margin:0">{{ l.error }}</p>
                </td>
              </tr>
            }
            @if (pistaDe(l); as pista) {
              <tr>
                <td colspan="9" style="padding-top:0; border-bottom:none">
                  <span class="small">{{ pista }}</span>
                </td>
              </tr>
            }
          }
        </tbody>
        <tfoot>
          <tr>
            <td colspan="5">Total</td>
            <td class="num">{{ num(totalCantidad()) }}</td>
            <td class="num">{{ num(totalCosto(), 0) }}</td>
            <td colspan="2"></td>
          </tr>
        </tfoot>
      </table>
    </div>

    <datalist id="responsables">
      @for (e of empleados(); track e.id) {
        <option [value]="e.nombre + ' ' + e.apellido"></option>
      }
    </datalist>

    <div class="barra" style="margin-top:16px; justify-content:space-between">
      <button (click)="anadirLinea()">Añadir línea</button>
      <div style="display:flex; gap:10px">
        <a class="boton" routerLink="/actividades">Cancelar</a>
        <button class="primario" (click)="guardar()" [disabled]="guardando() || !hayQueGuardar()">
          {{ guardando() ? 'Guardando…' : 'Guardar actividades' }}
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
  `,
})
export class ActividadLote implements OnInit {
  private api = inject(Api);
  private router = inject(Router);

  cultivos = signal<Cultivo[]>([]);
  semillas = signal<Semilla[]>([]);
  productos = signal<Producto[]>([]);
  empleados = signal<Empleado[]>([]);

  // ---------------------------------------------------------- cabecera
  fecha = signal(hoyLocal());
  actividad = signal('');
  productoId = signal<number | null>(null);
  detalle = signal<string | null>(null);
  unidad = signal<string | null>(null);
  costo = signal<number | null>(null);

  lineas = signal<Linea[]>([]);
  guardando = signal(false);
  errorGeneral = signal<string | null>(null);
  resultado = signal<{ total: number; guardadas: number; fallidas: number } | null>(null);

  private siguienteClave = 1;

  /** Los mismos nombres que generan las consultas de accion heredadas. */
  readonly tiposActividad = [
    'AbonoSolido', 'AbonoLiquido', 'AbonoSiembra', 'CalDolomita',
    'Deshierbe', 'ProteccionVegetal', 'PreparacionTerreno', 'Siembra', 'otros',
  ];

  /**
   * La semana con la que se guarda la labor. Se calcula de la fecha de la
   * cabecera con la misma regla que el backend (domingo como primer dia),
   * no de la fecha de siembra del cultivo.
   */
  semana = computed(() => (this.fecha() ? semanaAccess(this.fecha()) : null));

  opcionesCultivo = computed<OpcionBuscador[]>(() =>
    this.cultivos()
      .filter((c) => c.activo === 1)
      .map((c) => ({
        valor: c.codigosistema,
        texto: `${c.codigosistema} · ${this.nombreSemilla(c.codSemilla)}`,
        detalle: `sembrado ${c.fechasiembra} · lote ${c.lote ?? '—'} · cama ${c.cama ?? '—'}` +
                 ` · ${c.numeroPlantasSembradas ?? 0} plantas`,
      }))
  );

  opcionesProducto = computed<OpcionBuscador[]>(() =>
    this.productos().map((p) => ({
      valor: p.id,
      texto: p.nombreProducto ?? `Producto ${p.id}`,
      detalle: [p.unidad, p.valorUnidad != null ? `$ ${p.valorUnidad}` : null]
        .filter(Boolean).join(' · '),
    }))
  );

  unidadesConocidas = computed(() =>
    [...new Set(this.productos().map((p) => p.unidad).filter((u): u is string => !!u))].sort()
  );

  totalDe = (l: Linea) => (Number(l.cantidadAbono) || 0) * (Number(l.numeroPlantas) || 0);
  costoDe = (l: Linea) => this.totalDe(l) * (Number(this.costo()) || 0);

  totalCantidad = computed(() => this.lineas().reduce((a, l) => a + this.totalDe(l), 0));
  totalCosto = computed(() => this.lineas().reduce((a, l) => a + this.costoDe(l), 0));

  hayQueGuardar = computed(() => this.lineas().some((l) => l.estado !== 'guardada'));

  num = (v: number | null, decimales = 2) =>
    v == null ? '—' : v.toLocaleString('es-CO', { maximumFractionDigits: decimales });

  async ngOnInit() {
    const [cultivos, semillas, productos, empleados] = await Promise.all([
      this.api.listar<Cultivo>('programacionCultivos', 2000),
      this.api.listar<Semilla>('infoSemilla'),
      this.api.listar<Producto>('productos', 200),
      this.api.listar<Empleado>('empleados'),
    ]);
    this.cultivos.set(cultivos);
    this.semillas.set(semillas);
    this.productos.set(productos);
    this.empleados.set(empleados);
    this.anadirLinea();
  }

  nombreSemilla(id: number): string {
    const s = this.semillas().find((x) => x.Id === id);
    return s ? [s.semilla, s.variedad].filter(Boolean).join(' ') : `semilla ${id}`;
  }

  /**
   * Avisos por linea, sin bloquear: repetir cultivo choca contra el indice
   * unico de actividades, y sin dosis la labor se guarda con cantidad cero.
   */
  pistaDe(l: Linea): string | null {
    if (l.estado === 'guardada' || l.codigoSistema == null) return null;
    const repetido = this.lineas().filter(
      (x) => x.codigoSistema === l.codigoSistema && x.estado !== 'guardada'
    ).length > 1;
    if (repetido) {
      return `El cultivo ${l.codigoSistema} está en más de una línea. Solo cabe una ` +
             `actividad de este tipo por cultivo y semana, así que las demás fallarán.`;
    }
    if (!l.cantidadAbono) {
      return `Sin dosis, esta labor se guarda con cantidad y costo cero. ` +
             `Es lo correcto para un deshierbe, pero no para un abonamiento.`;
    }
    return null;
  }

  elegirProducto(id: string | number | null) {
    const n = id == null ? null : Number(id);
    this.productoId.set(n);
    const p = this.productos().find((x) => x.id === n);
    if (!p) return;
    // el producto rellena, pero no cierra: los tres campos siguen editables
    this.detalle.set(p.nombreProducto ?? null);
    this.unidad.set(p.unidad ?? null);
    this.costo.set(p.valorUnidad ?? null);
  }

  anadirLinea() {
    const ultima = this.lineas().at(-1);
    this.lineas.update((ls) => [...ls, {
      clave: this.siguienteClave++,
      codigoSistema: null,
      codsemilla: null,
      fechaSiembra: '',
      numeroPlantas: null,
      lote: null,
      cama: null,
      // La dosis y el responsable se repiten en toda la jornada, asi que se
      // heredan. El lote y la cama NO: aqui salen del cultivo que se elija,
      // que es lo contrario que en la siembra, donde los ponia el operario.
      cantidadAbono: ultima?.cantidadAbono ?? null,
      responsable: ultima?.responsable ?? null,
      estado: 'pendiente',
    }]);
  }

  quitar(l: Linea) {
    this.lineas.update((ls) => ls.filter((x) => x.clave !== l.clave));
  }

  /**
   * Todos los cambios van por la clave de la linea, nunca por el objeto que
   * llega de la plantilla: ese puede ser una copia anterior. Mismo criterio
   * que en Registrar siembra.
   */
  private actualizar(clave: number, cambios: Partial<Linea>) {
    this.lineas.update((ls) =>
      // error: undefined va ANTES del spread a proposito. Cualquier edicion
      // limpia el error de la linea, pero si cambios trae uno explicito ese
      // gana: al reves, guardar marcaba la linea como fallida y acto seguido
      // borraba el motivo, asi que el aviso prometia una explicacion que no
      // llegaba a pintarse nunca.
      ls.map((x) => (x.clave === clave ? { ...x, error: undefined, ...cambios } : x))
    );
  }

  cambiar(l: Linea, campo: keyof Linea, valor: any) {
    this.actualizar(l.clave, { [campo]: valor === '' ? null : valor } as Partial<Linea>);
  }

  /** Al elegir cultivo se copian su semilla, fecha de siembra, plantas, lote y cama. */
  elegirCultivo(l: Linea, codigo: string | number | null) {
    const n = codigo == null ? null : Number(codigo);
    const c = this.cultivos().find((x) => x.codigosistema === n);
    this.actualizar(l.clave, {
      codigoSistema: n,
      codsemilla: c?.codSemilla ?? null,
      fechaSiembra: c?.fechasiembra ?? '',
      numeroPlantas: c?.numeroPlantasSembradas ?? null,
      lote: c?.lote ?? null,
      cama: c?.cama ?? null,
    });
  }

  async guardar() {
    this.errorGeneral.set(null);
    this.resultado.set(null);

    if (!this.fecha()) {
      this.errorGeneral.set('Hace falta la fecha de la actividad.');
      return;
    }
    if (!this.actividad().trim()) {
      this.errorGeneral.set('Hace falta decir qué actividad es.');
      return;
    }
    const pendientes = this.lineas().filter((l) => l.estado !== 'guardada');
    const sinCultivo = pendientes.filter((l) => l.codigoSistema == null);
    if (sinCultivo.length) {
      this.errorGeneral.set(
        `${sinCultivo.length} línea(s) sin cultivo. Complétalas o quítalas antes de guardar.`
      );
      return;
    }

    this.guardando.set(true);
    let guardadas = 0, fallidas = 0;
    try {
      for (const l of pendientes) {
        try {
          await this.api.crear<Actividad>('actividades', {
            codigoSistema: l.codigoSistema!,
            codsemilla: l.codsemilla!,
            // la del CULTIVO; la de la jornada solo decide la semana
            fechaSiembra: l.fechaSiembra,
            semanaAbono: this.semana()!,
            Actividad: this.actividad().trim(),
            cantidadAbono: l.cantidadAbono ?? 0,
            lote: l.lote,
            cama: l.cama,
            numeroPlantas: l.numeroPlantas ?? 0,
            detalle: this.detalle() || null,
            responsable: l.responsable || null,
            costo: this.costo() ?? 0,
            unidad: this.unidad() || null,
            // se registra en campo, no es programacion
            fechaRegistro: this.fecha(),
          });
          this.actualizar(l.clave, { estado: 'guardada' });
          guardadas++;
        } catch (e: any) {
          // el 409 de la API ya viene explicado, pero en terminos de columnas;
          // aqui se traduce a lo que el operario ve en pantalla
          const msg = e?.error?.error ?? '';
          const repetida = e?.status === 409 || /Ya existe un registro/i.test(msg);
          this.actualizar(l.clave, {
            estado: 'error',
            error: repetida
              ? `El cultivo ${l.codigoSistema} ya tiene una actividad «${this.actividad().trim()}» ` +
                `en la semana ${this.semana()}. Access la descartaba en silencio; aquí se avisa.`
              : msg || 'No se pudo guardar esta línea.',
          });
          fallidas++;
        }
      }
    } finally {
      this.guardando.set(false);
      // Api.pedir deja el ultimo fallo en el banner global de la aplicacion,
      // con el mensaje tecnico de la base. Aqui sobra: cada linea fallida ya
      // lleva su explicacion debajo, y el banner solo repetiria la ultima en
      // un idioma peor.
      this.api.error.set(null);
    }

    this.resultado.set({ total: pendientes.length, guardadas, fallidas });
    if (!fallidas) setTimeout(() => this.router.navigate(['/actividades']), 1600);
  }
}
