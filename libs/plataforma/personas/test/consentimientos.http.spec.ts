import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { Contacto } from '../src/domain/contacto.js';
import { DocumentoIdentidad } from '../src/domain/documento-identidad.js';
import { Persona } from '../src/domain/persona.js';
import { crearAppPersonas, SUCURSAL } from './support/app-http.js';
import { AHORA, crearDobles, TENANT_A, TENANT_B, USUARIO_DEL_CONTEXTO, type Dobles } from './support/dobles.js';

const LEER = 'plat.persona.leer';
const CONSENTIMIENTO = 'plat.persona.consentimiento';
const TEXTO_FINALIDAD = 'plat.persona.texto_finalidad';
const PERSONA = '37000000-0000-4000-8000-0000000000a1';
const EVIDENCIA = '37000000-0000-4000-8000-0000000000f1';
const TEXTO_PROMOCIONES = 'Acepto recibir promociones por WhatsApp y correo electrónico.';
const TEXTO_PRESTACION = 'Autorizo el tratamiento de mis datos para la prestación del servicio.';
const UN_DIA_MS = 86_400_000;

const acepta = (finalidad: string, version_texto: string) => ({ finalidad, decision: 'ACEPTA', version_texto, accion_expresa: true });
const rechaza = (finalidad: string, version_texto: string) => ({ finalidad, decision: 'RECHAZA', version_texto, accion_expresa: true });

describe('HTTP de consentimientos (TR-RF-043)', () => {
  let app: INestApplication;
  let dobles: Dobles;
  let permisosDelActor: string[];
  const http = () => request(app.getHttpServer());
  const get = (ruta: string) => http().get(ruta).set('X-Sucursal-Id', SUCURSAL);
  const post = (ruta: string, cuerpo: object) => http().post(ruta).set('X-Sucursal-Id', SUCURSAL).send(cuerpo);
  const registrar = (cuerpo: object) => post(`/v1/personas/${PERSONA}/consentimientos`, cuerpo);
  const publicar = (finalidad: string, version: string, texto: string) => post('/v1/consentimientos/textos', { finalidad, version, texto });

  async function guardarPersona(tenantId: string): Promise<void> {
    const persona = Persona.registrar({
      id: PERSONA,
      tenantId,
      tipoPersona: 'NATURAL',
      documento: DocumentoIdentidad.crear('DNI', '45781236'),
      nombres: 'Juana',
      apellidoPaterno: 'Quispe',
      contactos: [Contacto.crear({ id: 'celular', tipo: 'CELULAR', valor: '987654321', principal: true })],
    });
    persona.pullEvents();
    await dobles.personas.guardar(persona);
  }

  const historialGuardado = async () => (await get(`/v1/personas/${PERSONA}/consentimientos?historial=true`)).body.historial;

  beforeAll(async () => {
    dobles = crearDobles();
    app = await crearAppPersonas(dobles, () => permisosDelActor);
  });

  beforeEach(async () => {
    permisosDelActor = [LEER, CONSENTIMIENTO, TEXTO_FINALIDAD];
    dobles.contexto.alcance = { tenantId: TENANT_A, actorId: USUARIO_DEL_CONTEXTO };
    dobles.reloj.actual = AHORA;
    dobles.personas.guardadas.length = 0;
    dobles.publicador.eventos.length = 0;
    dobles.auditoria.entradas.length = 0;
    dobles.consentimientos.vaciar();
    dobles.archivos.archivos.clear();
    await guardarPersona(TENANT_A);
    await publicar('PROMOCIONES', '2026-03', TEXTO_PROMOCIONES);
    await publicar('PRESTACION', 'v1', TEXTO_PRESTACION);
    dobles.auditoria.entradas.length = 0;
  });

  afterAll(() => app?.close());

  it('TR-CA-109: POST crea dos filas con versión, canal, registrado_por y registrado_en; GET muestra PRESTACION vigente y PROMOCIONES rechazada', async () => {
    const respuesta = await registrar({ canal: 'PRESENCIAL', decisiones: [acepta('PRESTACION', 'v1'), rechaza('PROMOCIONES', '2026-03')] });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.persona_id).toBe(PERSONA);
    expect(respuesta.body.decisiones).toEqual([
      expect.objectContaining({ finalidad: 'PRESTACION', decision: 'ACEPTA', version_texto: 'v1', canal: 'PRESENCIAL', registrado_por: USUARIO_DEL_CONTEXTO, registrado_en: AHORA.toISOString() }),
      expect.objectContaining({ finalidad: 'PROMOCIONES', decision: 'RECHAZA', version_texto: '2026-03', canal: 'PRESENCIAL', registrado_por: USUARIO_DEL_CONTEXTO, registrado_en: AHORA.toISOString() }),
    ]);

    const consulta = await get(`/v1/personas/${PERSONA}/consentimientos`);
    expect(consulta.status).toBe(200);
    expect(consulta.body.vigentes.map(({ finalidad, decision }: { finalidad: string; decision: { decision: string } | null }) => [finalidad, decision?.decision ?? null])).toEqual([
      ['PRESTACION', 'ACEPTA'],
      ['PROMOCIONES', 'RECHAZA'],
      ['COMPARTIR_PRODUCTOS', null],
      ['DATOS_SALUD', null],
      ['IDENTIDAD_PORTABLE', null],
    ]);
  });

  it('TR-CA-110: revocar PROMOCIONES aceptado marca revocado_en, revocado_por y canal_revocacion, y publica consentimiento.revocado', async () => {
    await registrar({ canal: 'WEB', decisiones: [acepta('PROMOCIONES', '2026-03')] });

    const respuesta = await post(`/v1/personas/${PERSONA}/consentimientos/PROMOCIONES/revocar`, { canal: 'WHATSAPP' });

    expect([respuesta.status, respuesta.body]).toEqual([
      200,
      expect.objectContaining({ decision: 'ACEPTA', revocado_en: AHORA.toISOString(), revocado_por: USUARIO_DEL_CONTEXTO, canal_revocacion: 'WHATSAPP' }),
    ]);
    expect(dobles.publicador.tipos()).toEqual(['consentimiento.revocado']);
    const vigentes = (await get(`/v1/personas/${PERSONA}/consentimientos`)).body.vigentes;
    expect(vigentes[1].decision).toMatchObject({ finalidad: 'PROMOCIONES', revocado_en: AHORA.toISOString() });
  });

  it.each([
    ['ausente', { finalidad: 'PROMOCIONES', decision: 'ACEPTA', version_texto: '2026-03' }],
    ['en false', { ...acepta('PROMOCIONES', '2026-03'), accion_expresa: false }],
  ])('TR-CA-111: accion_expresa %s → 422 ACCION_EXPRESA_REQUERIDA y no se guarda nada del lote', async (_caso, decision) => {
    const respuesta = await registrar({ canal: 'WEB', decisiones: [acepta('PRESTACION', 'v1'), decision] });

    expect([respuesta.status, respuesta.body.codigo]).toEqual([422, 'ACCION_EXPRESA_REQUERIDA']);
    expect(await historialGuardado()).toEqual([]);
  });

  it('TR-CA-111: una decisión sin decision → 422 DATOS_INVALIDOS', async () => {
    const respuesta = await registrar({ canal: 'WEB', decisiones: [{ finalidad: 'PRESTACION', version_texto: 'v1', accion_expresa: true }] });

    expect([respuesta.status, respuesta.body.codigo]).toEqual([422, 'DATOS_INVALIDOS']);
  });

  it('versión no vigente → 409 con la vigente; sin texto → 409 TEXTO_NO_PUBLICADO; repetida → 422 FINALIDAD_REPETIDA; nada se guarda', async () => {
    const versionVieja = await registrar({ canal: 'WEB', decisiones: [acepta('PRESTACION', 'v1'), acepta('PROMOCIONES', '2025-01')] });
    const sinTexto = await registrar({ canal: 'WEB', decisiones: [acepta('DATOS_SALUD', 'v1')] });
    const repetida = await registrar({ canal: 'WEB', decisiones: [acepta('PRESTACION', 'v1'), rechaza('PRESTACION', 'v1')] });

    expect([versionVieja.status, versionVieja.body]).toEqual([
      409,
      expect.objectContaining({ codigo: 'VERSION_TEXTO_NO_VIGENTE', finalidad: 'PROMOCIONES', version_vigente: '2026-03' }),
    ]);
    expect([sinTexto.status, sinTexto.body.codigo]).toEqual([409, 'TEXTO_NO_PUBLICADO']);
    expect([repetida.status, repetida.body.codigo]).toEqual([422, 'FINALIDAD_REPETIDA']);
    expect(await historialGuardado()).toEqual([]);
  });

  it('publicar una versión nueva del texto no cambia la vigente aceptada', async () => {
    await registrar({ canal: 'WEB', decisiones: [acepta('PROMOCIONES', '2026-03')] });
    dobles.reloj.actual = new Date(AHORA.getTime() + UN_DIA_MS);
    await publicar('PROMOCIONES', '2026-11', TEXTO_PROMOCIONES);

    const vigentes = (await get(`/v1/personas/${PERSONA}/consentimientos`)).body.vigentes;
    expect(vigentes[1].decision).toMatchObject({ decision: 'ACEPTA', version_texto: '2026-03' });
    expect(vigentes[1].decision.revocado_en).toBeUndefined();
  });

  it('un RECHAZA sobre un ACEPTA vigente deja la anterior revocada en el historial y publica consentimiento.revocado', async () => {
    await registrar({ canal: 'WEB', decisiones: [acepta('PROMOCIONES', '2026-03')] });
    dobles.reloj.actual = new Date(AHORA.getTime() + UN_DIA_MS);

    await registrar({ canal: 'KIOSCO', decisiones: [rechaza('PROMOCIONES', '2026-03')] });

    const historial = await historialGuardado();
    expect(historial.map(({ decision, canal_revocacion }: { decision: string; canal_revocacion?: string }) => [decision, canal_revocacion ?? null])).toEqual([
      ['RECHAZA', null],
      ['ACEPTA', 'KIOSCO'],
    ]);
    expect(dobles.publicador.tipos()).toEqual(['consentimiento.revocado']);
  });

  it('revocar sin ACEPTA vigente → 409 SIN_CONSENTIMIENTO_VIGENTE', async () => {
    await registrar({ canal: 'WEB', decisiones: [rechaza('PROMOCIONES', '2026-03')] });

    const respuesta = await post(`/v1/personas/${PERSONA}/consentimientos/PROMOCIONES/revocar`, { canal: 'WEB' });

    expect([respuesta.status, respuesta.body.codigo]).toEqual([409, 'SIN_CONSENTIMIENTO_VIGENTE']);
  });

  describe('evidencia', () => {
    const conEvidencia = () => registrar({ canal: 'PRESENCIAL', evidencia_archivo_id: EVIDENCIA, decisiones: [acepta('PRESTACION', 'v1')] });

    it('de otro tenant o inexistente → 404 EVIDENCIA_NO_ENCONTRADA', async () => {
      const respuesta = await conEvidencia();

      expect([respuesta.status, respuesta.body.codigo]).toEqual([404, 'EVIDENCIA_NO_ENCONTRADA']);
    });

    it.each(['EN_ANALISIS', 'CUARENTENA'] as const)('en %s → 422 EVIDENCIA_INVALIDA motivo NO_DISPONIBLE', async (estado) => {
      dobles.archivos.archivos.set(EVIDENCIA, { estado, categoria: 'EVIDENCIA' });

      const respuesta = await conEvidencia();

      expect([respuesta.status, respuesta.body.codigo, respuesta.body.motivo]).toEqual([422, 'EVIDENCIA_INVALIDA', 'NO_DISPONIBLE']);
    });

    it('de otra categoría → 422 motivo CATEGORIA; válida → queda en evidencia_archivo_id', async () => {
      dobles.archivos.archivos.set(EVIDENCIA, { estado: 'DISPONIBLE', categoria: 'FOTO_PERFIL' });
      const otraCategoria = await conEvidencia();
      dobles.archivos.archivos.set(EVIDENCIA, { estado: 'DISPONIBLE', categoria: 'EVIDENCIA' });
      const valida = await conEvidencia();

      expect([otraCategoria.status, otraCategoria.body.motivo]).toEqual([422, 'CATEGORIA']);
      expect([valida.status, valida.body.decisiones[0].evidencia_archivo_id]).toEqual([201, EVIDENCIA]);
    });
  });

  describe('textos por finalidad', () => {
    it('versión repetida → 409 VERSION_TEXTO_DUPLICADA; GET devuelve uno por finalidad, el más reciente', async () => {
      dobles.reloj.actual = new Date(AHORA.getTime() + UN_DIA_MS);
      const nueva = await publicar('PROMOCIONES', '2026-11', TEXTO_PROMOCIONES);
      const repetida = await publicar('PROMOCIONES', '2026-11', TEXTO_PROMOCIONES);
      const vigentes = await get('/v1/consentimientos/textos');
      const historial = await get('/v1/consentimientos/textos?finalidad=PROMOCIONES');

      expect([nueva.status, nueva.body]).toEqual([201, expect.objectContaining({ finalidad: 'PROMOCIONES', version: '2026-11', texto: TEXTO_PROMOCIONES })]);
      expect([repetida.status, repetida.body.codigo]).toEqual([409, 'VERSION_TEXTO_DUPLICADA']);
      expect(vigentes.body.map(({ finalidad, version }: { finalidad: string; version: string }) => [finalidad, version])).toEqual([
        ['PRESTACION', 'v1'],
        ['PROMOCIONES', '2026-11'],
      ]);
      expect(historial.body.map(({ version }: { version: string }) => version)).toEqual(['2026-11', '2026-03']);
    });

    it('versión con formato inválido o texto corto → 422 DATOS_INVALIDOS', async () => {
      const malaVersion = await publicar('PROMOCIONES', 'v 2', TEXTO_PROMOCIONES);
      const corto = await publicar('PROMOCIONES', 'v2', 'muy corto');

      expect([malaVersion.status, malaVersion.body.codigo, corto.status, corto.body.codigo]).toEqual([422, 'DATOS_INVALIDOS', 422, 'DATOS_INVALIDOS']);
    });
  });

  it('registrar y publicar texto dejan su auditoría sin el texto completo', async () => {
    await registrar({ canal: 'WEB', decisiones: [acepta('PRESTACION', 'v1')] });
    await publicar('PRESTACION', 'v2', TEXTO_PRESTACION);

    expect(dobles.auditoria.entradas.map((entrada) => entrada.accion)).toEqual([
      'plat.persona.consentimiento.registrar',
      'plat.persona.texto_finalidad.publicar',
    ]);
    expect(JSON.stringify(dobles.auditoria.entradas)).not.toContain(TEXTO_PRESTACION);
  });

  it('aislamiento: persona de B pedida desde A → 404 en las rutas de persona; los textos de B no se ven desde A', async () => {
    dobles.personas.guardadas.length = 0;
    dobles.contexto.alcance = { tenantId: TENANT_B, actorId: USUARIO_DEL_CONTEXTO };
    await guardarPersona(TENANT_B);
    await publicar('DATOS_SALUD', 'b1', TEXTO_PRESTACION);
    dobles.contexto.alcance = { tenantId: TENANT_A, actorId: USUARIO_DEL_CONTEXTO };

    const respuestas = await Promise.all([
      get(`/v1/personas/${PERSONA}/consentimientos`),
      registrar({ canal: 'WEB', decisiones: [acepta('PRESTACION', 'v1')] }),
      post(`/v1/personas/${PERSONA}/consentimientos/PRESTACION/revocar`, { canal: 'WEB' }),
    ]);
    const textos = await get('/v1/consentimientos/textos');

    expect(respuestas.map((respuesta) => [respuesta.status, respuesta.body.codigo])).toEqual(Array(3).fill([404, 'NO_ENCONTRADA']));
    expect(textos.body.map(({ finalidad }: { finalidad: string }) => finalidad)).toEqual(['PRESTACION', 'PROMOCIONES']);
  });

  it('sin el permiso de cada ruta → 403 SIN_PERMISO', async () => {
    permisosDelActor = [LEER];
    const sinConsentimiento = await Promise.all([
      registrar({ canal: 'WEB', decisiones: [acepta('PRESTACION', 'v1')] }),
      post(`/v1/personas/${PERSONA}/consentimientos/PRESTACION/revocar`, { canal: 'WEB' }),
      publicar('PRESTACION', 'v3', TEXTO_PRESTACION),
    ]);
    permisosDelActor = [CONSENTIMIENTO, TEXTO_FINALIDAD];
    const sinLeer = await Promise.all([get(`/v1/personas/${PERSONA}/consentimientos`), get('/v1/consentimientos/textos')]);

    expect([...sinConsentimiento, ...sinLeer].map((respuesta) => [respuesta.status, respuesta.body.codigo])).toEqual(Array(5).fill([403, 'SIN_PERMISO']));
  });

  it('las cinco rutas están en OpenAPI bajo /v1 con sus respuestas', () => {
    const rutas = SwaggerModule.createDocument(app, new DocumentBuilder().addBearerAuth().build()).paths;
    const codigos = (ruta: string, metodo: 'get' | 'post') => Object.keys(rutas[ruta][metodo]?.responses ?? {}).sort();

    expect(codigos('/v1/personas/{id}/consentimientos', 'get')).toEqual(['200', '400', '401', '403', '404']);
    expect(codigos('/v1/personas/{id}/consentimientos', 'post')).toEqual(['201', '400', '401', '403', '404', '409', '422']);
    expect(codigos('/v1/personas/{id}/consentimientos/{finalidad}/revocar', 'post')).toEqual(['200', '400', '401', '403', '404', '409']);
    expect(codigos('/v1/consentimientos/textos', 'get')).toEqual(['200', '400', '401', '403']);
    expect(codigos('/v1/consentimientos/textos', 'post')).toEqual(['201', '400', '401', '403', '409', '422']);
  });
});
