import type { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { EMPRESA_ID, respuestaEmisorDePrueba } from '../../testing/emisor-de-prueba';
import { API_URL, prepararHttpDePrueba } from '../../testing/http-de-prueba';
import type { EmisorRespuesta } from '../models/emisor';
import { INTERVALO_CONSULTA_PRUEBA_MS, MAXIMO_CONSULTAS_PRUEBA, SeguimientoPruebaService, type EstadoSeguimiento } from './seguimiento-prueba.service';

const URL_EMISOR = `${API_URL}/fe/emisores/${EMPRESA_ID}`;
const conPrueba = (estado: 'EN_PROCESO' | 'ACEPTADA'): EmisorRespuesta =>
  respuestaEmisorDePrueba({
    estado: estado === 'ACEPTADA' ? 'VERIFICADO' : 'CONFIGURADO',
    prueba: { estado, numero: 1, solicitada_en: '2026-11-25T14:59:00.000Z', resultado_en: estado === 'ACEPTADA' ? '2026-11-25T15:00:06.000Z' : null, codigo: null, descripcion: null },
  });

describe('SeguimientoPruebaService', () => {
  let servicio: SeguimientoPruebaService;
  let http: HttpTestingController;
  let estados: EstadoSeguimiento[];
  let terminado: boolean;

  const responder = (respuesta: EmisorRespuesta) => http.expectOne({ method: 'GET', url: URL_EMISOR }).flush(respuesta);
  const avanzarUnIntervalo = () => vi.advanceTimersByTime(INTERVALO_CONSULTA_PRUEBA_MS);
  const seguir = () =>
    servicio.seguir(EMPRESA_ID).subscribe({
      next: (estado) => estados.push(estado),
      complete: () => (terminado = true),
    });

  beforeEach(() => {
    vi.useFakeTimers();
    http = prepararHttpDePrueba();
    servicio = TestBed.inject(SeguimientoPruebaService);
    estados = [];
    terminado = false;
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  it('consulta al instante y cada 3 s; para cuando la prueba deja EN_PROCESO', () => {
    seguir();
    vi.advanceTimersByTime(0);
    responder(conPrueba('EN_PROCESO'));
    avanzarUnIntervalo();
    responder(conPrueba('ACEPTADA'));

    expect(estados.map(({ emisor }) => emisor?.prueba?.estado)).toEqual(['EN_PROCESO', 'ACEPTADA']);
    expect(estados.at(-1)?.agotado).toBe(false);
    expect(terminado).toBe(true);
    avanzarUnIntervalo();
    http.expectNone(URL_EMISOR);
  });

  it('a los 40 intentos para y marca agotado si sigue EN_PROCESO', () => {
    seguir();
    vi.advanceTimersByTime(0);
    responder(conPrueba('EN_PROCESO'));
    for (let intento = 1; intento < MAXIMO_CONSULTAS_PRUEBA; intento++) {
      avanzarUnIntervalo();
      responder(conPrueba('EN_PROCESO'));
    }

    expect(estados).toHaveLength(MAXIMO_CONSULTAS_PRUEBA);
    expect(estados.filter(({ agotado }) => agotado)).toHaveLength(1);
    expect(estados.at(-1)?.agotado).toBe(true);
    expect(terminado).toBe(true);
    avanzarUnIntervalo();
    http.expectNone(URL_EMISOR);
  });

  it('al desuscribirse (la página se destruye) no quedan consultas', () => {
    const suscripcion = seguir();
    vi.advanceTimersByTime(0);
    responder(conPrueba('EN_PROCESO'));
    suscripcion.unsubscribe();
    avanzarUnIntervalo();
    avanzarUnIntervalo();
    http.expectNone(URL_EMISOR);
  });
});
