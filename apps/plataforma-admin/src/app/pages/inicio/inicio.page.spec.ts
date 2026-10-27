import { PaginaDePrueba } from '../../../testing/pagina-de-prueba';
import { InicioPage } from './inicio.page';

describe('InicioPage', () => {
  it('muestra el correo y la sucursal actual', async () => {
    const pagina = new PaginaDePrueba('', InicioPage);
    await pagina.abrir('/');

    expect(pagina.texto()).toContain('carmen@correo.pe');
    expect(pagina.texto()).toContain('Sucursal: Miraflores');
  });
});
