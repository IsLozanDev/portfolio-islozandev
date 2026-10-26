import { PaginaDePrueba } from '../../../testing/pagina-de-prueba';
import { InicioPage } from './inicio.page';

describe('InicioPage', () => {
  let pagina: PaginaDePrueba;

  beforeEach(async () => {
    pagina = new PaginaDePrueba('', InicioPage);
    await pagina.abrir('/');
  });

  it('muestra el correo y la sucursal actual', () => {
    expect(pagina.texto()).toContain('carmen@correo.pe');
    expect(pagina.texto()).toContain('Sucursal: Miraflores');
  });

  it('con varias sucursales ofrece cambiarla', async () => {
    await pagina.pulsar('Cambiar sucursal');

    expect(pagina.urlActual()).toBe('/seleccionar-sucursal');
  });

  it('«Salir» cierra la sesión y va a ingresar', async () => {
    await pagina.pulsar('Salir');

    expect(pagina.sesion.salir).toHaveBeenCalledTimes(1);
    expect(pagina.urlActual()).toBe('/auth/ingresar');
  });
});
