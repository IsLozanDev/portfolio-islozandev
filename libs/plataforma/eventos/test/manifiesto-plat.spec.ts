import { readFile } from 'node:fs/promises';
import { PERMISOS_EVT } from '../src/domain/permisos-evt.js';

// El manifiesto PLAT vive en seguridad (lo aplica su CLI); aquí se lee como archivo, no se importa.
const RUTA_MANIFIESTO = new URL('../../seguridad/manifiesto/plat.manifiesto.json', import.meta.url);

interface Manifiesto {
  version: string;
  permisos: { codigo: string; alcance_minimo: string; sensible: boolean }[];
  opciones: { codigo: string; permisos: string[] }[];
  roles_predefinidos: { codigo: string; permisos: string[] }[];
}

describe('Manifiesto PLAT 1.4.0: parte de evt (spec 11)', () => {
  let manifiesto: Manifiesto;

  beforeAll(async () => {
    manifiesto = JSON.parse(await readFile(RUTA_MANIFIESTO, 'utf8'));
  });

  it('declara exactamente los permisos de PERMISOS_EVT; reprocesar es sensible (TR-RN-009) y consultar no', () => {
    const deEvt = manifiesto.permisos.filter((permiso) => permiso.codigo.startsWith('plat.evento.'));
    expect(manifiesto.version).toBe('1.4.0');
    expect(deEvt.map((permiso) => permiso.codigo).sort()).toEqual(Object.values(PERMISOS_EVT).sort());
    expect(deEvt.map((permiso) => [permiso.codigo, permiso.alcance_minimo, permiso.sensible])).toEqual([
      ['plat.evento.consultar', 'TENANT', false],
      ['plat.evento.reprocesar', 'TENANT', true],
    ]);
  });

  it('trae el rol PLAT_ADMIN_EVENTOS con los dos permisos y plat.sesion.contexto', () => {
    expect(manifiesto.roles_predefinidos.find((rol) => rol.codigo === 'PLAT_ADMIN_EVENTOS')?.permisos.sort()).toEqual(
      ['plat.evento.consultar', 'plat.evento.reprocesar', 'plat.sesion.contexto'].sort(),
    );
  });

  it('no agrega opciones de menú', () => {
    expect(manifiesto.opciones.flatMap((opcion) => opcion.permisos).filter((permiso) => permiso.startsWith('plat.evento.'))).toEqual([]);
  });
});
