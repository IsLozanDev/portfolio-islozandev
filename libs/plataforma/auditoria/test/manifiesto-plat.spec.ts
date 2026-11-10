import { readFile } from 'node:fs/promises';
import { PERMISOS_AUD } from '../src/domain/permisos-aud.js';

// El manifiesto PLAT vive en seguridad (lo aplica su CLI); aquí se lee como archivo, no se importa.
const RUTA_MANIFIESTO = new URL('../../seguridad/manifiesto/plat.manifiesto.json', import.meta.url);

interface Manifiesto {
  version: string;
  permisos: { codigo: string; alcance_minimo: string; sensible: boolean }[];
  opciones: { permisos: string[] }[];
  roles_predefinidos: { codigo: string; permisos: string[] }[];
}

describe('Manifiesto PLAT 1.15.0: parte de aud (spec 20b)', () => {
  let manifiesto: Manifiesto;
  const permisosDe = (rol: string) => manifiesto.roles_predefinidos.find((predefinido) => predefinido.codigo === rol)?.permisos ?? [];

  beforeAll(async () => {
    manifiesto = JSON.parse(await readFile(RUTA_MANIFIESTO, 'utf8'));
  });

  it('está en la versión 1.15.0', () => {
    expect(manifiesto.version).toBe('1.15.0');
  });

  it('declara PERMISOS_AUD con alcance mínimo SUCURSAL; exportar es sensible (TR-RN-009)', () => {
    const permisos = manifiesto.permisos.filter((permiso) => permiso.codigo.startsWith('plat.auditoria.'));
    expect(permisos.map((permiso) => [permiso.codigo, permiso.alcance_minimo, permiso.sensible])).toEqual([
      [PERMISOS_AUD.consultar, 'SUCURSAL', false],
      [PERMISOS_AUD.exportar, 'SUCURSAL', true],
    ]);
  });

  it('PLAT_AUDITOR lleva los dos y el contexto de sesión; PLAT_PROPIETARIO, los dos', () => {
    expect([...permisosDe('PLAT_AUDITOR')].sort()).toEqual([PERMISOS_AUD.consultar, PERMISOS_AUD.exportar, 'plat.sesion.contexto']);
    expect(permisosDe('PLAT_PROPIETARIO')).toEqual(expect.arrayContaining(Object.values(PERMISOS_AUD)));
  });

  it('«Seguridad > Auditoría» abre /admin/auditoria con plat.auditoria.consultar (spec 20c)', () => {
    expect(manifiesto.opciones.filter((opcion) => opcion.permisos.some((permiso) => permiso.startsWith('plat.auditoria.')))).toEqual([
      {
        codigo: 'plat.seguridad.auditoria',
        modulo: 'seguridad',
        padre: 'plat.seguridad',
        nombre: 'Auditoría',
        ruta: '/admin/auditoria',
        icono: 'fact_check',
        orden: 7,
        permisos: [PERMISOS_AUD.consultar],
      },
    ]);
  });
});
