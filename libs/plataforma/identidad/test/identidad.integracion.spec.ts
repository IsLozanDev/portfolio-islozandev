import { AlsTenantContext, SystemClock, TypeOrmUnitOfWork, uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { DataSource } from 'typeorm';
import { ConsultarDocumento } from '../src/application/consultar-documento.js';
import { DocumentoNoEncontradoError } from '../src/domain/errores.js';
import { CuotaNula } from '../src/infrastructure/cuota.nula.js';
import { ProveedorFalso } from '../src/infrastructure/falso/proveedor.falso.js';
import { ProveedorConRespaldo } from '../src/infrastructure/respaldo/proveedor-con-respaldo.js';
import { BitacoraConsultasTypeOrm } from '../src/infrastructure/typeorm/bitacora-consultas.repositorio.js';
import { CacheIdentidadRepositorioTypeOrm } from '../src/infrastructure/typeorm/cache-identidad.repositorio.js';
import { ConfiguracionProveedoresTypeOrm } from '../src/infrastructure/typeorm/configuracion-proveedores.repositorio.js';
import { ENTIDADES_IDN } from '../src/infrastructure/typeorm/entidades.js';
import { ConsultorEspia, HasherPrueba } from './support/dobles.js';
import { createTempDb, describeConDb, type TempDb } from './support/temp-db.js';

// Rol sin BYPASSRLS para leer la bitácora como la app: el DataSource de la prueba es superusuario.
const ROL_APP = 'idn_integracion_app';
const DNI_JUANA = '45781236';
const consulta = { tipo: 'DNI' as const, numero: DNI_JUANA, motivo: 'REGISTRO_CLIENTE' as const };

describeConDb('Identidad con TypeORM (TR-RF-045, 046, PostgreSQL 16)', () => {
  let baseTemporal: TempDb;
  let dataSource: DataSource;
  let contexto: AlsTenantContext;
  let consultor: ConsultorEspia;
  let consultarDocumento: ConsultarDocumento;
  const tenantA = uuidV7();
  const tenantB = uuidV7();

  const filasBitacoraVisiblesPara = async (tenantId: string): Promise<{ tenant_id: string; resultado: string }[]> =>
    dataSource.transaction(async (manager) => {
      await manager.query(`SET LOCAL ROLE ${ROL_APP}`);
      await manager.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
      return manager.query(`SELECT tenant_id, resultado FROM idn.consulta_log ORDER BY id`);
    });

  beforeAll(async () => {
    baseTemporal = await createTempDb();
    dataSource = new DataSource({ type: 'postgres', url: baseTemporal.url, entities: ENTIDADES_IDN });
    await dataSource.initialize();
    await dataSource.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${ROL_APP}') THEN CREATE ROLE ${ROL_APP} NOLOGIN; END IF;
    END $$`);
    await dataSource.query(`GRANT USAGE ON SCHEMA idn TO ${ROL_APP}; GRANT SELECT ON idn.consulta_log TO ${ROL_APP}`);

    contexto = new AlsTenantContext();
    const unidadDeTrabajo = new TypeOrmUnitOfWork(dataSource, contexto);
    const reloj = new SystemClock();
    consultor = new ConsultorEspia(new ProveedorConRespaldo([new ProveedorFalso()], reloj));
    consultarDocumento = new ConsultarDocumento({
      unidadDeTrabajo,
      contexto,
      reloj,
      cache: new CacheIdentidadRepositorioTypeOrm(unidadDeTrabajo),
      bitacora: new BitacoraConsultasTypeOrm(unidadDeTrabajo),
      configuracion: new ConfiguracionProveedoresTypeOrm(unidadDeTrabajo),
      consultor,
      cuota: new CuotaNula(),
      hasher: new HasherPrueba(),
    });
  });

  afterAll(async () => {
    await dataSource?.destroy();
    // El rol es del clúster y no se borra, como sync_lector: otra base temporal en paralelo puede tener sus privilegios.
    await baseTemporal?.drop();
  });

  it('lee DECOLECTA de idn.proveedor para DNI y RUC', async () => {
    const unidadDeTrabajo = new TypeOrmUnitOfWork(dataSource, contexto);
    const configuracion = new ConfiguracionProveedoresTypeOrm(unidadDeTrabajo);
    const activos = await contexto.run({ tenantId: tenantA }, () => unidadDeTrabajo.run(() => configuracion.activosPara('RUC')));
    expect(activos).toEqual([{ codigo: 'DECOLECTA', prioridad: 1, ttlDias: 30, timeoutMs: 3000 }]);
  });

  it('la caché es compartida entre tenants y la bitácora queda aislada por tenant', async () => {
    const primera = await contexto.run({ tenantId: tenantA }, () => consultarDocumento.ejecutar(consulta));
    const segunda = await contexto.run({ tenantId: tenantB }, () => consultarDocumento.ejecutar(consulta));

    expect(primera).toMatchObject({ fuente: 'PROVEEDOR', datos: { nombres: 'Juana', apellidos: 'Quispe Mamani' } });
    expect(segunda).toMatchObject({ fuente: 'CACHE', proveedor: 'DECOLECTA', datos: { nombres: 'Juana', apellidos: 'Quispe Mamani' } });
    expect(consultor.llamadas).toBe(1);

    const [fila] = await dataSource.query(`SELECT datos, fuente, expira_en - consultado_en AS ttl FROM idn.cache_documento WHERE numero = $1`, [DNI_JUANA]);
    expect(fila).toMatchObject({ datos: { nombres: 'Juana', apellidos: 'Quispe Mamani' }, fuente: 'DECOLECTA', ttl: { days: 30 } });

    expect(await filasBitacoraVisiblesPara(tenantA)).toEqual([{ tenant_id: tenantA, resultado: 'PROVEEDOR' }]);
    expect(await filasBitacoraVisiblesPara(tenantB)).toEqual([{ tenant_id: tenantB, resultado: 'CACHE' }]);
  });

  it('el número queda hasheado en la bitácora', async () => {
    const filas: { numero_hash: string }[] = await dataSource.query(`SELECT numero_hash FROM idn.consulta_log`);
    expect(filas.length).toBeGreaterThan(0);
    for (const { numero_hash } of filas) expect(numero_hash).toBe(new HasherPrueba().hashear(DNI_JUANA));
  });

  it('la caché vencida se actualiza con una nueva llamada', async () => {
    await dataSource.query(`UPDATE idn.cache_documento SET expira_en = now() - interval '1 day', consultado_en = now() - interval '31 days' WHERE numero = $1`, [
      DNI_JUANA,
    ]);
    const llamadasAntes = consultor.llamadas;

    const respuesta = await contexto.run({ tenantId: tenantA }, () => consultarDocumento.ejecutar(consulta));

    expect(respuesta.fuente).toBe('PROVEEDOR');
    expect(consultor.llamadas).toBe(llamadasAntes + 1);
    const [{ vigente }] = await dataSource.query(`SELECT expira_en > now() AS vigente FROM idn.cache_documento WHERE numero = $1`, [DNI_JUANA]);
    expect(vigente).toBe(true);
  });

  it('RUC: guarda los cinco campos en snake_case y responde apto_factura', async () => {
    const respuesta = await contexto.run({ tenantId: tenantA }, () =>
      consultarDocumento.ejecutar({ tipo: 'RUC', numero: '20498765433', motivo: 'EMISION_COMPROBANTE' }),
    );
    expect(respuesta).toMatchObject({ aptoFactura: false, motivoNoApto: 'Estado BAJA DE OFICIO' });
    const [{ datos }] = await dataSource.query(`SELECT datos FROM idn.cache_documento WHERE tipo_doc = 'RUC' AND numero = '20498765433'`);
    expect(Object.keys(datos).sort()).toEqual(['condicion', 'direccion_fiscal', 'estado', 'razon_social', 'ubigeo']);
  });

  it('NO_ENCONTRADO no deja fila en la caché', async () => {
    await expect(contexto.run({ tenantId: tenantA }, () => consultarDocumento.ejecutar({ ...consulta, numero: '99999999' }))).rejects.toThrow(
      DocumentoNoEncontradoError,
    );
    expect(await dataSource.query(`SELECT 1 FROM idn.cache_documento WHERE numero = '99999999'`)).toEqual([]);
    expect(await filasBitacoraVisiblesPara(tenantA)).toContainEqual({ tenant_id: tenantA, resultado: 'NO_ENCONTRADO' });
  });

  it('TR-CA-117: insertar otra clave en un DNI viola ck_cache_campos', async () => {
    await expect(
      dataSource.query(
        `INSERT INTO idn.cache_documento (tipo_doc, numero, datos, fuente, consultado_en, expira_en)
         VALUES ('DNI', '10293847', '{"nombres": "Luis", "apellidos": "Huamán", "direccion": "Jr. Lima 1"}', 'DECOLECTA', now(), now())`,
      ),
    ).rejects.toMatchObject({ driverError: { constraint: 'ck_cache_campos' } });
  });
});
