import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AUDITORIA, AuditoriaModule, ENTIDADES_AUDITORIA, type AuditoriaPort } from '@vitrina/plataforma/auditoria';
import type { CatalogoPort, ResultadoValidacion } from '@vitrina/plataforma/catalogos';
import type { EventPublisher } from '@vitrina/plataforma/kernel';
import {
  AlsTenantContext,
  EVENT_PUBLISHER,
  InMemoryEventSchemaValidator,
  KernelInfraModule,
  SystemClock,
  TENANT_CONTEXT,
  TypeOrmUnitOfWork,
  uuidV7,
} from '@vitrina/plataforma/kernel-infra';
import { ConsultarEmpresa, ENTIDADES_ORG, LecturaOrganizacionTypeOrm } from '@vitrina/plataforma/org';
import { BOVEDA_SECRETOS, BYTES_CLAVE, ClavesMaestras, ENTIDADES_SEC, SecretosModule, type BovedaSecretos } from '@vitrina/plataforma/secretos';
import { DataSource } from 'typeorm';
import { AvisarCertificadosPorVencer } from '../src/application/avisar-certificados-por-vencer.js';
import { CargarCertificado } from '../src/application/cargar-certificado.js';
import { ConfigurarEmisor } from '../src/application/configurar-emisor.js';
import { ConsultarEmisor } from '../src/application/consultar-emisor.js';
import type { DependenciasEmisor } from '../src/application/dependencias-fe.js';
import { EmisorNoEncontradoError, VersionObsoletaEmisorError } from '../src/domain/errores.js';
import { EVENTOS_FE } from '../src/domain/eventos-fe.js';
import { ProveedoresFeCatalogo } from '../src/infrastructure/catalogos/proveedores-fe.catalogo.js';
import { registrarEsquemasFe } from '../src/infrastructure/event-schemas.js';
import { LectorCertificadoForge } from '../src/infrastructure/forge/lector-certificado.forge.js';
import { EmpresaEmisoraOrg } from '../src/infrastructure/org/empresa-emisora.org.js';
import { RepositorioAvisosCertificadoTypeOrm } from '../src/infrastructure/typeorm/avisos-certificado.repositorio.js';
import { CertificadosConAvisoPendienteSql } from '../src/infrastructure/typeorm/certificados-con-aviso-pendiente.sql.js';
import { RepositorioEmisoresTypeOrm } from '../src/infrastructure/typeorm/emisores.repositorio.js';
import { ENTIDADES_FE } from '../src/infrastructure/typeorm/entidades.js';
import { CLAVE_PFX, crearPfx, OTRO_RUC, RUC_EMPRESA, sujetoConRuc } from './support/certificados.js';
import { createTempDb, describeConDb, type TempDb } from './support/temp-db.js';

const CLAVE_PROVEEDOR = 'clave-del-proveedor-sol';

interface FilaCruda {
  [columna: string]: unknown;
}

/** CatalogoPort sobre la semilla real de PROVEEDOR_FE, sin Redis, en la transacción del caso de uso. */
function catalogoDeLaBase(unidadDeTrabajo: TypeOrmUnitOfWork): CatalogoPort {
  return {
    async validarItem(catalogo: string, codigo: string): Promise<ResultadoValidacion> {
      const [fila] = (await unidadDeTrabajo.manager.query(
        `SELECT i.nombre, i.atributos FROM cat.catalogo_item i JOIN cat.catalogo c ON c.id = i.catalogo_id
          WHERE c.codigo = $1 AND i.codigo = $2 AND i.activo`,
        [catalogo, codigo],
      )) as { nombre: string; atributos: Record<string, unknown> }[];
      return fila
        ? { valido: true, motivo: null, atributos: fila.atributos, nombre: fila.nombre }
        : { valido: false, motivo: 'INEXISTENTE', atributos: null, nombre: null };
    },
  };
}

describeConDb('Emisor electrónico con TypeORM, bóveda real y RLS (spec 49, PostgreSQL 16)', () => {
  let baseTemporal: TempDb;
  let dataSource: DataSource;
  let app: INestApplicationContext;
  let contexto: AlsTenantContext;
  let unidadDeTrabajo: TypeOrmUnitOfWork;
  let dependencias: DependenciasEmisor;
  const usuario = uuidV7();
  const tenantA = uuidV7();
  const tenantB = uuidV7();
  const empresaA = uuidV7();
  const empresaB = uuidV7();
  const ahora = new Date();
  const sufijo = randomBytes(4).toString('hex');

  const enTenant = <Resultado>(tenantId: string, trabajo: () => Promise<Resultado>): Promise<Resultado> =>
    contexto.run({ tenantId, actorId: usuario }, trabajo);
  const crudo = (consulta: string, parametros: unknown[] = []): Promise<FilaCruda[]> => dataSource.query(consulta, parametros);
  const configurar = (cambios: object = {}) =>
    enTenant(tenantA, () =>
      new ConfigurarEmisor(dependencias).ejecutar({
        empresaId: empresaA,
        proveedor: 'SIMULADO',
        usuarioProveedor: 'MODDATOS',
        clave: CLAVE_PROVEEDOR,
        regimenIgv: 'GENERAL',
        ...cambios,
      }),
    );
  const cargar = (pfx: Uint8Array) => enTenant(tenantA, () => new CargarCertificado(dependencias).ejecutar({ empresaId: empresaA, pfx, clave: CLAVE_PFX }));
  const conteos = async () => ({
    secretos: (await crudo('SELECT count(*)::int AS n FROM sec.secreto WHERE tenant_id = $1', [tenantA]))[0].n,
    auditoria: (await crudo(`SELECT count(*)::int AS n FROM aud.evento_auditoria WHERE tenant_id = $1 AND accion LIKE 'fe.%'`, [tenantA]))[0].n,
    eventos: (await crudo(`SELECT count(*)::int AS n FROM sync.outbox WHERE tenant_id = $1 AND event_type LIKE 'fe.%'`, [tenantA]))[0].n,
    emisor: (await crudo('SELECT version FROM fe.emisor WHERE tenant_id = $1', [tenantA]))[0]?.version,
  });

  beforeAll(async () => {
    baseTemporal = await createTempDb();
    dataSource = new DataSource({ type: 'postgres', url: baseTemporal.url, entities: [...ENTIDADES_FE, ...ENTIDADES_SEC, ...ENTIDADES_AUDITORIA, ...ENTIDADES_ORG] });
    await dataSource.initialize();
    await crudo(
      `INSERT INTO org.tenant (id, codigo, nombre, estado, version) VALUES ($1, $3, 'FE A', 'ACTIVO', 1), ($2, $4, 'FE B', 'ACTIVO', 1)`,
      [tenantA, tenantB, `fe-a-${sufijo}`, `fe-b-${sufijo}`],
    );
    await crudo(
      `INSERT INTO org.empresa (id, tenant_id, ruc, razon_social, version) VALUES ($1, $2, $3, 'FE A SAC', 1), ($4, $5, $6, 'FE B SAC', 1)`,
      [empresaA, tenantA, RUC_EMPRESA, empresaB, tenantB, OTRO_RUC],
    );

    const validador = new InMemoryEventSchemaValidator();
    registrarEsquemasFe(validador);
    const claves = ClavesMaestras.crear(new Map([[1, randomBytes(BYTES_CLAVE)]]), 1);

    @Module({
      imports: [KernelInfraModule.register({ dataSource, validator: validador }), AuditoriaModule.registrarPuerto(), SecretosModule.register({ claves })],
    })
    class PruebaModule {}

    app = await NestFactory.createApplicationContext(PruebaModule, { logger: false });
    contexto = app.get(TENANT_CONTEXT);
    unidadDeTrabajo = app.get(TypeOrmUnitOfWork);
    dependencias = {
      unidadDeTrabajo,
      contexto,
      reloj: new SystemClock(),
      ids: { next: uuidV7 },
      publicador: app.get<EventPublisher>(EVENT_PUBLISHER),
      auditoria: app.get<AuditoriaPort>(AUDITORIA),
      boveda: app.get<BovedaSecretos>(BOVEDA_SECRETOS),
      emisores: new RepositorioEmisoresTypeOrm(unidadDeTrabajo, contexto),
      empresas: new EmpresaEmisoraOrg(new ConsultarEmpresa({ unidadDeTrabajo, lectura: new LecturaOrganizacionTypeOrm(unidadDeTrabajo, contexto) })),
      proveedores: new ProveedoresFeCatalogo(catalogoDeLaBase(unidadDeTrabajo)),
      lector: new LectorCertificadoForge(),
    };
  });

  afterAll(async () => {
    await app?.close();
    await dataSource?.destroy();
    await baseTemporal?.drop();
  });

  it('TR-CA-133 y TR-RNF-113: CONFIGURADO con el .pfx del RUC; los tres secretos solo cifrados en sec.secreto y un evento', async () => {
    await configurar();
    const pfx = crearPfx(ahora);
    const vista = await cargar(pfx);

    expect(vista.estado).toBe('CONFIGURADO');
    const [emisor] = await crudo('SELECT * FROM fe.emisor WHERE tenant_id = $1', [tenantA]);
    expect(emisor).toMatchObject({ certificado_ruc: RUC_EMPRESA, certificado_huella_sha256: vista.certificado?.huellaSha256, estado: 'CONFIGURADO' });
    const secretos = await crudo('SELECT id, tipo, cifrado, version FROM sec.secreto WHERE tenant_id = $1 ORDER BY tipo', [tenantA]);
    expect(secretos.map((secreto) => secreto.tipo)).toEqual(['fe.certificado', 'fe.clave_certificado', 'fe.credencial']);
    expect(secretos.map((secreto) => secreto.id).sort()).toEqual(
      [emisor.secreto_certificado_id, emisor.secreto_clave_certificado_id, emisor.secreto_credencial_id].sort(),
    );
    for (const secreto of secretos) {
      const cifrado = secreto.cifrado as Buffer;
      expect(cifrado.includes(Buffer.from(CLAVE_PROVEEDOR))).toBe(false);
      expect(cifrado.includes(Buffer.from(CLAVE_PFX))).toBe(false);
    }

    const eventos = await crudo(`SELECT event_type, payload FROM sync.outbox WHERE tenant_id = $1 AND event_type LIKE 'fe.%'`, [tenantA]);
    expect(eventos).toEqual([{ event_type: EVENTOS_FE.emisorConfigurado, payload: expect.objectContaining({ proveedor: 'SIMULADO', ambiente: 'BETA' }) }]);

    // TR-RNF-026 y 013: auditoría con antes y después, sin claves ni bytes del .pfx.
    const auditoria = await crudo(`SELECT accion, antes, despues FROM aud.evento_auditoria WHERE tenant_id = $1 AND accion LIKE 'fe.%' ORDER BY numero`, [tenantA]);
    expect(auditoria.map((fila) => fila.accion)).toEqual(['fe.emisor.configurar', 'fe.emisor.cargar_certificado']);
    const visible = JSON.stringify([auditoria, eventos, emisor]);
    for (const secreto of [CLAVE_PROVEEDOR, CLAVE_PFX, Buffer.from(pfx).toString('base64').slice(0, 40)]) expect(visible).not.toContain(secreto);
  });

  it('reemplazar el certificado o la clave rota el mismo secreto (misma id, version + 1)', async () => {
    const [antes] = await crudo('SELECT * FROM fe.emisor WHERE tenant_id = $1', [tenantA]);
    await cargar(crearPfx(ahora));
    await configurar({ clave: 'otra-clave', version: Number(antes.version) + 1 });

    const [despues] = await crudo('SELECT * FROM fe.emisor WHERE tenant_id = $1', [tenantA]);
    expect([despues.secreto_certificado_id, despues.secreto_credencial_id]).toEqual([antes.secreto_certificado_id, antes.secreto_credencial_id]);
    const versiones = await crudo('SELECT tipo, version FROM sec.secreto WHERE tenant_id = $1 ORDER BY tipo', [tenantA]);
    expect(versiones).toEqual([
      { tipo: 'fe.certificado', version: 2 },
      { tipo: 'fe.clave_certificado', version: 2 },
      { tipo: 'fe.credencial', version: 2 },
    ]);
  });

  it('TR-CA-134 con la base real: otro RUC no cambia el emisor ni la bóveda', async () => {
    const antes = await conteos();
    await expect(cargar(crearPfx(ahora, { sujeto: sujetoConRuc(OTRO_RUC) }))).rejects.toThrow('El certificado no corresponde al RUC de la empresa');
    expect(await conteos()).toEqual(antes);
  });

  it('si la transacción falla después de guardar en la bóveda (conflicto de versión) no queda secreto, cambio, auditoría ni evento', async () => {
    const otro = await enTenant(tenantB, () =>
      new ConfigurarEmisor(dependencias).ejecutar({ empresaId: empresaB, proveedor: 'SIMULADO', usuarioProveedor: 'B', regimenIgv: 'GENERAL' }),
    );
    const antesB = (await crudo('SELECT count(*)::int AS n FROM sec.secreto WHERE tenant_id = $1', [tenantB]))[0].n;
    // Otra operación sube la versión entre la lectura y la escritura: la bóveda ya guardó cuando el UPDATE falla.
    const emisores = new RepositorioEmisoresTypeOrm(unidadDeTrabajo, contexto);
    const conCarrera: DependenciasEmisor = {
      ...dependencias,
      emisores: {
        porEmpresa: (empresaId) => emisores.porEmpresa(empresaId),
        porId: (emisorId) => emisores.porId(emisorId),
        insertar: (emisor) => emisores.insertar(emisor),
        actualizar: async (emisor, versionEsperada) => {
          await crudo('UPDATE fe.emisor SET version = version + 1 WHERE id = $1', [emisor.id]);
          return emisores.actualizar(emisor, versionEsperada);
        },
      },
    };
    const auditoriaAntes = (await crudo(`SELECT count(*)::int AS n FROM aud.evento_auditoria WHERE tenant_id = $1`, [tenantB]))[0].n;

    await expect(
      enTenant(tenantB, () =>
        new ConfigurarEmisor(conCarrera).ejecutar({
          empresaId: empresaB,
          proveedor: 'SIMULADO',
          usuarioProveedor: 'B2',
          clave: CLAVE_PROVEEDOR,
          regimenIgv: 'GENERAL',
          version: otro.vista.version,
        }),
      ),
    ).rejects.toBeInstanceOf(VersionObsoletaEmisorError);
    expect((await crudo('SELECT count(*)::int AS n FROM sec.secreto WHERE tenant_id = $1', [tenantB]))[0].n).toBe(antesB);
    expect((await crudo(`SELECT count(*)::int AS n FROM aud.evento_auditoria WHERE tenant_id = $1`, [tenantB]))[0].n).toBe(auditoriaAntes);
    expect((await crudo('SELECT usuario_proveedor FROM fe.emisor WHERE tenant_id = $1', [tenantB]))[0].usuario_proveedor).toBe('B');
  });

  it('TR-RNF-010: el otro tenant no lee el emisor (404) ni lo encuentra por id', async () => {
    const [emisorA] = await crudo('SELECT id FROM fe.emisor WHERE tenant_id = $1', [tenantA]);
    await expect(enTenant(tenantB, () => new ConsultarEmisor(dependencias).ejecutar(empresaA))).rejects.toBeInstanceOf(EmisorNoEncontradoError);
    expect(await enTenant(tenantB, () => unidadDeTrabajo.run(() => dependencias.emisores.porId(String(emisorA.id))))).toBeNull();
  });

  it('bloqueo optimista: dos lecturas de la misma versión, solo la primera escritura pasa', async () => {
    const leer = () => enTenant(tenantA, () => unidadDeTrabajo.run(() => dependencias.emisores.porEmpresa(empresaA)));
    const [uno, dos] = [await leer(), await leer()];
    if (!uno || !dos) throw new Error('falta el emisor');
    const version = uno.version;
    uno.registrarModificacion(usuario, ahora);
    dos.registrarModificacion(usuario, ahora);
    await enTenant(tenantA, () => unidadDeTrabajo.run(() => dependencias.emisores.actualizar(uno, version)));
    await expect(enTenant(tenantA, () => unidadDeTrabajo.run(() => dependencias.emisores.actualizar(dos, version)))).rejects.toBeInstanceOf(
      VersionObsoletaEmisorError,
    );
  });

  it('TR-CA-135: dos corridas a la vez del mismo día dejan un aviso y un evento por certificado', async () => {
    const [emisor] = await crudo('SELECT certificado_vence_en FROM fe.emisor WHERE tenant_id = $1', [tenantA]);
    const venceEn = emisor.certificado_vence_en as Date;
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date(venceEn.getTime() - 10 * 86_400_000));
    const crearTarea = () =>
      new AvisarCertificadosPorVencer({
        unidadDeTrabajo,
        contexto,
        reloj: new SystemClock(),
        ids: { next: uuidV7 },
        publicador: dependencias.publicador,
        emisores: dependencias.emisores,
        avisos: new RepositorioAvisosCertificadoTypeOrm(unidadDeTrabajo, new CertificadosConAvisoPendienteSql(dataSource)),
        diasAviso: { delTenant: () => Promise.resolve(30) },
        informar: () => undefined,
        avisar: () => undefined,
      });

    const resultados = await Promise.all([crearTarea().ejecutar(hoy), crearTarea().ejecutar(hoy)]);
    expect(resultados.reduce((total, resultado) => total + resultado.avisados, 0)).toBe(1);
    expect(await crudo('SELECT dias_antes FROM fe.aviso_certificado WHERE tenant_id = $1', [tenantA])).toEqual([{ dias_antes: 30 }]);
    const eventos = await crudo(`SELECT payload FROM sync.outbox WHERE tenant_id = $1 AND event_type = $2`, [tenantA, EVENTOS_FE.certificadoPorVencer]);
    expect(eventos).toEqual([{ payload: expect.objectContaining({ ruc: RUC_EMPRESA, dias_restantes: 10 }) }]);

    expect((await crearTarea().ejecutar(hoy)).avisados).toBe(0);
  });
});
