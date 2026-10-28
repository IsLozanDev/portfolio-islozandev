import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ENTIDADES_SEQ, registrarEsquemasSeq, SembrarSeriesIniciales } from '@vitrina/plataforma/correlativos';
import { ENTIDADES_EVT } from '@vitrina/plataforma/eventos';
import { CLOCK, ID_GENERATOR, InMemoryEventSchemaValidator, TENANT_CONTEXT, TypeOrmUnitOfWork, uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { CrearTenant, fechaCalendarioDe, GestionarSuscripcion, registrarEsquemasOrg, RegistrarEmpresa, sumarDias, TenantRepositorioTypeOrm } from '@vitrina/plataforma/org';
import { ENTIDADES_CFG, PARAMETRO_PORT, registrarEsquemasCfg } from '@vitrina/plataforma/parametros';
import {
  AplicarManifiesto,
  IdentidadNoDisponibleError,
  InvitarPropietario,
  ManifiestoRepositorioTypeOrm,
  PROVEEDOR_IDENTIDAD,
  REGISTRO_ACCESO,
  registrarEsquemasSeg,
  type ProveedorIdentidad,
} from '@vitrina/plataforma/seguridad';
import { AppModule } from '../src/app.module.js';
import { AltaTenant, TenantDuplicadoError, type AltaTenantComando, type DependenciasAlta } from '../src/org/alta-tenant.js';
import { OperadorRequeridoError } from '../src/org/operador.js';
import { TenantsPorCodigoTypeOrm } from '../src/org/tenants-por-codigo.typeorm.js';
import { crearBaseTemporal, describeConDb, type BaseTemporal } from './support/temp-db.js';

const DIAS_PRUEBA = 15;
const RUTA_MANIFIESTO = new URL('../../../libs/plataforma/seguridad/manifiesto/plat.manifiesto.json', import.meta.url);

/** Doble de Supabase Admin: al invitar inserta `seg.usuario` como lo haría el trigger de `auth.users`. */
class ProveedorFalso implements ProveedorIdentidad {
  readonly llamadas: { tipo: 'invitar' | 'enlace'; correo: string }[] = [];
  fallar = false;

  constructor(private readonly dataSource: DataSource) {}

  async invitar(correo: string, nombre: string): Promise<{ usuarioId: string }> {
    if (this.fallar) throw new IdentidadNoDisponibleError('falso');
    this.llamadas.push({ tipo: 'invitar', correo });
    const usuarioId = randomUUID();
    await this.dataSource.query(`INSERT INTO seg.usuario (id, email, nombre, tipo, estado) VALUES ($1, $2, $3, 'EXTERNO', 'ACTIVO')`, [usuarioId, correo, nombre]);
    return { usuarioId };
  }

  async enviarEnlace(correo: string): Promise<void> {
    if (this.fallar) throw new IdentidadNoDisponibleError('falso');
    this.llamadas.push({ tipo: 'enlace', correo });
  }
}

describeConDb('AltaTenant contra PostgreSQL 16 (TR-RF-001)', () => {
  let base: BaseTemporal;
  let dataSource: DataSource;
  let app: INestApplication;
  let proveedor: ProveedorFalso;
  let dependencias: DependenciasAlta;
  const operador = uuidV7();
  const cliente = uuidV7();
  const admin = uuidV7();

  const comando = (cambios: Partial<AltaTenantComando> = {}): AltaTenantComando => ({
    codigo: 'polleria-dona-rosa',
    nombre: 'Pollería Doña Rosa',
    productoCodigo: 'REST',
    plan: 'BASICO',
    modalidad: 'PRUEBA',
    ruc: '20601234565',
    razonSocial: 'Pollería Doña Rosa SAC',
    correoPropietario: 'rosa.quispe@gmail.com',
    nombrePropietario: 'Rosa Quispe',
    actor: { usuarioId: admin, tenantId: operador },
    ...cambios,
  });
  const alta = (cambios: Partial<DependenciasAlta> = {}) => new AltaTenant({ ...dependencias, ...cambios });
  const consultar = (sql: string, parametros: unknown[] = []) => dataSource.query(sql, parametros);
  const contar = async (sql: string, parametros: unknown[] = []) => Number((await consultar(sql, parametros))[0].n);
  /** Filas de un tenant en cada esquema que toca el alta. */
  const filasDe = async (codigo: string) => {
    const [tenant] = await consultar('SELECT id FROM org.tenant WHERE codigo = $1', [codigo]);
    return tenant ? contar('SELECT count(*) AS n FROM sync.outbox WHERE tenant_id = $1', [tenant.id]) : 0;
  };

  beforeAll(async () => {
    base = await crearBaseTemporal();
    dataSource = new DataSource({ type: 'postgres', url: base.url, entities: [...ENTIDADES_CFG, ...ENTIDADES_SEQ, ...ENTIDADES_EVT] });
    await dataSource.initialize();
    const validator = new InMemoryEventSchemaValidator();
    registrarEsquemasOrg(validator);
    registrarEsquemasSeg(validator);
    registrarEsquemasCfg(validator);
    registrarEsquemasSeq(validator);

    proveedor = new ProveedorFalso(dataSource);
    const modulo = await Test.createTestingModule({
      imports: [
        AppModule.register({
          dataSource,
          validator,
          supabaseUrl: 'https://proyecto-prueba.supabase.co',
          mfaMaxEdadSeg: 900,
          redisUrl: 'redis://127.0.0.1:6379',
          invitaciones: { supabaseSecretKey: 'sb_secret_prueba', url: 'https://app.vitrina.pe/auth/invitacion' },
          reintentosEventos: { intentos: 8, esperaBaseMs: 5000, esperaMaximaMs: 600_000 },
          tenantOperador: 'plataforma',
        }),
      ],
    })
      .overrideProvider(REGISTRO_ACCESO)
      .useValue({ marcar: async () => undefined })
      .overrideProvider(PROVEEDOR_IDENTIDAD)
      .useValue(proveedor)
      // CFG ya tiene sus pruebas: aquí solo importa que el alta use el valor que resuelve.
      .overrideProvider(PARAMETRO_PORT)
      .useValue({ valor: async () => ({ valor: DIAS_PRUEBA, origen: 'DEFECTO' }) })
      .compile();
    app = modulo.createNestApplication({ logger: false });
    await app.init();

    const unidadDeTrabajo = app.get(TypeOrmUnitOfWork);
    const contexto = app.get(TENANT_CONTEXT);
    dependencias = {
      unidadDeTrabajo,
      contexto,
      ids: app.get(ID_GENERATOR),
      reloj: app.get(CLOCK),
      tenants: new TenantRepositorioTypeOrm(unidadDeTrabajo, contexto),
      tenantsPorCodigo: new TenantsPorCodigoTypeOrm(dataSource),
      parametros: app.get(PARAMETRO_PORT),
      crearTenant: app.get(CrearTenant),
      gestionarSuscripcion: app.get(GestionarSuscripcion),
      registrarEmpresa: app.get(RegistrarEmpresa),
      sembrarSeries: app.get(SembrarSeriesIniciales),
      invitarPropietario: app.get(InvitarPropietario),
      tenantOperador: 'plataforma',
    };

    await new AplicarManifiesto(new ManifiestoRepositorioTypeOrm(dataSource, { next: uuidV7 })).ejecutar(JSON.parse(await readFile(RUTA_MANIFIESTO, 'utf8')));
    await consultar(`INSERT INTO org.tenant (id, codigo, nombre, estado, version) VALUES ($1, 'plataforma', 'Plataforma', 'ACTIVO', 1), ($2, 'cliente-x', 'Cliente X', 'ACTIVO', 1)`, [
      operador,
      cliente,
    ]);
    await consultar(`INSERT INTO seg.usuario (id, email, nombre, tipo, estado) VALUES ($1, 'admin@vitrina.pe', 'Admin Plataforma', 'INTERNO', 'ACTIVO')`, [admin]);
  });

  beforeEach(() => {
    proveedor.llamadas.length = 0;
    proveedor.fallar = false;
  });

  afterAll(async () => {
    await app?.close();
    await dataSource?.destroy();
    await base?.borrar();
  });

  it('TR-CA-001: polleria-dona-rosa en PRUEBA con suscripción, sucursal 0000, B001, F001 y la propietaria invitada', async () => {
    const resultado = await alta().ejecutar(comando());
    const hoy = fechaCalendarioDe(new Date());

    expect(resultado).toMatchObject({ estado: 'PRUEBA', vigenteHasta: sumarDias(hoy, DIAS_PRUEBA), usuarioNuevo: true, correoEnviado: true });
    expect(proveedor.llamadas).toEqual([{ tipo: 'invitar', correo: 'rosa.quispe@gmail.com' }]);

    const { tenantId } = resultado;
    expect(await consultar('SELECT estado FROM org.tenant WHERE id = $1', [tenantId])).toEqual([{ estado: 'PRUEBA' }]);
    expect(await consultar('SELECT producto_codigo, plan, estado, vigente_hasta::text AS vigente_hasta FROM org.suscripcion WHERE tenant_id = $1', [tenantId])).toEqual([
      { producto_codigo: 'REST', plan: 'BASICO', estado: 'PRUEBA', vigente_hasta: sumarDias(hoy, DIAS_PRUEBA) },
    ]);
    expect(await consultar('SELECT es_principal, codigo_establecimiento_sunat FROM org.sucursal WHERE tenant_id = $1', [tenantId])).toEqual([
      { es_principal: true, codigo_establecimiento_sunat: '0000' },
    ]);
    expect(await consultar('SELECT tipo, serie, digitos, sucursal_id FROM seq.serie WHERE tenant_id = $1 ORDER BY serie', [tenantId])).toEqual([
      { tipo: 'BOLETA', serie: 'B001', digitos: 8, sucursal_id: resultado.sucursalId },
      { tipo: 'FACTURA', serie: 'F001', digitos: 8, sucursal_id: resultado.sucursalId },
    ]);
    expect(
      await consultar(
        `SELECT m.estado, m.es_propietario, r.codigo AS rol, a.alcance FROM seg.membresia m
           JOIN seg.asignacion a ON a.membresia_id = m.id JOIN seg.rol r ON r.id = a.rol_id WHERE m.tenant_id = $1`,
        [tenantId],
      ),
    ).toEqual([{ estado: 'INVITADO', es_propietario: true, rol: 'PLAT_PROPIETARIO', alcance: 'TENANT' }]);
    expect(await contar('SELECT count(*) AS n FROM seg.invitacion WHERE tenant_id = $1 AND usada_en IS NULL', [tenantId])).toBe(1);

    const eventos = (await consultar('SELECT event_type FROM sync.outbox WHERE tenant_id = $1 ORDER BY seq', [tenantId])).map((fila: { event_type: string }) => fila.event_type);
    expect(eventos.sort()).toEqual(
      ['tenant.creado', 'suscripcion.cambiada', 'empresa.creada', 'sucursal.creada', 'serie.creada', 'serie.creada', 'membresia.invitada', 'asignacion.otorgada'].sort(),
    );
  });

  it('TR-CA-002: con polleria-dona-rosa existente, otra alta falla sin llamar a Supabase ni escribir', async () => {
    const outboxAntes = await contar('SELECT count(*) AS n FROM sync.outbox');
    const membresiasAntes = await contar('SELECT count(*) AS n FROM seg.membresia');

    await expect(alta().ejecutar(comando({ correoPropietario: 'otra@vitrina.pe' }))).rejects.toThrow(TenantDuplicadoError);

    expect(proveedor.llamadas).toEqual([]);
    expect(await contar('SELECT count(*) AS n FROM org.tenant WHERE codigo = $1', ['polleria-dona-rosa'])).toBe(1);
    expect(await contar('SELECT count(*) AS n FROM sync.outbox')).toBe(outboxAntes);
    expect(await contar('SELECT count(*) AS n FROM seg.membresia')).toBe(membresiasAntes);
  });

  it('si la siembra de series falla, no queda ninguna fila del tenant en ningún esquema', async () => {
    const sembrarRoto = { ejecutar: async () => Promise.reject(new Error('seq caído')) };

    await expect(alta({ sembrarSeries: sembrarRoto }).ejecutar(comando({ codigo: 'series-rotas', correoPropietario: 'series@vitrina.pe' }))).rejects.toThrow('seq caído');

    expect(await contar('SELECT count(*) AS n FROM org.tenant WHERE codigo = $1', ['series-rotas'])).toBe(0);
    expect(await filasDe('series-rotas')).toBe(0);
    expect(await contar(`SELECT count(*) AS n FROM seg.membresia m JOIN seg.usuario u ON u.id = m.usuario_id WHERE u.email = 'series@vitrina.pe'`)).toBe(0);
  });

  it('con Supabase caído no hay filas', async () => {
    proveedor.fallar = true;

    await expect(alta().ejecutar(comando({ codigo: 'supabase-caido', correoPropietario: 'caido@vitrina.pe' }))).rejects.toThrow(IdentidadNoDisponibleError);

    expect(await contar('SELECT count(*) AS n FROM org.tenant WHERE codigo = $1', ['supabase-caido'])).toBe(0);
    expect(await contar('SELECT count(*) AS n FROM seg.usuario WHERE email = $1', ['caido@vitrina.pe'])).toBe(0);
  });

  it('un propietario con correo registrado no crea otro usuario y recibe el enlace', async () => {
    await consultar(`INSERT INTO seg.usuario (id, email, nombre, tipo, estado) VALUES ($1, 'carlos.rojas@outlook.com', 'Carlos Rojas', 'EXTERNO', 'ACTIVO')`, [uuidV7()]);

    const resultado = await alta().ejecutar(comando({ codigo: 'gym-norte', productoCodigo: 'GYM', correoPropietario: 'carlos.rojas@outlook.com' }));

    expect(resultado).toMatchObject({ usuarioNuevo: false, correoEnviado: true });
    expect(proveedor.llamadas).toEqual([{ tipo: 'enlace', correo: 'carlos.rojas@outlook.com' }]);
    expect(await contar('SELECT count(*) AS n FROM seg.usuario WHERE email = $1', ['carlos.rojas@outlook.com'])).toBe(1);
  });

  it('ACTIVO deja el tenant ACTIVO y la suscripción ACTIVA con la fecha del comando', async () => {
    const resultado = await alta().ejecutar(comando({ codigo: 'clinica-activa', productoCodigo: 'CLI', modalidad: 'ACTIVO', vigenteHasta: '2030-12-31', correoPropietario: 'clinica@vitrina.pe' }));

    expect(await consultar('SELECT t.estado AS tenant, s.estado AS suscripcion, s.vigente_hasta::text AS hasta FROM org.tenant t JOIN org.suscripcion s ON s.tenant_id = t.id WHERE t.id = $1', [resultado.tenantId])).toEqual([
      { tenant: 'ACTIVO', suscripcion: 'ACTIVA', hasta: '2030-12-31' },
    ]);
  });

  it('un actor de un tenant cliente no da de alta tenants', async () => {
    await expect(alta().ejecutar(comando({ codigo: 'desde-cliente', actor: { usuarioId: admin, tenantId: cliente } }))).rejects.toThrow(OperadorRequeridoError);
    expect(proveedor.llamadas).toEqual([]);
  });
});
