import { Component } from '@angular/core';
import { autenticadoGuard, sesionGuard } from '@vitrina/shared/auth';
import { LayoutComponent } from './components/layout/layout.component';
import { CLAVE_NOMBRE_APP } from './models/datos-ruta-shell';
import { NoEncontradoPage } from './pages/no-encontrado/no-encontrado.page';
import { ProhibidoPage } from './pages/prohibido/prohibido.page';
import { SeleccionarSucursalPage } from './pages/seleccionar-sucursal/seleccionar-sucursal.page';
import { SinAccesosPage } from './pages/sin-accesos/sin-accesos.page';
import { rutasDelShell } from './shell.routes';

@Component({ template: '' })
class Hija {}

describe('rutasDelShell', () => {
  const [seleccionar, sinAccesos, layout] = rutasDelShell([{ path: 'usuarios', component: Hija }]);

  it('selección de sucursal y sin accesos van fuera del layout con sesionGuard', () => {
    expect(seleccionar).toMatchObject({ path: 'seleccionar-sucursal', canActivate: [sesionGuard] });
    expect(sinAccesos).toMatchObject({ path: 'sin-accesos', canActivate: [sesionGuard] });
  });

  it('el layout exige contexto y pone las hijas antes de 403 y del comodín 404', () => {
    expect(layout).toMatchObject({ path: '', canActivate: [autenticadoGuard], data: { [CLAVE_NOMBRE_APP]: 'Plataforma' } });
    expect(layout.children?.map((ruta) => ruta.path)).toEqual(['usuarios', '403', '**']);
  });

  it('el nombre de la app viaja en data del layout', () => {
    const [, , layoutPropio] = rutasDelShell([], 'SazónPOS');
    expect(layoutPropio.data).toEqual({ [CLAVE_NOMBRE_APP]: 'SazónPOS' });
  });

  it('cada ruta lazy carga su componente', async () => {
    const rutasLazy = [seleccionar, sinAccesos, layout, ...(layout.children ?? []).filter((ruta) => ruta.loadComponent)];
    const componentes = await Promise.all(rutasLazy.map((ruta) => (ruta.loadComponent as () => Promise<unknown>)()));

    expect(componentes).toEqual([SeleccionarSucursalPage, SinAccesosPage, LayoutComponent, ProhibidoPage, NoEncontradoPage]);
  });
});
