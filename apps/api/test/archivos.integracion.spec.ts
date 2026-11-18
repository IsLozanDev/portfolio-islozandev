import 'reflect-metadata';
import { Global, Module, type CanActivate, type ExecutionContext, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  ALMACEN_ARCHIVOS,
  AlmacenArchivosMemoria,
  AnalizarArchivo,
  ArchivosModule,
  COLA_ANALISIS_ABIERTA,
  ENTIDADES_ARC,
  registrarEsquemasArc,
  type TrabajoAnalisis,
} from '@vitrina/plataforma/archivos';
import { AuditoriaModule, ENTIDADES_AUDITORIA } from '@vitrina/plataforma/auditoria';
import { InMemoryEventSchemaValidator, KernelInfraModule, SystemClock, TENANT_CONTEXT, uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { ALCANCE_ACTOR, ContextoTenantInterceptor, DIRECTORIO_SEG } from '@vitrina/plataforma/seguridad';
import { crearBaseTemporal, describeConDb, type BaseTemporal } from './support/temp-db.js';

const CABECERA_TENANT = 'x-prueba-tenant';
const USUARIO = uuidV7();
const OPCIONES_SUPABASE = { supabase: { url: 'https://prueba.supabase.co', secretKey: 'sb_secret_prueba' }, bucket: 'archivos' };
const CODIFICADOR = new TextEncoder();
const PDF = CODIFICADOR.encode('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);
/** Cabecera `MZ` de un ejecutable de Windows. */
const EJECUTABLE = Uint8Array.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0xff, 0xff, 0x00, 0x00, ...new Array<number>(48).fill(0)]);
// Partida en dos para que el antivirus de la máquina no ponga este archivo en cuarentena.
const CADENA_EICAR = ['X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD', '-ANTIVIRUS-TEST-FILE!$H+H*'].join('');
const PDF_INFECTADO = Uint8Array.from([...PDF, ...CODIFICADOR.encode(CADENA_EICAR)]);

/**
 * Deja el principal con el tenant de la cabecera, como AutenticacionGuard con el token. Los permisos los
 * cubre archivos.http.spec.ts con PermisoGuard; aquí importan la base, la RLS, el outbox y la auditoría.
 */
class TenantDeCabecera implements CanActivate {
  canActivate(contexto: ExecutionContext): boolean {
    const solicitud = contexto.switchToHttp().getRequest();
    solicitud.principal = { usuarioId: USUARIO, tenantId: solicitud.headers[CABECERA_TENANT], tipo: 'INTERNO', aal: 'aal1', sesionId: 'sesion', amr: [] };
    return true;
  }
}

/** Lo que AuditoriaModule toma de SeguridadModule para sus consultas; estas pruebas solo registran. */
@Global()
@Module({
  providers: [
    { provide: ALCANCE_ACTOR, useValue: {} },
    { provide: DIRECTORIO_SEG, useValue: {} },
  ],
  exports: [ALCANCE_ACTOR, DIRECTORIO_SEG],
})
class SeguridadDePrueba {}

/** La cola sin Redis: guarda los trabajos para que la prueba haga de worker. */
class ColaEnMemoria {
  readonly trabajos: TrabajoAnalisis[] = [];

  encolar(trabajo: TrabajoAnalisis): Promise<void> {
    if (!this.trabajos.some((pendiente) => pendiente.archivoId === trabajo.archivoId)) this.trabajos.push(trabajo);
    return Promise.resolve();
  }
}

describeConDb('HTTP /v1/archivos contra PostgreSQL 16 (TR-CA-199 a 201, 204 y 205)', () => {
  let base: BaseTemporal;
  let dataSource: DataSource;
  let app: INestApplication;
  let almacen: AlmacenArchivosMemoria;
  let cola: ColaEnMemoria;
  const tenantA = uuidV7();
  const tenantB = uuidV7();

  const como = (tenantId: string) => ({
    get: (ruta: string) => request(app.getHttpServer()).get(`/v1/archivos${ruta}`).set(CABECERA_TENANT, tenantId),
    post: (ruta: string, cuerpo: object = {}) => request(app.getHttpServer()).post(`/v1/archivos${ruta}`).set(CABECERA_TENANT, tenantId).send(cuerpo),
  });
  const consultar = <Fila>(sql: string, parametros: unknown[] = []): Promise<Fila[]> => dataSource.query(sql, parametros);
  const eventosDe = async (archivoId: string) =>
    (await consultar<{ event_type: string }>('SELECT event_type FROM sync.outbox WHERE aggregate_id = $1 ORDER BY seq', [archivoId])).map(
      (fila) => fila.event_type,
    );
  const auditoriaDe = (archivoId: string) =>
    consultar<{ accion: string; tenant_id: string; usuario_id: string; despues: object }>(
      `SELECT accion, tenant_id, usuario_id, despues FROM aud.evento_auditoria WHERE entidad_tipo = 'ARCHIVO' AND entidad_id = $1`,
      [archivoId],
    );

  /** Lo que hace el navegador y después el worker: pide la URL, sube, confirma y se analiza. */
  async function subirYAnalizar(contenido: Uint8Array, cambios: object = {}): Promise<string> {
    const solicitada = await como(tenantA).post('/cargas', {
      categoria: 'DOCUMENTO',
      nombre_original: 'contrato.pdf',
      tamano: contenido.byteLength,
      mime: 'application/pdf',
      entidad_tipo: 'PRUEBA_SENSIBLE',
      entidad_id: 'E-1',
      ...cambios,
    });
    expect(solicitada.status).toBe(201);
    almacen.subirConUrl(solicitada.body.carga.url, contenido);
    const confirmada = await como(tenantA).post(`/${solicitada.body.archivo_id}/confirmar`);
    expect([confirmada.status, confirmada.body.estado]).toEqual([200, 'EN_ANALISIS']);
    for (const trabajo of cola.trabajos.splice(0)) await app.get(AnalizarArchivo, { strict: false }).ejecutar(trabajo);
    return solicitada.body.archivo_id;
  }

  beforeAll(async () => {
    base = await crearBaseTemporal();
    dataSource = new DataSource({ type: 'postgres', url: base.url, entities: [...ENTIDADES_ARC, ...ENTIDADES_AUDITORIA] });
    await dataSource.initialize();
    const validator = new InMemoryEventSchemaValidator();
    registrarEsquemasArc(validator);
    almacen = new AlmacenArchivosMemoria(new SystemClock());
    cola = new ColaEnMemoria();

    const modulo = await Test.createTestingModule({
      imports: [
        KernelInfraModule.register({ dataSource, validator }),
        SeguridadDePrueba,
        AuditoriaModule.registrarApi(),
        ArchivosModule.register({ ...OPCIONES_SUPABASE, redisUrl: 'redis://127.0.0.1:6379' }),
        ArchivosModule.registrarWorker(OPCIONES_SUPABASE),
      ],
    })
      .overrideProvider(ALMACEN_ARCHIVOS)
      .useValue(almacen)
      .overrideProvider(COLA_ANALISIS_ABIERTA)
      .useValue({ cola, cerrar: () => Promise.resolve() })
      .compile();
    app = modulo.createNestApplication({ logger: false });
    app.useGlobalGuards(new TenantDeCabecera());
    app.useGlobalInterceptors(new ContextoTenantInterceptor(app.get(TENANT_CONTEXT)));
    app.setGlobalPrefix('v1');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await dataSource?.destroy();
    await base?.borrar();
  });

  it('TR-CA-199: un PDF queda DISPONIBLE con hash, bytes y tipo real, y archivo.disponible en el outbox', async () => {
    const archivoId = await subirYAnalizar(PDF);

    const estado = await como(tenantA).get(`/${archivoId}`);
    const [version] = await consultar<{ ruta_storage: string; mime_real: string; bytes: string }>(
      'SELECT ruta_storage, mime_real, bytes FROM arc.version_archivo WHERE archivo_id = $1',
      [archivoId],
    );

    expect(estado.body).toMatchObject({ estado: 'DISPONIBLE', bytes: PDF.byteLength, hash_sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(version).toEqual({ ruta_storage: `${tenantA}/${archivoId}/1`, mime_real: 'application/pdf', bytes: String(PDF.byteLength) });
    expect(await eventosDe(archivoId)).toEqual(['archivo.disponible']);
  });

  it('TR-CA-200: un .exe declarado application/pdf queda RECHAZADO, sin objeto y sin evento', async () => {
    const archivoId = await subirYAnalizar(EJECUTABLE);

    const estado = await como(tenantA).get(`/${archivoId}`);

    expect(estado.body).toMatchObject({ estado: 'RECHAZADO', motivo_rechazo: 'TIPO_NO_PERMITIDO' });
    expect(almacen.existe(`${tenantA}/${archivoId}/1`)).toBe(false);
    expect(await eventosDe(archivoId)).toEqual([]);
  });

  it('TR-CA-201: la firma EICAR deja el archivo en CUARENTENA, con el evento, el objeto en Storage y la descarga en 409', async () => {
    const archivoId = await subirYAnalizar(PDF_INFECTADO);

    const descarga = await como(tenantA).get(`/${archivoId}/descarga`);

    expect([descarga.status, descarga.body]).toMatchObject([409, { codigo: 'ARCHIVO_NO_DISPONIBLE', estado: 'CUARENTENA' }]);
    expect(almacen.existe(`${tenantA}/${archivoId}/1`)).toBe(true);
    expect(await eventosDe(archivoId)).toEqual(['archivo.en_cuarentena']);
  });

  it('TR-CA-204: la descarga de un DOCUMENTO da una URL de 15 minutos y deja una fila en aud', async () => {
    const archivoId = await subirYAnalizar(PDF);
    const antes = Date.now();

    const descarga = await como(tenantA).get(`/${archivoId}/descarga`);

    expect(descarga.status).toBe(200);
    const vigenciaMs = new Date(descarga.body.expira_en).getTime() - antes;
    expect(vigenciaMs).toBeGreaterThan(899_000);
    expect(vigenciaMs).toBeLessThan(905_000);
    expect(almacen.descargarConUrl(descarga.body.url)).toEqual(PDF);
    expect(await auditoriaDe(archivoId)).toEqual([
      {
        accion: 'plat.archivo.descargar',
        tenant_id: tenantA,
        usuario_id: USUARIO,
        despues: { categoria: 'DOCUMENTO', entidad_tipo: 'PRUEBA_SENSIBLE', entidad_id: 'E-1', disposicion: 'attachment' },
      },
    ]);
  });

  it('la descarga de una IMAGEN (no sensible) no deja fila en aud', async () => {
    const archivoId = await subirYAnalizar(PNG, { categoria: 'IMAGEN', mime: 'image/png', nombre_original: 'logo.png', entidad_tipo: 'PRODUCTO' });

    const descarga = await como(tenantA).get(`/${archivoId}/descarga?disposicion=inline`);

    expect(descarga.status).toBe(200);
    expect(await auditoriaDe(archivoId)).toEqual([]);
  });

  it('TR-CA-205: el archivo de A pedido desde B → 404 en estado, confirmar y descarga, y sin fila en aud', async () => {
    const archivoId = await subirYAnalizar(PDF);

    const respuestas = [
      await como(tenantB).get(`/${archivoId}`),
      await como(tenantB).post(`/${archivoId}/confirmar`),
      await como(tenantB).get(`/${archivoId}/descarga`),
    ];

    expect(respuestas.map((respuesta) => [respuesta.status, respuesta.body.codigo])).toEqual([
      [404, 'NO_ENCONTRADO'],
      [404, 'NO_ENCONTRADO'],
      [404, 'NO_ENCONTRADO'],
    ]);
    expect(await auditoriaDe(archivoId)).toEqual([]);
  });

  it('una carga rechazada por tamaño no deja fila en arc.archivo', async () => {
    const antes = await consultar<{ filas: number }>('SELECT count(*)::int AS filas FROM arc.archivo');

    const respuesta = await como(tenantA).post('/cargas', {
      categoria: 'IMAGEN',
      nombre_original: 'foto.png',
      tamano: 10 * 1024 * 1024 + 1,
      mime: 'image/png',
      entidad_tipo: 'PRODUCTO',
      entidad_id: 'P-1',
    });

    expect([respuesta.status, respuesta.body.codigo]).toEqual([422, 'TAMANO_EXCEDIDO']);
    expect(await consultar('SELECT count(*)::int AS filas FROM arc.archivo')).toEqual(antes);
  });
});
