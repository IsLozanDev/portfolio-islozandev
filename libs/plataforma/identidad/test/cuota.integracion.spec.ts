import { AlsTenantContext, InMemoryEventSchemaValidator, OutboxPublisher, TypeOrmUnitOfWork, uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { DataSource } from 'typeorm';
import { AjustarCuota } from '../src/application/ajustar-cuota.js';
import { ConsultarDocumento } from '../src/application/consultar-documento.js';
import { ControlCuota } from '../src/application/control-cuota.js';
import type { ConsultorProveedores } from '../src/application/ports/proveedores.js';
import { CuotaAgotadaError, DocumentoInvalidoError, ProveedorNoDisponibleError } from '../src/domain/errores.js';
import { registrarEsquemasIdn } from '../src/infrastructure/event-schemas.js';
import { ProveedorFalso } from '../src/infrastructure/falso/proveedor.falso.js';
import { ProveedorConRespaldo } from '../src/infrastructure/respaldo/proveedor-con-respaldo.js';
import { BitacoraConsultasTypeOrm } from '../src/infrastructure/typeorm/bitacora-consultas.repositorio.js';
import { CacheIdentidadRepositorioTypeOrm } from '../src/infrastructure/typeorm/cache-identidad.repositorio.js';
import { ConfiguracionProveedoresTypeOrm } from '../src/infrastructure/typeorm/configuracion-proveedores.repositorio.js';
import { RepositorioCuotasTypeOrm } from '../src/infrastructure/typeorm/cuota.repositorio.js';
import { ENTIDADES_IDN } from '../src/infrastructure/typeorm/entidades.js';
import { LecturaCuotasConsolaTypeOrm } from '../src/infrastructure/typeorm/lectura-cuotas-consola.js';
import { ConfiguracionCuotaFija, PlanFijo } from './support/cuotas.js';
import { ConsultorEspia, HasherPrueba, RelojFalso } from './support/dobles.js';
import { createTempDb, describeConDb, type TempDb } from './support/temp-db.js';

const OCTUBRE = '2026-10';
const RESERVAS_EN_PARALELO = 50;
const CONSULTAS_RESTANTES = 10;
const DNI_JUANA = '45781236';
const DNI_LUIS = '10293847';
const DNI_VALIDO_CUALQUIERA = '70707070';
const consultaDni = (numero: string) => ({ tipo: 'DNI' as const, numero, motivo: 'REGISTRO_CLIENTE' as const });
const proveedoresCaidos: ConsultorProveedores = { consultar: async () => ({ resultado: 'NO_DISPONIBLE' }) };

describeConDb('ControlCuota con TypeORM (TR-RF-047, PostgreSQL 16)', () => {
  let baseTemporal: TempDb;
  let dataSource: DataSource;
  let contexto: AlsTenantContext;
  let unidadDeTrabajo: TypeOrmUnitOfWork;
  let control: ControlCuota;
  let consultor: ConsultorEspia;
  let consultarDocumento: ConsultarDocumento;
  let consultarSinProveedores: ConsultarDocumento;
  let ajustarCuota: AjustarCuota;

  const reservarComo = (tenantId: string) =>
    contexto.run({ tenantId }, () => unidadDeTrabajo.run(() => control.reservar(tenantId)));
  const liberarComo = (tenantId: string) => contexto.run({ tenantId }, () => unidadDeTrabajo.run(() => control.liberar(tenantId)));

  const sembrar = (tenantId: string, incluidas: number, consumidas: number) =>
    dataSource.query(`INSERT INTO idn.cuota (tenant_id, periodo, plan, incluidas, consumidas) VALUES ($1, $2, 'PRO', $3, $4)`, [
      tenantId,
      OCTUBRE,
      incluidas,
      consumidas,
    ]);
  const cuotaDe = async (tenantId: string) =>
    (await dataSource.query(`SELECT * FROM idn.cuota WHERE tenant_id = $1 AND periodo = $2`, [tenantId, OCTUBRE]))[0];
  const consultarComo = (tenantId: string, numero: string, casoDeUso = consultarDocumento) =>
    contexto.run({ tenantId }, () => casoDeUso.ejecutar(consultaDni(numero)));
  const resultadosEnBitacora = async (tenantId: string): Promise<string[]> =>
    (await dataSource.query(`SELECT resultado FROM idn.consulta_log WHERE tenant_id = $1 ORDER BY id`, [tenantId])).map(
      (fila: { resultado: string }) => fila.resultado,
    );
  const eventosDe = async (tenantId: string): Promise<{ event_type: string; payload: Record<string, unknown> }[]> =>
    dataSource.query(`SELECT event_type, payload FROM sync.outbox WHERE tenant_id = $1 ORDER BY seq`, [tenantId]);

  beforeAll(async () => {
    baseTemporal = await createTempDb();
    // Más conexiones que reservas a la vez: cada una es una transacción propia.
    dataSource = new DataSource({ type: 'postgres', url: baseTemporal.url, entities: ENTIDADES_IDN, extra: { max: 20 } });
    await dataSource.initialize();
    contexto = new AlsTenantContext();
    unidadDeTrabajo = new TypeOrmUnitOfWork(dataSource, contexto);
    const validador = new InMemoryEventSchemaValidator();
    registrarEsquemasIdn(validador);
    const reloj = new RelojFalso(new Date('2026-10-16T12:00:00-05:00'));
    control = new ControlCuota({
      repositorio: new RepositorioCuotasTypeOrm(unidadDeTrabajo),
      planDelTenant: new PlanFijo('PRO'),
      configuracion: new ConfiguracionCuotaFija(),
      publicador: new OutboxPublisher(unidadDeTrabajo, contexto, validador, { next: uuidV7 }),
      reloj,
    });
    consultor = new ConsultorEspia(new ProveedorConRespaldo([new ProveedorFalso()], reloj));
    const dependencias = {
      unidadDeTrabajo,
      contexto,
      reloj,
      cache: new CacheIdentidadRepositorioTypeOrm(unidadDeTrabajo),
      bitacora: new BitacoraConsultasTypeOrm(unidadDeTrabajo),
      configuracion: new ConfiguracionProveedoresTypeOrm(unidadDeTrabajo),
      consultor,
      cuota: control,
      hasher: new HasherPrueba(),
    };
    consultarDocumento = new ConsultarDocumento(dependencias);
    consultarSinProveedores = new ConsultarDocumento({ ...dependencias, consultor: proveedoresCaidos });
    ajustarCuota = new AjustarCuota({
      unidadDeTrabajo,
      contexto,
      reloj,
      verificador: { exigir: async () => undefined },
      repositorio: new RepositorioCuotasTypeOrm(unidadDeTrabajo),
      control,
      publicador: new OutboxPublisher(unidadDeTrabajo, contexto, validador, { next: uuidV7 }),
    });
  });

  afterAll(async () => {
    await dataSource?.destroy();
    await baseTemporal?.drop();
  });

  it('con 10 restantes, 50 reservas en paralelo dan exactamente 10 true, consumidas = incluidas y cada aviso una vez', async () => {
    const tenantId = uuidV7();
    await sembrar(tenantId, 500, 500 - CONSULTAS_RESTANTES);

    const resultados = await Promise.all(Array.from({ length: RESERVAS_EN_PARALELO }, () => reservarComo(tenantId)));

    expect(resultados.filter(Boolean)).toHaveLength(CONSULTAS_RESTANTES);
    expect(await cuotaDe(tenantId)).toMatchObject({ incluidas: 500, consumidas: 500 });
    // 490 de 500 ya pasa el 80 %: la primera reserva avisa el umbral y la última, la agotada. Una vez cada uno.
    expect((await eventosDe(tenantId)).map((evento) => evento.event_type)).toEqual(['cuota.umbral_alcanzado', 'cuota.agotada']);
  });

  it('el umbral se publica una sola vez aunque varias reservas concurrentes lo crucen', async () => {
    const tenantId = uuidV7();
    await sembrar(tenantId, 500, 395);

    await Promise.all(Array.from({ length: 20 }, () => reservarComo(tenantId)));

    const eventos = await eventosDe(tenantId);
    expect(eventos.map((evento) => evento.event_type)).toEqual(['cuota.umbral_alcanzado']);
    expect(eventos[0].payload).toMatchObject({ tenant_id: tenantId, periodo: OCTUBRE, incluidas: 500, umbral: 80 });
    expect(await cuotaDe(tenantId)).toMatchObject({ consumidas: 415 });
  });

  it('TR-CA-120: la consulta 400 de 500 deja 400 y escribe el umbral con 80 % en el outbox', async () => {
    const tenantId = uuidV7();
    await sembrar(tenantId, 500, 399);

    expect(await reservarComo(tenantId)).toBe(true);

    expect(await cuotaDe(tenantId)).toMatchObject({ consumidas: 400 });
    expect(await eventosDe(tenantId)).toEqual([
      {
        event_type: 'cuota.umbral_alcanzado',
        payload: { tenant_id: tenantId, periodo: OCTUBRE, incluidas: 500, consumidas: 400, porcentaje: 80, umbral: 80 },
      },
    ]);
  });

  it('sin fila del periodo la crea con las incluidas de su plan y reserva una', async () => {
    const tenantId = uuidV7();

    expect(await reservarComo(tenantId)).toBe(true);

    expect(await cuotaDe(tenantId)).toMatchObject({ plan: 'PRO', incluidas: 500, consumidas: 1, version: 1 });
  });

  it('liberar devuelve la unidad y no baja de 0', async () => {
    const tenantId = uuidV7();
    await sembrar(tenantId, 500, 0);

    await reservarComo(tenantId);
    await liberarComo(tenantId);
    await liberarComo(tenantId);

    expect(await cuotaDe(tenantId)).toMatchObject({ consumidas: 0 });
  });

  describe('ConsultarDocumento con la cuota real', () => {
    it('TR-CA-121: 500 de 500 y DNI fuera de caché → CuotaAgotadaError, bitácora CUOTA_AGOTADA y el proveedor no se llama', async () => {
      const tenantId = uuidV7();
      await sembrar(tenantId, 500, 500);
      const llamadasAntes = consultor.llamadas;

      await expect(consultarComo(tenantId, DNI_JUANA)).rejects.toThrow(CuotaAgotadaError);

      expect(consultor.llamadas).toBe(llamadasAntes);
      expect(await resultadosEnBitacora(tenantId)).toEqual(['CUOTA_AGOTADA']);
      expect(await cuotaDe(tenantId)).toMatchObject({ consumidas: 500 });
    });

    it('TR-CA-122: cuota agotada y DNI vigente en caché → responde CACHE y consumidas no cambia', async () => {
      const otroTenant = uuidV7();
      await sembrar(otroTenant, 500, 0);
      await consultarComo(otroTenant, DNI_LUIS);
      const tenantId = uuidV7();
      await sembrar(tenantId, 500, 500);

      const respuesta = await consultarComo(tenantId, DNI_LUIS);

      expect(respuesta.fuente).toBe('CACHE');
      expect(await cuotaDe(tenantId)).toMatchObject({ consumidas: 500 });
      expect(await cuotaDe(otroTenant)).toMatchObject({ consumidas: 1 });
    });

    it('TR-RN-031: un documento inválido no consume cuota', async () => {
      const tenantId = uuidV7();
      await sembrar(tenantId, 500, 10);

      await expect(consultarComo(tenantId, '1234')).rejects.toThrow(DocumentoInvalidoError);

      expect(await cuotaDe(tenantId)).toMatchObject({ consumidas: 10 });
    });

    it('si fallan todos los proveedores, consumidas vuelve al valor previo a la reserva', async () => {
      const tenantId = uuidV7();
      await sembrar(tenantId, 500, 42);

      await expect(consultarComo(tenantId, DNI_VALIDO_CUALQUIERA, consultarSinProveedores)).rejects.toThrow(ProveedorNoDisponibleError);

      expect(await cuotaDe(tenantId)).toMatchObject({ consumidas: 42 });
      expect(await resultadosEnBitacora(tenantId)).toEqual(['PROVEEDOR_NO_DISPONIBLE']);
    });
  });

  describe('Consola del operador', () => {
    const operador = uuidV7();
    const actor = uuidV7();
    const nuevoTenant = async (nombre: string) => {
      const tenantId = uuidV7();
      await dataSource.query(`INSERT INTO org.tenant (id, codigo, nombre, estado, version) VALUES ($1, $2, $3, 'ACTIVO', 1)`, [
        tenantId,
        `cuota-${tenantId.slice(-12)}`,
        nombre,
      ]);
      return tenantId;
    };
    const comoOperador = <T>(trabajo: () => Promise<T>) => contexto.run({ tenantId: operador, actorId: actor }, trabajo);
    const lectura = () => new LecturaCuotasConsolaTypeOrm(unidadDeTrabajo);

    it('lista todos los tenants del periodo desde el contexto del operador, de mayor a menor consumo', async () => {
      const poco = await nuevoTenant('Consola Poco Uso');
      const mucho = await nuevoTenant('Consola Mucho Uso');
      await sembrar(poco, 500, 10);
      await sembrar(mucho, 500, 490);

      const pagina = await comoOperador(() => unidadDeTrabajo.run(() => lectura().delPeriodo({ periodo: OCTUBRE, q: 'consola', limite: 10, desplazamiento: 0 })));

      expect(pagina.total).toBe(2);
      expect(pagina.filas.map((fila) => [fila.tenantNombre, fila.consumidas])).toEqual([
        ['Consola Mucho Uso', 490],
        ['Consola Poco Uso', 10],
      ]);
    });

    it('el detalle trae las consultas del periodo por resultado', async () => {
      const tenantId = await nuevoTenant('Consola Detalle');
      await sembrar(tenantId, 500, 0);
      await consultarComo(tenantId, DNI_JUANA);

      const detalle = await comoOperador(() => unidadDeTrabajo.run(() => lectura().detalle(tenantId, OCTUBRE)));

      expect(detalle).toMatchObject({ tenantNombre: 'Consola Detalle', consumidas: expect.any(Number) });
      expect(Object.keys(detalle?.consultasPorResultado ?? {}).sort()).toEqual(
        ['CACHE', 'CUOTA_AGOTADA', 'INVALIDO', 'NO_ENCONTRADO', 'PROVEEDOR', 'PROVEEDOR_NO_DISPONIBLE'],
      );
      const total = Object.values(detalle?.consultasPorResultado ?? {}).reduce((suma, cantidad) => suma + cantidad, 0);
      expect(total).toBe(1);
      expect(await comoOperador(() => unidadDeTrabajo.run(() => lectura().detalle(tenantId, '2026-09')))).toBeNull();
    });

    it('el ajuste cambia las incluidas y deja cuota.ajustada en el outbox del tenant de la cuota, con el operador como actor', async () => {
      const tenantId = await nuevoTenant('Consola Ajuste');
      await sembrar(tenantId, 500, 450);

      await comoOperador(() => ajustarCuota.ejecutar({ tenantId, periodo: OCTUBRE, incluidas: 800, version: 1, actorId: actor }));

      expect(await cuotaDe(tenantId)).toMatchObject({ incluidas: 800, version: 2 });
      const eventos = await dataSource.query(`SELECT tenant_id, actor_id, event_type, payload FROM sync.outbox WHERE event_type = 'cuota.ajustada' AND tenant_id = $1`, [
        tenantId,
      ]);
      expect(eventos).toEqual([
        {
          tenant_id: tenantId,
          actor_id: actor,
          event_type: 'cuota.ajustada',
          payload: { tenant_id: tenantId, periodo: OCTUBRE, incluidas_anteriores: 500, incluidas: 800, actor_id: actor },
        },
      ]);
    });
  });
});
