import { readFile } from 'node:fs/promises';
import { PERMISOS_ORG } from '../src/domain/permisos-org.js';

// El manifiesto PLAT vive en seguridad (lo aplica su CLI); aquí se lee como archivo, no se importa.
const RUTA_MANIFIESTO = new URL('../../seguridad/manifiesto/plat.manifiesto.json', import.meta.url);
const ROLES_ADMIN = ['PLAT_ADMIN_SEGURIDAD', 'PLAT_ADMIN_CONFIGURACION', 'PLAT_ADMIN_EVENTOS'];

interface Manifiesto {
  version: string;
  permisos: { codigo: string; alcance_minimo: string; sensible: boolean }[];
  roles_predefinidos: { codigo: string; permisos: string[] }[];
  parametros: { codigo: string; tipo: string; valor_defecto: unknown; alcance_maximo: string }[];
}

describe('Manifiesto PLAT 1.5.0: parte de org (spec 12)', () => {
  let manifiesto: Manifiesto;
  const permisosDe = (codigo: string) => manifiesto.roles_predefinidos.find((rol) => rol.codigo === codigo)?.permisos ?? [];

  beforeAll(async () => {
    manifiesto = JSON.parse(await readFile(RUTA_MANIFIESTO, 'utf8'));
  });

  it('declara plat.tenant.crear sensible con alcance TENANT', () => {
    expect(manifiesto.version).toBe('1.5.0');
    expect(manifiesto.permisos.find((permiso) => permiso.codigo === PERMISOS_ORG.tenantCrear)).toMatchObject({
      alcance_minimo: 'TENANT',
      sensible: true,
    });
  });

  it('PLAT_ADMIN_TENANTS trae plat.tenant.crear y plat.sesion.contexto', () => {
    expect([...permisosDe('PLAT_ADMIN_TENANTS')].sort()).toEqual([PERMISOS_ORG.tenantCrear, 'plat.sesion.contexto'].sort());
  });

  it('PLAT_PROPIETARIO junta los permisos de los tres administradores y no puede dar de alta tenants', () => {
    const deAdministradores = new Set(ROLES_ADMIN.flatMap(permisosDe));
    expect(new Set(permisosDe('PLAT_PROPIETARIO'))).toEqual(deAdministradores);
    expect(permisosDe('PLAT_PROPIETARIO')).not.toContain(PERMISOS_ORG.tenantCrear);
  });

  it('declara dias_gracia (5) y dias_prueba (15) como NUMERO a nivel TENANT', () => {
    const deSuscripcion = manifiesto.parametros.filter((parametro) => parametro.codigo.startsWith('plat.suscripcion.'));
    expect(deSuscripcion.map(({ codigo, tipo, valor_defecto, alcance_maximo }) => [codigo, tipo, valor_defecto, alcance_maximo])).toEqual([
      ['plat.suscripcion.dias_gracia', 'NUMERO', 5, 'TENANT'],
      ['plat.suscripcion.dias_prueba', 'NUMERO', 15, 'TENANT'],
    ]);
  });
});
