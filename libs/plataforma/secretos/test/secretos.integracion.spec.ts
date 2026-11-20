import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AUDITORIA, AuditoriaModule, ENTIDADES_AUDITORIA, type AuditoriaPort } from '@vitrina/plataforma/auditoria';
import { AlsTenantContext, InMemoryEventSchemaValidator, KernelInfraModule, SystemClock, TENANT_CONTEXT, TypeOrmUnitOfWork, uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { DataSource } from 'typeorm';
import { ClavesDeDatos } from '../src/application/claves-de-datos.js';
import type { BovedaSecretos } from '../src/application/ports/boveda-secretos.js';
import type { RepositorioSecretos } from '../src/application/ports/repositorio-secretos.js';
import { ReenvolverClaves } from '../src/application/reenvolver-claves.js';
import { ServicioBoveda } from '../src/application/servicio-boveda.js';
import { BYTES_CLAVE, ClavesMaestras } from '../src/domain/claves-maestras.js';
import { datosAsociadosClave } from '../src/domain/datos-asociados.js';
import { ClaveMaestraDesconocidaError, SecretoCorruptoError, SecretoModificadoError, SecretoNoEncontradoError } from '../src/domain/errores.js';
import { CifradorAesGcm } from '../src/infrastructure/crypto/cifrador.aes-gcm.js';
import { RepositorioClavesTenantTypeOrm } from '../src/infrastructure/typeorm/claves-tenant.repositorio.js';
import { ENTIDADES_SEC } from '../src/infrastructure/typeorm/entidades.js';
import { RepositorioSecretosTypeOrm } from '../src/infrastructure/typeorm/secretos.repositorio.js';
import { TenantsPorReenvolverSql } from '../src/infrastructure/typeorm/tenants-por-reenvolver.sql.js';
import { createTempDb, describeConDb, type TempDb } from './support/temp-db.js';

const TIPO_CLAVE = 'fe.clave_certificado';
const TIPO_PFX = 'fe.certificado_pfx';
const BYTES_PFX = 50 * 1024;

interface FilaSecretoCruda {
  id: string;
  tenant_id: string;
  tipo: string;
  cifrado: Buffer;
  iv: Buffer;
  version: number;
  creado_por: string;
  rotado_por: string | null;
  rotado_en: Date | null;
}

interface FilaAuditoriaCruda {
  accion: string;
  entidad_tipo: string;
  entidad_id: string;
  antes: unknown;
  despues: unknown;
}

/** Dos operaciones esperan aquí hasta que llegan las dos. */
function barreraDeDos(): () => Promise<void> {
  let llegadas = 0;
  let liberar: () => void = () => undefined;
  const abierta = new Promise<void>((resolver) => (liberar = resolver));
  return () => {
    llegadas += 1;
    if (llegadas === 2) liberar();
    return abierta;
  };
}

describeConDb('Bóveda de secretos con TypeORM (spec 41, PostgreSQL 16)', () => {
  let baseTemporal: TempDb;
  let dataSource: DataSource;
  let app: INestApplicationContext;
  let contexto: AlsTenantContext;
  let unidadDeTrabajo: TypeOrmUnitOfWork;
  let auditoria: AuditoriaPort;
  const cifrador = new CifradorAesGcm();
  const maestraUno = randomBytes(BYTES_CLAVE);
  const maestraDos = randomBytes(BYTES_CLAVE);
  const soloLaUno = ClavesMaestras.crear(new Map([[1, maestraUno]]), 1);
  const unoYDos = ClavesMaestras.crear(
    new Map([
      [1, maestraUno],
      [2, maestraDos],
    ]),
    2,
  );
  const soloLaDos = ClavesMaestras.crear(new Map([[2, maestraDos]]), 2);
  const usuario = uuidV7();
  const valor = new TextEncoder().encode('clave-super-secreta-del-pfx');

  const crearBoveda = (claves: ClavesMaestras, secretos: RepositorioSecretos = new RepositorioSecretosTypeOrm(unidadDeTrabajo, contexto)): BovedaSecretos =>
    new ServicioBoveda({
      unidadDeTrabajo,
      contexto,
      reloj: new SystemClock(),
      ids: { next: uuidV7 },
      auditoria,
      cifrador,
      clavesDeDatos: new ClavesDeDatos(cifrador, new RepositorioClavesTenantTypeOrm(unidadDeTrabajo, contexto), claves),
      secretos,
      informar: () => undefined,
    });

  const crearReenvoltura = (claves: ClavesMaestras): ReenvolverClaves => {
    const clavesTenant = new RepositorioClavesTenantTypeOrm(unidadDeTrabajo, contexto);
    return new ReenvolverClaves({
      unidadDeTrabajo,
      contexto,
      reloj: new SystemClock(),
      clavesDeDatos: new ClavesDeDatos(cifrador, clavesTenant, claves),
      clavesTenant,
      tenantsPorReenvolver: new TenantsPorReenvolverSql(dataSource),
      informar: () => undefined,
      avisar: () => undefined,
    });
  };

  const enTenant = <Resultado>(tenantId: string, trabajo: () => Promise<Resultado>): Promise<Resultado> =>
    contexto.run({ tenantId, actorId: usuario }, trabajo);

  // Lecturas crudas como superusuario de la base temporal: ven todas las filas sin depender de la RLS.
  const filaSecreto = async (secretoId: string): Promise<FilaSecretoCruda | undefined> =>
    ((await dataSource.query('SELECT * FROM sec.secreto WHERE id = $1', [secretoId])) as FilaSecretoCruda[])[0];
  const clavesDelTenant = async (tenantId: string): Promise<{ clave_cifrada: Buffer; iv: Buffer; version_clave_maestra: number }[]> =>
    dataSource.query('SELECT clave_cifrada, iv, version_clave_maestra FROM sec.clave_tenant WHERE tenant_id = $1', [tenantId]);
  const auditoriaDe = async (tenantId: string): Promise<FilaAuditoriaCruda[]> =>
    dataSource.query('SELECT accion, entidad_tipo, entidad_id, antes, despues FROM aud.evento_auditoria WHERE tenant_id = $1 ORDER BY numero', [tenantId]);

  beforeAll(async () => {
    baseTemporal = await createTempDb();
    dataSource = new DataSource({ type: 'postgres', url: baseTemporal.url, entities: [...ENTIDADES_SEC, ...ENTIDADES_AUDITORIA] });
    await dataSource.initialize();

    @Module({
      imports: [KernelInfraModule.register({ dataSource, validator: new InMemoryEventSchemaValidator() }), AuditoriaModule.registrarPuerto()],
    })
    class PruebaModule {}

    app = await NestFactory.createApplicationContext(PruebaModule, { logger: false });
    contexto = app.get(TENANT_CONTEXT);
    unidadDeTrabajo = app.get(TypeOrmUnitOfWork);
    auditoria = app.get(AUDITORIA);
  });

  afterAll(async () => {
    await app?.close();
    await dataSource?.destroy();
    await baseTemporal?.drop();
  });

  it('guardar y leer devuelven exactamente los bytes, incluido un .pfx de 50 KB', async () => {
    const tenantId = uuidV7();
    const boveda = crearBoveda(soloLaUno);
    const pfx = randomBytes(BYTES_PFX);

    const idClave = await enTenant(tenantId, () => boveda.guardar(TIPO_CLAVE, valor));
    const idPfx = await enTenant(tenantId, () => boveda.guardar(TIPO_PFX, pfx));

    expect(Buffer.from(await enTenant(tenantId, () => boveda.leer(idClave))).equals(Buffer.from(valor))).toBe(true);
    expect(Buffer.from(await enTenant(tenantId, () => boveda.leer(idPfx))).equals(pfx)).toBe(true);
  });

  it('ninguna columna guarda el valor ni la clave de datos en claro, y dos guardar del mismo valor no se parecen', async () => {
    const tenantId = uuidV7();
    const boveda = crearBoveda(soloLaUno);

    const primero = await enTenant(tenantId, () => boveda.guardar(TIPO_CLAVE, valor));
    const segundo = await enTenant(tenantId, () => boveda.guardar(TIPO_CLAVE, valor));

    const [filaUno, filaDos] = [await filaSecreto(primero), await filaSecreto(segundo)];
    const [clave] = await clavesDelTenant(tenantId);
    if (!filaUno || !filaDos || !clave) throw new Error('faltan filas');
    const claveDatos = Buffer.from(cifrador.descifrar(maestraUno, clave.clave_cifrada, clave.iv, datosAsociadosClave(tenantId, 1)));
    for (const columna of [filaUno.cifrado, filaUno.iv, Buffer.from(filaUno.tipo), clave.clave_cifrada, clave.iv]) {
      expect(columna.includes(Buffer.from(valor))).toBe(false);
      expect(columna.includes(claveDatos)).toBe(false);
    }
    expect(filaUno.cifrado.equals(filaDos.cifrado)).toBe(false);
    expect(filaUno.iv.equals(filaDos.iv)).toBe(false);
    expect(filaUno).toMatchObject({ tenant_id: tenantId, tipo: TIPO_CLAVE, version: 1, creado_por: usuario, rotado_por: null, rotado_en: null });
  });

  it('el cifrado copiado a otro id, otro tipo u otro tenant falla con SecretoCorruptoError', async () => {
    const tenantA = uuidV7();
    const tenantB = uuidV7();
    const boveda = crearBoveda(soloLaUno);
    const original = await enTenant(tenantA, () => boveda.guardar(TIPO_CLAVE, valor));
    const otroId = await enTenant(tenantA, () => boveda.guardar(TIPO_CLAVE, randomBytes(8)));
    const otroTipo = await enTenant(tenantA, () => boveda.guardar(TIPO_PFX, randomBytes(8)));
    const otroTenant = await enTenant(tenantB, () => boveda.guardar(TIPO_CLAVE, randomBytes(8)));

    await dataSource.query(
      'UPDATE sec.secreto SET cifrado = o.cifrado, iv = o.iv FROM sec.secreto o WHERE o.id = $1 AND sec.secreto.id = ANY($2::uuid[])',
      [original, [otroId, otroTipo, otroTenant]],
    );

    await expect(enTenant(tenantA, () => boveda.leer(otroId))).rejects.toThrow(SecretoCorruptoError);
    await expect(enTenant(tenantA, () => boveda.leer(otroTipo))).rejects.toThrow(SecretoCorruptoError);
    await expect(enTenant(tenantB, () => boveda.leer(otroTenant))).rejects.toThrow(SecretoCorruptoError);
  });

  it('dos guardar simultáneos del primer secreto dejan una sola clave del tenant y ambos se leen', async () => {
    const tenantId = uuidV7();
    const boveda = crearBoveda(soloLaUno);

    const ids = await Promise.all([enTenant(tenantId, () => boveda.guardar(TIPO_CLAVE, valor)), enTenant(tenantId, () => boveda.guardar(TIPO_PFX, valor))]);

    expect(await clavesDelTenant(tenantId)).toHaveLength(1);
    for (const id of ids) expect(Buffer.from(await enTenant(tenantId, () => boveda.leer(id))).equals(Buffer.from(valor))).toBe(true);
  });

  it('un secreto de otro tenant o inexistente da SecretoNoEncontradoError', async () => {
    const boveda = crearBoveda(soloLaUno);
    const id = await enTenant(uuidV7(), () => boveda.guardar(TIPO_CLAVE, valor));

    await expect(enTenant(uuidV7(), () => boveda.leer(id))).rejects.toThrow(SecretoNoEncontradoError);
    await expect(enTenant(uuidV7(), () => boveda.leer(uuidV7()))).rejects.toThrow(SecretoNoEncontradoError);
  });

  it('rotar conserva el id, sube la versión, cambia el IV, registra quién y cuándo, y se lee el valor nuevo', async () => {
    const tenantId = uuidV7();
    const boveda = crearBoveda(soloLaUno);
    const id = await enTenant(tenantId, () => boveda.guardar(TIPO_CLAVE, valor));
    const antes = await filaSecreto(id);
    const nuevo = new TextEncoder().encode('clave-rotada');

    await enTenant(tenantId, () => boveda.rotar(id, nuevo));

    const despues = await filaSecreto(id);
    expect(despues).toMatchObject({ id, version: 2, rotado_por: usuario });
    expect(despues?.rotado_en).toBeInstanceOf(Date);
    expect(despues?.iv.equals(antes?.iv ?? Buffer.alloc(0))).toBe(false);
    expect(Buffer.from(await enTenant(tenantId, () => boveda.leer(id))).equals(Buffer.from(nuevo))).toBe(true);
  });

  it('dos rotar concurrentes: uno gana y el otro responde conflicto', async () => {
    const tenantId = uuidV7();
    const id = await enTenant(tenantId, () => crearBoveda(soloLaUno).guardar(TIPO_CLAVE, valor));
    const repositorio = new RepositorioSecretosTypeOrm(unidadDeTrabajo, contexto);
    const esperarAlOtro = barreraDeDos();
    // Las dos leen la versión 1 antes de que ninguna actualice.
    const sincronizado: RepositorioSecretos = {
      obtener: async (secretoId) => {
        const leido = await repositorio.obtener(secretoId);
        await esperarAlOtro();
        return leido;
      },
      insertar: (secreto) => repositorio.insertar(secreto),
      actualizar: (secreto, versionEsperada) => repositorio.actualizar(secreto, versionEsperada),
      borrar: (secretoId) => repositorio.borrar(secretoId),
    };
    const boveda = crearBoveda(soloLaUno, sincronizado);

    const resultados = await Promise.allSettled([
      enTenant(tenantId, () => boveda.rotar(id, randomBytes(8))),
      enTenant(tenantId, () => boveda.rotar(id, randomBytes(8))),
    ]);

    expect(resultados.filter((resultado) => resultado.status === 'fulfilled')).toHaveLength(1);
    const [fallido] = resultados.filter((resultado): resultado is PromiseRejectedResult => resultado.status === 'rejected');
    expect(fallido?.reason).toBeInstanceOf(SecretoModificadoError);
    expect((await filaSecreto(id))?.version).toBe(2);
  });

  it('eliminar borra la fila; leer después no lo encuentra; eliminar un id inexistente no falla ni audita', async () => {
    const tenantId = uuidV7();
    const boveda = crearBoveda(soloLaUno);
    const id = await enTenant(tenantId, () => boveda.guardar(TIPO_CLAVE, valor));

    await enTenant(tenantId, () => boveda.eliminar(id));
    const auditadas = (await auditoriaDe(tenantId)).length;
    await enTenant(tenantId, () => boveda.eliminar(uuidV7()));
    await enTenant(tenantId, () => boveda.eliminar(id));

    expect(await filaSecreto(id)).toBeUndefined();
    await expect(enTenant(tenantId, () => boveda.leer(id))).rejects.toThrow(SecretoNoEncontradoError);
    expect(await auditoriaDe(tenantId)).toHaveLength(auditadas);
  });

  it('guardar, rotar y eliminar dejan su fila en aud con el tipo y sin el valor; leer no escribe en aud', async () => {
    const tenantId = uuidV7();
    const boveda = crearBoveda(soloLaUno);

    const id = await enTenant(tenantId, () => boveda.guardar(TIPO_CLAVE, valor));
    await enTenant(tenantId, () => boveda.leer(id));
    await enTenant(tenantId, () => boveda.rotar(id, valor));
    await enTenant(tenantId, () => boveda.leer(id));
    await enTenant(tenantId, () => boveda.eliminar(id));

    const filas = await auditoriaDe(tenantId);
    expect(filas).toEqual([
      { accion: 'plat.secreto.guardar', entidad_tipo: 'secreto', entidad_id: id, antes: null, despues: { tipo: TIPO_CLAVE } },
      { accion: 'plat.secreto.rotar', entidad_tipo: 'secreto', entidad_id: id, antes: null, despues: { tipo: TIPO_CLAVE, version: 2 } },
      { accion: 'plat.secreto.eliminar', entidad_tipo: 'secreto', entidad_id: id, antes: { tipo: TIPO_CLAVE, version: 2 }, despues: null },
    ]);
    expect(JSON.stringify(filas)).not.toContain('clave-super-secreta');
  });

  it('si la transacción del llamador se revierte, no queda secreto, clave ni fila de aud', async () => {
    const tenantId = uuidV7();
    const boveda = crearBoveda(soloLaUno);
    let guardado = '';

    await expect(
      enTenant(tenantId, () =>
        unidadDeTrabajo.run(async () => {
          guardado = await boveda.guardar(TIPO_CLAVE, valor);
          throw new Error('el caso de uso del consumidor falla después de guardar');
        }),
      ),
    ).rejects.toThrow('el caso de uso del consumidor falla');

    expect(guardado).not.toBe('');
    expect(await filaSecreto(guardado)).toBeUndefined();
    expect(await clavesDelTenant(tenantId)).toEqual([]);
    expect(await auditoriaDe(tenantId)).toEqual([]);
  });

  it('rotación de la maestra: lee con 1 y 2, los tenants nuevos usan la 2, re-envuelve sin tocar los secretos y lee sin la 1', async () => {
    const tenantViejo = uuidV7();
    const tenantNuevo = uuidV7();
    const idViejo = await enTenant(tenantViejo, () => crearBoveda(soloLaUno).guardar(TIPO_CLAVE, valor));
    const secretoAntes = await filaSecreto(idViejo);

    const durante = crearBoveda(unoYDos);
    expect(Buffer.from(await enTenant(tenantViejo, () => durante.leer(idViejo))).equals(Buffer.from(valor))).toBe(true);
    const idNuevo = await enTenant(tenantNuevo, () => durante.guardar(TIPO_CLAVE, valor));
    expect((await clavesDelTenant(tenantNuevo))[0]?.version_clave_maestra).toBe(2);
    await expect(enTenant(tenantViejo, () => crearBoveda(soloLaDos).leer(idViejo))).rejects.toThrow(ClaveMaestraDesconocidaError);

    const reenvoltura = crearReenvoltura(unoYDos);
    expect(await reenvoltura.contarPendientes()).toBeGreaterThan(0);
    const resultado = await reenvoltura.ejecutar();

    expect(resultado.pendientes).toBe(0);
    expect(resultado.reenvueltas).toBeGreaterThan(0);
    expect(await reenvoltura.contarPendientes()).toBe(0);
    expect((await dataSource.query('SELECT count(*)::int AS n FROM sec.clave_tenant WHERE version_clave_maestra <> 2'))[0].n).toBe(0);
    expect(await filaSecreto(idViejo)).toEqual(secretoAntes);
    const despues = crearBoveda(soloLaDos);
    expect(Buffer.from(await enTenant(tenantViejo, () => despues.leer(idViejo))).equals(Buffer.from(valor))).toBe(true);
    expect(Buffer.from(await enTenant(tenantNuevo, () => despues.leer(idNuevo))).equals(Buffer.from(valor))).toBe(true);
  });
});
