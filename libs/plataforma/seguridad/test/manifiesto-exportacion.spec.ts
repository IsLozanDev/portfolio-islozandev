import { readFile } from 'node:fs/promises';
import { PERMISOS_SEG, PERMISOS_VETADOS_SOPORTE } from '../src/domain/permisos-seg.js';

interface Manifiesto {
  version: string;
  opciones: { codigo: string; permisos: string[] }[];
  permisos: { codigo: string; alcance_minimo: string; sensible?: boolean }[];
  roles_predefinidos: { codigo: string; permisos: string[] }[];
}

/** Lo que el spec 18b agrega al manifiesto PLAT 1.8.0. */
describe('Manifiesto PLAT 1.11.0: exportación de la bitácora (spec 18b)', () => {
  let manifiesto: Manifiesto;
  const exportar = PERMISOS_SEG.seguridadBitacoraExportar;
  const conPermiso = () => manifiesto.roles_predefinidos.filter((rol) => rol.permisos.includes(exportar)).map((rol) => rol.codigo).sort();

  beforeAll(async () => {
    manifiesto = JSON.parse(await readFile(new URL('../manifiesto/plat.manifiesto.json', import.meta.url), 'utf8'));
  });

  it('declara plat.seguridad.bitacora_exportar con alcance TENANT y sensible (TR-RN-009, TR-RN-047)', () => {
    expect(manifiesto.version).toBe('1.11.0');
    expect(manifiesto.permisos.find((permiso) => permiso.codigo === exportar)).toEqual({
      codigo: exportar,
      descripcion: 'Exportar la bitácora de seguridad a Excel',
      alcance_minimo: 'TENANT',
      sensible: true,
    });
  });

  it('solo el propietario y el administrador de seguridad pueden exportar', () => {
    expect(conPermiso()).toEqual(['PLAT_ADMIN_SEGURIDAD', 'PLAT_PROPIETARIO']);
  });

  it('el agente de soporte no la tiene y además está vetada en una sesión de soporte', () => {
    expect(conPermiso()).not.toContain('PLAT_AGENTE_SOPORTE');
    expect(PERMISOS_VETADOS_SOPORTE).toContain(exportar);
  });

  it('no agrega opción de menú: el botón vive en la lista de la bitácora', () => {
    expect(manifiesto.opciones.filter((opcion) => opcion.permisos.includes(exportar))).toEqual([]);
  });
});
