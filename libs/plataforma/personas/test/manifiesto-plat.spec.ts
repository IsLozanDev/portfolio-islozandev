import { readFile } from 'node:fs/promises';
import { PERMISOS_PER } from '../src/domain/permisos-per.js';

const RUTA_MANIFIESTO = new URL('../../seguridad/manifiesto/plat.manifiesto.json', import.meta.url);

describe('Manifiesto PLAT 1.22.0: parte de per (specs 31 y 32)', () => {
  interface Manifiesto {
    version: string;
    permisos: { codigo: string; descripcion: string; alcance_minimo: string; sensible: boolean }[];
    opciones: { codigo: string; permisos: string[] }[];
    roles_predefinidos: { codigo: string; permisos: string[] }[];
  }
  let manifiesto: Manifiesto;
  const esDePersonas = (codigo: string) => codigo.startsWith('plat.persona.');

  beforeAll(async () => {
    manifiesto = JSON.parse(await readFile(RUTA_MANIFIESTO, 'utf8'));
  });

  it('está en la versión 1.22.0 y declara los cuatro permisos con alcance TENANT, no sensibles', () => {
    expect(manifiesto.version).toBe('1.22.0');
    const dePersonas = manifiesto.permisos.filter((permiso) => esDePersonas(permiso.codigo));
    expect(dePersonas.map((permiso) => [permiso.codigo, permiso.alcance_minimo, permiso.sensible])).toEqual([
      [PERMISOS_PER.leer, 'TENANT', false],
      [PERMISOS_PER.registrar, 'TENANT', false],
      [PERMISOS_PER.rol, 'TENANT', false],
      [PERMISOS_PER.editar, 'TENANT', false],
    ]);
    expect(dePersonas[0].descripcion).toBe('Buscar y ver personas del tenant');
    expect(dePersonas[3].descripcion).toBe('Editar datos básicos, contactos y direcciones de una persona');
  });

  it('ningún rol predefinido ni opción de menú los incluye: cada producto o tenant los suma a sus roles', () => {
    const enRoles = manifiesto.roles_predefinidos.flatMap((rol) => rol.permisos).filter(esDePersonas);
    const enMenu = manifiesto.opciones.flatMap((opcion) => opcion.permisos).filter(esDePersonas);

    expect([enRoles, enMenu]).toEqual([[], []]);
  });
});
