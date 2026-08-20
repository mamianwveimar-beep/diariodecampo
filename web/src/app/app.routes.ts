import { Routes } from '@angular/router';
import { Maestro } from './compartido/maestro';

/**
 * Las 14 pantallas de Access se consolidan en 11: los tres subformularios
 * (SubFrm_Siembra, SubFrm_Costos y detallePedido Subformulario) dejan de ser
 * objetos aparte y viven dentro de su pantalla contenedora.
 * Cuarentena es nueva: no tiene equivalente en Access.
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'inicio' },

  { path: 'inicio', title: 'Inicio · Diario de campo',
    loadComponent: () => import('./paginas/inicio').then((m) => m.Inicio) },

  { path: 'siembras', title: 'Siembras · Diario de campo',
    loadComponent: () => import('./paginas/siembras').then((m) => m.Siembras) },

  { path: 'siembras/nueva', title: 'Registrar siembra · Diario de campo',
    loadComponent: () => import('./paginas/siembra-lote').then((m) => m.SiembraLote) },

  { path: 'orden', title: 'Órdenes de siembra · Diario de campo',
    loadComponent: () => import('./paginas/orden-siembra').then((m) => m.OrdenSiembra) },

  { path: 'orden/:codigo', title: 'Orden de siembra · Diario de campo',
    loadComponent: () => import('./paginas/orden-siembra').then((m) => m.OrdenSiembra) },

  { path: 'actividades', title: 'Actividades y costos · Diario de campo',
    loadComponent: () => import('./paginas/actividades').then((m) => m.Actividades) },

  { path: 'pedidos', title: 'Pedidos · Diario de campo',
    loadComponent: () => import('./paginas/pedidos').then((m) => m.Pedidos) },

  { path: 'informes', title: 'Informes · Diario de campo',
    loadComponent: () => import('./paginas/informes').then((m) => m.Informes) },

  { path: 'cuarentena', title: 'Cuarentena · Diario de campo',
    loadComponent: () => import('./paginas/cuarentena').then((m) => m.Cuarentena) },

  // pantallas de mantenimiento, todas sobre el mismo componente
  { path: 'semillas',  title: 'Semillas · Diario de campo',  component: Maestro, data: { clave: 'semillas' } },
  { path: 'productos', title: 'Productos · Diario de campo', component: Maestro, data: { clave: 'productos' } },
  { path: 'clientes',  title: 'Clientes · Diario de campo',  component: Maestro, data: { clave: 'clientes' } },
  { path: 'empleados', title: 'Empleados · Diario de campo', component: Maestro, data: { clave: 'empleados' } },
  { path: 'almacen',   title: 'Almacen · Diario de campo',   component: Maestro, data: { clave: 'almacen' } },

  { path: '**', redirectTo: 'inicio' },
];
