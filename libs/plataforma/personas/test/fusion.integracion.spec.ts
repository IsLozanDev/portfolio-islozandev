import { AlsTenantContext, InMemoryEventSchemaValidator, OutboxPublisher, SystemClock, TypeOrmUnitOfWork, uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { DataSource } from 'typeorm';
import { AgregarDireccion } from '../src/application/agregar-direccion.js';
import { AsignarRolPersona } from '../src/application/asignar-rol.js';
import type { DependenciasPersonas } from '../src/application/dependencias-personas.js';
import { DescartarPar } from '../src/application/duplicados/descartar-par.js';
import { FusionarPersonas, type FusionarPersonasComando } from '../src/application/duplicados/fusionar-personas.js';
import { ObtenerPersona } from '../src/application/obtener-persona.js';
import type { PersonaDetalle, RegistrarPersonaComando } from '../src/application/ports/persona.port.js';
import { RegistrarPersona } from '../src/application/registrar-persona.js';
import type { PersonaFusionada } from '../src/domain/eventos-per.js';
import { registrarEsquemasPer } from '../src/infrastructure/event-schemas.js';
import { RepositorioConsentimientosTypeOrm } from '../src/infrastructure/typeorm/consentimientos.repositorio.js';
import { ConsultaDuplicadosTypeOrm } from '../src/infrastructure/typeorm/consulta-duplicados.typeorm.js';
import { ConsultaPersonasTypeOrm } from '../src/infrastructure/typeorm/consulta-personas.typeorm.js';
import { ENTIDADES_PER } from '../src/infrastructure/typeorm/entidades.js';
import { RepositorioFusionesTypeOrm } from '../src/infrastructure/typeorm/fusiones.repositorio.js';
import { RepositorioPersonasTypeOrm } from '../src/infrastructure/typeorm/personas.repositorio.js';
import { ConsumidorCitasDePrueba } from './support/consumidor-citas.js';
import { ArchivosFijos, AuditoriaEspia, CatalogoFijo, IdentidadEspia, SuscripcionesFijas, UBIGEO_CAYMA } from './support/dobles.js';
import { createTempDb, describeConDb, type TempDb } from './support/temp-db.js';

const JUANA_DNI: RegistrarPersonaComando = {
  tipoPersona: 'NATURAL',
  tipoDocumento: 'DNI',
  numeroDocumento: '45781236',
  nombres: 'Juana',
  apellidoPaterno: 'Quispe',
  apellidoMaterno: 'Mamani',
  celular: '987654321',
};
const JUANA_PASAPORTE: RegistrarPersonaComando = {
  ...JUANA_DNI,
  tipoDocumento: 'PASAPORTE',
  numeroDocumento: 'P1234567',
  apellidoMaterno: null,
  correo: 'juana@correo.pe',
};
const MOTIVO = 'Misma clienta registrada con pasaporte';

interface FilaOutbox {
  event_id: string;
  event_type: string;
  payload: PersonaFusionada;
}

describeConDb('Fusión de personas con TypeORM (spec 39, PostgreSQL 16)', () => {
  let baseTemporal: TempDb;
  let dataSource: DataSource;
  let contexto: AlsTenantContext;
  let unidadDeTrabajo: TypeOrmUnitOfWork;
  let dependencias: DependenciasPersonas;
  let auditoria: AuditoriaEspia;

  const enTenant = <Resultado>(tenantId: string, trabajo: () => Promise<Resultado>): Promise<Resultado> =>
    contexto.run({ tenantId, actorId: uuidV7() }, trabajo);

  const consultar = <Fila>(tenantId: string, sql: string, parametros: unknown[]): Promise<Fila[]> =>
    contexto.run({ tenantId }, () => unidadDeTrabajo.run(() => unidadDeTrabajo.manager.query(sql, parametros)));

  const comando = (conservada: PersonaDetalle, absorbida: PersonaDetalle): FusionarPersonasComando => ({
    conservadaId: conservada.id,
    absorbidaId: absorbida.id,
    versionConservada: conservada.version,
    versionAbsorbida: absorbida.version,
    camposElegidos: { datosBasicos: {}, principales: {} },
    motivo: MOTIVO,
  });

  /** Juana con DNI y Juana con pasaporte, correo, rol y dirección; devuelve las dos ya leídas. */
  async function dosJuanas(tenantId: string, sufijo: string): Promise<[PersonaDetalle, PersonaDetalle]> {
    return enTenant(tenantId, async () => {
      const registrar = new RegistrarPersona(dependencias);
      const conservada = await registrar.ejecutar({ ...JUANA_DNI, numeroDocumento: `4578${sufijo}` });
      const absorbida = await registrar.ejecutar({ ...JUANA_PASAPORTE, numeroDocumento: `P${sufijo}` });
      await new AsignarRolPersona(dependencias).ejecutar({ personaId: absorbida.id, productoCodigo: 'CLI', rol: 'PACIENTE' });
      await new AgregarDireccion(dependencias).ejecutar({ personaId: absorbida.id, direccion: 'Av. Ejército 710', ubigeo: UBIGEO_CAYMA, principal: true });
      const obtener = new ObtenerPersona(dependencias);
      return [await obtener.ejecutar(conservada.id), await obtener.ejecutar(absorbida.id)];
    });
  }

  beforeAll(async () => {
    baseTemporal = await createTempDb();
    dataSource = new DataSource({ type: 'postgres', url: baseTemporal.url, entities: ENTIDADES_PER });
    await dataSource.initialize();
    contexto = new AlsTenantContext();
    unidadDeTrabajo = new TypeOrmUnitOfWork(dataSource, contexto);
    const validador = new InMemoryEventSchemaValidator();
    registrarEsquemasPer(validador);
    auditoria = new AuditoriaEspia();
    dependencias = {
      unidadDeTrabajo,
      contexto,
      reloj: new SystemClock(),
      ids: { next: uuidV7 },
      publicador: new OutboxPublisher(unidadDeTrabajo, contexto, validador, { next: uuidV7 }),
      personas: new RepositorioPersonasTypeOrm(unidadDeTrabajo, contexto),
      consultaPersonas: new ConsultaPersonasTypeOrm(unidadDeTrabajo, contexto),
      suscripciones: new SuscripcionesFijas(['CLI']),
      catalogo: new CatalogoFijo(),
      identidad: new IdentidadEspia(),
      consentimientos: new RepositorioConsentimientosTypeOrm(unidadDeTrabajo, contexto),
      auditoria,
      archivos: new ArchivosFijos(),
      consultaDuplicados: new ConsultaDuplicadosTypeOrm(unidadDeTrabajo, contexto),
      fusiones: new RepositorioFusionesTypeOrm(unidadDeTrabajo, contexto),
    };
  });

  afterAll(async () => {
    await dataSource?.destroy();
    await baseTemporal?.drop();
  });

  it('TR-CA-107: mueve roles, contactos y direcciones, deja el alias, registra la fusión y publica persona.fusionada', async () => {
    const tenant = uuidV7();
    const [conservada, absorbida] = await dosJuanas(tenant, '1236');
    const consumidor = new ConsumidorCitasDePrueba();
    consumidor.citas.set('cita-1', conservada.id);
    consumidor.citas.set('cita-2', absorbida.id);

    const resultado = await enTenant(tenant, () => new FusionarPersonas(dependencias).ejecutar(comando(conservada, absorbida)));

    expect(resultado.roles.map(({ productoCodigo, rol }) => [productoCodigo, rol])).toEqual([['CLI', 'PACIENTE']]);
    expect(resultado.contactos.map(({ tipo, principal }) => [tipo, principal])).toEqual([
      ['CELULAR', true],
      ['CORREO', true],
    ]);
    expect(resultado.direcciones.map(({ direccion, principal }) => [direccion, principal])).toEqual([['Av. Ejército 710', true]]);
    const [alias] = await consultar<{ activo: boolean; fusionada_en_id: string }>(
      tenant,
      `SELECT activo, fusionada_en_id FROM per.persona WHERE id = $1`,
      [absorbida.id],
    );
    expect(alias).toEqual({ activo: false, fusionada_en_id: conservada.id });
    const enLaAbsorbida = await consultar<{ n: number }>(
      tenant,
      `SELECT (SELECT count(*) FROM per.persona_rol WHERE persona_id = $1)
            + (SELECT count(*) FROM per.contacto WHERE persona_id = $1 AND tipo_contacto = 'CORREO')
            + (SELECT count(*) FROM per.direccion WHERE persona_id = $1) AS n`,
      [absorbida.id],
    );
    expect(Number(enLaAbsorbida[0]?.n)).toBe(0);
    expect(await consultar(tenant, `SELECT motivo FROM per.fusion WHERE persona_absorbida_id = $1`, [absorbida.id])).toEqual([{ motivo: MOTIVO }]);

    const [evento] = await consultar<FilaOutbox>(
      tenant,
      `SELECT event_id, event_type, payload FROM sync.outbox WHERE tenant_id = $1 AND event_type = 'persona.fusionada'`,
      [tenant],
    );
    expect(evento?.payload).toMatchObject({ persona_conservada_id: conservada.id, persona_absorbida_id: absorbida.id });
    if (!evento) throw new Error('sin evento');
    consumidor.personaFusionada({ eventId: evento.event_id, payload: evento.payload });
    consumidor.personaFusionada({ eventId: evento.event_id, payload: evento.payload });
    expect([...consumidor.citas.values()]).toEqual([conservada.id, conservada.id]);
    expect(consumidor.reasignaciones).toBe(1);

    expect(auditoria.entradas.at(-1)).toMatchObject({ accion: 'plat.persona.fusionar', entidadId: conservada.id, motivo: MOTIVO });
  });

  it('la absorbida no se lista y leerla devuelve la conservada', async () => {
    const tenant = uuidV7();
    const [conservada, absorbida] = await dosJuanas(tenant, '2222');
    await enTenant(tenant, () => new FusionarPersonas(dependencias).ejecutar(comando(conservada, absorbida)));

    const lista = await enTenant(tenant, () =>
      unidadDeTrabajo.run(() => dependencias.consultaPersonas.buscar({ consulta: null, pagina: 1, tamano: 20 })),
    );
    expect(lista.items.map((item) => item.id)).toEqual([conservada.id]);
    expect(await enTenant(tenant, () => new ObtenerPersona(dependencias).ejecutar(absorbida.id))).toMatchObject({
      id: conservada.id,
      resueltaDesde: absorbida.id,
      alias: [absorbida.id],
    });
  });

  it('si A se fusionó en B y luego B en C, A y B apuntan a C', async () => {
    const tenant = uuidV7();
    const [primera, segunda] = await dosJuanas(tenant, '3333');
    const tercera = await enTenant(tenant, () => new RegistrarPersona(dependencias).ejecutar({ ...JUANA_DNI, tipoDocumento: 'CE', numeroDocumento: '003333' }));
    await enTenant(tenant, () => new FusionarPersonas(dependencias).ejecutar(comando(segunda, primera)));
    const segundaActual = await enTenant(tenant, () => new ObtenerPersona(dependencias).ejecutar(segunda.id));

    await enTenant(tenant, () => new FusionarPersonas(dependencias).ejecutar(comando(tercera, segundaActual)));

    const alias = await consultar<{ id: string; fusionada_en_id: string }>(
      tenant,
      `SELECT id, fusionada_en_id FROM per.persona WHERE tenant_id = $1 AND fusionada_en_id IS NOT NULL ORDER BY id`,
      [tenant],
    );
    expect(alias).toEqual(expect.arrayContaining([{ id: primera.id, fusionada_en_id: tercera.id }, { id: segunda.id, fusionada_en_id: tercera.id }]));
    expect(await enTenant(tenant, () => new ObtenerPersona(dependencias).ejecutar(primera.id))).toMatchObject({ id: tercera.id });
  });

  it('un fallo a mitad de la fusión no deja filas movidas, alias, registro ni evento', async () => {
    const tenant = uuidV7();
    const [conservada, absorbida] = await dosJuanas(tenant, '4444');
    const auditoriaQueFalla = { registrar: async () => Promise.reject(new Error('auditoría caída')) };

    await expect(
      enTenant(tenant, () => new FusionarPersonas({ ...dependencias, auditoria: auditoriaQueFalla }).ejecutar(comando(conservada, absorbida))),
    ).rejects.toThrow('auditoría caída');

    expect(await enTenant(tenant, () => new ObtenerPersona(dependencias).ejecutar(absorbida.id))).toMatchObject({
      id: absorbida.id,
      activo: true,
      resueltaDesde: null,
      roles: [expect.objectContaining({ productoCodigo: 'CLI' })],
    });
    expect(await consultar(tenant, `SELECT id FROM per.fusion WHERE persona_absorbida_id = $1`, [absorbida.id])).toEqual([]);
    expect(await consultar(tenant, `SELECT event_id FROM sync.outbox WHERE tenant_id = $1 AND event_type = 'persona.fusionada'`, [tenant])).toEqual([]);
  });

  it('una segunda fusión de la misma absorbida falla por uq_fusion_absorbida', async () => {
    const tenant = uuidV7();
    const [conservada, absorbida] = await dosJuanas(tenant, '5555');
    await enTenant(tenant, () => new FusionarPersonas(dependencias).ejecutar(comando(conservada, absorbida)));

    await expect(
      enTenant(tenant, () =>
        unidadDeTrabajo.run(() =>
          dependencias.fusiones.registrar({
            id: uuidV7(),
            conservadaId: conservada.id,
            absorbidaId: absorbida.id,
            camposElegidos: { datosBasicos: {}, principales: {} },
            motivo: MOTIVO,
            fusionadoPor: uuidV7(),
            fusionadoEn: new Date(),
          }),
        ),
      ),
    ).rejects.toMatchObject({ driverError: expect.objectContaining({ code: '23505' }) });
  });

  it('desde otro tenant las personas no existen para fusionar ni descartar', async () => {
    const tenant = uuidV7();
    const [conservada, absorbida] = await dosJuanas(tenant, '6666');

    await expect(enTenant(uuidV7(), () => new FusionarPersonas(dependencias).ejecutar(comando(conservada, absorbida)))).rejects.toMatchObject({
      code: 'NO_ENCONTRADA',
    });
    await expect(enTenant(uuidV7(), () => new DescartarPar(dependencias).ejecutar(conservada.id, absorbida.id))).rejects.toMatchObject({
      code: 'NO_ENCONTRADA',
    });
  });
});
