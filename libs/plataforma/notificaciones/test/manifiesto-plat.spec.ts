import { readFile } from 'node:fs/promises';
import { PERMISOS_PLANTILLAS } from '../src/domain/permisos-not.js';

const RUTA_MANIFIESTO = new URL('../../seguridad/manifiesto/plat.manifiesto.json', import.meta.url);

describe('Manifiesto PLAT 1.27.0: plantillas de notificación (spec 43)', () => {
  interface Manifiesto {
    version: string;
    permisos: { codigo: string; descripcion: string; alcance_minimo: string; sensible: boolean }[];
    opciones: { codigo: string; permisos: string[] }[];
    roles_predefinidos: { codigo: string; permisos: string[] }[];
  }
  let manifiesto: Manifiesto;
  const esDePlantillas = (codigo: string) => codigo.startsWith('plat.plantilla_notificacion.');

  beforeAll(async () => {
    manifiesto = JSON.parse(await readFile(RUTA_MANIFIESTO, 'utf8'));
  });

  it('está en la versión 1.27.0 y declara los dos permisos con alcance TENANT, no sensibles', () => {
    expect(manifiesto.version).toBe('1.31.0');
    const dePlantillas = manifiesto.permisos.filter((permiso) => esDePlantillas(permiso.codigo));
    expect(dePlantillas.map((permiso) => [permiso.codigo, permiso.alcance_minimo, permiso.sensible])).toEqual([
      [PERMISOS_PLANTILLAS.consultar, 'TENANT', false],
      [PERMISOS_PLANTILLAS.gestionar, 'TENANT', false],
    ]);
  });

  it('solo PLAT_PROPIETARIO los tiene; sin opción de menú hasta el spec 47', () => {
    const propietario = manifiesto.roles_predefinidos.find((rol) => rol.codigo === 'PLAT_PROPIETARIO');
    expect(propietario?.permisos.filter(esDePlantillas)).toEqual(Object.values(PERMISOS_PLANTILLAS));
    const otros = manifiesto.roles_predefinidos.filter((rol) => rol.codigo !== 'PLAT_PROPIETARIO');
    expect(otros.flatMap((rol) => rol.permisos).filter(esDePlantillas)).toEqual([]);
    expect(manifiesto.opciones.flatMap((opcion) => opcion.permisos).filter(esDePlantillas)).toEqual([]);
  });
});
