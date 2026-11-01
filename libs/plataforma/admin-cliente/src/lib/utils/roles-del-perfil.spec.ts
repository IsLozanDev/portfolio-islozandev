import type { RolDisponible } from '../models/perfil';
import { rolesQueSiguenDisponibles } from './roles-del-perfil';

const disponible = (id: string): RolDisponible => ({ id, codigo: id, nombre: id, productoCodigo: 'LIB', productoNombre: 'Librería', predefinido: true });

describe('rolesQueSiguenDisponibles', () => {
  it('se queda con los roles del perfil que están en la lista de disponibles', () => {
    expect([...rolesQueSiguenDisponibles(['r1', 'r-inactivo', 'r2'], [disponible('r1'), disponible('r2'), disponible('r3')])]).toEqual(['r1', 'r2']);
  });

  it('sin disponibles no queda ninguno', () => {
    expect(rolesQueSiguenDisponibles(['r1'], []).size).toBe(0);
  });
});
