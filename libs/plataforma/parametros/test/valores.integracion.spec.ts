import { ConflictError, NotFoundError } from '@vitrina/plataforma/kernel';
import { ActorSinAlcanceError } from '@vitrina/plataforma/seguridad';
import { FijarValor } from '../src/application/fijar-valor.js';
import { RestablecerValor } from '../src/application/restablecer-valor.js';
import { ParametroObsoletoError, ValorInvalidoError } from '../src/domain/errores.js';
import { crearEntornoValores, type EntornoValores, type Organizacion } from './support/entorno.js';
import { describeConDb } from './support/temp-db.js';

const PROPINA = 'rest.propina.porcentaje';

describeConDb('FijarValor y RestablecerValor (TR-RF-031, TR-RF-033, PostgreSQL 16)', () => {
  let entorno: EntornoValores;
  let organizacion: Organizacion;
  let fijar: FijarValor;
  let restablecer: RestablecerValor;
  const resolver = (sucursalId: string | null, empresaId: string | null = null) =>
    entorno.en(organizacion.tenantId, () =>
      entorno.dependencias.unidadDeTrabajo.run(() => entorno.dependencias.resolucion.valor(PROPINA, organizacion.tenantId, empresaId, sucursalId)),
    );
  const comoAna = <T>(trabajo: () => Promise<T>) => entorno.en(organizacion.tenantId, trabajo);

  beforeAll(async () => {
    entorno = await crearEntornoValores();
    await entorno.definicion({ codigo: PROPINA, producto: 'REST', tipo: 'NUMERO', defecto: 10, maximo: 'SUCURSAL', esquema: { minimum: 0, maximum: 20 } });
    await entorno.definicion({ codigo: 'rest.salon.retirado', producto: 'REST', tipo: 'NUMERO', defecto: 1, maximo: 'TENANT', obsoleto: true });
    organizacion = await entorno.organizacion();
    fijar = new FijarValor(entorno.dependencias);
    restablecer = new RestablecerValor(entorno.dependencias);
  });

  afterAll(() => entorno?.cerrar());

  it('TR-CA-080: 10 en el tenant y 0 en «Food court Jockey»: Jockey resuelve 0 y Miraflores 10', async () => {
    await comoAna(() => fijar.ejecutar({ codigo: PROPINA, alcance: 'TENANT', valor: 10, actorId: organizacion.usuarioId }));
    const fijado = await comoAna(() => fijar.ejecutar({ codigo: PROPINA, alcance: 'SUCURSAL', sucursalId: organizacion.jockey, valor: 0, actorId: organizacion.usuarioId }));

    expect(fijado).toMatchObject({ valor: 0, cambiado: true });
    expect(await resolver(organizacion.jockey)).toEqual({ valor: 0, origen: 'SUCURSAL' });
    expect(await resolver(organizacion.miraflores)).toEqual({ valor: 10, origen: 'TENANT' });
    const [fila] = await entorno.dataSource.query(`SELECT modificado_por, version FROM cfg.parametro_valor WHERE sucursal_id = $1`, [organizacion.jockey]);
    expect(fila).toEqual({ modificado_por: organizacion.usuarioId, version: '1' });
  });

  it('parametro.cambiado entra al outbox en la misma transacción, con el valor anterior al cambiar', async () => {
    await comoAna(() => fijar.ejecutar({ codigo: PROPINA, alcance: 'SUCURSAL', sucursalId: organizacion.jockey, valor: 2, actorId: organizacion.usuarioId }));
    const eventos = await entorno.eventosDe(PROPINA);
    // sync.outbox.version es bigint: node-pg lo devuelve como texto.
    expect(eventos.at(-1)).toMatchObject({ event_type: 'parametro.cambiado', aggregate_type: 'parametro_valor', version: '2' });
    expect(eventos.at(-1)?.payload).toMatchObject({ alcance: 'SUCURSAL', sucursal_id: organizacion.jockey, valor_anterior: 0, valor: 2, restablecido: false });
  });

  it('el mismo valor no escribe ni publica (TR-RNF-008)', async () => {
    const antes = (await entorno.eventosDe(PROPINA)).length;
    const fijado = await comoAna(() => fijar.ejecutar({ codigo: PROPINA, alcance: 'SUCURSAL', sucursalId: organizacion.jockey, valor: 2, actorId: organizacion.usuarioId }));
    expect(fijado.cambiado).toBe(false);
    expect(await entorno.eventosDe(PROPINA)).toHaveLength(antes);
  });

  it('TR-CA-083: 12 en la empresa de Arequipa y nada en «Cayma»: resuelve 12 con origen EMPRESA', async () => {
    await comoAna(() => fijar.ejecutar({ codigo: PROPINA, alcance: 'EMPRESA', empresaId: organizacion.empresaArequipa, valor: 12, actorId: organizacion.usuarioId }));
    expect(await resolver(organizacion.cayma)).toEqual({ valor: 12, origen: 'EMPRESA' });
  });

  it('TR-CA-082: 25 se rechaza y no deja fila ni evento', async () => {
    const antes = (await entorno.eventosDe(PROPINA)).length;
    await expect(comoAna(() => fijar.ejecutar({ codigo: PROPINA, alcance: 'SUCURSAL', sucursalId: organizacion.miraflores, valor: 25, actorId: organizacion.usuarioId }))).rejects.toThrow(
      new ValorInvalidoError('El valor debe estar entre 0 y 20'),
    );
    expect(await entorno.eventosDe(PROPINA)).toHaveLength(antes);
  });

  it('TR-CA-086: restablecer Jockey vuelve a heredar 10 del tenant y publica restablecido', async () => {
    const restablecido = await comoAna(() =>
      restablecer.ejecutar({ codigo: PROPINA, alcance: 'SUCURSAL', sucursalId: organizacion.jockey, confirmar: true, actorId: organizacion.usuarioId }),
    );
    expect(restablecido).toEqual({ efectivo: { valor: 10, origen: 'TENANT' } });
    expect((await entorno.eventosDe(PROPINA)).at(-1)?.payload).toMatchObject({ valor_anterior: 2, valor: null, restablecido: true });
  });

  it('TR-CA-087: restablecer el tenant sin otros niveles en esa sucursal resuelve el defecto', async () => {
    const restablecido = await comoAna(() => restablecer.ejecutar({ codigo: PROPINA, alcance: 'TENANT', confirmar: true, actorId: organizacion.usuarioId }));
    expect(restablecido).toEqual({ efectivo: { valor: 10, origen: 'DEFECTO' } });
    expect(await resolver(organizacion.miraflores)).toEqual({ valor: 10, origen: 'DEFECTO' });
  });

  it('un parámetro obsoleto no admite valores nuevos', async () => {
    await expect(comoAna(() => fijar.ejecutar({ codigo: 'rest.salon.retirado', alcance: 'TENANT', valor: 3, actorId: organizacion.usuarioId }))).rejects.toThrow(
      ParametroObsoletoError,
    );
  });

  it('un actor sin alcance de tenant no fija a nivel tenant (403)', async () => {
    entorno.negar.alcances.add('TENANT');
    try {
      await expect(comoAna(() => fijar.ejecutar({ codigo: PROPINA, alcance: 'TENANT', valor: 15, actorId: organizacion.usuarioId }))).rejects.toThrow(ActorSinAlcanceError);
    } finally {
      entorno.negar.alcances.clear();
    }
  });

  it('una sucursal de otro tenant no se escribe', async () => {
    const otra = await entorno.organizacion();
    await expect(
      comoAna(() => fijar.ejecutar({ codigo: PROPINA, alcance: 'SUCURSAL', sucursalId: otra.jockey, valor: 5, actorId: organizacion.usuarioId })),
    ).rejects.toThrow();
    const [{ cantidad }] = await entorno.dataSource.query('SELECT count(*)::int AS cantidad FROM cfg.parametro_valor WHERE sucursal_id = $1', [otra.jockey]);
    expect(cantidad).toBe(0);
  });

  it('un cambio concurrente sobre la misma fila da ConflictError (bloqueo optimista)', async () => {
    await comoAna(() => fijar.ejecutar({ codigo: PROPINA, alcance: 'SUCURSAL', sucursalId: organizacion.miraflores, valor: 4, actorId: organizacion.usuarioId }));
    const { valores, unidadDeTrabajo } = entorno.dependencias;
    await expect(
      comoAna(() =>
        unidadDeTrabajo.run(async () => {
          const ambito = { alcance: 'SUCURSAL' as const, empresaId: null, sucursalId: organizacion.miraflores };
          const leido = await valores.buscar(PROPINA, ambito);
          if (!leido) throw new NotFoundError('sin fila');
          await entorno.dataSource.query('UPDATE cfg.parametro_valor SET version = version + 1 WHERE id = $1', [leido.id]);
          leido.cambiar(6, organizacion.usuarioId, new Date());
          await valores.guardar(leido);
        }),
      ),
    ).rejects.toThrow(ConflictError);
  });
});
