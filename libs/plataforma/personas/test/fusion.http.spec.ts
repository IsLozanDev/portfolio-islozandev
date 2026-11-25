import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { crearAppPersonas, sesionDePrueba, SUCURSAL } from './support/app-http.js';
import { crearDobles, TENANT_A, TENANT_B, USUARIO_DEL_CONTEXTO, type Dobles } from './support/dobles.js';

const LEER = 'plat.persona.leer';
const REGISTRAR = 'plat.persona.registrar';
const FUSIONAR = 'plat.persona.fusionar';
const MOTIVO = 'Misma clienta registrada con pasaporte';

const JUANA_DNI = {
  tipo_persona: 'NATURAL',
  tipo_documento: 'DNI',
  numero_documento: '45781236',
  nombres: 'Juana',
  apellido_paterno: 'Quispe',
  apellido_materno: 'Mamani',
  celular: '987654321',
};
const JUANA_PASAPORTE = { ...JUANA_DNI, tipo_documento: 'PASAPORTE', numero_documento: 'P1234567', apellido_materno: null, correo: 'juana@correo.pe' };
const OTRO_DNI = { ...JUANA_DNI, numero_documento: '45781237' };

interface PersonaHttp {
  id: string;
  version: number;
  contactos: { id: string; tipo: string }[];
}

describe('HTTP de duplicados y fusión (TR-RF-042)', () => {
  let app: INestApplication;
  let dobles: Dobles;
  let permisosDelActor: string[];
  const http = () => request(app.getHttpServer());
  const get = (ruta: string) => http().get(ruta).set('X-Sucursal-Id', SUCURSAL);
  const post = (ruta: string, cuerpo: object) => http().post(ruta).set('X-Sucursal-Id', SUCURSAL).send(cuerpo);
  const borrar = (ruta: string) => http().delete(ruta).set('X-Sucursal-Id', SUCURSAL);
  const registrar = async (cuerpo: object): Promise<PersonaHttp> => (await post('/v1/personas', cuerpo)).body;

  const fusion = (conservada: PersonaHttp, absorbida: PersonaHttp, extra: object = {}) => ({
    persona_conservada_id: conservada.id,
    persona_absorbida_id: absorbida.id,
    version_conservada: conservada.version,
    version_absorbida: absorbida.version,
    campos_elegidos: { datos_basicos: {}, principales: {} },
    motivo: MOTIVO,
    ...extra,
  });

  beforeAll(async () => {
    dobles = crearDobles();
    app = await crearAppPersonas(dobles, () => permisosDelActor);
  });

  beforeEach(() => {
    permisosDelActor = [LEER, REGISTRAR, FUSIONAR];
    sesionDePrueba.conMfa = true;
    dobles.contexto.alcance = { tenantId: TENANT_A, actorId: USUARIO_DEL_CONTEXTO };
    dobles.personas.guardadas.length = 0;
    dobles.personas.fusionesGuardadas.length = 0;
    dobles.fusiones.fusiones.length = 0;
    dobles.publicador.eventos.length = 0;
    dobles.auditoria.entradas.length = 0;
    dobles.consultaDuplicados.criterios.length = 0;
    dobles.consultaDuplicados.evaluacion = null;
  });

  afterAll(() => app?.close());

  it('TR-CA-107: POST /v1/personas/fusiones devuelve la conservada con la absorbida como alias; leer la absorbida la resuelve', async () => {
    const conservada = await registrar(JUANA_DNI);
    const absorbida = await registrar(JUANA_PASAPORTE);
    const correo = absorbida.contactos.find((contacto) => contacto.tipo === 'CORREO');

    const respuesta = await post('/v1/personas/fusiones', fusion(conservada, absorbida, {
      campos_elegidos: { datos_basicos: { apellido_materno: 'CONSERVADA' }, principales: { CORREO: correo?.id } },
    }));

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toMatchObject({ id: conservada.id, numero_documento: '45781236', apellido_materno: 'Mamani', alias: [absorbida.id], resuelta_desde: null });
    expect(respuesta.body.contactos).toEqual(expect.arrayContaining([expect.objectContaining({ id: correo?.id, principal: true })]));
    expect(dobles.publicador.tipos()).toContain('persona.fusionada');
    expect((await get(`/v1/personas/${absorbida.id}`)).body).toMatchObject({ id: conservada.id, resuelta_desde: absorbida.id });

    const edicion = await http().patch(`/v1/personas/${absorbida.id}`).set('X-Sucursal-Id', SUCURSAL).send({ version: 1, nombres: 'Rosa' });
    permisosDelActor = [...permisosDelActor, 'plat.persona.editar'];
    const conPermiso = await http().patch(`/v1/personas/${absorbida.id}`).set('X-Sucursal-Id', SUCURSAL).send({ version: 1, nombres: 'Rosa' });
    expect(edicion.status).toBe(403);
    expect(conPermiso.status).toBe(409);
    expect(conPermiso.body).toEqual({ codigo: 'PERSONA_FUSIONADA', mensaje: expect.any(String), persona_conservada_id: conservada.id });
  });

  it('TR-CA-108: DNI distintos → 409 DOCUMENTOS_DISTINTOS «Las personas tienen documentos distintos»', async () => {
    const juana = await registrar(JUANA_DNI);
    const otra = await registrar(OTRO_DNI);

    const respuesta = await post('/v1/personas/fusiones', fusion(juana, otra));

    expect(respuesta.status).toBe(409);
    expect(respuesta.body).toEqual({ codigo: 'DOCUMENTOS_DISTINTOS', mensaje: 'Las personas tienen documentos distintos' });
    expect(dobles.fusiones.fusiones).toEqual([]);
  });

  it('valida el cuerpo: 400 por forma, 422 por motivo, misma persona o principal ajeno, 409 por versión', async () => {
    const juana = await registrar(JUANA_DNI);
    const otra = await registrar(JUANA_PASAPORTE);

    const casos: [object, number, string | undefined][] = [
      [fusion(juana, otra, { motivo: 'abcd' }), 422, 'MOTIVO_INVALIDO'],
      [fusion(juana, juana), 422, 'MISMA_PERSONA'],
      [fusion(juana, otra, { campos_elegidos: { datos_basicos: {}, principales: { CORREO: juana.id } } }), 422, 'CAMPO_ELEGIDO_INVALIDO'],
      [fusion(juana, otra, { version_absorbida: 7 }), 409, 'VERSION_OBSOLETA'],
      [fusion(juana, otra, { campos_elegidos: { datos_basicos: { nombres: 'LA_OTRA' }, principales: {} } }), 400, 'SOLICITUD_INVALIDA'],
      [fusion(juana, otra, { campos_elegidos: { datos_basicos: {}, principales: { TELEGRAM: juana.id } } }), 400, 'SOLICITUD_INVALIDA'],
      [{ ...fusion(juana, otra), persona_absorbida_id: 'no-es-uuid' }, 400, 'SOLICITUD_INVALIDA'],
    ];
    for (const [cuerpo, estado, codigo] of casos) {
      const respuesta = await post('/v1/personas/fusiones', cuerpo);
      expect([respuesta.status, respuesta.body.codigo]).toEqual([estado, codigo]);
    }
    expect(dobles.fusiones.fusiones).toEqual([]);
  });

  it('GET /v1/personas/duplicados pagina desde el puntaje mínimo y no lo captura GET /v1/personas/:id', async () => {
    const respuesta = await get('/v1/personas/duplicados?pagina=2&tamano=5');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ items: [], total: 0, pagina: 2, tamano: 5 });
    expect(dobles.consultaDuplicados.criterios).toEqual([{ pagina: 2, tamano: 5, personaId: null, puntajeMinimo: 60 }]);
    expect((await get('/v1/personas/duplicados?tamano=51')).status).toBe(400);
  });

  it('GET /v1/personas/duplicados?persona= filtra por esa persona y rechaza lo que no es uuid', async () => {
    const personaId = '0192f3a4-5b6c-7d8e-9f01-23456789abcd';

    expect((await get(`/v1/personas/duplicados?persona=${personaId}&tamano=1`)).status).toBe(200);
    expect(dobles.consultaDuplicados.criterios).toEqual([{ pagina: 1, tamano: 1, personaId, puntajeMinimo: 60 }]);
    const invalida = await get('/v1/personas/duplicados?persona=abc');
    expect(invalida.status).toBe(400);
    expect(invalida.body.codigo).toBe('SOLICITUD_INVALIDA');
  });

  it('GET /v1/personas/duplicados/{a}/{b} compara las dos fichas con versión, puntaje, descarte y bloqueo', async () => {
    const juana = await registrar(JUANA_DNI);
    const otra = await registrar(OTRO_DNI);
    dobles.consultaDuplicados.evaluacion = { puntaje: 80, motivos: ['CELULAR_Y_NOMBRE_IGUAL'] };

    const respuesta = await get(`/v1/personas/duplicados/${otra.id}/${juana.id}`);

    expect(respuesta.status).toBe(200);
    const [menor, mayor] = [juana.id, otra.id].sort();
    expect(respuesta.body).toMatchObject({
      persona_a: { id: menor, version: 1 },
      persona_b: { id: mayor, version: 1 },
      puntaje: 80,
      motivos: ['CELULAR_Y_NOMBRE_IGUAL'],
      descartado: false,
      bloqueo: 'DOCUMENTOS_DISTINTOS',
    });
  });

  it('descartes: POST 204 idempotente, DELETE 204 y luego 404 DESCARTE_NO_ENCONTRADO', async () => {
    const juana = await registrar(JUANA_DNI);
    const otra = await registrar(OTRO_DNI);
    const par = { persona_a_id: juana.id, persona_b_id: otra.id };

    expect((await post('/v1/personas/duplicados/descartes', par)).status).toBe(204);
    expect((await post('/v1/personas/duplicados/descartes', { persona_a_id: otra.id, persona_b_id: juana.id })).status).toBe(204);
    expect((await get(`/v1/personas/duplicados/${juana.id}/${otra.id}`)).body.descartado).toBe(true);
    expect((await borrar(`/v1/personas/duplicados/descartes/${otra.id}/${juana.id}`)).status).toBe(204);
    const otraVez = await borrar(`/v1/personas/duplicados/descartes/${juana.id}/${otra.id}`);
    expect([otraVez.status, otraVez.body.codigo]).toEqual([404, 'DESCARTE_NO_ENCONTRADO']);
  });

  it('permisos: 403 sin leer o sin fusionar; 401 step-up sin aal2 al fusionar y descartar; consultar no pide MFA', async () => {
    const juana = await registrar(JUANA_DNI);
    const otra = await registrar(JUANA_PASAPORTE);

    sesionDePrueba.conMfa = false;
    expect((await get('/v1/personas/duplicados')).status).toBe(200);
    expect((await get(`/v1/personas/duplicados/${juana.id}/${otra.id}`)).status).toBe(200);
    const sinMfa = await post('/v1/personas/fusiones', fusion(juana, otra));
    expect([sinMfa.status, sinMfa.body.codigo]).toEqual([401, expect.stringMatching(/MFA/)]);
    expect((await post('/v1/personas/duplicados/descartes', { persona_a_id: juana.id, persona_b_id: otra.id })).status).toBe(401);
    expect((await borrar(`/v1/personas/duplicados/descartes/${juana.id}/${otra.id}`)).status).toBe(401);

    permisosDelActor = [REGISTRAR];
    expect((await get('/v1/personas/duplicados')).status).toBe(403);
    expect((await get(`/v1/personas/duplicados/${juana.id}/${otra.id}`)).status).toBe(403);
    expect((await post('/v1/personas/fusiones', fusion(juana, otra))).status).toBe(403);
    expect((await post('/v1/personas/duplicados/descartes', { persona_a_id: juana.id, persona_b_id: otra.id })).status).toBe(403);
    expect(dobles.fusiones.fusiones).toEqual([]);
  });

  it('personas de otro tenant → 404 en comparar, descartar y fusionar', async () => {
    const juana = await registrar(JUANA_DNI);
    dobles.contexto.alcance = { tenantId: TENANT_B, actorId: USUARIO_DEL_CONTEXTO };
    const ajena = await registrar(JUANA_PASAPORTE);
    dobles.contexto.alcance = { tenantId: TENANT_A, actorId: USUARIO_DEL_CONTEXTO };

    expect((await get(`/v1/personas/duplicados/${juana.id}/${ajena.id}`)).status).toBe(404);
    expect((await post('/v1/personas/duplicados/descartes', { persona_a_id: juana.id, persona_b_id: ajena.id })).status).toBe(404);
    const fusionAjena = await post('/v1/personas/fusiones', fusion(juana, ajena));
    expect([fusionAjena.status, fusionAjena.body.codigo]).toEqual([404, 'NO_ENCONTRADA']);
  });

  it('las cinco rutas están en OpenAPI bajo /v1', () => {
    const documento = SwaggerModule.createDocument(app, new DocumentBuilder().build());
    expect(Object.keys(documento.paths)).toEqual(
      expect.arrayContaining([
        '/v1/personas/duplicados',
        '/v1/personas/duplicados/{a}/{b}',
        '/v1/personas/duplicados/descartes',
        '/v1/personas/duplicados/descartes/{a}/{b}',
        '/v1/personas/fusiones',
      ]),
    );
    expect(Object.keys(documento.paths['/v1/personas/duplicados/descartes/{a}/{b}'] ?? {})).toEqual(['delete']);
    const parametros = documento.paths['/v1/personas/duplicados']?.get?.parameters ?? [];
    expect(parametros).toContainEqual(expect.objectContaining({ name: 'persona', in: 'query', required: false }));
  });
});
