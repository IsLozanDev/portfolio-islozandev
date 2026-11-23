import { readFile } from 'node:fs/promises';
import { DIAS_AVISO_MAXIMO, DIAS_AVISO_MINIMO } from '../src/domain/aviso-certificado.js';
import { PARAMETRO_DIAS_AVISO_CERTIFICADO, PERMISOS_FE } from '../src/domain/permisos-fe.js';

const RUTA_MANIFIESTO = new URL('../../seguridad/manifiesto/plat.manifiesto.json', import.meta.url);

describe('Manifiesto PLAT 1.26.0: parte de fe (spec 49)', () => {
  interface Manifiesto {
    version: string;
    permisos: { codigo: string; descripcion: string; alcance_minimo: string; sensible: boolean }[];
    opciones: { codigo: string; permisos: string[] }[];
    roles_predefinidos: { codigo: string; nombre: string; permisos: string[] }[];
    parametros: { codigo: string; tipo: string; valor_defecto: unknown; alcance_maximo: string; esquema?: object }[];
  }
  let manifiesto: Manifiesto;
  const esDeFe = (codigo: string) => codigo.startsWith('plat.fe.');
  const permisosDe = (rol: string) => manifiesto.roles_predefinidos.find((candidato) => candidato.codigo === rol)?.permisos ?? [];

  beforeAll(async () => {
    manifiesto = JSON.parse(await readFile(RUTA_MANIFIESTO, 'utf8'));
  });

  it('está en la versión 1.26.0; plat.fe.configurar es sensible y plat.fe.consultar no, los dos con alcance TENANT', () => {
    expect(manifiesto.version).toBe('1.26.0');
    const deFe = manifiesto.permisos.filter((permiso) => esDeFe(permiso.codigo));
    expect(deFe.map((permiso) => [permiso.codigo, permiso.descripcion, permiso.alcance_minimo, permiso.sensible])).toEqual([
      [PERMISOS_FE.configurar, 'Configurar el emisor electrónico', 'TENANT', true],
      [PERMISOS_FE.consultar, 'Ver el emisor electrónico', 'TENANT', false],
    ]);
  });

  it('PLAT_ENCARGADO_FACTURACION y PLAT_PROPIETARIO tienen los dos; ningún otro rol ni opción de menú (spec 62)', () => {
    const ambos = Object.values(PERMISOS_FE);
    expect(permisosDe('PLAT_ENCARGADO_FACTURACION').filter(esDeFe)).toEqual(ambos);
    expect(permisosDe('PLAT_PROPIETARIO').filter(esDeFe)).toEqual(ambos);
    const otros = manifiesto.roles_predefinidos.filter((rol) => !['PLAT_ENCARGADO_FACTURACION', 'PLAT_PROPIETARIO'].includes(rol.codigo));
    expect(otros.flatMap((rol) => rol.permisos).filter(esDeFe)).toEqual([]);
    expect(manifiesto.opciones.flatMap((opcion) => opcion.permisos).filter(esDeFe)).toEqual([]);
  });

  it('plat.fe.dias_aviso_certificado: número entero de 1 a 90, 30 por defecto y editable por tenant', () => {
    const parametro = manifiesto.parametros.find((candidato) => candidato.codigo === PARAMETRO_DIAS_AVISO_CERTIFICADO);
    expect(parametro).toMatchObject({
      tipo: 'NUMERO',
      valor_defecto: 30,
      alcance_maximo: 'TENANT',
      esquema: { type: 'integer', minimum: DIAS_AVISO_MINIMO, maximum: DIAS_AVISO_MAXIMO },
    });
  });
});
