import { Component, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { Api } from './nucleo/api';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="app">
      <aside class="lateral">
        <div class="marca">
          <span class="eyebrow">Finca</span>
          <span class="n">Diario de campo</span>
        </div>

        <nav class="nav">
          <a routerLink="/inicio" routerLinkActive="activo">Inicio</a>

          <div class="nav-grupo eyebrow">Produccion</div>
          <a routerLink="/siembras" routerLinkActive="activo">Siembras y cosechas</a>
          <a routerLink="/actividades" routerLinkActive="activo">Actividades y costos</a>
          <a routerLink="/semillas" routerLinkActive="activo">Semillas</a>

          <div class="nav-grupo eyebrow">Almacen</div>
          <a routerLink="/almacen" routerLinkActive="activo">Movimientos</a>
          <a routerLink="/productos" routerLinkActive="activo">Productos</a>

          <div class="nav-grupo eyebrow">Comercial</div>
          <a routerLink="/clientes" routerLinkActive="activo">Clientes</a>
          <a routerLink="/pedidos" routerLinkActive="activo">Pedidos</a>

          <div class="nav-grupo eyebrow">Gestion</div>
          <a routerLink="/empleados" routerLinkActive="activo">Empleados</a>
          <a routerLink="/informes" routerLinkActive="activo">Informes</a>
          <a routerLink="/cuarentena" routerLinkActive="activo">Cuarentena</a>
        </nav>
      </aside>

      <main class="principal">
        @if (api.cargando() > 0) { <div class="cargando" role="status" aria-label="Cargando"></div> }
        @if (api.error(); as e) {
          <p class="aviso error" role="alert" style="margin-bottom:18px">
            {{ e }}
            <button class="menudo" (click)="api.error.set(null)">Cerrar</button>
          </p>
        }
        <router-outlet />
      </main>
    </div>
  `,
})
export class App {
  api = inject(Api);
}
