import { PaginaDePrueba } from '../../../testing/pagina-de-prueba';
import { SinAccesosPage } from './sin-accesos.page';

describe('SinAccesosPage', () => {
  let pagina: PaginaDePrueba;

  beforeEach(async () => {
    pagina = new PaginaDePrueba('sin-accesos', SinAccesosPage);
    await pagina.abrir('/sin-accesos');
  });

  it('TR-CA-046: muestra el mensaje del SRS', () => {
    expect(pagina.textoDe('[role=alert]')).toBe('No tiene accesos vigentes; contacte a su administrador');
  });

  it('«Salir» cierra la sesión y va a ingresar', async () => {
    await pagina.pulsar('Salir');

    expect(pagina.sesion.salir).toHaveBeenCalledTimes(1);
    expect(pagina.urlActual()).toBe('/auth/ingresar');
  });
});
