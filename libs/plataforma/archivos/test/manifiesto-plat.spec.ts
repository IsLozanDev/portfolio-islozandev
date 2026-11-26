import { readFile } from 'node:fs/promises';
import { PERMISOS_ARC } from '../src/domain/permisos-arc.js';

const RUTA_MANIFIESTO = new URL('../../seguridad/manifiesto/plat.manifiesto.json', import.meta.url);

describe('Manifiesto PLAT 1.27.0: parte de arc (specs 33 y 35)', () => {
  interface Manifiesto {
    version: string;
    permisos: { codigo: string; descripcion: string; alcance_minimo: string; sensible: boolean }[];
    opciones: { codigo: string; permisos: string[] }[];
    roles_predefinidos: { codigo: string; permisos: string[] }[];
  }
  let manifiesto: Manifiesto;
  const esDeArchivos = (codigo: string) => codigo.startsWith('plat.archivo.');

  beforeAll(async () => {
    manifiesto = JSON.parse(await readFile(RUTA_MANIFIESTO, 'utf8'));
  });

  it('está en la versión 1.27.0 y declara los tres permisos con alcance TENANT, no sensibles', () => {
    expect(manifiesto.version).toBe('1.30.0');
    const deArchivos = manifiesto.permisos.filter((permiso) => esDeArchivos(permiso.codigo));
    expect(deArchivos.map((permiso) => [permiso.codigo, permiso.descripcion, permiso.alcance_minimo, permiso.sensible])).toEqual([
      [PERMISOS_ARC.subir, 'Subir archivos', 'TENANT', false],
      [PERMISOS_ARC.descargar, 'Ver y descargar archivos', 'TENANT', false],
      [PERMISOS_ARC.versionar, 'Subir versiones de un archivo y elegir la vigente', 'TENANT', false],
    ]);
  });

  it('ningún rol predefinido ni opción de menú los incluye: cada producto o tenant los suma a sus roles', () => {
    const enRoles = manifiesto.roles_predefinidos.flatMap((rol) => rol.permisos).filter(esDeArchivos);
    const enMenu = manifiesto.opciones.flatMap((opcion) => opcion.permisos).filter(esDeArchivos);

    expect([enRoles, enMenu]).toEqual([[], []]);
  });
});
