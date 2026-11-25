import { readFile } from 'node:fs/promises';
import { PERMISOS_PER } from '../src/domain/permisos-per.js';

const RUTA_MANIFIESTO = new URL('../../seguridad/manifiesto/plat.manifiesto.json', import.meta.url);

describe('Manifiesto PLAT 1.28.0: parte de per (specs 31, 32, 37, 38 y 39)', () => {
  interface Manifiesto {
    version: string;
    permisos: { codigo: string; descripcion: string; alcance_minimo: string; sensible: boolean }[];
    opciones: { codigo: string; padre: string | null; ruta?: string; permisos: string[] }[];
    roles_predefinidos: { codigo: string; permisos: string[] }[];
  }
  let manifiesto: Manifiesto;
  const esDePersonas = (codigo: string) => codigo.startsWith('plat.persona.');

  beforeAll(async () => {
    manifiesto = JSON.parse(await readFile(RUTA_MANIFIESTO, 'utf8'));
  });

  it('está en la versión 1.28.0 y declara los siete permisos con alcance TENANT; solo fusionar es sensible', () => {
    expect(manifiesto.version).toBe('1.29.0');
    const dePersonas = manifiesto.permisos.filter((permiso) => esDePersonas(permiso.codigo));
    expect(dePersonas.map((permiso) => [permiso.codigo, permiso.alcance_minimo, permiso.sensible])).toEqual([
      [PERMISOS_PER.leer, 'TENANT', false],
      [PERMISOS_PER.registrar, 'TENANT', false],
      [PERMISOS_PER.rol, 'TENANT', false],
      [PERMISOS_PER.editar, 'TENANT', false],
      [PERMISOS_PER.consentimiento, 'TENANT', false],
      [PERMISOS_PER.textoFinalidad, 'TENANT', false],
      [PERMISOS_PER.fusionar, 'TENANT', true],
    ]);
    expect(dePersonas[0].descripcion).toBe('Buscar y ver personas del tenant');
    expect(dePersonas[3].descripcion).toBe('Editar datos básicos, contactos y direcciones de una persona');
    expect(dePersonas[4].descripcion).toBe('Registrar y revocar consentimientos de una persona');
    expect(dePersonas[5].descripcion).toBe('Publicar textos de consentimiento por finalidad');
    expect(dePersonas[6].descripcion).toBe('Descartar duplicados y fusionar personas del tenant');
  });

  it('ningún rol predefinido los incluye: cada producto o tenant los suma a sus roles', () => {
    expect(manifiesto.roles_predefinidos.flatMap((rol) => rol.permisos).filter(esDePersonas)).toEqual([]);
  });

  it('spec 38: la opción «Personas» de Organización lleva a /admin/personas con plat.persona.leer, y es la única de personas', () => {
    const conPersonas = manifiesto.opciones.filter((opcion) => opcion.permisos.some(esDePersonas));
    expect(conPersonas).toEqual([
      expect.objectContaining({ codigo: 'plat.organizacion.personas', padre: 'plat.organizacion', ruta: '/admin/personas', permisos: [PERMISOS_PER.leer] }),
    ]);
  });
});
