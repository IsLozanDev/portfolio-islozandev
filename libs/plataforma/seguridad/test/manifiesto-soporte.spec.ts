import { readFile } from 'node:fs/promises';
import { PERMISOS_SEG, PERMISOS_VETADOS_SOPORTE } from '../src/domain/permisos-seg.js';

interface Manifiesto {
  version: string;
  opciones: { codigo: string; padre: string | null; ruta?: string; permisos: string[] }[];
  permisos: { codigo: string; alcance_minimo: string; sensible: boolean }[];
  roles_predefinidos: { codigo: string; permisos: string[] }[];
}

/** Lo que el spec 18 agregó al manifiesto PLAT 1.7.0; sigue en 1.8.0 (spec 18b). */
describe('Manifiesto PLAT 1.8.0: bitácora y soporte (spec 18)', () => {
  let manifiesto: Manifiesto;
  const permisosDe = (codigo: string) => manifiesto.roles_predefinidos.find((rol) => rol.codigo === codigo)?.permisos ?? [];
  const permiso = (codigo: string) => manifiesto.permisos.find((declarado) => declarado.codigo === codigo);
  const opcion = (codigo: string) => manifiesto.opciones.find((declarada) => declarada.codigo === codigo);

  beforeAll(async () => {
    manifiesto = JSON.parse(await readFile(new URL('../manifiesto/plat.manifiesto.json', import.meta.url), 'utf8'));
  });

  it('declara los tres permisos con alcance TENANT; solo autorizar es sensible (TR-RN-009)', () => {
    expect(manifiesto.version).toBe('1.8.0');
    const declarados = [PERMISOS_SEG.seguridadBitacora, PERMISOS_SEG.soporteAutorizar, PERMISOS_SEG.soporteSolicitar].map((codigo) => [
      codigo,
      permiso(codigo)?.alcance_minimo,
      permiso(codigo)?.sensible,
    ]);
    expect(declarados).toEqual([
      ['plat.seguridad.bitacora', 'TENANT', false],
      ['plat.soporte.autorizar', 'TENANT', true],
      ['plat.soporte.solicitar', 'TENANT', false],
    ]);
  });

  it('las tres opciones de menú cuelgan de Seguridad y de Consola con su ruta y su permiso', () => {
    expect([opcion('plat.seguridad.bitacora'), opcion('plat.seguridad.soporte'), opcion('plat.consola.soporte')]).toEqual([
      expect.objectContaining({ padre: 'plat.seguridad', ruta: '/admin/bitacora', permisos: ['plat.seguridad.bitacora'] }),
      expect.objectContaining({ padre: 'plat.seguridad', ruta: '/admin/soporte', permisos: ['plat.soporte.autorizar'] }),
      expect.objectContaining({ padre: 'plat.consola', ruta: '/consola/soporte', permisos: ['plat.soporte.solicitar'] }),
    ]);
  });

  it('el propietario autoriza y ve la bitácora; el administrador de seguridad solo ve la bitácora', () => {
    expect(permisosDe('PLAT_PROPIETARIO')).toEqual(expect.arrayContaining(['plat.seguridad.bitacora', 'plat.soporte.autorizar']));
    expect(permisosDe('PLAT_ADMIN_SEGURIDAD')).toContain('plat.seguridad.bitacora');
    expect(permisosDe('PLAT_ADMIN_SEGURIDAD')).not.toContain('plat.soporte.autorizar');
  });

  it('PLAT_AGENTE_SOPORTE solicita y lista tenants, y queda fuera del techo del cliente', () => {
    const agente = permisosDe('PLAT_AGENTE_SOPORTE');
    expect([...agente].sort()).toEqual(['plat.sesion.contexto', 'plat.soporte.solicitar', 'plat.tenant.consultar']);
    // Fuera del techo (spec 16b): un cliente no puede armarse este rol ni ponerlo en un perfil.
    const techo = new Set(permisosDe('PLAT_PROPIETARIO'));
    expect(agente.filter((codigo) => !techo.has(codigo)).sort()).toEqual(['plat.soporte.solicitar', 'plat.tenant.consultar']);
  });

  it('nadie del cliente tiene plat.soporte.solicitar: solo el agente del operador', () => {
    const conSolicitar = manifiesto.roles_predefinidos.filter((rol) => rol.permisos.includes('plat.soporte.solicitar')).map((rol) => rol.codigo);
    expect(conSolicitar).toEqual(['PLAT_AGENTE_SOPORTE']);
  });

  it('todos los permisos vetados en soporte existen en el manifiesto', () => {
    expect(PERMISOS_VETADOS_SOPORTE.filter((codigo) => !permiso(codigo))).toEqual([]);
  });
});
