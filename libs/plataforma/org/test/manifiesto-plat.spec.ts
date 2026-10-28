import { readFile } from 'node:fs/promises';
import { PERMISOS_ORG } from '../src/domain/permisos-org.js';

// El manifiesto PLAT vive en seguridad (lo aplica su CLI); aquí se lee como archivo, no se importa.
const RUTA_MANIFIESTO = new URL('../../seguridad/manifiesto/plat.manifiesto.json', import.meta.url);
const ROLES_ADMIN = ['PLAT_ADMIN_SEGURIDAD', 'PLAT_ADMIN_CONFIGURACION', 'PLAT_ADMIN_EVENTOS'];
const PERMISOS_ORGANIZACION = [PERMISOS_ORG.organizacionConsultar, PERMISOS_ORG.empresaCrear, PERMISOS_ORG.sucursalGestionar, PERMISOS_ORG.unidadGestionar];
const PERMISOS_TENANTS = [PERMISOS_ORG.tenantCrear, PERMISOS_ORG.tenantConsultar, PERMISOS_ORG.tenantCambiarEstado];

interface Manifiesto {
  version: string;
  modulos: { codigo: string; orden: number }[];
  opciones: { codigo: string; modulo: string; padre: string | null; ruta?: string; permisos: string[] }[];
  permisos: { codigo: string; alcance_minimo: string; sensible: boolean }[];
  roles_predefinidos: { codigo: string; permisos: string[] }[];
  parametros: { codigo: string; tipo: string; valor_defecto: unknown; alcance_maximo: string }[];
}

describe('Manifiesto PLAT 1.6.0: parte de org (specs 12 y 17a)', () => {
  let manifiesto: Manifiesto;
  const permisosDe = (codigo: string) => manifiesto.roles_predefinidos.find((rol) => rol.codigo === codigo)?.permisos ?? [];
  const permiso = (codigo: string) => manifiesto.permisos.find((declarado) => declarado.codigo === codigo);

  beforeAll(async () => {
    manifiesto = JSON.parse(await readFile(RUTA_MANIFIESTO, 'utf8'));
  });

  it('declara los permisos de org con su alcance; crear y cambiar estado de tenants son sensibles', () => {
    expect(manifiesto.version).toBe('1.6.0');
    const declarados = [...PERMISOS_TENANTS, ...PERMISOS_ORGANIZACION].map((codigo) => [codigo, permiso(codigo)?.alcance_minimo, permiso(codigo)?.sensible]);
    expect(declarados).toEqual([
      ['plat.tenant.crear', 'TENANT', true],
      ['plat.tenant.consultar', 'TENANT', false],
      ['plat.tenant.cambiar_estado', 'TENANT', true],
      ['plat.organizacion.consultar', 'SUCURSAL', false],
      ['plat.empresa.crear', 'TENANT', false],
      ['plat.sucursal.gestionar', 'EMPRESA', false],
      ['plat.unidad.gestionar', 'SUCURSAL', false],
    ]);
  });

  it('plat.suscripcion.gestionar no se declara: TR-RF-005 no tiene endpoint', () => {
    expect(permiso(PERMISOS_ORG.suscripcionGestionar)).toBeUndefined();
  });

  it('PLAT_ADMIN_TENANTS trae los tres permisos de tenants y plat.sesion.contexto', () => {
    expect([...permisosDe('PLAT_ADMIN_TENANTS')].sort()).toEqual([...PERMISOS_TENANTS, 'plat.sesion.contexto'].sort());
  });

  it('PLAT_PROPIETARIO junta los tres administradores y los permisos de organización, sin ninguno de tenants', () => {
    const esperados = new Set([...ROLES_ADMIN.flatMap(permisosDe), ...PERMISOS_ORGANIZACION]);
    expect(new Set(permisosDe('PLAT_PROPIETARIO'))).toEqual(esperados);
    expect(permisosDe('PLAT_PROPIETARIO').filter((codigo) => codigo.startsWith('plat.tenant.') || codigo.startsWith('plat.suscripcion.'))).toEqual([]);
  });

  it('PLAT_ADMIN_SEGURIDAD puede leer la organización para el selector de alcance (16a)', () => {
    expect(permisosDe('PLAT_ADMIN_SEGURIDAD')).toContain(PERMISOS_ORG.organizacionConsultar);
  });

  it('declara los módulos organizacion y consola con sus opciones de menú', () => {
    expect(manifiesto.modulos.filter((modulo) => ['organizacion', 'consola'].includes(modulo.codigo))).toEqual([
      { codigo: 'organizacion', nombre: 'Organización', orden: 3 },
      { codigo: 'consola', nombre: 'Consola', orden: 4 },
    ]);
    const opciones = manifiesto.opciones.filter((opcion) => ['organizacion', 'consola'].includes(opcion.modulo)).map(({ codigo, padre, ruta, permisos }) => [codigo, padre, ruta, permisos]);
    expect(opciones).toEqual([
      ['plat.organizacion', null, undefined, []],
      ['plat.organizacion.empresas', 'plat.organizacion', '/admin/empresas', ['plat.organizacion.consultar']],
      ['plat.organizacion.sucursales', 'plat.organizacion', '/admin/sucursales', ['plat.organizacion.consultar']],
      ['plat.organizacion.unidades', 'plat.organizacion', '/admin/unidades', ['plat.organizacion.consultar']],
      ['plat.consola', null, undefined, []],
      ['plat.consola.tenants', 'plat.consola', '/consola/tenants', ['plat.tenant.consultar']],
    ]);
  });

  it('declara dias_gracia (5) y dias_prueba (15) como NUMERO a nivel TENANT', () => {
    const deSuscripcion = manifiesto.parametros.filter((parametro) => parametro.codigo.startsWith('plat.suscripcion.'));
    expect(deSuscripcion.map(({ codigo, tipo, valor_defecto, alcance_maximo }) => [codigo, tipo, valor_defecto, alcance_maximo])).toEqual([
      ['plat.suscripcion.dias_gracia', 'NUMERO', 5, 'TENANT'],
      ['plat.suscripcion.dias_prueba', 'NUMERO', 15, 'TENANT'],
    ]);
  });
});
