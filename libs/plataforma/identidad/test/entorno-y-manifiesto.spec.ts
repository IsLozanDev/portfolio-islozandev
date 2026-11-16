import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { PERMISOS_IDN } from '../src/domain/permisos-idn.js';
import { camposEntornoIdentidad, exigirProveedorReal } from '../src/interface/entorno-identidad.js';

// El manifiesto PLAT vive en seguridad (lo aplica su CLI); aquí se lee como archivo, no se importa.
const RUTA_MANIFIESTO = new URL('../../seguridad/manifiesto/plat.manifiesto.json', import.meta.url);

const esquema = z.object({ APP_ENV: z.string(), ...camposEntornoIdentidad }).superRefine(exigirProveedorReal);
const camposConError = (entorno: Record<string, string>) => {
  const resultado = esquema.safeParse(entorno);
  return resultado.success ? [] : resultado.error.issues.map((problema) => problema.path.join('.'));
};

describe('Entorno de identidad', () => {
  it('por defecto usa el falso', () => {
    expect(esquema.parse({ APP_ENV: 'local' })).toEqual({ APP_ENV: 'local', IDN_PROVEEDOR: 'falso' });
  });

  it.each(['local', 'test', 'staging'])('en %s admite el falso', (ambiente) => {
    expect(camposConError({ APP_ENV: ambiente, IDN_PROVEEDOR: 'falso' })).toEqual([]);
  });

  it('en producción rechaza el falso y exige el token', () => {
    expect(camposConError({ APP_ENV: 'production', IDN_PROVEEDOR: 'falso' })).toEqual(['IDN_PROVEEDOR', 'IDN_DECOLECTA_TOKEN']);
    expect(camposConError({ APP_ENV: 'production', IDN_PROVEEDOR: 'decolecta' })).toEqual(['IDN_DECOLECTA_TOKEN']);
    expect(camposConError({ APP_ENV: 'production', IDN_PROVEEDOR: 'decolecta', IDN_DECOLECTA_TOKEN: 'secreto' })).toEqual([]);
  });

  it('con decolecta el token es obligatorio en cualquier ambiente', () => {
    expect(camposConError({ APP_ENV: 'staging', IDN_PROVEEDOR: 'decolecta' })).toEqual(['IDN_DECOLECTA_TOKEN']);
  });

  it('rechaza un proveedor desconocido', () => {
    expect(camposConError({ APP_ENV: 'local', IDN_PROVEEDOR: 'reniec' })).toEqual(['IDN_PROVEEDOR']);
  });
});

describe('Manifiesto PLAT 1.17.0: parte de idn (spec 28)', () => {
  interface Manifiesto {
    version: string;
    permisos: { codigo: string; alcance_minimo: string; sensible: boolean }[];
    opciones: { permisos: string[] }[];
    roles_predefinidos: { codigo: string; permisos: string[] }[];
  }
  let manifiesto: Manifiesto;

  beforeAll(async () => {
    manifiesto = JSON.parse(await readFile(RUTA_MANIFIESTO, 'utf8'));
  });

  it('está en la versión 1.17.0 y declara los dos permisos con alcance TENANT, no sensibles', () => {
    expect(manifiesto.version).toBe('1.17.0');
    const deIdn = manifiesto.permisos.filter((permiso) => permiso.codigo.startsWith('plat.identidad.'));
    expect(deIdn.map((permiso) => [permiso.codigo, permiso.alcance_minimo, permiso.sensible])).toEqual([
      [PERMISOS_IDN.validar, 'TENANT', false],
      [PERMISOS_IDN.consultar, 'TENANT', false],
    ]);
  });

  it('spec 28b: PLAT_PROPIETARIO tiene validar y consultar para el prellenado del RUC', () => {
    const propietario = manifiesto.roles_predefinidos.find((rol) => rol.codigo === 'PLAT_PROPIETARIO');
    expect(propietario?.permisos).toEqual(expect.arrayContaining([PERMISOS_IDN.validar, PERMISOS_IDN.consultar]));
  });

  it('no agrega opción de menú', () => {
    expect(manifiesto.opciones.flatMap((opcion) => opcion.permisos).filter((codigo) => codigo.startsWith('plat.identidad.'))).toEqual([]);
  });
});
