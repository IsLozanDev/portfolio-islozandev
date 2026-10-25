import type { CambiosDefiniciones, RepositorioDefiniciones, ResumenDefiniciones, SesionDefiniciones } from '../src/application/ports/repositorios.js';
import { RegistrarDefiniciones } from '../src/application/registrar-definiciones.js';
import { DefinicionParametro } from '../src/domain/definicion-parametro.js';
import { DefinicionInvalidaError } from '../src/domain/errores.js';
import { ValidadorEsquemaAjv } from '../src/infrastructure/ajv/validador-esquema.ajv.js';

/** Repositorio en memoria: guarda las definiciones y registra cada `aplicar`. */
class DefinicionesEnMemoria implements RepositorioDefiniciones {
  readonly filas = new Map<string, DefinicionParametro>();
  readonly aplicados: { producto: string; cambios: CambiosDefiniciones; resumen: ResumenDefiniciones }[] = [];

  transaccion<T>(trabajo: (sesion: SesionDefiniciones) => Promise<T>): Promise<T> {
    return trabajo({
      todasDe: async (producto) => [...this.filas.values()].filter((definicion) => definicion.productoCodigo === producto),
      aplicar: async (producto, cambios, resumen) => {
        this.aplicados.push({ producto, cambios, resumen });
        for (const definicion of [...cambios.insertar, ...cambios.actualizar, ...cambios.reactivar]) this.filas.set(definicion.codigo, definicion);
        for (const codigo of cambios.obsoletar) {
          const anterior = this.filas.get(codigo) as DefinicionParametro;
          this.filas.set(codigo, DefinicionParametro.reconstituir({ codigo, productoCodigo: anterior.productoCodigo, descripcion: anterior.descripcion, tipo: anterior.tipo, valorDefecto: anterior.valorDefecto, alcanceMaximo: anterior.alcanceMaximo, esquema: anterior.esquema, obsoleto: true }));
        }
      },
    });
  }
}

type Json = Record<string, unknown>;
const PROPINA: Json = {
  codigo: 'rest.propina.porcentaje',
  descripcion: 'Porcentaje de propina sugerida',
  tipo: 'NUMERO',
  valor_defecto: 10,
  alcance_maximo: 'SUCURSAL',
  esquema: { minimum: 0, maximum: 20 },
};
const MESAS: Json = { codigo: 'rest.salon.mesas', descripcion: 'Mesas del salón', tipo: 'NUMERO', valor_defecto: 12, alcance_maximo: 'SUCURSAL' };
const rest = (...parametros: unknown[]) => ({ productoCodigo: 'REST', parametros });
const NADA = { insertadas: 0, actualizadas: 0, obsoletas: 0, reactivadas: 0 };

describe('RegistrarDefiniciones (TR-RF-030, TR-RNF-120)', () => {
  let repositorio: DefinicionesEnMemoria;
  let registrar: RegistrarDefiniciones;

  beforeEach(() => {
    repositorio = new DefinicionesEnMemoria();
    registrar = new RegistrarDefiniciones(repositorio, new ValidadorEsquemaAjv());
  });

  it('TR-CA-078: el manifiesto REST 1.5.0 registra la propina con alcance máximo SUCURSAL', async () => {
    expect(await registrar.ejecutar(rest(PROPINA))).toEqual({ ...NADA, insertadas: 1 });
    expect(repositorio.filas.get('rest.propina.porcentaje')).toMatchObject({ alcanceMaximo: 'SUCURSAL', valorDefecto: 10, obsoleto: false });
  });

  it('TR-CA-079: un defecto «treinta» rechaza con el tipo esperado y no escribe', async () => {
    const malo = { codigo: 'plat.sesion.minutos_inactividad', descripcion: 'Minutos de inactividad', tipo: 'NUMERO', valor_defecto: 'treinta', alcance_maximo: 'TENANT' };
    const ejecutar = registrar.ejecutar({ productoCodigo: 'PLAT', parametros: [malo] });
    await expect(ejecutar).rejects.toThrow(DefinicionInvalidaError);
    await expect(ejecutar).rejects.toMatchObject({ detalles: ['parametros[0].valor_defecto: Se esperaba un valor NUMERO'] });
    expect(repositorio.aplicados).toEqual([]);
  });

  it('validar no toca el repositorio y junta errores de varios parámetros', () => {
    expect(() => registrar.validar(rest(PROPINA, 'x', { ...MESAS, codigo: 'rest-salon' }, { ...PROPINA, valor_defecto: 30 }))).toThrow(
      expect.objectContaining({
        detalles: [
          'parametros[1]: debe ser un objeto',
          'parametros[2].codigo: Código de parámetro inválido: rest-salon (formato producto.ambito.nombre)',
          'parametros[3].codigo: duplicado rest.propina.porcentaje',
          'parametros[3].valor_defecto: El valor debe estar entre 0 y 20',
        ],
      }),
    );
    expect(repositorio.aplicados).toEqual([]);
  });

  it('parametros que no es arreglo se rechaza', () => {
    expect(() => registrar.validar({ productoCodigo: 'REST', parametros: {} })).toThrow('parametros: debe ser un arreglo');
  });

  it('repetir las mismas definiciones da 0 cambios y no registra (vd no sube)', async () => {
    await registrar.ejecutar(rest(PROPINA, MESAS));
    expect(await registrar.ejecutar(rest({ ...PROPINA, esquema: { maximum: 20, minimum: 0 } }, MESAS))).toEqual(NADA);
    expect(repositorio.aplicados).toHaveLength(1);
  });

  it('un defecto o una descripción nuevos actualizan', async () => {
    await registrar.ejecutar(rest(PROPINA));
    expect(await registrar.ejecutar(rest({ ...PROPINA, valor_defecto: 12 }))).toEqual({ ...NADA, actualizadas: 1 });
    expect(repositorio.filas.get('rest.propina.porcentaje')?.valorDefecto).toBe(12);
  });

  it('una definición retirada queda obsoleta y al volver se reactiva', async () => {
    await registrar.ejecutar(rest(PROPINA, MESAS));
    expect(await registrar.ejecutar(rest(PROPINA))).toEqual({ ...NADA, obsoletas: 1 });
    expect(repositorio.filas.get('rest.salon.mesas')?.obsoleto).toBe(true);
    // Sigue obsoleta sin repetir el cambio.
    expect(await registrar.ejecutar(rest(PROPINA))).toEqual(NADA);

    expect(await registrar.ejecutar(rest(PROPINA, { ...MESAS, valor_defecto: 8 }))).toEqual({ ...NADA, reactivadas: 1 });
    expect(repositorio.filas.get('rest.salon.mesas')).toMatchObject({ obsoleto: false, valorDefecto: 8 });
  });

  it('cambiar el tipo de una definición existente se rechaza y no escribe', async () => {
    await registrar.ejecutar(rest(PROPINA));
    await expect(registrar.ejecutar(rest({ ...PROPINA, tipo: 'TEXTO', valor_defecto: '10', esquema: null }))).rejects.toMatchObject({
      detalles: ['parametros[0].tipo: rest.propina.porcentaje es NUMERO y no puede cambiar a TEXTO'],
    });
    expect(repositorio.aplicados).toHaveLength(1);
  });

  it('solo mira las definiciones del mismo producto', async () => {
    await registrar.ejecutar({ productoCodigo: 'PLAT', parametros: [{ ...MESAS, codigo: 'plat.sesion.minutos_inactividad' }] });
    expect(await registrar.ejecutar(rest(PROPINA))).toEqual({ ...NADA, insertadas: 1 });
    expect(repositorio.filas.get('plat.sesion.minutos_inactividad')?.obsoleto).toBe(false);
  });
});
