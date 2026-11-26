import { CertificadoLeido } from '../src/domain/certificado-leido.js';
import { boletaDePrueba } from '../src/domain/documento-electronico.js';
import { emisorDePrueba } from '../src/domain/emisor-documento.js';
import { Emisor, LARGO_MAXIMO_DESCRIPCION_PRUEBA, type ReglasProduccion } from '../src/domain/emisor.js';
import {
  CertificadoVencidoError,
  EmisorEnProduccionError,
  EstadoEmisorInvalidoError,
  ProduccionNoPermitidaError,
  ProveedorSimuladoEnProduccionError,
  PruebaBetaRequeridaError,
  PruebaEnCursoError,
  UrlProveedorNoPermitidaError,
} from '../src/domain/errores.js';
import type { RespuestaPse } from '../src/domain/respuesta-pse.js';
import { exigirUrlPermitida } from '../src/domain/url-proveedor.js';

const AHORA = new Date('2026-11-23T15:00:00.000Z');
const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const URL_NUBEFACT = 'https://api.nubefact.com/api/v1/48239908-7ae7-4353-824d-071765d4';
const DOMINIOS = ['api.nubefact.com'];
const ACTOR = 'usuario-1';

const despues = (milisegundos: number) => new Date(AHORA.getTime() + milisegundos);
const respuesta = (resultado: RespuestaPse['resultado'], cambios: Partial<RespuestaPse> = {}): RespuestaPse => ({
  resultado,
  codigo: resultado === 'RECHAZADO' ? '2800' : '0',
  descripcion: 'detalle del PSE',
  observaciones: [],
  ...cambios,
});
const reglas = (cambios: Partial<ReglasProduccion> = {}): ReglasProduccion => ({
  produccionPermitida: true,
  esSimulado: false,
  requiereCertificado: false,
  ...cambios,
});
const certificado = (venceEn: Date) =>
  new CertificadoLeido('20601234561', venceEn, new Date('2026-01-01T00:00:00Z'), 'a'.repeat(64), []);

/** Un emisor NUBEFACT CONFIGURADO (no pide certificado). */
function configurado(): Emisor {
  const emisor = Emisor.crear({ id: 'emisor-1', tenantId: 'tenant-1', empresaId: 'empresa-1', creadoPor: ACTOR, ahora: AHORA });
  emisor.configurarProveedor({ proveedor: 'NUBEFACT', usuarioProveedor: 'MODDATOS', regimenIgv: 'GENERAL', leyendaPie: null, urlProveedor: URL_NUBEFACT });
  emisor.asignarCredencial('secreto-1');
  emisor.recalcularEstado(false, AHORA);
  return emisor;
}

function verificado(): Emisor {
  const emisor = configurado();
  const numero = emisor.solicitarPrueba(AHORA);
  emisor.registrarResultadoPrueba(numero, respuesta('ACEPTADO'), despues(MINUTO));
  return emisor;
}

function enProduccion(): Emisor {
  const emisor = verificado();
  emisor.habilitarProduccion(despues(HORA), reglas(), ACTOR);
  return emisor;
}

describe('exigirUrlPermitida (anti-SSRF)', () => {
  it('acepta https con host exacto del catálogo, también con :443 explícito', () => {
    expect(exigirUrlPermitida(` ${URL_NUBEFACT} `, DOMINIOS)).toBe(URL_NUBEFACT);
    expect(() => exigirUrlPermitida('https://api.nubefact.com:443/api/v1/x', DOMINIOS)).not.toThrow();
  });

  it.each([
    ['otro host', 'https://api.pse.pe/api/v1/x'],
    ['subdominio del permitido', 'https://evil.api.nubefact.com/api/v1/x'],
    ['http', 'http://api.nubefact.com/api/v1/x'],
    ['con usuario', 'https://user@api.nubefact.com/api/v1/x'],
    ['con usuario y clave', 'https://user:clave@api.nubefact.com/api/v1/x'],
    ['con puerto 8443', 'https://api.nubefact.com:8443/api/v1/x'],
    ['no es URL', 'api.nubefact.com/api/v1/x'],
  ])('%s → URL_PROVEEDOR_NO_PERMITIDA sin la URL en el mensaje', (_caso, url) => {
    expect(() => exigirUrlPermitida(url, DOMINIOS)).toThrow(UrlProveedorNoPermitidaError);
    try {
      exigirUrlPermitida(url, DOMINIOS);
    } catch (error) {
      expect((error as Error).message).not.toContain('clave');
    }
  });
});

describe('boletaDePrueba', () => {
  it('S/ 1.00 con IGV del 18 %: gravada 0.85 e IGV 0.15 que suman el total, a CLIENTES VARIOS con documento 0', () => {
    const emisor = emisorDePrueba({ ruc: '20601234561', razonSocial: 'EMPRESA SAC', nombreComercial: null, domicilioFiscal: null, ubigeo: null });
    const boleta = boletaDePrueba(emisor, 'B001', 7, new Date('2026-11-24T03:30:00Z'));
    expect(boleta).toMatchObject({ tipo: '03', serie: 'B001', numero: 7, moneda: 'PEN', fechaEmision: '2026-11-23', horaEmision: '22:30:00' });
    expect(boleta.emisor).toEqual({ ruc: '20601234561', razonSocial: 'EMPRESA SAC', nombreComercial: null, domicilioFiscal: '', ubigeo: '', codigoEstablecimiento: '0000' });
    expect(boleta.adquirente).toEqual({ tipoDocumento: '0', numero: '0', nombre: 'CLIENTES VARIOS' });
    expect(boleta.totales).toEqual({ gravado: '0.85', exonerado: '0.00', inafecto: '0.00', igv: '0.15', total: '1.00' });
    expect(boleta.lineas).toEqual([expect.objectContaining({ cantidad: '1.0000', valorUnitario: '0.8500', precioUnitario: '1.0000', afectacionIgv: '10', igv: '0.15' })]);
    expect(boleta.montoEnLetras).toBe('UNO CON 00/100 SOLES');
  });
});

describe('Emisor: prueba en beta (TR-RF-052, paso 4)', () => {
  it('solicitarPrueba suma el correlativo y deja EN_PROCESO; BORRADOR o PRODUCCION → ESTADO_EMISOR_INVALIDO', () => {
    const emisor = configurado();
    expect(emisor.solicitarPrueba(AHORA)).toBe(1);
    expect(emisor.prueba).toEqual({ estado: 'EN_PROCESO', numero: 1, solicitadaEn: AHORA, resultadoEn: null, codigo: null, descripcion: null });
    expect(emisor.datos.pruebasEnviadas).toBe(1);

    const borrador = Emisor.crear({ id: 'e2', tenantId: 't', empresaId: 'em', creadoPor: ACTOR, ahora: AHORA });
    expect(() => borrador.solicitarPrueba(AHORA)).toThrow(EstadoEmisorInvalidoError);
    expect(() => enProduccion().solicitarPrueba(AHORA)).toThrow(EstadoEmisorInvalidoError);
  });

  it('otra prueba antes de 10 min → PRUEBA_EN_CURSO; una atascada de 11 min se repite con número nuevo y la vieja se ignora', () => {
    const emisor = configurado();
    const vieja = emisor.solicitarPrueba(AHORA);
    expect(() => emisor.solicitarPrueba(despues(9 * MINUTO))).toThrow(PruebaEnCursoError);

    const nueva = emisor.solicitarPrueba(despues(11 * MINUTO));
    expect(nueva).toBe(vieja + 1);
    expect(emisor.registrarResultadoPrueba(vieja, respuesta('ACEPTADO'), despues(12 * MINUTO))).toBe(false);
    expect(emisor.prueba?.estado).toBe('EN_PROCESO');
    expect(emisor.datos.estado).toBe('CONFIGURADO');

    expect(emisor.registrarResultadoPrueba(nueva, respuesta('ACEPTADO'), despues(13 * MINUTO))).toBe(true);
    expect(emisor.datos.estado).toBe('VERIFICADO');
  });

  it('aceptada (también con observaciones) → VERIFICADO una vez; repetida se ignora; EN_PROCESO no cambia nada', () => {
    const emisor = configurado();
    const numero = emisor.solicitarPrueba(AHORA);
    expect(emisor.registrarResultadoPrueba(numero, respuesta('EN_PROCESO'), despues(MINUTO))).toBe(false);
    expect(emisor.prueba?.estado).toBe('EN_PROCESO');
    expect(emisor.registrarResultadoPrueba(numero, respuesta('ACEPTADO_CON_OBSERVACIONES'), despues(MINUTO))).toBe(true);
    expect(emisor.prueba).toMatchObject({ estado: 'ACEPTADA', codigo: '0', resultadoEn: despues(MINUTO) });
    expect(emisor.registrarResultadoPrueba(numero, respuesta('ACEPTADO'), despues(2 * MINUTO))).toBe(false);

    // Una prueba nueva desde VERIFICADO aceptada no vuelve a publicar.
    const otra = emisor.solicitarPrueba(despues(3 * MINUTO));
    expect(emisor.registrarResultadoPrueba(otra, respuesta('ACEPTADO'), despues(4 * MINUTO))).toBe(false);
    expect(emisor.datos.estado).toBe('VERIFICADO');
  });

  it('rechazo → RECHAZADA con código y descripción recortada a 500; ERROR_TECNICO final → ERROR; el emisor sigue CONFIGURADO', () => {
    const emisor = configurado();
    const numero = emisor.solicitarPrueba(AHORA);
    emisor.registrarResultadoPrueba(numero, respuesta('RECHAZADO', { descripcion: 'x'.repeat(800) }), despues(MINUTO));
    expect(emisor.prueba).toMatchObject({ estado: 'RECHAZADA', codigo: '2800' });
    expect(emisor.prueba?.descripcion).toHaveLength(LARGO_MAXIMO_DESCRIPCION_PRUEBA);
    expect(emisor.datos.estado).toBe('CONFIGURADO');

    const otra = emisor.solicitarPrueba(despues(2 * MINUTO));
    emisor.registrarResultadoPrueba(otra, respuesta('ERROR_TECNICO', { codigo: 'TIEMPO_AGOTADO', descripcion: null }), despues(3 * MINUTO));
    expect(emisor.prueba).toMatchObject({ estado: 'ERROR', codigo: 'TIEMPO_AGOTADO', descripcion: null });
    expect(emisor.datos.estado).toBe('CONFIGURADO');
  });

  it('credencial o configuración inválida (spec 52) → RECHAZADA, como antes; el emisor sigue CONFIGURADO', () => {
    const emisor = configurado();
    const numero = emisor.solicitarPrueba(AHORA);
    emisor.registrarResultadoPrueba(numero, respuesta('CREDENCIAL_INVALIDA', { codigo: '0102' }), despues(MINUTO));
    expect(emisor.prueba).toMatchObject({ estado: 'RECHAZADA', codigo: '0102' });
    expect(emisor.datos.estado).toBe('CONFIGURADO');
  });
});

describe('Emisor: paso a producción (TR-RF-052, paso 5)', () => {
  it('con todo en regla deja estado y ambiente en PRODUCCION con quién y cuándo', () => {
    const emisor = enProduccion();
    expect(emisor.datos).toMatchObject({ estado: 'PRODUCCION', ambiente: 'PRODUCCION', produccionHabilitadaEn: despues(HORA), produccionHabilitadaPor: ACTOR });
  });

  it('falla en orden: entorno, simulador, prueba, certificado', () => {
    const emisor = configurado();
    expect(() => emisor.habilitarProduccion(AHORA, reglas({ produccionPermitida: false, esSimulado: true }), ACTOR)).toThrow(ProduccionNoPermitidaError);
    expect(() => emisor.habilitarProduccion(AHORA, reglas({ esSimulado: true }), ACTOR)).toThrow(ProveedorSimuladoEnProduccionError);
    expect(() => emisor.habilitarProduccion(AHORA, reglas({ requiereCertificado: true }), ACTOR)).toThrow(PruebaBetaRequeridaError);
    // Sin certificado o con uno vencido cuando el proveedor lo pide.
    expect(() => verificado().habilitarProduccion(despues(HORA), reglas({ requiereCertificado: true }), ACTOR)).toThrow(CertificadoVencidoError);
    const conCertificado = configurado();
    conCertificado.asignarCertificado(certificado(despues(2 * HORA)), { certificadoId: 'c', claveId: 'k' });
    conCertificado.registrarResultadoPrueba(conCertificado.solicitarPrueba(AHORA), respuesta('ACEPTADO'), despues(MINUTO));
    expect(() => conCertificado.habilitarProduccion(despues(3 * HORA), reglas({ requiereCertificado: true }), ACTOR)).toThrow(CertificadoVencidoError);
  });

  it('aceptada hace 25 h no habilita; hace 23 h sí', () => {
    expect(() => verificado().habilitarProduccion(despues(25 * HORA + MINUTO), reglas(), ACTOR)).toThrow(PruebaBetaRequeridaError);
    expect(() => verificado().habilitarProduccion(despues(23 * HORA), reglas(), ACTOR)).not.toThrow();
  });

  it('certificado vigente cuando el proveedor lo pide: habilita', () => {
    const emisor = configurado();
    emisor.asignarCertificado(certificado(despues(400 * 24 * HORA)), { certificadoId: 'c', claveId: 'k' });
    const numero = emisor.solicitarPrueba(AHORA);
    emisor.registrarResultadoPrueba(numero, respuesta('ACEPTADO'), despues(MINUTO));
    expect(() => emisor.habilitarProduccion(despues(HORA), reglas({ requiereCertificado: true }), ACTOR)).not.toThrow();
  });
});

describe('Emisor: cambios después de verificar', () => {
  const configuracion = { proveedor: 'NUBEFACT', usuarioProveedor: 'MODDATOS', regimenIgv: 'GENERAL', leyendaPie: null, urlProveedor: URL_NUBEFACT };

  it.each([
    ['proveedor', (emisor: Emisor) => emisor.configurarProveedor({ ...configuracion, proveedor: 'SIMULADO' })],
    ['URL', (emisor: Emisor) => emisor.configurarProveedor({ ...configuracion, urlProveedor: `${URL_NUBEFACT}x` })],
    ['credencial', (emisor: Emisor) => emisor.asignarCredencial('secreto-1')],
    ['certificado', (emisor: Emisor) => emisor.asignarCertificado(certificado(despues(400 * 24 * HORA)), { certificadoId: 'c', claveId: 'k' })],
  ])('VERIFICADO: cambiar %s vuelve a CONFIGURADO y limpia la prueba', (_campo, cambiar) => {
    const emisor = verificado();
    cambiar(emisor);
    expect(emisor.datos.estado).toBe('CONFIGURADO');
    expect(emisor.prueba).toBeNull();
    expect(emisor.datos.pruebasEnviadas).toBe(1);
  });

  it('VERIFICADO: cambiar solo régimen o leyenda no invalida la prueba', () => {
    const emisor = verificado();
    emisor.configurarProveedor({ ...configuracion, regimenIgv: 'REDUCIDO_RESTAURANTES', leyendaPie: 'Gracias' });
    expect(emisor.datos.estado).toBe('VERIFICADO');
  });

  it('PRODUCCION: rotar credencial o certificado sigue en PRODUCCION; cambiar proveedor o URL → EMISOR_EN_PRODUCCION', () => {
    const emisor = enProduccion();
    emisor.asignarCredencial('secreto-1');
    emisor.asignarCertificado(certificado(despues(400 * 24 * HORA)), { certificadoId: 'c', claveId: 'k' });
    emisor.configurarProveedor({ ...configuracion, leyendaPie: 'Gracias' });
    expect(emisor.datos).toMatchObject({ estado: 'PRODUCCION', ambiente: 'PRODUCCION' });

    expect(() => emisor.configurarProveedor({ ...configuracion, proveedor: 'SIMULADO' })).toThrow(EmisorEnProduccionError);
    expect(() => emisor.configurarProveedor({ ...configuracion, urlProveedor: `${URL_NUBEFACT}x` })).toThrow(EmisorEnProduccionError);
    expect(emisor.datos.proveedor).toBe('NUBEFACT');
  });
});
