import { NotFoundError, type DomainEvent, type TenantScope } from '@vitrina/plataforma/kernel';
import { ActorSinAlcanceError, type DestinoAlcance } from '@vitrina/plataforma/seguridad';
import { CambiarEstadoSerie } from '../src/application/cambiar-estado-serie.js';
import { CrearSerie, type CrearSerieComando } from '../src/application/crear-serie.js';
import type { DependenciasSeries } from '../src/application/dependencias-series.js';
import type { RepositorioSeries, UbicacionUnidad } from '../src/application/ports/repositorios.js';
import { AmbitoSerieInvalidoError, SerieInvalidaError, SerieNoEncontradaError } from '../src/domain/errores.js';
import type { Serie } from '../src/domain/serie.js';

const TENANT = '0193f3a0-0000-7000-8000-000000000001';
const EMPRESA = '0193f3a0-0000-7000-8000-000000000011';
const OTRA_EMPRESA = '0193f3a0-0000-7000-8000-000000000012';
const CENTRAL = '0193f3a0-0000-7000-8000-000000000101';
const CAYMA = '0193f3a0-0000-7000-8000-000000000102';
const VENTANILLA = '0193f3a0-0000-7000-8000-000000000201';
const ANA = '0193f3a0-0000-7000-8000-000000000901';
const AHORA = new Date('2026-10-24T15:00:00Z');

class SeriesEnMemoria implements RepositorioSeries {
  readonly guardadas = new Map<string, Serie>();
  escrituras = 0;

  async buscar(id: string) {
    return this.guardadas.get(id) ?? null;
  }

  async insertar(serie: Serie) {
    this.escrituras += 1;
    this.guardadas.set(serie.id, serie);
  }

  async guardarEstado(serie: Serie) {
    this.escrituras += 1;
    this.guardadas.set(serie.id, serie);
  }
}

interface Escenario {
  dependencias: DependenciasSeries;
  series: SeriesEnMemoria;
  publicados: DomainEvent[];
  destinos: DestinoAlcance[];
}

function escenario(opciones: { actorCubre?: (destino: DestinoAlcance) => boolean } = {}): Escenario {
  const series = new SeriesEnMemoria();
  const publicados: DomainEvent[] = [];
  const destinos: DestinoAlcance[] = [];
  const enTransaccion = { activa: false };
  const alcance: TenantScope = { tenantId: TENANT };
  const sucursales = new Map([
    [CENTRAL, EMPRESA],
    [CAYMA, EMPRESA],
  ]);
  const unidades = new Map<string, UbicacionUnidad>([[VENTANILLA, { empresaId: EMPRESA, sucursalId: CAYMA }]]);
  let siguienteId = 0;
  const dependencias: DependenciasSeries = {
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
    ids: { next: () => `0193f3a0-0000-7000-8000-00000000b${String(++siguienteId).padStart(3, '0')}` },
    reloj: { now: () => AHORA },
    eventos: {
      publish: async (evento) => {
        expect(enTransaccion.activa).toBe(true);
        publicados.push(evento);
      },
    },
    series,
    ubicaciones: {
      sucursalDeUnidad: async (unidadId) => unidades.get(unidadId) ?? null,
      empresaDeSucursal: async (sucursalId) => sucursales.get(sucursalId) ?? null,
    },
    alcanceActor: {
      cubre: async (_usuarioId, destino) => {
        destinos.push(destino);
        return (opciones.actorCubre ?? (() => true))(destino);
      },
    },
  };
  return { dependencias, series, publicados, destinos };
}

const boletaEnCayma = (cambios: Partial<CrearSerieComando> = {}): CrearSerieComando => ({
  empresaId: EMPRESA,
  sucursalId: CAYMA,
  tipo: 'BOLETA',
  codigo: 'B002',
  reinicio: 'NUNCA',
  ultimoNumero: 0,
  actorId: ANA,
  ...cambios,
});

describe('CrearSerie (TR-RF-035)', () => {
  it('TR-CA-090: registra B002 en Cayma, verifica el alcance sobre la sucursal y publica en la transacción', async () => {
    const { dependencias, series, publicados, destinos } = escenario();
    const serie = await new CrearSerie(dependencias).ejecutar(boletaEnCayma());

    expect(serie).toMatchObject({ tenantId: TENANT, codigo: 'B002', ultimoNumero: 0, digitos: 8, activa: true });
    expect(serie.ambito).toEqual({ empresaId: EMPRESA, sucursalId: CAYMA, unidadId: null });
    expect(destinos).toEqual([{ alcance: 'SUCURSAL', empresaId: null, sucursalId: CAYMA }]);
    expect(series.escrituras).toBe(1);
    expect(publicados.map((evento) => evento.eventType)).toEqual(['serie.creada']);
  });

  it('TR-CA-092: con la unidad «Ventanilla 1» toma la sucursal de la unidad', async () => {
    const { dependencias } = escenario();
    const serie = await new CrearSerie(dependencias).ejecutar(
      boletaEnCayma({ sucursalId: null, unidadId: VENTANILLA, tipo: 'TICKET', codigo: 'A', digitos: 3, reinicio: 'DIARIO' }),
    );
    expect(serie.ambito).toEqual({ empresaId: EMPRESA, sucursalId: CAYMA, unidadId: VENTANILLA });
    expect(serie.reinicio).toBe('DIARIO');
  });

  it('sin sucursal verifica el alcance sobre la empresa', async () => {
    const { dependencias, destinos } = escenario();
    await new CrearSerie(dependencias).ejecutar(boletaEnCayma({ sucursalId: null, tipo: 'KARDEX', codigo: 'K' }));
    expect(destinos).toEqual([{ alcance: 'EMPRESA', empresaId: EMPRESA, sucursalId: null }]);
  });

  it('una unidad de otra sucursal da 400', async () => {
    const { dependencias, series } = escenario();
    await expect(new CrearSerie(dependencias).ejecutar(boletaEnCayma({ sucursalId: CENTRAL, unidadId: VENTANILLA, tipo: 'TICKET', codigo: 'A' }))).rejects.toThrow(
      new AmbitoSerieInvalidoError('La unidad no pertenece a la sucursal'),
    );
    expect(series.escrituras).toBe(0);
  });

  it('una unidad o sucursal de otra empresa da 400', async () => {
    const { dependencias } = escenario();
    const crear = new CrearSerie(dependencias);
    await expect(crear.ejecutar(boletaEnCayma({ empresaId: OTRA_EMPRESA, sucursalId: null, unidadId: VENTANILLA, tipo: 'TICKET', codigo: 'A' }))).rejects.toThrow(
      new AmbitoSerieInvalidoError('La unidad no pertenece a la empresa'),
    );
    await expect(crear.ejecutar(boletaEnCayma({ empresaId: OTRA_EMPRESA }))).rejects.toThrow(
      new AmbitoSerieInvalidoError('La sucursal no pertenece a la empresa'),
    );
  });

  it('una unidad o sucursal que no se ve (otro tenant) da 404', async () => {
    const { dependencias } = escenario();
    const crear = new CrearSerie(dependencias);
    const ajena = '0193f3a0-0000-7000-8000-00000000f001';
    await expect(crear.ejecutar(boletaEnCayma({ unidadId: ajena }))).rejects.toThrow(NotFoundError);
    await expect(crear.ejecutar(boletaEnCayma({ sucursalId: ajena }))).rejects.toThrow(NotFoundError);
  });

  it('un actor sin alcance sobre la sucursal da 403 y no escribe', async () => {
    const { dependencias, series, publicados } = escenario({ actorCubre: (destino) => destino.sucursalId !== CAYMA });
    await expect(new CrearSerie(dependencias).ejecutar(boletaEnCayma())).rejects.toThrow(ActorSinAlcanceError);
    expect(series.escrituras).toBe(0);
    expect(publicados).toEqual([]);
  });

  it('TR-CA-091: una serie inválida no escribe ni publica', async () => {
    const { dependencias, series, publicados } = escenario();
    await expect(new CrearSerie(dependencias).ejecutar(boletaEnCayma({ tipo: 'FACTURA', codigo: 'B001' }))).rejects.toThrow(
      new SerieInvalidaError('Las series de factura deben iniciar con F y tener 4 caracteres'),
    );
    expect(series.escrituras).toBe(0);
    expect(publicados).toEqual([]);
  });
});

describe('CambiarEstadoSerie', () => {
  const crearB002 = async (entorno: Escenario) => {
    const serie = await new CrearSerie(entorno.dependencias).ejecutar(boletaEnCayma());
    entorno.publicados.length = 0;
    entorno.series.escrituras = 0;
    entorno.destinos.length = 0;
    return serie;
  };

  it('desactivar escribe y publica serie.estado_cambiado', async () => {
    const entorno = escenario();
    const serie = await crearB002(entorno);
    const resultado = await new CambiarEstadoSerie(entorno.dependencias).ejecutar({ serieId: serie.id, activa: false, actorId: ANA });

    expect(resultado).toEqual({ id: serie.id, activa: false, modificadoEn: AHORA, cambiado: true });
    expect(entorno.series.escrituras).toBe(1);
    expect(entorno.publicados.map((evento) => evento.payload)).toEqual([{ serie_id: serie.id, tipo: 'BOLETA', serie: 'B002', activa: false, por: ANA }]);
    expect(entorno.destinos).toEqual([{ alcance: 'SUCURSAL', empresaId: null, sucursalId: CAYMA }]);
  });

  it('al mismo estado no escribe ni publica (TR-RNF-008)', async () => {
    const entorno = escenario();
    const serie = await crearB002(entorno);
    const resultado = await new CambiarEstadoSerie(entorno.dependencias).ejecutar({ serieId: serie.id, activa: true, actorId: ANA });
    expect(resultado.cambiado).toBe(false);
    expect(entorno.series.escrituras).toBe(0);
    expect(entorno.publicados).toEqual([]);
  });

  it('una serie inexistente da SERIE_NO_ENCONTRADA', async () => {
    const { dependencias } = escenario();
    await expect(
      new CambiarEstadoSerie(dependencias).ejecutar({ serieId: '0193f3a0-0000-7000-8000-00000000f002', activa: false, actorId: ANA }),
    ).rejects.toThrow(SerieNoEncontradaError);
  });

  it('un actor sin alcance sobre la sucursal de la serie da 403 y no escribe', async () => {
    const entorno = escenario();
    const serie = await crearB002(entorno);
    entorno.dependencias.alcanceActor = { cubre: async () => false };
    await expect(new CambiarEstadoSerie(entorno.dependencias).ejecutar({ serieId: serie.id, activa: false, actorId: ANA })).rejects.toThrow(ActorSinAlcanceError);
    expect(entorno.series.escrituras).toBe(0);
    expect(serie.activa).toBe(true);
  });
});
