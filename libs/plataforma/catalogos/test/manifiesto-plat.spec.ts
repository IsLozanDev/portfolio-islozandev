import { readFile } from 'node:fs/promises';
import { PERMISOS_CAT } from '../src/domain/permisos-cat.js';

// El manifiesto PLAT vive en seguridad (lo aplica su CLI); aquí se lee como archivo, no se importa.
const RUTA_MANIFIESTO = new URL('../../seguridad/manifiesto/plat.manifiesto.json', import.meta.url);

interface Manifiesto {
  version: string;
  permisos: { codigo: string; alcance_minimo: string; sensible: boolean }[];
  opciones: { codigo: string; modulo: string; padre: string | null; nombre: string; ruta?: string; icono: string; orden: number; permisos: string[] }[];
  roles_predefinidos: { codigo: string; permisos: string[] }[];
  parametros: { codigo: string; descripcion: string; tipo: string; valor_defecto: unknown; alcance_maximo: string }[];
}

const PREFIJOS_CAT = ['plat.catalogo.', 'plat.feriado.'];

describe('Manifiesto PLAT 1.12.0: parte de cat (specs 19a, 19b, 19c y 19d)', () => {
  let manifiesto: Manifiesto;
  const permisosDe = (rol: string) => manifiesto.roles_predefinidos.find((predefinido) => predefinido.codigo === rol)?.permisos ?? [];
  const esDeCat = (codigo: string) => PREFIJOS_CAT.some((prefijo) => codigo.startsWith(prefijo));
  const deCat = (permisos: string[]) => permisos.filter(esDeCat).sort();

  beforeAll(async () => {
    manifiesto = JSON.parse(await readFile(RUTA_MANIFIESTO, 'utf8'));
  });

  it('está en la versión 1.12.0', () => {
    expect(manifiesto.version).toBe('1.12.0');
  });

  it('declara exactamente PERMISOS_CAT, todos de alcance TENANT; gestionar, item_gestionar e importar son sensibles (TR-RN-009)', () => {
    const permisos = manifiesto.permisos.filter((permiso) => esDeCat(permiso.codigo));
    expect(permisos.map((permiso) => [permiso.codigo, permiso.alcance_minimo, permiso.sensible])).toEqual([
      ['plat.catalogo.gestionar', 'TENANT', true],
      ['plat.catalogo.item_gestionar', 'TENANT', true],
      ['plat.catalogo.leer', 'TENANT', false],
      ['plat.catalogo.personalizar', 'TENANT', false],
      ['plat.catalogo.item_propio', 'TENANT', false],
      ['plat.catalogo.importar', 'TENANT', true],
      ['plat.feriado.gestionar', 'TENANT', false],
    ]);
    expect(permisos.map((permiso) => permiso.codigo).sort()).toEqual(Object.values(PERMISOS_CAT).sort());
  });

  it('PLAT_PROPIETARIO lleva los 7 y PLAT_ADMIN_CONFIGURACION leer, personalizar, item_propio y feriado.gestionar', () => {
    expect(deCat(permisosDe('PLAT_PROPIETARIO'))).toEqual(Object.values(PERMISOS_CAT).sort());
    expect(deCat(permisosDe('PLAT_ADMIN_CONFIGURACION'))).toEqual([
      'plat.catalogo.item_propio',
      'plat.catalogo.leer',
      'plat.catalogo.personalizar',
      'plat.feriado.gestionar',
    ]);
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

  it('la única opción de catálogos es Consola > Catálogos, con item_gestionar y no leer (spec 19d); feriados llega con el 19e', () => {
    expect(manifiesto.opciones.filter((opcion) => opcion.permisos.some(esDeCat))).toEqual([
      {
        codigo: 'plat.consola.catalogos',
        modulo: 'consola',
        padre: 'plat.consola',
        nombre: 'Catálogos',
        ruta: '/consola/catalogos',
        icono: 'library_books',
        orden: 3,
        permisos: ['plat.catalogo.item_gestionar'],
      },
    ]);
  });
});
