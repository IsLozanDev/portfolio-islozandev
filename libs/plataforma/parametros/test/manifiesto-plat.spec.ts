import { readFile } from 'node:fs/promises';
import { RegistrarDefiniciones } from '../src/application/registrar-definiciones.js';
import { PERMISOS_CFG } from '../src/domain/permisos-cfg.js';
import { ValidadorEsquemaAjv } from '../src/infrastructure/ajv/validador-esquema.ajv.js';

// El manifiesto PLAT vive en seguridad (lo aplica su CLI); aquí se lee como archivo, no se importa.
const RUTA_MANIFIESTO = new URL('../../seguridad/manifiesto/plat.manifiesto.json', import.meta.url);

interface Manifiesto {
  version: string;
  permisos: { codigo: string; alcance_minimo: string; sensible: boolean }[];
  opciones: { codigo: string; ruta?: string; permisos: string[] }[];
  roles_predefinidos: { codigo: string; permisos: string[] }[];
  parametros: unknown[];
}

describe('Manifiesto PLAT 1.2.0: parte de cfg (spec 09)', () => {
  let manifiesto: Manifiesto;

  beforeAll(async () => {
    manifiesto = JSON.parse(await readFile(RUTA_MANIFIESTO, 'utf8'));
  });

  it('declara exactamente los permisos de PERMISOS_CFG, ninguno sensible', () => {
    const deCfg = manifiesto.permisos.filter((permiso) => permiso.codigo.startsWith('plat.parametro.'));
    expect(manifiesto.version).toBe('1.2.0');
    expect(deCfg.map((permiso) => permiso.codigo).sort()).toEqual(Object.values(PERMISOS_CFG).sort());
    expect(deCfg.map((permiso) => [permiso.codigo, permiso.alcance_minimo, permiso.sensible])).toEqual([
      ['plat.parametro.definir', 'TENANT', false],
      ['plat.parametro.leer', 'SUCURSAL', false],
      ['plat.parametro.editar', 'SUCURSAL', false],
    ]);
  });

  it('trae la opción «Parámetros» y el rol PLAT_ADMIN_CONFIGURACION', () => {
    expect(manifiesto.opciones.find((opcion) => opcion.codigo === 'plat.configuracion.parametros')).toMatchObject({ ruta: '/admin/parametros', permisos: ['plat.parametro.leer'] });
    expect(manifiesto.roles_predefinidos.find((rol) => rol.codigo === 'PLAT_ADMIN_CONFIGURACION')?.permisos).toEqual([
      'plat.parametro.leer',
      'plat.parametro.editar',
      'plat.sesion.contexto',
    ]);
  });

  it('plat.sesion.minutos_inactividad es una definición válida: NUMERO, defecto 30, máximo TENANT', () => {
    const registrar = new RegistrarDefiniciones({ transaccion: async () => Promise.reject(new Error('sin base')) }, new ValidadorEsquemaAjv());
    const [sesion] = registrar.validar({ productoCodigo: 'PLAT', parametros: manifiesto.parametros });
    expect(sesion).toMatchObject({ codigo: 'plat.sesion.minutos_inactividad', tipo: 'NUMERO', valorDefecto: 30, alcanceMaximo: 'TENANT' });
  });
});
