import type { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_URL, prepararHttpDePrueba } from '../../testing/http-de-prueba';
import { DETALLE_DE_PRUEBA } from '../../testing/persona-de-prueba';
import { ErrorPersonas } from '../models/error-personas';
import { DuplicadosCliente } from './duplicados.cliente';

const URL_DUPLICADOS = `${API_URL}/personas/duplicados`;
const A = 'per-a';
const B = 'per-b';
const LISTADA = {
  tipo_persona: 'NATURAL',
  tipo_documento: 'DNI',
  numero_documento: '45781236',
  denominacion: 'Quispe Mamani, Juana',
  celular_principal: '987654321',
  correo_principal: null,
  roles: [{ producto_codigo: 'CLI', rol: 'PACIENTE' }],
  coincidencia: null,
};

describe('DuplicadosCliente', () => {
  let cliente: DuplicadosCliente;
  let http: HttpTestingController;

  beforeEach(() => {
    http = prepararHttpDePrueba();
    cliente = TestBed.inject(DuplicadosCliente);
  });

  afterEach(() => http.verify());

  it('listar manda página y tamaño, y persona solo con filtro; mapea los pares', async () => {
    const promesa = cliente.listar({ pagina: 2, tamano: 20, personaId: null });
    const peticion = http.expectOne((solicitud) => solicitud.url === URL_DUPLICADOS);
    expect(peticion.request.params.keys().sort()).toEqual(['pagina', 'tamano']);
    peticion.flush({
      items: [{ persona_a: { ...LISTADA, id: A }, persona_b: { ...LISTADA, id: B, tipo_documento: 'PASAPORTE' }, puntaje: 60, motivos: ['CELULAR_Y_NOMBRE_PARECIDO'] }],
      total: 21,
      pagina: 2,
      tamano: 20,
    });

    const pagina = await promesa;
    expect(pagina).toMatchObject({ total: 21, pagina: 2, tamano: 20 });
    expect(pagina.items[0]).toMatchObject({
      personaA: { id: A, denominacion: 'Quispe Mamani, Juana', celularPrincipal: '987654321' },
      personaB: { id: B, tipoDocumento: 'PASAPORTE' },
      puntaje: 60,
      motivos: ['CELULAR_Y_NOMBRE_PARECIDO'],
    });

    const filtrada = cliente.listar({ pagina: 1, tamano: 1, personaId: A });
    const conPersona = http.expectOne((solicitud) => solicitud.url === URL_DUPLICADOS);
    expect(conPersona.request.params.get('persona')).toBe(A);
    conPersona.flush({ items: [], total: 0, pagina: 1, tamano: 1 });
    expect((await filtrada).total).toBe(0);
  });

  it('comparar trae las dos fichas con versión, descarte y bloqueo', async () => {
    const promesa = cliente.comparar(A, B);
    http.expectOne({ method: 'GET', url: `${URL_DUPLICADOS}/${A}/${B}` }).flush({
      persona_a: { ...DETALLE_DE_PRUEBA, id: A },
      persona_b: { ...DETALLE_DE_PRUEBA, id: B, version: 1, alias: ['per-vieja'] },
      puntaje: 60,
      motivos: ['CELULAR_Y_NOMBRE_PARECIDO'],
      descartado: true,
      bloqueo: 'DOCUMENTOS_DISTINTOS',
    });

    expect(await promesa).toMatchObject({
      personaA: { id: A, version: 5, resueltaDesde: null, alias: [] },
      personaB: { id: B, version: 1, alias: ['per-vieja'] },
      descartado: true,
      bloqueo: 'DOCUMENTOS_DISTINTOS',
    });
  });

  it('descartar y quitarDescarte usan sus rutas', async () => {
    const descarte = cliente.descartar(A, B);
    const post = http.expectOne({ method: 'POST', url: `${URL_DUPLICADOS}/descartes` });
    expect(post.request.body).toEqual({ persona_a_id: A, persona_b_id: B });
    post.flush(null, { status: 204, statusText: 'No Content' });
    await descarte;

    const quitar = cliente.quitarDescarte(A, B);
    http.expectOne({ method: 'DELETE', url: `${URL_DUPLICADOS}/descartes/${A}/${B}` }).flush(null, { status: 204, statusText: 'No Content' });
    await quitar;
  });

  it('fusionar envía el cuerpo en snake_case y devuelve la conservada', async () => {
    const promesa = cliente.fusionar({
      conservadaId: A,
      absorbidaId: B,
      versionConservada: 5,
      versionAbsorbida: 1,
      datosBasicos: { nombres: 'CONSERVADA', apellidoPaterno: 'CONSERVADA', apellidoMaterno: 'ABSORBIDA' },
      principales: { CELULAR: 'c1', DIRECCION: 'd2' },
      motivo: 'Misma clienta registrada con pasaporte',
    });
    const peticion = http.expectOne({ method: 'POST', url: `${API_URL}/personas/fusiones` });
    expect(peticion.request.body).toEqual({
      persona_conservada_id: A,
      persona_absorbida_id: B,
      version_conservada: 5,
      version_absorbida: 1,
      campos_elegidos: {
        datos_basicos: { nombres: 'CONSERVADA', apellido_paterno: 'CONSERVADA', apellido_materno: 'ABSORBIDA' },
        principales: { CELULAR: 'c1', DIRECCION: 'd2' },
      },
      motivo: 'Misma clienta registrada con pasaporte',
    });
    peticion.flush({ ...DETALLE_DE_PRUEBA, id: A, version: 6, alias: [B] });

    expect(await promesa).toMatchObject({ id: A, version: 6, alias: [B] });
  });

  it('un 409 PERSONA_FUSIONADA llega con la ficha en la que se fusionó', async () => {
    const promesa = cliente.comparar(A, B);
    http.expectOne({ method: 'GET', url: `${URL_DUPLICADOS}/${A}/${B}` }).flush(
      { codigo: 'PERSONA_FUSIONADA', mensaje: 'La persona ya se fusionó', persona_conservada_id: 'per-c' },
      { status: 409, statusText: 'Conflict' },
    );

    const error = await promesa.catch((falla: unknown) => falla);
    expect(error).toBeInstanceOf(ErrorPersonas);
    expect(error).toMatchObject({ codigo: 'PERSONA_FUSIONADA', estado: 409, personaConservadaId: 'per-c', personaId: null });
  });
});
