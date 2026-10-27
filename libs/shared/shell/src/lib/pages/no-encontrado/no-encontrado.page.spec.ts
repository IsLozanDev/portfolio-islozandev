import { MENSAJES_SHELL } from '../../models/mensajes-shell';
import { PaginaDePrueba } from '../../../testing/pagina-de-prueba';
import { NoEncontradoPage } from './no-encontrado.page';

describe('NoEncontradoPage', () => {
  it('muestra el aviso y lleva al inicio', async () => {
    const pagina = new PaginaDePrueba('no-existe', NoEncontradoPage);
    await pagina.abrir('/no-existe');

    expect(pagina.textoDe('[role=alert]')).toBe(MENSAJES_SHELL.noEncontrado);

    await pagina.pulsar('Volver al inicio');

    expect(pagina.urlActual()).toBe('/');
  });
});
