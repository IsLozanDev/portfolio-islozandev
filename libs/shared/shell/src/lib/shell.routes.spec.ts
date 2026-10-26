import { Component } from '@angular/core';
import { autenticadoGuard, sesionGuard } from '@vitrina/shared/auth';
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
    expect(layout).toMatchObject({ path: '', canActivate: [autenticadoGuard] });
    expect(layout.children?.map((ruta) => ruta.path)).toEqual(['usuarios', '403', '**']);
  });
});
