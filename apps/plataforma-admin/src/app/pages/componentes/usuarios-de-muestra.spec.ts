import { filtrarYOrdenar, USUARIOS_DE_MUESTRA } from './usuarios-de-muestra';

describe('filtrarYOrdenar', () => {
  it('sin filtros ni orden devuelve los 37 usuarios en su orden', () => {
    expect(filtrarYOrdenar(USUARIOS_DE_MUESTRA, { busqueda: '', estado: null }, null)).toEqual(USUARIOS_DE_MUESTRA);
  });

  it('filtra por estado y por búsqueda en nombre o correo', () => {
    const suspendidos = filtrarYOrdenar(USUARIOS_DE_MUESTRA, { busqueda: '', estado: 'SUSPENDIDO' }, null);
    expect(suspendidos.every((usuario) => usuario.estado === 'SUSPENDIDO')).toBe(true);

    expect(filtrarYOrdenar(USUARIOS_DE_MUESTRA, { busqueda: 'usuario12@', estado: null }, null).map((usuario) => usuario.id)).toEqual(['usuario-12']);
    expect(filtrarYOrdenar(USUARIOS_DE_MUESTRA, { busqueda: ' ROSA ', estado: null }, null).length).toBeGreaterThan(0);
  });

  it('ordena por nombre en ambos sentidos', () => {
    const ascendente = filtrarYOrdenar(USUARIOS_DE_MUESTRA, { busqueda: '', estado: null }, { clave: 'nombre', direccion: 'asc' });
    const descendente = filtrarYOrdenar(USUARIOS_DE_MUESTRA, { busqueda: '', estado: null }, { clave: 'nombre', direccion: 'desc' });

    expect(ascendente[0].nombre.localeCompare(ascendente[1].nombre, 'es')).toBeLessThanOrEqual(0);
    expect(descendente.map((usuario) => usuario.nombre)).toEqual(ascendente.map((usuario) => usuario.nombre).reverse());
  });
});
