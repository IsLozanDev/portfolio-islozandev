import { PaginaDePrueba } from '../../../testing/pagina-de-prueba';
import { MENSAJE_PROHIBIDO, ProhibidoPage } from './prohibido.page';

describe('ProhibidoPage', () => {
  it('muestra el aviso y lleva al inicio', async () => {
    const pagina = new PaginaDePrueba('403', ProhibidoPage);
    await pagina.abrir('/403');

    expect(pagina.textoDe('[role=alert]')).toBe(MENSAJE_PROHIBIDO);

    await pagina.pulsar('Ir al inicio');

    expect(pagina.urlActual()).toBe('/');
  });
});
