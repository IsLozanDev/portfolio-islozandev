import { readFile } from 'node:fs/promises';
import { PERMISOS_SEQ } from '../src/domain/permisos-seq.js';

// El manifiesto PLAT vive en seguridad (lo aplica su CLI); aquí se lee como archivo, no se importa.
const RUTA_MANIFIESTO = new URL('../../seguridad/manifiesto/plat.manifiesto.json', import.meta.url);

interface Manifiesto {
  version: string;
  permisos: { codigo: string; alcance_minimo: string; sensible: boolean }[];
  opciones: { codigo: string; padre: string | null; ruta?: string; permisos: string[] }[];
  roles_predefinidos: { codigo: string; permisos: string[] }[];
}

describe('Manifiesto PLAT 1.3.0: parte de seq (spec 10)', () => {
  let manifiesto: Manifiesto;

  beforeAll(async () => {
    manifiesto = JSON.parse(await readFile(RUTA_MANIFIESTO, 'utf8'));
  });

  it('declara exactamente los permisos de PERMISOS_SEQ; gestionar es sensible (TR-RN-009) y numerar no', () => {
    const deSeq = manifiesto.permisos.filter((permiso) => permiso.codigo.startsWith('plat.serie.'));
    expect(manifiesto.version).toBe('1.3.0');
    expect(deSeq.map((permiso) => permiso.codigo).sort()).toEqual(Object.values(PERMISOS_SEQ).sort());
    expect(deSeq.map((permiso) => [permiso.codigo, permiso.alcance_minimo, permiso.sensible])).toEqual([
      ['plat.serie.gestionar', 'SUCURSAL', true],
      ['plat.serie.numerar', 'SUCURSAL', false],
    ]);
  });

  it('trae la opción «Series» bajo Configuración y suma gestionar a PLAT_ADMIN_CONFIGURACION', () => {
    expect(manifiesto.opciones.find((opcion) => opcion.codigo === 'plat.configuracion.series')).toMatchObject({
      padre: 'plat.configuracion',
      ruta: '/admin/series',
      permisos: ['plat.serie.gestionar'],
    });
    expect(manifiesto.roles_predefinidos.find((rol) => rol.codigo === 'PLAT_ADMIN_CONFIGURACION')?.permisos).toContain('plat.serie.gestionar');
  });

  it('plat.serie.numerar no va en roles humanos', () => {
    expect(manifiesto.roles_predefinidos.flatMap((rol) => rol.permisos)).not.toContain('plat.serie.numerar');
  });
});
