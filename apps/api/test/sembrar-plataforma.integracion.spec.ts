import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ENTIDADES_SEQ, registrarEsquemasSeq } from '@vitrina/plataforma/correlativos';
import { ENTIDADES_EVT } from '@vitrina/plataforma/eventos';
import { ID_GENERATOR, InMemoryEventSchemaValidator, TENANT_CONTEXT, TypeOrmUnitOfWork, uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { CrearTenant, registrarEsquemasOrg, RegistrarEmpresa } from '@vitrina/plataforma/org';
import { ENTIDADES_CFG, registrarEsquemasCfg } from '@vitrina/plataforma/parametros';
import {
  AplicarManifiesto,
  InvitarPropietario,
  ManifiestoRepositorioTypeOrm,
  PROVEEDOR_IDENTIDAD,
  REGISTRO_ACCESO,
  registrarEsquemasSeg,
  type ProveedorIdentidad,
} from '@vitrina/plataforma/seguridad';
import { AppModule } from '../src/app.module.js';
import { SembrarPlataforma } from '../src/org/sembrar-plataforma.js';
import { TenantsPorCodigoTypeOrm } from '../src/org/tenants-por-codigo.typeorm.js';
import { crearBaseTemporal, describeConDb, type BaseTemporal } from './support/temp-db.js';

const RUTA_MANIFIESTO = new URL('../../../libs/plataforma/seguridad/manifiesto/plat.manifiesto.json', import.meta.url);

/** Doble de Supabase Admin: al invitar inserta `seg.usuario` como lo haría el trigger de `auth.users`. */
class ProveedorFalso implements ProveedorIdentidad {
  readonly llamadas: string[] = [];

  constructor(private readonly dataSource: DataSource) {}

  async invitar(correo: string, nombre: string): Promise<{ usuarioId: string }> {
    this.llamadas.push(`invitar:${correo}`);
    const usuarioId = randomUUID();
    await this.dataSource.query(`INSERT INTO seg.usuario (id, email, nombre, tipo, estado) VALUES ($1, $2, $3, 'EXTERNO', 'ACTIVO')`, [usuarioId, correo, nombre]);
    return { usuarioId };
  }

  async enviarEnlace(correo: string): Promise<void> {
    this.llamadas.push(`enlace:${correo}`);
  }
}

describeConDb('SembrarPlataforma contra PostgreSQL 16 (spec 12)', () => {
  let base: BaseTemporal;
  let dataSource: DataSource;
  let app: INestApplication;
  let proveedor: ProveedorFalso;
  let sembrador: SembrarPlataforma;
  const contar = async (sql: string, parametros: unknown[] = []) => Number((await dataSource.query(sql, parametros))[0].n);

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
      .compile();
    app = modulo.createNestApplication({ logger: false });
    await app.init();

    sembrador = new SembrarPlataforma({
      unidadDeTrabajo: app.get(TypeOrmUnitOfWork),
      contexto: app.get(TENANT_CONTEXT),
      ids: app.get(ID_GENERATOR),
      tenantsPorCodigo: new TenantsPorCodigoTypeOrm(dataSource),
      crearTenant: app.get(CrearTenant),
      registrarEmpresa: app.get(RegistrarEmpresa),
      invitarPropietario: app.get(InvitarPropietario),
      tenantOperador: 'plataforma',
      rucOperador: '20601234565',
    });
    await new AplicarManifiesto(new ManifiestoRepositorioTypeOrm(dataSource, { next: uuidV7 })).ejecutar(JSON.parse(await readFile(RUTA_MANIFIESTO, 'utf8')));
  });

  afterAll(async () => {
    await app?.close();
    await dataSource?.destroy();
    await base?.borrar();
  });

  it('la primera corrida crea el operador ACTIVO sin suscripción, su sucursal 0000 y la membresía con PLAT_PROPIETARIO y PLAT_ADMIN_TENANTS', async () => {
    const resultado = await sembrador.ejecutar({ correo: 'ana@vitrina.pe', nombre: 'Ana Torres' });

    expect(resultado).toMatchObject({ sinCambios: false, tenantCreado: true, usuarioNuevo: true, correoEnviado: true });
    const { tenantId } = resultado;
    expect(await dataSource.query('SELECT codigo, estado FROM org.tenant WHERE id = $1', [tenantId])).toEqual([{ codigo: 'plataforma', estado: 'ACTIVO' }]);
    expect(await contar('SELECT count(*) AS n FROM org.suscripcion WHERE tenant_id = $1', [tenantId])).toBe(0);
    expect(await dataSource.query('SELECT ruc FROM org.empresa WHERE tenant_id = $1', [tenantId])).toEqual([{ ruc: '20601234565' }]);
    expect(await dataSource.query('SELECT codigo_establecimiento_sunat FROM org.sucursal WHERE tenant_id = $1 AND es_principal', [tenantId])).toEqual([
      { codigo_establecimiento_sunat: '0000' },
    ]);
    expect(
      await dataSource.query(
        `SELECT m.es_propietario, r.codigo, a.alcance FROM seg.membresia m JOIN seg.asignacion a ON a.membresia_id = m.id
           JOIN seg.rol r ON r.id = a.rol_id WHERE m.tenant_id = $1 ORDER BY r.codigo`,
        [tenantId],
      ),
    ).toEqual([
      { es_propietario: true, codigo: 'PLAT_ADMIN_TENANTS', alcance: 'TENANT' },
      { es_propietario: true, codigo: 'PLAT_PROPIETARIO', alcance: 'TENANT' },
    ]);
    expect(proveedor.llamadas).toEqual(['invitar:ana@vitrina.pe']);
  });

  it('la segunda corrida con el mismo correo no cambia nada', async () => {
    const filas = async () => [
      await contar("SELECT count(*) AS n FROM org.tenant WHERE codigo = 'plataforma'"),
      await contar('SELECT count(*) AS n FROM seg.membresia'),
      await contar('SELECT count(*) AS n FROM seg.asignacion'),
      await contar('SELECT count(*) AS n FROM sync.outbox'),
    ];
    const antes = await filas();
    proveedor.llamadas.length = 0;

    await expect(sembrador.ejecutar({ correo: 'ANA@vitrina.pe', nombre: 'Ana Torres' })).resolves.toMatchObject({ sinCambios: true });

    expect(await filas()).toEqual(antes);
    expect(proveedor.llamadas).toEqual([]);
  });

  it('otro correo suma un administrador al operador existente sin crear otro tenant', async () => {
    const resultado = await sembrador.ejecutar({ correo: 'luis@vitrina.pe', nombre: 'Luis Rojas' });

    expect(resultado).toMatchObject({ sinCambios: false, tenantCreado: false });
    expect(await contar("SELECT count(*) AS n FROM org.tenant WHERE codigo = 'plataforma'")).toBe(1);
    expect(await contar('SELECT count(*) AS n FROM seg.membresia WHERE tenant_id = $1', [resultado.tenantId])).toBe(2);
  });
});
