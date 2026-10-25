import type { DomainEvent, TenantScope } from '@vitrina/plataforma/kernel';
import { ActorSinAlcanceError, ConfirmacionRequeridaError, type DestinoAlcance } from '@vitrina/plataforma/seguridad';
import type { DependenciasValores } from '../src/application/dependencias-valores.js';
import { FijarValor } from '../src/application/fijar-valor.js';
import type { RepositorioValores, ValorEfectivo } from '../src/application/ports/repositorios.js';
import { RestablecerValor } from '../src/application/restablecer-valor.js';
import { DefinicionParametro, type DatosDefinicion } from '../src/domain/definicion-parametro.js';
import {
  AlcanceNoPermitidoError,
  AmbitoValorInvalidoError,
  ParametroNoDefinidoError,
  ParametroObsoletoError,
  ValorInvalidoError,
  ValorNoConfiguradoError,
} from '../src/domain/errores.js';
import type { AmbitoValor } from '../src/domain/tipos.js';
import type { ValorParametro } from '../src/domain/valor-parametro.js';
import { ValidadorEsquemaAjv } from '../src/infrastructure/ajv/validador-esquema.ajv.js';

const TENANT = '0193f3a0-0000-7000-8000-000000000001';
const JOCKEY = '0193f3a0-0000-7000-8000-000000000101';
const ANA = '0193f3a0-0000-7000-8000-000000000901';
const AHORA = new Date('2026-10-24T15:00:00Z');
const esquemas = new ValidadorEsquemaAjv();

const definicion = (cambios: Partial<DatosDefinicion> = {}, obsoleto = false): DefinicionParametro =>
  DefinicionParametro.reconstituir({
    codigo: 'rest.propina.porcentaje',
    productoCodigo: 'REST',
    descripcion: 'Porcentaje de propina sugerida',
    tipo: 'NUMERO',
    valorDefecto: 10,
    alcanceMaximo: 'SUCURSAL',
    esquema: { minimum: 0, maximum: 20 },
    ...cambios,
    obsoleto,
  });

const claveDe = (codigo: string, ambito: AmbitoValor) => `${codigo}|${ambito.alcance}|${ambito.empresaId}|${ambito.sucursalId}`;

class ValoresEnMemoria implements RepositorioValores {
  readonly guardados = new Map<string, ValorParametro>();
  escrituras = 0;
  eliminaciones = 0;

  async buscar(codigo: string, ambito: AmbitoValor) {
    return this.guardados.get(claveDe(codigo, ambito)) ?? null;
  }

  async guardar(valorParametro: ValorParametro) {
    this.escrituras += 1;
    this.guardados.set(claveDe(valorParametro.codigo, valorParametro.ambito), valorParametro);
  }

  async eliminar(valorParametro: ValorParametro) {
    this.eliminaciones += 1;
    this.guardados.delete(claveDe(valorParametro.codigo, valorParametro.ambito));
  }
}

interface Escenario {
  dependencias: DependenciasValores;
  valores: ValoresEnMemoria;
  publicados: DomainEvent[];
  enTransaccion: { activa: boolean };
}

function escenario(opciones: { definiciones?: DefinicionParametro[]; actorCubre?: (destino: DestinoAlcance) => boolean; efectivo?: ValorEfectivo } = {}): Escenario {
  const definiciones = new Map((opciones.definiciones ?? [definicion()]).map((def) => [def.codigo, def]));
  const valores = new ValoresEnMemoria();
  const publicados: DomainEvent[] = [];
  const enTransaccion = { activa: false };
  const alcance: TenantScope = { tenantId: TENANT };
  let siguienteId = 0;
  const dependencias: DependenciasValores = {
    unidadDeTrabajo: {
      run: async (trabajo) => {
        enTransaccion.activa = true;
        try {
          return await trabajo();
        } finally {
          enTransaccion.activa = false;
        }
      },
    },
    contexto: { current: () => alcance, run: (_alcance, trabajo) => trabajo() },
    ids: { next: () => `0193f3a0-0000-7000-8000-00000000a${String(++siguienteId).padStart(3, '0')}` },
    reloj: { now: () => AHORA },
    eventos: {
      publish: async (evento) => {
        expect(enTransaccion.activa).toBe(true);
        publicados.push(evento);
      },
    },
    definiciones: { buscar: async (codigo) => definiciones.get(codigo) ?? null },
    valores,
    resolucion: { valor: async () => opciones.efectivo ?? { valor: 10, origen: 'TENANT' }, versiones: async () => ({ vt: 1, vd: 1 }) },
    alcanceActor: { cubre: async (_usuarioId, destino) => (opciones.actorCubre ?? (() => true))(destino) },
    esquemas,
  };
  return { dependencias, valores, publicados, enTransaccion };
}

const fijarEnJockey = (valor: unknown = 0) => ({ codigo: 'rest.propina.porcentaje', alcance: 'SUCURSAL' as const, sucursalId: JOCKEY, valor, actorId: ANA });

describe('FijarValor (TR-RF-031)', () => {
  it('TR-CA-080: fija 0 en «Food court Jockey» y publica parametro.cambiado en la transacción', async () => {
    const { dependencias, valores, publicados } = escenario();
    const fijado = await new FijarValor(dependencias).ejecutar(fijarEnJockey(0));

    expect(fijado).toMatchObject({ alcance: 'SUCURSAL', empresaId: null, sucursalId: JOCKEY, valor: 0, cambiado: true, modificadoEn: AHORA });
    expect(valores.escrituras).toBe(1);
    expect(publicados).toHaveLength(1);
    expect(publicados[0].payload).toMatchObject({ codigo: 'rest.propina.porcentaje', valor_anterior: null, valor: 0, restablecido: false, por: ANA });
  });

  it('cambiar un valor existente publica el valor anterior', async () => {
    const { dependencias, publicados } = escenario();
    const fijar = new FijarValor(dependencias);
    await fijar.ejecutar(fijarEnJockey(0));
    await fijar.ejecutar(fijarEnJockey(5));
    expect(publicados[1].payload).toMatchObject({ valor_anterior: 0, valor: 5 });
  });

  it('fijar el mismo valor no escribe ni publica (TR-RNF-008)', async () => {
    const { dependencias, valores, publicados } = escenario();
    const fijar = new FijarValor(dependencias);
    await fijar.ejecutar(fijarEnJockey(0));
    expect(await fijar.ejecutar(fijarEnJockey(0))).toMatchObject({ cambiado: false, valor: 0 });
    expect(valores.escrituras).toBe(1);
    expect(publicados).toHaveLength(1);
  });

  it('TR-CA-081: máximo EMPRESA en una sucursal se rechaza', async () => {
    const moneda = definicion({ codigo: 'plat.factura.moneda_defecto', productoCodigo: 'PLAT', tipo: 'TEXTO', valorDefecto: 'PEN', alcanceMaximo: 'EMPRESA', esquema: null });
    const { dependencias, valores } = escenario({ definiciones: [moneda] });
    await expect(
      new FijarValor(dependencias).ejecutar({ codigo: 'plat.factura.moneda_defecto', alcance: 'SUCURSAL', sucursalId: JOCKEY, valor: 'USD', actorId: ANA }),
    ).rejects.toThrow(new AlcanceNoPermitidoError('EMPRESA'));
    expect(valores.escrituras).toBe(0);
  });

  it('TR-CA-082: 25 con rango 0 a 20 se rechaza', async () => {
    const { dependencias } = escenario();
    await expect(new FijarValor(dependencias).ejecutar(fijarEnJockey(25))).rejects.toThrow(new ValorInvalidoError('El valor debe estar entre 0 y 20'));
  });

  it('un tipo equivocado indica el tipo esperado', async () => {
    const { dependencias } = escenario();
    await expect(new FijarValor(dependencias).ejecutar(fijarEnJockey('cero'))).rejects.toThrow('Se esperaba un valor NUMERO');
  });

  it('un código inexistente da PARAMETRO_NO_DEFINIDO', async () => {
    const { dependencias } = escenario();
    await expect(new FijarValor(dependencias).ejecutar({ ...fijarEnJockey(), codigo: 'rest.mesa.color' })).rejects.toThrow(ParametroNoDefinidoError);
  });

  it('un parámetro obsoleto no admite valores nuevos', async () => {
    const { dependencias } = escenario({ definiciones: [definicion({}, true)] });
    await expect(new FijarValor(dependencias).ejecutar(fijarEnJockey())).rejects.toThrow(ParametroObsoletoError);
  });

  it('un actor sin alcance sobre el nivel recibe ACTOR_SIN_ALCANCE y no se escribe nada', async () => {
    const { dependencias, valores, publicados } = escenario({ actorCubre: (destino) => destino.alcance !== 'TENANT' });
    await expect(new FijarValor(dependencias).ejecutar({ codigo: 'rest.propina.porcentaje', alcance: 'TENANT', valor: 12, actorId: ANA })).rejects.toThrow(
      ActorSinAlcanceError,
    );
    expect(valores.escrituras).toBe(0);
    expect(publicados).toEqual([]);
  });

  it('un ámbito incoherente se rechaza antes de abrir la transacción', async () => {
    const { dependencias, valores } = escenario();
    expect(() => new FijarValor(dependencias).ejecutar({ codigo: 'rest.propina.porcentaje', alcance: 'EMPRESA', valor: 1, actorId: ANA })).toThrow(AmbitoValorInvalidoError);
    expect(valores.escrituras).toBe(0);
  });
});

describe('RestablecerValor (TR-RF-033)', () => {
  const restablecerJockey = (confirmar = true) => ({ codigo: 'rest.propina.porcentaje', alcance: 'SUCURSAL' as const, sucursalId: JOCKEY, confirmar, actorId: ANA });

  it('TR-CA-086: borra el valor, publica restablecido y devuelve lo que hereda', async () => {
    const { dependencias, valores, publicados } = escenario({ efectivo: { valor: 10, origen: 'TENANT' } });
    await new FijarValor(dependencias).ejecutar(fijarEnJockey(0));

    expect(await new RestablecerValor(dependencias).ejecutar(restablecerJockey())).toEqual({ efectivo: { valor: 10, origen: 'TENANT' } });
    expect(valores.eliminaciones).toBe(1);
    expect(valores.guardados.size).toBe(0);
    expect(publicados[1].payload).toMatchObject({ valor_anterior: 0, valor: null, restablecido: true, por: ANA });
  });

  it('sin confirmar responde CONFIRMACION_REQUERIDA y no borra', async () => {
    const { dependencias, valores } = escenario();
    await new FijarValor(dependencias).ejecutar(fijarEnJockey(0));
    expect(() => new RestablecerValor(dependencias).ejecutar(restablecerJockey(false))).toThrow(ConfirmacionRequeridaError);
    expect(valores.eliminaciones).toBe(0);
  });

  it('un nivel sin valor da VALOR_NO_CONFIGURADO', async () => {
    const { dependencias } = escenario();
    await expect(new RestablecerValor(dependencias).ejecutar(restablecerJockey())).rejects.toThrow(ValorNoConfiguradoError);
  });

  it('un parámetro obsoleto se puede restablecer', async () => {
    const vigente = escenario();
    await new FijarValor(vigente.dependencias).ejecutar(fijarEnJockey(0));
    const conObsoleto: DependenciasValores = { ...vigente.dependencias, definiciones: { buscar: async () => definicion({}, true) } };
    await expect(new RestablecerValor(conObsoleto).ejecutar(restablecerJockey())).resolves.toMatchObject({ efectivo: { origen: 'TENANT' } });
  });

  it('un actor sin alcance no restablece', async () => {
    const { dependencias, valores } = escenario({ actorCubre: () => false });
    await expect(new RestablecerValor(dependencias).ejecutar(restablecerJockey())).rejects.toThrow(ActorSinAlcanceError);
    expect(valores.eliminaciones).toBe(0);
  });
});
