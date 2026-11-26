import { InMemoryEventSchemaValidator } from '@vitrina/plataforma/kernel-infra';
import { ErrorTecnicoPseError } from '../src/application/ejecutar-prueba-emisor.js';
import { EmitirComprobante } from '../src/application/emitir-comprobante.js';
import { EnviarComprobante, EVENTOS_LOG_ENVIO } from '../src/application/enviar-comprobante.js';
import type { EmitirComprobanteComando } from '../src/application/ports/comprobante.port.js';
import { EVENTOS_FE } from '../src/domain/eventos-fe.js';
import { registrarEsquemasFe } from '../src/infrastructure/event-schemas.js';
import {
  OBSERVACION_SIMULADA,
  TOKEN_SIMULAR_CREDENCIAL,
  TOKEN_SIMULAR_ERROR,
  TOKEN_SIMULAR_OBSERVACION,
  TOKEN_SIMULAR_RECHAZO,
} from '../src/infrastructure/pse/simulador/pse.simulador.js';
import { EMPRESA, NUBEFACT, TENANT_A, TENANT_B } from './support/dobles.js';
import { RUC_CLIENTE, SUCURSAL } from './support/dobles-emision.js';
import { ANEXO_SUCURSAL, crearDoblesEnvio, TOKEN_ACEPTA, type DoblesEnvio } from './support/dobles-envio.js';

const CLAVE = '0193f3a0-0000-7000-8000-00000000e521';
const NOMBRE_CLIENTE = 'CLIENTE SAC';
const PRIMER_INTENTO = { numero: 1, esUltimo: false };
const ULTIMO_INTENTO = { numero: 3, esUltimo: true };

function boleta(cambios: Partial<EmitirComprobanteComando> = {}): EmitirComprobanteComando {
  return {
    tipo: 'BOLETA',
    empresaId: EMPRESA,
    sucursalId: SUCURSAL,
    moneda: 'PEN',
    formaPago: 'CONTADO',
    lineas: [{ descripcion: 'Menú', unidad: 'NIU', cantidad: '1', valorUnitario: '10.00', afectacionIgv: '10' }],
    claveIdempotencia: CLAVE,
    ...cambios,
  };
}

function factura(): EmitirComprobanteComando {
  return boleta({ tipo: 'FACTURA', adquirente: { tipoDocumento: 'RUC', numero: RUC_CLIENTE, nombre: NOMBRE_CLIENTE } });
}

describe('EnviarComprobante (TR-RF-059)', () => {
  let dobles: DoblesEnvio;
  let envio: EnviarComprobante;
  const validador = new InMemoryEventSchemaValidator();
  registrarEsquemasFe(validador);

  /** Emite con el caso de uso del 51 y descarta su cpe.emitido: solo interesan los eventos del envío. */
  async function emitir(comando: EmitirComprobanteComando = boleta()): Promise<string> {
    const emitido = await new EmitirComprobante(dobles.emision).emitir(comando);
    dobles.publicador.eventos.length = 0;
    dobles.publicador.enTransaccion.length = 0;
    return emitido.comprobanteId;
  }

  const enviar = (comprobanteId: string, intento = PRIMER_INTENTO, tenantId = TENANT_A) => envio.ejecutar({ tenantId, comprobanteId }, intento);
  const leer = (comprobanteId: string) => dobles.unidadDeTrabajo.run(() => dobles.comprobantes.porId(comprobanteId));

  beforeEach(async () => {
    dobles = await crearDoblesEnvio();
    envio = new EnviarComprobante(dobles);
  });

  it('TR-CA-150: respuesta 0 → ACEPTADO con el XML y el CDR en ARC, un intento y cpe.aceptado con esquema válido', async () => {
    const id = await emitir();

    await enviar(id);

    const comprobante = await leer(id);
    const [xml, cdr] = dobles.archivos.guardados;
    expect(comprobante?.datos).toMatchObject({
      estado: 'ACEPTADO',
      version: 2,
      respuesta: { codigo: '0', xmlArchivoId: xml?.archivoId, cdrArchivoId: cdr?.archivoId, hash: expect.any(String) },
    });
    expect(dobles.archivos.guardados.map((archivo) => [archivo.comprobanteId, archivo.tipo])).toEqual([
      [id, 'XML'],
      [id, 'CDR'],
    ]);
    expect(dobles.envios.de(id)).toEqual([
      expect.objectContaining({ intento: 1, proveedor: 'SIMULADO', resultado: 'ACEPTADO', codigo: '0', tenantId: TENANT_A }),
    ]);
    expect(dobles.publicador.tipos()).toEqual([EVENTOS_FE.comprobanteAceptado]);
    expect(dobles.publicador.enTransaccion).toEqual([true]);
    expect(() => validador.validate(dobles.publicador.eventos[0])).not.toThrow();
  });

  it('TR-CA-152: observación no bloqueante → ACEPTADO_CON_OBSERVACIONES con la observación en el comprobante y el evento', async () => {
    await dobles.configurarEmisor({ token: TOKEN_SIMULAR_OBSERVACION });
    const id = await emitir();

    await enviar(id);

    expect((await leer(id))?.datos).toMatchObject({ estado: 'ACEPTADO_CON_OBSERVACIONES', respuesta: { observaciones: [OBSERVACION_SIMULADA] } });
    expect(dobles.publicador.eventos[0]?.payload).toMatchObject({ estado: 'ACEPTADO_CON_OBSERVACIONES', observaciones: [OBSERVACION_SIMULADA] });
  });

  it('TR-CA-151: rechazo → RECHAZADO con código y descripción y cpe.rechazado; sin CDR', async () => {
    await dobles.configurarEmisor({ token: TOKEN_SIMULAR_RECHAZO });
    const id = await emitir();

    await enviar(id);

    expect((await leer(id))?.datos).toMatchObject({ estado: 'RECHAZADO', respuesta: { codigo: '2800', descripcion: 'Rechazo simulado', cdrArchivoId: null } });
    expect(dobles.publicador.tipos()).toEqual([EVENTOS_FE.comprobanteRechazado]);
    expect(() => validador.validate(dobles.publicador.eventos[0])).not.toThrow();
  });

  it('ERROR_TECNICO: lanza para que BullMQ reintente; en el último intento queda PENDIENTE_ENVIO con un intento por vez', async () => {
    await dobles.configurarEmisor({ token: TOKEN_SIMULAR_ERROR });
    const id = await emitir();

    await expect(enviar(id, PRIMER_INTENTO)).rejects.toBeInstanceOf(ErrorTecnicoPseError);
    await expect(enviar(id, { numero: 2, esUltimo: false })).rejects.toBeInstanceOf(ErrorTecnicoPseError);
    await enviar(id, ULTIMO_INTENTO);

    expect((await leer(id))?.datos.estado).toBe('PENDIENTE_ENVIO');
    expect(dobles.envios.de(id).map((intento) => [intento.intento, intento.resultado])).toEqual([
      [1, 'ERROR_TECNICO'],
      [2, 'ERROR_TECNICO'],
      [3, 'ERROR_TECNICO'],
    ]);
    expect(dobles.publicador.eventos).toEqual([]);
  });

  it('CREDENCIAL_INVALIDA: sigue PENDIENTE_ENVIO sin reintento ni evento, con un intento y el log de alerta', async () => {
    await dobles.configurarEmisor({ token: TOKEN_SIMULAR_CREDENCIAL });
    const id = await emitir();

    await enviar(id, PRIMER_INTENTO);

    expect((await leer(id))?.datos.estado).toBe('PENDIENTE_ENVIO');
    expect(dobles.envios.de(id)).toEqual([expect.objectContaining({ resultado: 'CREDENCIAL_INVALIDA', codigo: '0102' })]);
    expect(dobles.publicador.eventos).toEqual([]);
    expect(dobles.registros).toContainEqual(expect.objectContaining({ nivel: 'avisar', mensaje: EVENTOS_LOG_ENVIO.credencialInvalida }));
  });

  it.each([
    ['proveedor NUBEFACT', { proveedor: NUBEFACT }, 'SIN_ADAPTADOR'],
    ['emisor CONFIGURADO', { estado: 'CONFIGURADO' as const }, 'EMISOR_NO_HABILITADO'],
  ])('%s: intento NO_ENVIADO con el motivo, PENDIENTE_ENVIO y sin llamar al proveedor', async (_caso, cambios, motivo) => {
    const id = await emitir();
    await dobles.configurarEmisor(cambios);

    await enviar(id);

    expect((await leer(id))?.datos.estado).toBe('PENDIENTE_ENVIO');
    expect(dobles.envios.de(id)).toEqual([expect.objectContaining({ resultado: 'NO_ENVIADO', codigo: motivo, duracionMs: null })]);
    expect(dobles.pse.documentos).toEqual([]);
    expect(dobles.registros).toContainEqual(expect.objectContaining({ nivel: 'avisar', mensaje: EVENTOS_LOG_ENVIO.noEnviado }));
  });

  it('empresa sin ubigeo: NO_ENVIADO por DATOS_INCOMPLETOS', async () => {
    const id = await emitir();
    const empresa = dobles.emision.base.empresas.empresas.get(EMPRESA);
    if (empresa) dobles.emision.base.empresas.empresas.set(EMPRESA, { ...empresa, ubigeo: null });

    await enviar(id);

    expect(dobles.envios.de(id)).toEqual([expect.objectContaining({ resultado: 'NO_ENVIADO', codigo: 'DATOS_INCOMPLETOS' })]);
    expect(dobles.pse.documentos).toEqual([]);
  });

  it('una boleta en modo RESUMEN no se envía ni registra intentos (va en el resumen diario del 55)', async () => {
    const id = await emitir(boleta({ modoEnvio: 'RESUMEN' }));

    await enviar(id);

    expect(dobles.pse.documentos).toEqual([]);
    expect(dobles.envios.filas).toEqual([]);
  });

  it('el documento lleva el anexo de la sucursal del comprobante y el código SUNAT del tipo de documento del adquirente', async () => {
    await enviar(await emitir(factura()));
    await enviar(await emitir(boleta({ claveIdempotencia: '0193f3a0-0000-7000-8000-00000000e522' })));

    const [deFactura, deBoleta] = dobles.pse.documentos;
    expect(deFactura?.emisor.codigoEstablecimiento).toBe(ANEXO_SUCURSAL);
    expect(deFactura?.adquirente).toMatchObject({ tipoDocumento: '6', numero: RUC_CLIENTE });
    expect(deBoleta?.adquirente).toMatchObject({ tipoDocumento: '0', numero: '0' });
  });

  it('el mismo trabajo dos veces no envía dos veces ni duplica eventos', async () => {
    const id = await emitir();

    await enviar(id);
    await enviar(id);

    expect(dobles.pse.documentos).toHaveLength(1);
    expect(dobles.envios.de(id)).toHaveLength(1);
    expect(dobles.publicador.tipos()).toEqual([EVENTOS_FE.comprobanteAceptado]);
  });

  it('con ARC caído registra igual el estado final y el evento con los archivos en null, sin reenviar', async () => {
    dobles.archivos.caido = true;
    const id = await emitir();

    await enviar(id);
    await enviar(id);

    expect((await leer(id))?.datos).toMatchObject({ estado: 'ACEPTADO', respuesta: { xmlArchivoId: null, cdrArchivoId: null } });
    expect(dobles.publicador.eventos[0]?.payload).toMatchObject({ xml_archivo_id: null, cdr_archivo_id: null });
    expect(dobles.pse.documentos).toHaveLength(1);
  });

  it('un trabajo de otro tenant no ve el comprobante y no hace nada (TR-RNF-010)', async () => {
    const id = await emitir();

    await enviar(id, PRIMER_INTENTO, TENANT_B);

    expect(dobles.pse.documentos).toEqual([]);
    expect(dobles.envios.filas).toEqual([]);
    expect((await leer(id))?.datos.estado).toBe('PENDIENTE_ENVIO');
  });

  it('TR-RNF-026: los logs llevan comprobante, emisor, resultado y duración, sin datos del adquirente ni el token', async () => {
    await enviar(await emitir(factura()));

    const registro = dobles.registros.find((uno) => uno.mensaje === EVENTOS_LOG_ENVIO.resultado);
    expect(registro?.datos).toMatchObject({ comprobante: expect.stringMatching(/^F001-/), resultado: 'ACEPTADO', duracion_ms: expect.any(Number) });
    const texto = JSON.stringify(dobles.registros);
    expect(texto).not.toContain(RUC_CLIENTE);
    expect(texto).not.toContain(NOMBRE_CLIENTE);
    expect(texto).not.toContain(TOKEN_ACEPTA);
  });

});
