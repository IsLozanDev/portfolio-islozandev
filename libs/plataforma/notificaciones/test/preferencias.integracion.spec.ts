import 'reflect-metadata';
import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { EventPublisher, TenantContext } from '@vitrina/plataforma/kernel';
import { EVENT_PUBLISHER, InMemoryEventSchemaValidator, KernelInfraModule, SystemClock, TENANT_CONTEXT, TypeOrmUnitOfWork, uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { DataSource } from 'typeorm';
import type { DependenciasPreferencias } from '../src/application/dependencias.js';
import { EnviarNotificacion } from '../src/application/enviar-notificacion.js';
import { ConsultarPreferencias } from '../src/application/preferencias/consultar-preferencias.js';
import { RegistrarBaja } from '../src/application/preferencias/registrar-baja.js';
import { vencimientoEnlace } from '../src/domain/enlace-preferencias.js';
import { FirmadorEnlaceHmac } from '../src/infrastructure/crypto/firmador-enlace.hmac.js';
import { registrarEsquemasNot } from '../src/infrastructure/event-schemas.js';
import { RepositorioBajasTypeOrm } from '../src/infrastructure/typeorm/bajas.repositorio.js';
import { RepositorioContactosInvalidosTypeOrm } from '../src/infrastructure/typeorm/contactos-invalidos.repositorio.js';
import { ENTIDADES_NOT } from '../src/infrastructure/typeorm/entidades.js';
import { RepositorioMensajesTypeOrm } from '../src/infrastructure/typeorm/mensajes.repositorio.js';
import { RepositorioPlantillasTypeOrm } from '../src/infrastructure/typeorm/plantillas.repositorio.js';
import { CLAVE_ENLACE_PRUEBA, ConsentimientosMemoria, PersonasMemoria, registro, URL_PREFERENCIAS_PRUEBA } from './support/dobles.js';
import { createTempDb, describeConDb, type TempDb } from './support/temp-db.js';

const CORREO = 'ana@ejemplo.pe';
const HASH = `sha256:${CORREO}`;

describeConDb('Preferencias y bajas con TypeORM (spec 46, PostgreSQL 16)', () => {
  let baseTemporal: TempDb;
  let dataSource: DataSource;
  let app: INestApplicationContext;
  let contexto: TenantContext;
  let consentimientos: ConsentimientosMemoria;
  let personas: PersonasMemoria;
  let enviar: EnviarNotificacion;
  let consultar: ConsultarPreferencias;
  let registrar: RegistrarBaja;
  const firmador = new FirmadorEnlaceHmac(CLAVE_ENLACE_PRUEBA);

  const enTenant = <Resultado>(tenantId: string, trabajo: () => Promise<Resultado>): Promise<Resultado> => contexto.run({ tenantId }, trabajo);
  const token = (tenantId: string, personaId?: string) =>
    firmador.firmar({ tenantId, canal: 'CORREO', destinoHash: HASH, ...(personaId ? { personaId } : {}), venceEn: vencimientoEnlace(new Date()) });
  const enviarA = (tenantId: string, finalidad: 'TRANSACCIONAL' | 'PROMOCIONAL', personaId?: string) =>
    enTenant(tenantId, () =>
      enviar.enviar({
        plantilla: 'PRUEBA_CORREO',
        destinatario: personaId ? { personaId } : { correo: CORREO },
        variables: { nombre: 'Ana', producto: 'SazónPOS' },
        finalidad,
        claveIdempotencia: uuidV7(),
      }),
    );
  const filasDe = (tenantId: string): Promise<{ alcance: string; persona_id: string | null }[]> =>
    dataSource.query('SELECT alcance, persona_id FROM ntf.baja WHERE tenant_id = $1 ORDER BY alcance', [tenantId]);

  beforeAll(async () => {
    baseTemporal = await createTempDb();
    dataSource = new DataSource({ type: 'postgres', url: baseTemporal.url, entities: ENTIDADES_NOT });
    await dataSource.initialize();
    const validador = new InMemoryEventSchemaValidator();
    registrarEsquemasNot(validador);

    @Module({ imports: [KernelInfraModule.register({ dataSource, validator: validador })] })
    class PruebaModule {}

    app = await NestFactory.createApplicationContext(PruebaModule, { logger: false });
    contexto = app.get(TENANT_CONTEXT);
    const unidadDeTrabajo = app.get(TypeOrmUnitOfWork);
    const reloj = new SystemClock();
    const ids = { next: uuidV7 };
    const mensajes = new RepositorioMensajesTypeOrm(unidadDeTrabajo, contexto);
    const bajas = new RepositorioBajasTypeOrm(unidadDeTrabajo, contexto);
    consentimientos = new ConsentimientosMemoria(contexto);
    personas = new PersonasMemoria();
    enviar = new EnviarNotificacion({
      unidadDeTrabajo,
      contexto,
      reloj,
      ids,
      publicador: app.get<EventPublisher>(EVENT_PUBLISHER),
      mensajes,
      plantillas: new RepositorioPlantillasTypeOrm(unidadDeTrabajo, contexto),
      contactosInvalidos: new RepositorioContactosInvalidosTypeOrm(unidadDeTrabajo, contexto),
      bajas,
      enlacePreferencias: { firmador, urlBase: URL_PREFERENCIAS_PRUEBA },
      avisar: () => undefined,
      personas,
      consentimientos,
      hashearDestino: (destino) => `sha256:${destino}`,
      zonaHoraria: 'America/Lima',
    });
    const dependencias: DependenciasPreferencias = { unidadDeTrabajo, contexto, reloj, ids, mensajes, bajas, consentimientos, firmador, informar: registro() };
    consultar = new ConsultarPreferencias(dependencias);
    registrar = new RegistrarBaja(dependencias);
  });

  afterAll(async () => {
    await app?.close();
    await dataSource?.destroy();
    await baseTemporal?.drop();
  });

  it('TR-CA-193: baja PROMOCIONAL con persona revoca PROMOCIONES; el promocional queda omitido y el transaccional sale', async () => {
    const tenantId = uuidV7();
    const personaId = uuidV7();
    personas.correos.set(personaId, [{ valor: CORREO, principal: true }]);
    consentimientos.conPromociones.add(personaId);

    await registrar.ejecutar(token(tenantId, personaId), 'PROMOCIONAL');
    const promocional = await enviarA(tenantId, 'PROMOCIONAL', personaId);
    const transaccional = await enviarA(tenantId, 'TRANSACCIONAL', personaId);

    expect(consentimientos.revocaciones).toContainEqual({ personaId, finalidad: 'PROMOCIONES', canal: 'WEB', actorId: personaId });
    expect(await filasDe(tenantId)).toEqual([{ alcance: 'PROMOCIONAL', persona_id: personaId }]);
    expect(promocional.estado).toBe('OMITIDO_SIN_CONSENTIMIENTO');
    expect(transaccional.estado).toBe('ENCOLADO');
  });

  it('baja CANAL de un correo suelto: se guarda por hash, no llama a PER y todo envío posterior queda DESCARTADO', async () => {
    const tenantId = uuidV7();
    const revocacionesAntes = consentimientos.revocaciones.length;

    await registrar.ejecutar(token(tenantId), 'CANAL');
    const despues = await enviarA(tenantId, 'TRANSACCIONAL');

    expect(await filasDe(tenantId)).toEqual([{ alcance: 'CANAL', persona_id: null }]);
    expect(consentimientos.revocaciones).toHaveLength(revocacionesAntes);
    expect(despues.estado).toBe('DESCARTADO');
    const [{ motivo_fallo: motivo }] = await dataSource.query('SELECT motivo_fallo FROM ntf.mensaje WHERE id = $1', [despues.mensajeId]);
    expect(motivo).toBe('BAJA_CANAL');
  });

  it('repetir la baja no duplica la fila', async () => {
    const tenantId = uuidV7();

    await registrar.ejecutar(token(tenantId), 'PROMOCIONAL');
    const repetida = await registrar.ejecutar(token(tenantId), 'PROMOCIONAL');

    expect(repetida).toEqual({ bajas: ['PROMOCIONAL'] });
    expect(await filasDe(tenantId)).toHaveLength(1);
  });

  it('TR-RNF-010: el token de un tenant no lee ni registra bajas de otro', async () => {
    const tenantA = uuidV7();
    const tenantB = uuidV7();
    await enviarA(tenantA, 'TRANSACCIONAL');
    await registrar.ejecutar(token(tenantA), 'CANAL');

    const vistaDeB = await consultar.ejecutar(token(tenantB));
    await registrar.ejecutar(token(tenantB), 'PROMOCIONAL');

    expect(vistaDeB).toEqual({ destinoEnmascarado: '***', canal: 'CORREO', bajas: [] });
    expect(await filasDe(tenantA)).toEqual([{ alcance: 'CANAL', persona_id: null }]);
    expect(await filasDe(tenantB)).toEqual([{ alcance: 'PROMOCIONAL', persona_id: null }]);
    expect(await consultar.ejecutar(token(tenantA))).toEqual({ destinoEnmascarado: 'a***@ejemplo.pe', canal: 'CORREO', bajas: ['CANAL'] });
  });
});
