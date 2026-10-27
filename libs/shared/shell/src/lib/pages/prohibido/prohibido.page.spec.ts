import { MENSAJES_SHELL } from '../../models/mensajes-shell';
import { PaginaDePrueba } from '../../../testing/pagina-de-prueba';
import { ProhibidoPage } from './prohibido.page';

describe('ProhibidoPage', () => {
  it('muestra el aviso y lleva al inicio', async () => {
    const pagina = new PaginaDePrueba('403', ProhibidoPage);
    await pagina.abrir('/403');

    expect(pagina.textoDe('[role=alert]')).toBe(MENSAJES_SHELL.prohibido);

    await pagina.pulsar('Volver al inicio');

    expect(pagina.urlActual()).toBe('/');
  });
});
