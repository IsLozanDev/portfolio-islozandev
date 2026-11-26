import { respuestaFinalDe, type RespuestaFinal } from '../src/domain/comprobante/respuesta-comprobante.js';
import { esEstadoFinal, ESTADOS_COMPROBANTE } from '../src/domain/comprobante/tipo-comprobante.js';
import { nuevoIntento, RESULTADOS_ENVIO } from '../src/domain/envio/intento-envio.js';
import { TransicionComprobanteInvalidaError } from '../src/domain/errores.js';
import { EVENTOS_FE } from '../src/domain/eventos-fe.js';
import type { RespuestaPse } from '../src/domain/respuesta-pse.js';
import { comprobante } from './support/comprobante-de-prueba.js';

const AHORA = new Date('2026-11-25T15:10:00Z');
const XML_ID = '0193f3a0-0000-7000-8000-0000000000a1';
const CDR_ID = '0193f3a0-0000-7000-8000-0000000000a2';
const ARCHIVOS = { xmlArchivoId: XML_ID, cdrArchivoId: CDR_ID };

function respuestaPse(resultado: RespuestaPse['resultado'], cambios: Partial<RespuestaPse> = {}): RespuestaPse {
  return { resultado, codigo: '0', descripcion: 'La Boleta numero B002-125, ha sido aceptada', observaciones: [], hash: 'hash-firma', ...cambios };
}

function respuestaFinal(resultado: RespuestaPse['resultado'], cambios: Partial<RespuestaPse> = {}): RespuestaFinal {
  const final = respuestaFinalDe(respuestaPse(resultado, cambios));
  if (!final) throw new Error(`${resultado} debía ser una respuesta final`);
  return final;
}

/** Un comprobante recién emitido, sin el evento cpe.emitido ya extraído. */
function emitido() {
  const nuevo = comprobante({ tipo: 'BOLETA', serie: 'B002', adquirente: null }, 125);
  nuevo.extraerEventos();
  return nuevo;
}

describe('Estados finales del comprobante (TR-RN-022)', () => {
  it('solo ACEPTADO, ACEPTADO_CON_OBSERVACIONES y RECHAZADO son finales', () => {
    expect(ESTADOS_COMPROBANTE.filter(esEstadoFinal)).toEqual(['ACEPTADO', 'ACEPTADO_CON_OBSERVACIONES', 'RECHAZADO']);
  });

  it('una respuesta técnica, de credencial o en proceso no cierra el envío', () => {
    expect(respuestaFinalDe(respuestaPse('ERROR_TECNICO'))).toBeNull();
    expect(respuestaFinalDe(respuestaPse('CREDENCIAL_INVALIDA'))).toBeNull();
    expect(respuestaFinalDe(respuestaPse('EN_PROCESO'))).toBeNull();
  });

  it('la respuesta final recorta código, descripción y hash al largo de sus columnas', () => {
    const final = respuestaFinal('RECHAZADO', { codigo: '2'.repeat(30), descripcion: 'x'.repeat(800), hash: 'h'.repeat(150) });

    expect(final.codigo).toHaveLength(10);
    expect(final.descripcion).toHaveLength(500);
    expect(final.hash).toHaveLength(100);
  });
});

describe('Comprobante.registrarRespuesta (TR-RF-059)', () => {
  it('TR-CA-150: respuesta 0 → ACEPTADO con la respuesta y los archivos, versión 2 y cpe.aceptado', () => {
    const boleta = emitido();

    boleta.registrarRespuesta(respuestaFinal('ACEPTADO'), ARCHIVOS, AHORA);

    expect(boleta.datos).toMatchObject({ estado: 'ACEPTADO', version: 2, modificadoEn: AHORA });
    expect(boleta.datos.respuesta).toEqual({
      resultado: 'ACEPTADO',
      codigo: '0',
      descripcion: 'La Boleta numero B002-125, ha sido aceptada',
      observaciones: [],
      hash: 'hash-firma',
      xmlArchivoId: XML_ID,
      cdrArchivoId: CDR_ID,
      respondidoEn: AHORA,
    });
    const [evento] = boleta.extraerEventos();
    expect(evento).toMatchObject({ eventType: EVENTOS_FE.comprobanteAceptado, aggregateId: boleta.id, aggregateVersion: 2, occurredAt: AHORA });
    expect(evento?.payload).toEqual({
      comprobante_id: boleta.id,
      tipo: '03',
      serie: 'B002',
      numero: 125,
      total: boleta.datos.totales.total.aTexto(),
      moneda: 'PEN',
      estado: 'ACEPTADO',
      origen_producto: null,
      origen_id: null,
      codigo_respuesta: '0',
      observaciones: [],
      xml_archivo_id: XML_ID,
      cdr_archivo_id: CDR_ID,
    });
  });

  it('TR-CA-152: observación no bloqueante → ACEPTADO_CON_OBSERVACIONES y cpe.aceptado con la observación', () => {
    const boleta = emitido();

    boleta.registrarRespuesta(respuestaFinal('ACEPTADO_CON_OBSERVACIONES', { observaciones: ['4252 - El dato ingresado como atributo'] }), ARCHIVOS, AHORA);

    expect(boleta.datos.estado).toBe('ACEPTADO_CON_OBSERVACIONES');
    const [evento] = boleta.extraerEventos();
    expect(evento?.eventType).toBe(EVENTOS_FE.comprobanteAceptado);
    expect(evento?.payload).toMatchObject({ estado: 'ACEPTADO_CON_OBSERVACIONES', observaciones: ['4252 - El dato ingresado como atributo'] });
  });

  it('TR-CA-151: rechazo → RECHAZADO con código y descripción y cpe.rechazado, sin CDR', () => {
    const boleta = emitido();

    boleta.registrarRespuesta(respuestaFinal('RECHAZADO', { codigo: '2105', descripcion: 'Unidad de medida no existe' }), { xmlArchivoId: XML_ID, cdrArchivoId: null }, AHORA);

    expect(boleta.datos).toMatchObject({ estado: 'RECHAZADO', respuesta: { codigo: '2105', descripcion: 'Unidad de medida no existe', cdrArchivoId: null } });
    const [evento] = boleta.extraerEventos();
    expect(evento?.eventType).toBe(EVENTOS_FE.comprobanteRechazado);
    expect(evento?.payload).toMatchObject({
      estado: 'RECHAZADO',
      codigo_respuesta: '2105',
      descripcion_respuesta: 'Unidad de medida no existe',
      xml_archivo_id: XML_ID,
    });
    expect(evento?.payload).not.toHaveProperty('cdr_archivo_id');
  });

  it('los eventos de respuesta no llevan datos del adquirente (TR-RNF-026)', () => {
    const factura = comprobante({}, 101);
    factura.extraerEventos();

    factura.registrarRespuesta(respuestaFinal('ACEPTADO'), ARCHIVOS, AHORA);

    const texto = JSON.stringify(factura.extraerEventos()[0]?.payload);
    expect(texto).not.toContain(factura.datos.adquirente.numero);
    expect(texto).not.toContain(factura.datos.adquirente.nombre);
  });

  it('con los archivos que no se pudieron guardar, la respuesta queda igual y el evento los lleva nulos', () => {
    const boleta = emitido();

    boleta.registrarRespuesta(respuestaFinal('ACEPTADO'), { xmlArchivoId: null, cdrArchivoId: null }, AHORA);

    expect(boleta.datos.estado).toBe('ACEPTADO');
    expect(boleta.extraerEventos()[0]?.payload).toMatchObject({ xml_archivo_id: null, cdr_archivo_id: null });
  });

  it('desde un estado final no admite otra respuesta ni levanta eventos', () => {
    const boleta = emitido();
    boleta.registrarRespuesta(respuestaFinal('RECHAZADO', { codigo: '2105' }), ARCHIVOS, AHORA);
    boleta.extraerEventos();

    expect(() => boleta.registrarRespuesta(respuestaFinal('ACEPTADO'), ARCHIVOS, AHORA)).toThrow(TransicionComprobanteInvalidaError);
    expect(boleta.datos).toMatchObject({ estado: 'RECHAZADO', version: 2 });
    expect(boleta.extraerEventos()).toEqual([]);
  });
});

describe('Intento de envío', () => {
  it('los resultados son los del CHECK de fe.envio', () => {
    expect([...RESULTADOS_ENVIO]).toEqual(['ACEPTADO', 'ACEPTADO_CON_OBSERVACIONES', 'RECHAZADO', 'ERROR_TECNICO', 'CREDENCIAL_INVALIDA', 'NO_ENVIADO']);
  });

  it('recorta código y descripción del proveedor al largo de sus columnas', () => {
    const intento = nuevoIntento({
      id: 'i-1',
      tenantId: 't',
      comprobanteId: 'c',
      intento: 1,
      proveedor: 'SUNAT',
      resultado: 'ERROR_TECNICO',
      codigo: 'C'.repeat(40),
      descripcion: 'd'.repeat(900),
      enviadoEn: AHORA,
      duracionMs: 15_000,
    });

    expect(intento.codigo).toHaveLength(20);
    expect(intento.descripcion).toHaveLength(500);
  });
});
