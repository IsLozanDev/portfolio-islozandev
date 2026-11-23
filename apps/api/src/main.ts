import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { ENTIDADES_AUDITORIA } from '@vitrina/plataforma/auditoria';
import { ENTIDADES_CAT, registrarEsquemasCat } from '@vitrina/plataforma/catalogos';
import { ENTIDADES_FE, registrarEsquemasFe } from '@vitrina/plataforma/comprobantes';
import { ENTIDADES_SEQ, registrarEsquemasSeq } from '@vitrina/plataforma/correlativos';
import { ENTIDADES_EVT } from '@vitrina/plataforma/eventos';
import { ENTIDADES_IDN, registrarEsquemasIdn } from '@vitrina/plataforma/identidad';
import { InMemoryEventSchemaValidator } from '@vitrina/plataforma/kernel-infra';
import { salDocumento, usarLoggerDeObservabilidad } from '@vitrina/plataforma/observabilidad';
import { ENTIDADES_ORG, registrarEsquemasOrg } from '@vitrina/plataforma/org';
import { ENTIDADES_CFG, registrarEsquemasCfg } from '@vitrina/plataforma/parametros';
import { ENTIDADES_PER, registrarEsquemasPer } from '@vitrina/plataforma/personas';
import { ENTIDADES_ARC, registrarEsquemasArc } from '@vitrina/plataforma/archivos';
import { ENTIDADES_SEG_LECTURA, ENTIDADES_SEG_SOPORTE, registrarEsquemasSeg } from '@vitrina/plataforma/seguridad';
import { clavesMaestrasDe, ENTIDADES_SEC } from '@vitrina/plataforma/secretos';
import { ENTIDADES_NOT, registrarEsquemasNot } from '@vitrina/plataforma/notificaciones';
import { AppModule } from './app.module.js';
import { configurarApp } from './app.setup.js';
import { cargarConfig } from './config/env.js';
import { opcionesCors } from './cors.js';
import { SERVICIO } from './servicio.js';

const config = cargarConfig();
const cors = opcionesCors(config.ORIGENES_PERMITIDOS);
// Logs e idn hashean el documento con la misma sal (TR-RNF-111).
const salDocumentos = salDocumento(config);

const dataSource = new DataSource({
  type: 'postgres',
  url: config.DATABASE_URL,
  entities: [...ENTIDADES_CFG, ...ENTIDADES_SEQ, ...ENTIDADES_CAT, ...ENTIDADES_EVT, ...ENTIDADES_ORG, ...ENTIDADES_SEG_LECTURA, ...ENTIDADES_SEG_SOPORTE, ...ENTIDADES_AUDITORIA, ...ENTIDADES_IDN, ...ENTIDADES_PER, ...ENTIDADES_ARC, ...ENTIDADES_SEC, ...ENTIDADES_NOT, ...ENTIDADES_FE],
});
await dataSource.initialize();

const validator = new InMemoryEventSchemaValidator();
registrarEsquemasOrg(validator);
registrarEsquemasSeg(validator);
registrarEsquemasCfg(validator);
registrarEsquemasSeq(validator);
registrarEsquemasCat(validator);
registrarEsquemasIdn(validator);
registrarEsquemasPer(validator);
registrarEsquemasArc(validator);
registrarEsquemasNot(validator);
registrarEsquemasFe(validator);

const app = await NestFactory.create(
  AppModule.register({
    dataSource,
    validator,
    supabaseUrl: config.SUPABASE_URL,
    mfaMaxEdadSeg: config.SEG_MFA_MAX_EDAD_SEG,
    redisUrl: config.REDIS_URL,
    ingreso: { supabasePublishableKey: config.SUPABASE_PUBLISHABLE_KEY },
    invitaciones: { supabaseSecretKey: config.SUPABASE_SECRET_KEY, url: config.SEG_URL_INVITACION, horas: config.SEG_INVITACION_HORAS },
    reintentosEventos: { intentos: config.EVT_INTENTOS, esperaBaseMs: config.EVT_BACKOFF_MS, esperaMaximaMs: config.EVT_BACKOFF_MAX_MS },
    tenantOperador: config.ORG_TENANT_OPERADOR,
    observabilidad: { servicio: SERVICIO, nivel: config.LOG_LEVEL, salDocumento: salDocumentos },
    identidad: { proveedor: config.IDN_PROVEEDOR, decolectaToken: config.IDN_DECOLECTA_TOKEN, salDocumento: salDocumentos },
    archivos: { bucket: config.ARC_BUCKET },
    clavesMaestras: clavesMaestrasDe(config),
    notificaciones: config,
  }),
  // Spec 42: el webhook de Resend verifica la firma sobre el cuerpo crudo; el JSON del resto de rutas no cambia.
  { bufferLogs: true, rawBody: true },
);
usarLoggerDeObservabilidad(app);
configurarApp(app);
if (cors) app.enableCors(cors);
await app.listen(config.PORT);
