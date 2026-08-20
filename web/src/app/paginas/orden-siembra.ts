import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Api } from '../nucleo/api';
import type { CostoActividad, Cultivo, Orden, Producto } from '../nucleo/tipos';
import { calcularPrograma, type FilaPrograma } from '../nucleo/plan-siembra';
import { semanaAccess } from '../nucleo/fechas';

/**
 * Una fila de la tabla de la semana: sale de la ficha o la anade el operario.
 *
 * Es el mismo tipo para las dos porque acaban en la misma tabla y en el mismo
 * envio; lo que cambia es que las adicionales traen todos los campos abiertos
 * y ademas abren su linea en costosInsumos.
 */
export interface FilaSemana {
  /** Estable dentro de una semana: es la clave del indice UNIQUE de actividades. */
  actividad: string;
  detalle: string;
  unidad: string;
  cantidad: number | null;
  costoTotal: number | null;
  /** Cantidad por planta, para poder despejar al enviar. Las adicionales no la usan. */
  costoUnitario: number;
  esAdicional: boolean;
}

/**
 * Solo lo que se carga al hombro suma al peso de la semana. El minutaje de
 * mano de obra no, y las adicionales traen la unidad escrita a mano, asi que
 * la regla mira la unidad y no el tipo de labor.
 */
const UNIDADES_CON_PESO = new Set(['kg', 'litro', 'l', 'lt', 'lts', 'kgs']);
export const pesa = (unidad: string | null | undefined) =>
  UNIDADES_CON_PESO.has((unidad ?? '').trim().toLowerCase());

/**
 * Orden de siembra: lo que el operario registra en campo, con el movil.
 *
 * La pantalla se organiza alrededor de los permisos, y esa es toda su idea:
 * el operario solo puede tocar cuatro cosas —lote, cama, cantidad real
 * sembrada y el motivo de la merma—, y todo lo demas sale de la ficha de la
 * semilla y se marca como cerrado. Asi no hace falta explicar nada: se ve.
 *
 * La tabla de la semana de la siembra si es editable, y es la excepcion que
 * confirma la regla: son las labores que el operario acaba de ejecutar, asi
 * que puede corregir lo que de verdad aplico. Solo esa semana viaja en el
 * POST y solo esa queda con fechaRegistro sellada; el resto de la temporada
 * se programa igual, pero con fechaRegistro en NULL, a la espera de que
 * llegue su semana.
 *
 * Todo se calcula sobre las plantas que de verdad entraron, no sobre las que
 * se habian planificado.
 *
 * Sin codigo en la ruta muestra la lista de siembras pendientes; con codigo,
 * la orden. Es el mismo componente porque es el mismo trabajo: elegir una
 * cama y registrarla.
 */
@Component({
  selector: 'dc-orden-siembra',
  imports: [FormsModule, RouterLink],
  template: `
    <!-- ==================================================== la lista -->
    @if (!codigo()) {
      <div class="cabecera">
        <div class="fila">
          <div>
            <div class="eyebrow">programacionCultivos</div>
            <h1>Órdenes de siembra</h1>
            <p class="small">
              Siembras programadas que todavía nadie ha registrado en campo.
              Elige la cama que acabas de sembrar.
            </p>
          </div>
          <a class="boton" routerLink="/siembras/nueva">Programar siembra</a>
        </div>
      </div>

      @if (cargando()) {
        <p class="small">Cargando…</p>
      } @else if (!pendientes().length) {
        <p class="aviso ok" role="status">
          No queda ninguna siembra por registrar. Todo lo programado ya está anotado en campo.
        </p>
      } @else {
        <div class="barra">
          <label>Cultivo
            <select [ngModel]="semillaFiltro()" (ngModelChange)="semillaFiltro.set($event)">
              <option [ngValue]="null">Todos</option>
              @for (s of semillasPendientes(); track s.id) {
                <option [ngValue]="s.id">{{ s.nombre }}</option>
              }
            </select>
          </label>
          <label>Lote
            <select [ngModel]="loteFiltro()" (ngModelChange)="loteFiltro.set($event)">
              <option [ngValue]="null">Todos</option>
              @for (l of lotesPendientes(); track l) { <option [ngValue]="l">{{ l }}</option> }
            </select>
          </label>
          <label>Siembra desde<input type="date" [ngModel]="desdeFiltro()"
                 (ngModelChange)="desdeFiltro.set($event || null)" /></label>
          <label>Siembra hasta<input type="date" [ngModel]="hastaFiltro()"
                 (ngModelChange)="hastaFiltro.set($event || null)" /></label>
          <button (click)="limpiar()">Limpiar</button>
          <span class="small">{{ filtradas().length }} de {{ pendientes().length }} ·
            {{ num(totalPlantas(), 0) }} plantas por registrar</span>
          @if (rangoInvertido()) {
            <span class="small" style="color:var(--ochre)">
              La fecha «desde» es posterior a la «hasta», por eso no sale nada.
            </span>
          }
        </div>

        @if (!filtradas().length) {
          <p class="vacio">Ninguna siembra coincide con el filtro.</p>
        }

        <div class="lista-ordenes">
          @for (o of filtradas(); track o.codigosistema) {
            <a class="orden-fila" [routerLink]="['/orden', o.codigosistema]">
              <span class="izq">
                <span class="n">{{ nombre(o) }}</span>
                <span class="d">
                  {{ o.fechasiembra }} ·
                  lote {{ o.lote ?? '—' }} · cama {{ o.cama ?? '—' }}
                  @if (o.factura) { · {{ o.factura }} }
                </span>
              </span>
              <span class="der">
                <span class="mono cifra">{{ referencia(o) }}</span>
                <span class="u">plantas</span>
              </span>
            </a>
          }
        </div>
      }
    }

    <!-- ==================================================== la orden -->
    @if (codigo() && orden(); as o) {
      <div class="cabecera">
        <div class="fila">
          <div>
            <div class="eyebrow">
              Orden {{ o.codigosistema }} · lote {{ loteMostrado() }} · cama {{ camaMostrada() }}
            </div>
            <h1>Orden de siembra</h1>
          </div>
          <a class="boton" routerLink="/orden">Volver a la lista</a>
        </div>
      </div>

      @if (resultado(); as r) {
        <!-- ------------------------------------------- ya registrada -->
        <div class="aviso ok" role="status" style="margin-bottom:18px">
          <span>
            <strong>Registro guardado.</strong>
            Quedaron programadas {{ r.generadas.actividades }} labores y
            {{ r.generadas.costosInsumos }} líneas de costo para este cultivo.
          </span>
        </div>

        @if (generadas().length) {
          <div class="tarjeta" style="margin-bottom:18px">
            <h2>Lo que queda programado</h2>
            <p class="small">Calculado sobre las {{ r.cultivo.numeroPlantasSembradas }} plantas que sembraste.</p>
            <div class="tabla-caja">
              <table>
                <thead>
                  <tr>
                    <th class="num">Semana</th><th>Actividad</th><th>Detalle</th>
                    <th class="num">Cantidad</th><th>Unidad</th><th class="num">Coste</th>
                  </tr>
                </thead>
                <tbody>
                  @for (a of generadas(); track a.id) {
                    <tr>
                      <td class="num">{{ a.semanaAbono }}</td>
                      <td>{{ a.Actividad }}</td>
                      <td>{{ a.detalle ?? '—' }}</td>
                      <td class="num">{{ redondear(a.total) }}</td>
                      <td>{{ a.unidad ?? '—' }}</td>
                      <td class="num">{{ redondear(a.GTotal) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }

        <div class="barra">
          <a class="boton primario" routerLink="/orden">Registrar la siguiente cama</a>
          <a class="boton" [routerLink]="['/actividades']">Ver actividades y costos</a>
        </div>
      } @else {
        <!-- ---------------------------------------------- el cultivo -->
        <section class="tarjeta cerrada" style="margin-bottom:16px">
          <div class="cab">
            <h2>{{ nombre(o) }}</h2>
            <span class="etiqueta no">Lo fija el sistema</span>
          </div>
          <div class="datos">
            <div><span class="k">Fecha de siembra</span><span class="v">{{ o.fechasiembra }}</span></div>
            <div><span class="k">Ciclo</span><span class="v">{{ o.ciclo ?? '—' }} días</span></div>
            <div>
              <span class="k">Planificado</span>
              <span class="v">
                @if (o.numeroPlantasPlanificadas != null) {
                  <span class="mono">{{ o.numeroPlantasPlanificadas }}</span> plantas
                } @else { — }
              </span>
            </div>
            <div><span class="k">Área sembrada</span><span class="v"><span class="mono">{{ num(area()) }}</span> m²</span></div>
          </div>
          @if (o.numeroPlantasPlanificadas == null) {
            <p class="small">
              Esta siembra se programó antes de que existiera la cantidad planificada,
              así que no hay con qué comparar. Se toma como referencia lo que tenía anotado.
            </p>
          }
        </section>

        <!-- ------------------------------------------ los cuatro datos -->
        <section class="tarjeta tuyo">
          <div class="cab">
            <h2>Lo que registras tú</h2>
            <span class="etiqueta si">4 datos</span>
          </div>

          <div class="par">
            <label class="campo">
              <span class="et">Lote</span>
              <input [ngModel]="lote()" (ngModelChange)="lote.set($event || null)"
                     maxlength="20" list="lotes-conocidos" placeholder="p. ej. 4 o A1" />
              <datalist id="lotes-conocidos">
                @for (l of lotesConocidos(); track l) { <option [value]="l"></option> }
              </datalist>
            </label>
            <label class="campo">
              <span class="et">Cama</span>
              <input [ngModel]="cama()" (ngModelChange)="cama.set($event || null)"
                     maxlength="20" list="camas-conocidas" placeholder="p. ej. 4 o B2" />
              <datalist id="camas-conocidas">
                @for (c of camasConocidas(); track c) { <option [value]="c"></option> }
              </datalist>
            </label>
          </div>

          <div class="estrella">
            <span class="et">Cantidad real sembrada</span>
            <div class="paso">
              <button type="button" (click)="ajustar(-10)" aria-label="Restar diez plantas">−</button>
              <input type="number" min="0" [ngModel]="real()" (ngModelChange)="cambiarReal($event)"
                     inputmode="numeric" aria-label="Cantidad real sembrada, en plantas" />
              <button type="button" (click)="ajustar(10)" aria-label="Sumar diez plantas">+</button>
            </div>
            <p class="balance" [class.ok]="merma() === 0" [class.merma]="merma() > 0"
               [class.extra]="merma() < 0">
              <span>
                @if (merma() === 0) { Coincide con la referencia }
                @else if (merma() > 0) { Merma de {{ merma() }} plantas }
                @else { {{ -merma() }} plantas de más }
              </span>
              <span class="mono">{{ num(real() ?? 0, 0) }} / {{ num(referencia(o), 0) }}</span>
            </p>
          </div>

          @if (merma() > 0) {
            <label class="campo">
              <span class="et">Motivo de la merma de {{ merma() }} plantas · obligatorio</span>
              <textarea [ngModel]="motivo()" (ngModelChange)="motivo.set($event)" maxlength="255"
                rows="3"
                placeholder="Por qué faltaron plantas: plántulas dañadas, cepellón partido, bandeja incompleta…"></textarea>
              <span class="small">{{ (motivo() ?? '').length }} / 255</span>
            </label>
            <label class="campo">
              <span class="et">Plántulas dañadas</span>
              <input type="number" min="0" [ngModel]="danadas()"
                     (ngModelChange)="danadas.set($event === '' ? null : +$event)" inputmode="numeric" />
            </label>
          }
        </section>

        <!-- ------------------------------------------ vista previa por semana -->
        @if (semanasPrograma().length) {
          <!-- Sin la clase "cerrada" a proposito: parte de esta tarjeta SI se
               puede tocar, y el color de la etiqueta lo dice segun la semana
               que se este viendo. Marcarla como cerrada mentiria. -->
          <section class="tarjeta" style="margin-top:16px">
            <div class="cab">
              <h2>Programación de la temporada</h2>
              @if (esSemanaDeSiembra()) {
                <span class="etiqueta si">Puedes corregirla</span>
              } @else {
                <span class="etiqueta no">Vista previa</span>
              }
            </div>
            <p class="small">
              Así queda la temporada de {{ nombre(o) }} con {{ num(real() ?? 0, 0) }} plantas.
              La <b>semana {{ semanaSiembra() }}</b> es la de la siembra: sus cantidades y
              costos se pueden corregir y son los que se registran al guardar. El resto queda
              programado para registrarse cuando llegue su semana.
            </p>

            <div class="pestanas-semana" role="tablist" aria-label="Semanas de la temporada">
              @for (s of semanasPrograma(); track s) {
                <button type="button" role="tab" [attr.aria-selected]="s === semanaActiva()"
                        [class.activa]="s === semanaActiva()" (click)="semanaActiva.set(s)">
                  Semana {{ s }}
                </button>
              }
            </div>

            @if (esSemanaDeSiembra()) {
              <!-- la semana de la siembra: editable, y es la que se registra -->
              <div class="tabla-caja fija">
                <table>
                  <thead>
                    <tr>
                      <th>Actividad</th><th>Detalle</th><th class="num">Cantidad</th>
                      <th>Unidad</th><th class="num">Costo</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (fi of filasEditables(); track fi.actividad) {
                      <tr>
                        <td>{{ fi.actividad }}</td>
                        <td>{{ fi.detalle }}</td>
                        <td class="num">
                          <input type="number" min="0" step="0.01" class="celda"
                                 [ngModel]="fi.cantidad"
                                 (ngModelChange)="corregir(fi.actividad, 'cantidad', $event)"
                                 [attr.aria-label]="'Cantidad de ' + fi.actividad" />
                        </td>
                        <td>{{ fi.unidad }}</td>
                        <td class="num">
                          <input type="number" min="0" step="1" class="celda"
                                 [ngModel]="fi.costoTotal"
                                 (ngModelChange)="corregir(fi.actividad, 'costoTotal', $event)"
                                 [attr.aria-label]="'Costo de ' + fi.actividad" />
                        </td>
                      </tr>
                    }

                    <!-- novedades que el operario anade en campo: todo abierto -->
                    @for (ad of adicionalesActivas(); track $index) {
                      <tr class="adicional">
                        <td>
                          <input class="celda txt" [ngModel]="ad.actividad"
                                 (ngModelChange)="cambiarAdicional(semanaActiva()!, $index, 'actividad', $event)"
                                 maxlength="50" placeholder="Actividad" list="tipos-actividad"
                                 aria-label="Actividad de la novedad" />
                        </td>
                        <td>
                          <input class="celda txt" [ngModel]="ad.detalle"
                                 (ngModelChange)="cambiarAdicional(semanaActiva()!, $index, 'detalle', $event)"
                                 maxlength="50" placeholder="Detalle" list="nombres-producto"
                                 aria-label="Detalle de la novedad" />
                        </td>
                        <td class="num">
                          <input type="number" min="0" step="0.01" class="celda"
                                 [ngModel]="ad.cantidad"
                                 (ngModelChange)="cambiarAdicional(semanaActiva()!, $index, 'cantidad', $event)"
                                 aria-label="Cantidad de la novedad" />
                        </td>
                        <td>
                          <input class="celda txt corta" [ngModel]="ad.unidad"
                                 (ngModelChange)="cambiarAdicional(semanaActiva()!, $index, 'unidad', $event)"
                                 maxlength="20" placeholder="Kg" list="unidades"
                                 aria-label="Unidad de la novedad" />
                        </td>
                        <td class="num">
                          <div class="con-quitar">
                            <input type="number" min="0" step="1" class="celda"
                                   [ngModel]="ad.costoTotal"
                                   (ngModelChange)="cambiarAdicional(semanaActiva()!, $index, 'costoTotal', $event)"
                                   aria-label="Costo de la novedad" />
                            <button type="button" class="menudo peligro"
                                    (click)="quitarActividad(semanaActiva()!, $index)"
                                    aria-label="Quitar esta novedad">×</button>
                          </div>
                        </td>
                      </tr>
                    }
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Semana {{ semanaActiva() }}</td>
                      <td></td>
                      <td class="num peso">{{ num(pesoSemanaActiva(), 1) }} kg</td>
                      <td></td>
                      <td class="num costo">{{ num(costoSemanaActiva(), 0) }}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <datalist id="tipos-actividad">
                @for (t of tiposActividad; track t) { <option [value]="t"></option> }
              </datalist>
              <datalist id="nombres-producto">
                @for (p of productos(); track p.id) { <option [value]="p.nombreProducto"></option> }
              </datalist>
              <datalist id="unidades">
                @for (u of unidadesConocidas(); track u) { <option [value]="u"></option> }
              </datalist>

              <button type="button" class="anadir" (click)="agregarActividad(semanaActiva()!)">
                + Agregar actividad adicional
              </button>
              <p class="small">
                Para novedades imprevistas: una preparación extra por suelo húmedo, un
                Basilus por hallazgo de plaga. Se guardan como labor y además abren su
                línea de costo.
              </p>

              @if (hayAjustes()) {
                <p class="nota-ajuste">
                  <span>Estás usando valores escritos a mano.</span>
                  <button type="button" class="menudo" (click)="ajustes.set({})">
                    Volver a lo calculado
                  </button>
                </p>
              }
            } @else {
              <!-- las demas semanas: previsualizacion de solo lectura -->
              <div class="tabla-caja fija">
                <table>
                  <thead>
                    <tr>
                      <th>Actividad</th><th>Detalle</th><th class="num">Cantidad</th>
                      <th>Unidad</th><th class="num">Costo</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (fi of filasSemanaActiva(); track fi.actividad + fi.detalle) {
                      <tr>
                        <td>{{ fi.actividad }}</td>
                        <td>{{ fi.detalle }}</td>
                        <td class="num">{{ num(fi.cantidad) }}</td>
                        <td>{{ fi.unidad }}</td>
                        <td class="num">{{ num(fi.costoTotal, 0) }}</td>
                      </tr>
                    }
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Semana {{ semanaActiva() }}</td>
                      <td></td>
                      <td class="num peso">{{ num(pesoSemanaActiva(), 1) }} kg</td>
                      <td></td>
                      <td class="num costo">{{ num(costoSemanaActiva(), 0) }}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p class="small">
                Solo se registra la semana de la siembra ({{ semanaSiembra() }}). Ésta queda
                programada, para registrarla cuando llegue.
              </p>
            }
          </section>
        }

        <p class="small" style="margin-top:16px">
          Al guardar queda programada la temporada completa de este cultivo —abonos,
          deshierbes y protección, con sus costos—, calculada sobre las plantas que
          de verdad sembraste.
        </p>

        @if (error(); as e) { <p class="aviso error" style="margin-top:14px">{{ e }}</p> }

        <div class="acciones-orden">
          <button class="primario" (click)="guardar()" [disabled]="guardando() || !puedeGuardar()">
            {{ guardando() ? 'Guardando…' : 'Guardar Registro de Actividad' }}
          </button>
          @if (!puedeGuardar() && !guardando()) {
            <span class="impedimento">{{ impedimento() }}</span>
          }
        </div>
      }
    }
  `,
  styles: `
    .lista-ordenes { display: flex; flex-direction: column; gap: 8px; }
    .orden-fila {
      display: flex; align-items: center; justify-content: space-between; gap: 14px;
      padding: 14px 16px; min-height: 64px;
      background: var(--surface); border: 1px solid var(--rule); border-radius: var(--r);
      text-decoration: none; color: var(--ink);
    }
    .orden-fila:hover { background: var(--surface-2); border-color: var(--rule-strong); }
    .orden-fila .izq { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
    .orden-fila .izq .n { font-weight: 600; }
    .orden-fila .izq .d, .orden-fila .der .u { font-size: .8rem; color: var(--ink-3); }
    .orden-fila .der { display: flex; flex-direction: column; align-items: flex-end; line-height: 1.1; }
    .orden-fila .der .cifra { font-size: 1.1rem; font-weight: 600; }

    .tarjeta .cab {
      display: flex; align-items: center; justify-content: space-between;
      gap: 10px; flex-wrap: wrap;
    }
    .tarjeta.tuyo { border: 2px solid var(--moss); }

    .datos {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 1px; background: var(--rule); border: 1px solid var(--rule);
      border-radius: var(--r); overflow: hidden;
    }
    .datos > div { background: var(--surface-2); padding: 10px 13px; display: flex; flex-direction: column; }
    .datos .v { font-size: .95rem; font-weight: 600; }

    .par { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
    .campo { display: flex; flex-direction: column; gap: 5px; }
    .datos .k, .campo .et {
      font-family: var(--f-mono); font-size: .64rem; font-weight: 500;
      letter-spacing: .1em; text-transform: uppercase; color: var(--ink-2);
    }
    .campo input, .campo textarea { min-height: 48px; font-size: 1rem; }
    .campo textarea { min-height: 84px; }

    .estrella { display: flex; flex-direction: column; gap: 9px; }
    .paso { display: flex; gap: 9px; }
    .paso button {
      flex: none; width: 58px; min-height: 68px; font-size: 1.5rem; padding: 0;
      border: 1px solid var(--rule-strong); color: var(--moss);
    }
    .paso button:hover { background: var(--moss-soft); }
    .paso input {
      flex: 1; min-width: 0; min-height: 68px; text-align: center;
      font-family: var(--f-mono); font-variant-numeric: tabular-nums;
      font-size: 1.9rem; font-weight: 600; padding: 0 6px;
    }

    .balance {
      display: flex; align-items: center; justify-content: space-between; gap: 10px;
      padding: 10px 13px; border-radius: var(--r); font-size: .87rem; font-weight: 500;
    }
    .balance.ok    { background: var(--moss-soft);  color: var(--moss); }
    .balance.merma { background: var(--ochre-soft); color: var(--ochre); }
    .balance.extra { background: var(--accent-soft); color: var(--accent); }


    .acciones-orden {
      display: flex; flex-direction: column; align-items: stretch; gap: 8px;
      margin-top: 18px;
    }
    .acciones-orden button { min-height: 56px; font-size: 1rem; }
    .impedimento { font-size: .82rem; color: var(--oxide); text-align: center; }

    .pestanas-semana {
      display: flex; gap: 6px; flex-wrap: wrap; overflow-x: auto;
      padding-bottom: 2px; margin: 2px 0 4px;
    }
    .pestanas-semana button {
      flex: none; min-height: 38px; padding: 0 14px; font-size: .84rem;
      font-weight: 500; border-radius: 999px; border: 1px solid var(--rule-strong);
      background: var(--surface); color: var(--ink-2);
    }
    .pestanas-semana button:hover { background: var(--surface-2); }
    tr.adicional td, .tabla-caja.fija tr.adicional td:first-child {
      background: var(--ochre-soft);
    }
    .con-quitar { display: flex; align-items: center; gap: 5px; }
    .con-quitar .celda { flex: 1; }
    .anadir {
      align-self: flex-start; min-height: 44px; font-size: .86rem;
      border-style: dashed; border-color: var(--rule-strong); color: var(--ink-2);
    }
    .anadir:hover { border-color: var(--moss); color: var(--moss); background: var(--moss-soft); }
    .nota-ajuste {
      display: flex; align-items: center; justify-content: space-between; gap: 10px;
      flex-wrap: wrap; margin-top: 10px; padding: 9px 12px; border-radius: var(--r);
      background: var(--ochre-soft); color: var(--ochre); font-size: .82rem; font-weight: 500;
    }
    .acciones-orden button.primario, .pestanas-semana button.activa {
      background: var(--moss); border-color: var(--moss); color: #fff; font-weight: 600;
    }

    @media (max-width: 620px) {
      .paso button { width: 52px; }
      .paso input { font-size: 1.6rem; }
    }
  `,
})
export class OrdenSiembra implements OnInit {
  private api = inject(Api);
  private ruta = inject(ActivatedRoute);

  codigo = signal<number | null>(null);
  orden = signal<Orden | null>(null);
  pendientes = signal<Orden[]>([]);
  cultivos = signal<Cultivo[]>([]);
  generadas = signal<CostoActividad[]>([]);
  productos = signal<Producto[]>([]);
  semanaActiva = signal<number | null>(null);
  /**
   * Solo lo que el operario escribio a mano, por nombre de actividad. Se
   * guarda aparte del programa calculado para que cambiar la cantidad
   * sembrada no borre las correcciones, y para poder volver a lo calculado
   * vaciando este mapa.
   */
  ajustes = signal<Record<string, { cantidad?: number; costoTotal?: number }>>({});

  /**
   * Novedades que el operario anade en campo, por semana. Van aparte de las
   * de la ficha porque no se calculan: son texto libre de principio a fin.
   */
  adicionales = signal<Record<number, FilaSemana[]>>({});

  // filtros de la lista, los mismos que en Actividades y costos
  semillaFiltro = signal<number | null>(null);
  loteFiltro = signal<string | null>(null);
  desdeFiltro = signal<string | null>(null);
  hastaFiltro = signal<string | null>(null);

  cargando = signal(false);
  guardando = signal(false);
  error = signal<string | null>(null);
  resultado = signal<{
    cultivo: Cultivo; merma: number;
    generadas: { actividades: number; costosInsumos: number };
  } | null>(null);

  // los cuatro datos del operario
  lote = signal<string | null>(null);
  cama = signal<string | null>(null);
  real = signal<number | null>(null);
  motivo = signal<string | null>(null);
  danadas = signal<number | null>(null);

  /**
   * Contra que se compara lo sembrado. Lo normal es la cantidad planificada,
   * pero las siembras anteriores a esta pantalla no la tienen: entonces se
   * usa lo que llevaban anotado, que es lo unico que se sabe.
   */
  referencia = (o: Orden) => o.numeroPlantasPlanificadas ?? o.numeroPlantasSembradas ?? 0;

  /** Solo las semillas que de verdad estan pendientes: la lista no ofrece vacio. */
  semillasPendientes = computed(() => {
    const vistas = new Map<number, string>();
    for (const o of this.pendientes()) vistas.set(o.codSemilla, this.nombre(o));
    return [...vistas].map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  });

  lotesPendientes = computed(() =>
    [...new Set(this.pendientes().map((o) => o.lote).filter((x): x is string => !!x))]
      .sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
  );

  /**
   * El rango va sobre fechasiembra. Las fechas son ISO 'YYYY-MM-DD', asi que
   * compararlas como texto ya ordena bien y no hace falta construir un Date
   * por fila en cada repintado.
   */
  filtradas = computed(() => {
    const sem = this.semillaFiltro(), lote = this.loteFiltro();
    const desde = this.desdeFiltro(), hasta = this.hastaFiltro();
    return this.pendientes().filter((o) =>
      (sem == null || o.codSemilla === sem) &&
      (lote == null || o.lote === lote) &&
      (!desde || o.fechasiembra >= desde) &&
      (!hasta || o.fechasiembra <= hasta)
    );
  });

  /** Un rango al reves da cero filas sin motivo visible; conviene decirlo. */
  rangoInvertido = computed(() => {
    const d = this.desdeFiltro(), h = this.hastaFiltro();
    return Boolean(d && h && d > h);
  });

  totalPlantas = computed(() =>
    this.filtradas().reduce((a, o) => a + this.referencia(o), 0)
  );

  merma = computed(() => {
    const o = this.orden();
    if (!o) return 0;
    return this.referencia(o) - (this.real() ?? 0);
  });

  area = computed(() => {
    const o = this.orden();
    if (!o?.marcoSiembra) return o?.areaCultivada ?? 0;
    return +(((this.real() ?? 0) * o.marcoSiembra)).toFixed(2);
  });

  loteMostrado = computed(() => this.lote() || '—');
  camaMostrada = computed(() => this.cama() || '—');

  lotesConocidos = computed(() =>
    [...new Set(this.cultivos().map((c) => c.lote).filter((x): x is string => !!x))].sort()
  );
  camasConocidas = computed(() =>
    [...new Set(this.cultivos().map((c) => c.cama).filter((x): x is string => !!x))].sort()
  );


  /**
   * La temporada completa prevista, recalculada cada vez que cambia la
   * cantidad real sembrada. Es una funcion pura sobre datos ya cargados
   * (orden + catalogo de productos): no pide nada al backend.
   */
  programa = computed<FilaPrograma[]>(() => {
    const o = this.orden();
    if (!o) return [];
    return calcularPrograma(o, this.real() ?? 0, this.productos());
  });

  // en orden de aparicion, que ya viene cronologico: ordenar por el numero
  // rompe cuando la temporada cruza el ano (de la semana 53 a la 2)
  semanasPrograma = computed(() => [...new Set(this.programa().map((f) => f.semana))]);

  /** La semana de la siembra, la unica que el operario registra hoy. */
  semanaSiembra = computed(() => {
    const o = this.orden();
    return o ? semanaAccess(o.fechasiembra) : null;
  });

  esSemanaDeSiembra = computed(() => this.semanaActiva() === this.semanaSiembra());

  /**
   * Las filas de la semana de siembra con las correcciones aplicadas encima.
   * El costo sigue a la cantidad salvo que tambien se haya escrito a mano.
   */
  filasEditables = computed(() => {
    const aj = this.ajustes();
    return this.programa()
      .filter((f) => f.semana === this.semanaSiembra())
      .map((f) => {
        const a = aj[f.actividad] ?? {};
        const cantidad = a.cantidad ?? f.cantidad;
        return {
          ...f,
          cantidad,
          costoTotal: a.costoTotal ?? +(cantidad * f.costoUnitario).toFixed(0),
        };
      });
  });

  hayAjustes = computed(() => Object.keys(this.ajustes()).length > 0);

  /** Los mismos nombres que usan las consultas de accion, como sugerencia. */
  readonly tiposActividad = [
    'PreparacionTerreno', 'Siembra', 'AbonoSiembra', 'CalDolomita', 'AbonoSolido',
    'AbonoLiquido', 'ProteccionVegetal', 'Deshierbe', 'otros',
  ];

  unidadesConocidas = computed(() =>
    [...new Set(this.productos().map((p) => p.unidad).filter((u): u is string => !!u))].sort());

  /** Las adicionales de la semana que se esta viendo. */
  adicionalesActivas = computed(() => {
    const s = this.semanaActiva();
    return s == null ? [] : (this.adicionales()[s] ?? []);
  });

  /**
   * Lo que de verdad se guarda de la semana de siembra: las de la ficha con
   * sus correcciones, mas las novedades anadidas a mano.
   */
  filasParaGuardar = computed<FilaSemana[]>(() => [
    ...this.filasEditables().map((f) => ({
      actividad: f.actividad, detalle: f.detalle, unidad: f.unidad,
      cantidad: f.cantidad, costoTotal: f.costoTotal,
      costoUnitario: f.costoUnitario, esAdicional: false,
    })),
    ...(this.adicionales()[this.semanaSiembra() ?? -1] ?? []),
  ]);

  filasSemanaActiva = computed(() => {
    const s = this.semanaActiva();
    return s == null ? [] : this.programa().filter((f) => f.semana === s);
  });

  /**
   * El pie sigue a la tabla que se esta viendo: la editable o la de lectura,
   * y en las dos suma tambien las novedades anadidas a esa semana.
   */
  private filasDelPie = computed<{ unidad: string; cantidad: number; costoTotal: number }[]>(() => [
    ...(this.esSemanaDeSiembra() ? this.filasEditables() : this.filasSemanaActiva())
      .map((f) => ({ unidad: f.unidad, cantidad: f.cantidad, costoTotal: f.costoTotal })),
    ...this.adicionalesActivas()
      .map((f) => ({ unidad: f.unidad, cantidad: f.cantidad ?? 0, costoTotal: f.costoTotal ?? 0 })),
  ]);

  // solo Kg y Litro se cargan al hombro; los minutos de mano de obra no pesan
  pesoSemanaActiva = computed(() =>
    this.filasDelPie().filter((f) => pesa(f.unidad)).reduce((a, f) => a + f.cantidad, 0));

  costoSemanaActiva = computed(() =>
    this.filasDelPie().reduce((a, f) => a + f.costoTotal, 0));

  puedeGuardar = computed(() => {
    if (this.real() == null || (this.real() ?? -1) < 0) return false;
    if (this.merma() > 0 && (this.motivo() ?? '').trim().length < 5) return false;
    return true;
  });

  impedimento = computed(() => {
    if (this.real() == null) return 'Falta la cantidad real sembrada.';
    if (this.merma() > 0 && (this.motivo() ?? '').trim().length < 5) {
      return 'Falta el motivo de la merma.';
    }
    return '';
  });

  /** Numeros con coma decimal, como el resto de la aplicacion. */
  num = (v: number | null, decimales = 2) =>
    v == null ? '—' : v.toLocaleString('es-CO', { maximumFractionDigits: decimales });

  redondear = (v: number | null) =>
    v == null ? '—' : v.toLocaleString('es-CO', { maximumFractionDigits: 2 });

  nombre = (o: Orden) => [o.semilla, o.variedad].filter(Boolean).join(' ') || `Semilla ${o.codSemilla}`;

  async ngOnInit() {
    this.ruta.paramMap.subscribe(async (p) => {
      const c = p.get('codigo');
      this.codigo.set(c ? Number(c) : null);
      this.resultado.set(null);
      this.error.set(null);
      await this.cargar();
    });
  }

  private async cargar() {
    this.cargando.set(true);
    try {
      const c = this.codigo();
      if (c == null) {
        this.pendientes.set(await this.api.ordenesPendientes());
        return;
      }
      const [o, cultivos, productos] = await Promise.all([
        this.api.orden(c),
        this.api.listar<Cultivo>('programacionCultivos', 2000),
        this.api.listar<Producto>('productos', 200),
      ]);
      this.orden.set(o);
      this.cultivos.set(cultivos);
      this.productos.set(productos);
      // los cuatro campos arrancan con lo que ya tenia la programacion
      this.lote.set(o.lote);
      this.cama.set(o.cama);
      this.real.set(this.referencia(o));
      this.motivo.set(null);
      this.danadas.set(null);
      this.ajustes.set({});
      this.adicionales.set({});
      this.semanaActiva.set(semanaAccess(o.fechasiembra));
    } finally {
      this.cargando.set(false);
    }
  }

  limpiar() {
    this.semillaFiltro.set(null);
    this.loteFiltro.set(null);
    this.desdeFiltro.set(null);
    this.hastaFiltro.set(null);
  }

  /** Guarda una correccion del operario sobre una fila de la semana de siembra. */
  corregir(actividad: string, campo: 'cantidad' | 'costoTotal', valor: any) {
    const n = valor === '' || valor == null ? null : Math.max(0, Number(valor));
    this.ajustes.update((m) => {
      const copia = { ...m, [actividad]: { ...m[actividad] } };
      if (n == null) delete copia[actividad][campo];
      else copia[actividad][campo] = n;
      if (!Object.keys(copia[actividad]).length) delete copia[actividad];
      return copia;
    });
  }

  /** Inserta una fila vacia en la semana indicada, con todo abierto. */
  agregarActividad(semana: number) {
    this.adicionales.update((m) => ({
      ...m,
      [semana]: [...(m[semana] ?? []), {
        actividad: '', detalle: '', unidad: '',
        cantidad: null, costoTotal: null, costoUnitario: 0, esAdicional: true,
      }],
    }));
  }

  quitarActividad(semana: number, i: number) {
    this.adicionales.update((m) => ({
      ...m, [semana]: (m[semana] ?? []).filter((_, x) => x !== i),
    }));
  }

  /** Todos los campos de una novedad son libres, incluidos actividad y unidad. */
  cambiarAdicional(semana: number, i: number, campo: keyof FilaSemana, valor: any) {
    const numerico = campo === 'cantidad' || campo === 'costoTotal';
    const v = numerico
      ? (valor === '' || valor == null ? null : Math.max(0, Number(valor)))
      : String(valor ?? '');
    this.adicionales.update((m) => ({
      ...m,
      [semana]: (m[semana] ?? []).map((f, x) => (x === i ? { ...f, [campo]: v } : f)),
    }));
  }

  cambiarReal(valor: any) {
    this.real.set(valor === '' || valor == null ? null : Math.max(0, Number(valor)));
  }

  ajustar(delta: number) {
    this.real.set(Math.max(0, (this.real() ?? 0) + delta));
  }

  async guardar() {
    const c = this.codigo();
    if (c == null || !this.puedeGuardar()) return;
    this.guardando.set(true);
    this.error.set(null);
    try {
      // Solo viaja la semana de la siembra. actividades.total es una columna
      // GENERATED, asi que lo que se envia no es el total que se ve sino la
      // tasa por planta y el costo unitario, despejados de lo que escribio el
      // operario. Con cero plantas o cero cantidad no hay de donde despejar y
      // se manda 0, que es lo unico honesto.
      const plantas = this.real()!;
      const r = await this.api.registrarOrden(c, {
        lote: this.lote(),
        cama: this.cama(),
        numeroPlantasSembradas: plantas,
        plantulasDanadas: this.danadas(),
        motivoMerma: this.motivo(),
        semana: this.semanaSiembra(),
        // las de la ficha con sus correcciones, mas las novedades anadidas a
        // mano; las adicionales sin actividad escrita se descartan aqui, para
        // no mandar filas vacias que el backend tendria que rechazar
        actividades: this.filasParaGuardar()
          .filter((f) => f.actividad.trim())
          .map((f) => {
            const cantidad = f.cantidad ?? 0;
            return {
              Actividad: f.actividad.trim(),
              detalle: f.detalle,
              unidad: f.unidad,
              cantidadAbono: plantas > 0 ? cantidad / plantas : 0,
              costo: cantidad > 0 ? (f.costoTotal ?? 0) / cantidad : 0,
              esAdicional: f.esAdicional,
            };
          }),
      });
      this.resultado.set(r);
      // se traen las labores que acaban de quedar programadas, para verlas
      const todas = await this.api.vista<CostoActividad>('cCostosActividades');
      this.generadas.set(
        todas.filter((a) => a.codigoSistema === c)
          .sort((a, b) => a.semanaAbono - b.semanaAbono)
      );
    } catch (e: any) {
      this.error.set(e?.error?.error ?? 'No se pudo guardar el registro.');
    } finally {
      this.guardando.set(false);
    }
  }
}
