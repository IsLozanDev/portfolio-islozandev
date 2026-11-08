import { readFile } from 'node:fs/promises';
import { PERMISOS_CAT } from '../src/domain/permisos-cat.js';

// El manifiesto PLAT vive en seguridad (lo aplica su CLI); aquí se lee como archivo, no se importa.
const RUTA_MANIFIESTO = new URL('../../seguridad/manifiesto/plat.manifiesto.json', import.meta.url);

interface Manifiesto {
  version: string;
  permisos: { codigo: string; alcance_minimo: string; sensible: boolean }[];
  opciones: { codigo: string; permisos: string[] }[];
  roles_predefinidos: { codigo: string; permisos: string[] }[];
  parametros: { codigo: string; descripcion: string; tipo: string; valor_defecto: unknown; alcance_maximo: string }[];
}

describe('Manifiesto PLAT 1.11.0: parte de cat (specs 19a, 19b y 19c)', () => {
  let manifiesto: Manifiesto;
  const permisosDe = (rol: string) => manifiesto.roles_predefinidos.find((predefinido) => predefinido.codigo === rol)?.permisos ?? [];
  const deCat = (permisos: string[]) => permisos.filter((codigo) => codigo.startsWith('plat.catalogo.')).sort();

  beforeAll(async () => {
    manifiesto = JSON.parse(await readFile(RUTA_MANIFIESTO, 'utf8'));
  });

  it('está en la versión 1.11.0', () => {
    expect(manifiesto.version).toBe('1.11.0');
  });

  it('declara exactamente PERMISOS_CAT, todos de alcance TENANT; gestionar, item_gestionar e importar son sensibles (TR-RN-009)', () => {
    const permisos = manifiesto.permisos.filter((permiso) => permiso.codigo.startsWith('plat.catalogo.'));
    expect(permisos.map((permiso) => [permiso.codigo, permiso.alcance_minimo, permiso.sensible])).toEqual([
      ['plat.catalogo.gestionar', 'TENANT', true],
      ['plat.catalogo.item_gestionar', 'TENANT', true],
      ['plat.catalogo.leer', 'TENANT', false],
      ['plat.catalogo.personalizar', 'TENANT', false],
      ['plat.catalogo.item_propio', 'TENANT', false],
      ['plat.catalogo.importar', 'TENANT', true],
    ]);
    expect(permisos.map((permiso) => permiso.codigo).sort()).toEqual(Object.values(PERMISOS_CAT).sort());
  });

  it('PLAT_PROPIETARIO lleva los 6 y PLAT_ADMIN_CONFIGURACION leer, personalizar e item_propio', () => {
    expect(deCat(permisosDe('PLAT_PROPIETARIO'))).toEqual(Object.values(PERMISOS_CAT).sort());
    expect(deCat(permisosDe('PLAT_ADMIN_CONFIGURACION'))).toEqual(['plat.catalogo.item_propio', 'plat.catalogo.leer', 'plat.catalogo.personalizar']);
    const otros = manifiesto.roles_predefinidos.filter((rol) => !['PLAT_PROPIETARIO', 'PLAT_ADMIN_CONFIGURACION'].includes(rol.codigo));
    expect(otros.flatMap((rol) => deCat(rol.permisos))).toEqual([]);
  });

  it('declara plat.calendario.sabado_habil BOOLEANO, true por defecto y hasta SUCURSAL (TR-RN-014, spec 19c)', () => {
    expect(manifiesto.parametros.find((parametro) => parametro.codigo === 'plat.calendario.sabado_habil')).toEqual({
      codigo: 'plat.calendario.sabado_habil',
      descripcion: 'El sábado cuenta como día hábil',
      tipo: 'BOOLEANO',
      valor_defecto: true,
      alcance_maximo: 'SUCURSAL',
    });
  });

  it('no trae opciones de menú de catálogos: llegan con la UI del 19d', () => {
    expect(manifiesto.opciones.filter((opcion) => opcion.permisos.some((permiso) => permiso.startsWith('plat.catalogo.')))).toEqual([]);
  });
});
