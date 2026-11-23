import { uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { EncolarEnvio } from '../src/application/encolar-envio.js';
import { EntregarMensaje } from '../src/application/entregar-mensaje.js';
import { EnviarNotificacion } from '../src/application/enviar-notificacion.js';
import type { IntentoEnCurso } from '../src/application/ports/cola-envios.js';
import { ErrorDefinitivoProveedor, ErrorTemporalProveedor } from '../src/application/ports/proveedor-correo.js';
import { ProveedorNoConfiguradoError } from '../src/domain/errores.js';
import { INTENTOS_ENVIO } from '../src/infrastructure/bullmq/cola-envios.js';
import { PROVEEDOR_NO_CONFIGURADO } from '../src/infrastructure/resend/no-configurado.js';
import { ColaMemoria, escenario, TENANT_A } from './support/dobles.js';

const intento = (numero: number): IntentoEnCurso => ({ numero, esUltimo: numero >= INTENTOS_ENVIO });

describe('cola y entrega (spec 42, paso 5)', () => {
  let piezas: ReturnType<typeof escenario>;
  let entregar: EntregarMensaje;
  let mensajeId: string;

  beforeEach(async () => {
    piezas = escenario();
    entregar = new EntregarMensaje(piezas.entrega);
    const registrada = await piezas.enTenant(TENANT_A, () =>
      new EnviarNotificacion(piezas.envio).enviar({
        plantilla: 'PRUEBA_CORREO',
        destinatario: { correo: 'ana@ejemplo.pe' },
        variables: { nombre: 'Ana', producto: 'SazónPOS' },
        finalidad: 'TRANSACCIONAL',
        claveIdempotencia: uuidV7(),
      }),
    );
    mensajeId = registrada.mensajeId;
  });

  const estado = () => piezas.mensajes.guardado(mensajeId).instantanea();
  const resultados = () => piezas.mensajes.intentos.map((registrado) => registrado.resultado);
  const trabajo = () => ({ tenantId: TENANT_A, mensajeId });

  it('EncolarEnvio agrega un trabajo por mensaje, con retardo hasta programado_para', async () => {
    const cola = new ColaMemoria();
    const encolar = new EncolarEnvio({ reloj: piezas.reloj, cola });

    await encolar.ejecutar(TENANT_A, { mensaje_id: mensajeId });
    await encolar.ejecutar(TENANT_A, { mensaje_id: mensajeId });
    await encolar.ejecutar(TENANT_A, { mensaje_id: 'programado', programado_para: new Date(piezas.reloj.now().getTime() + 60_000).toISOString() });
    await encolar.ejecutar(TENANT_A, { mensaje_id: 'vencido', programado_para: '2020-01-01T00:00:00.000Z' });

    expect(cola.trabajos.size).toBe(3);
    expect(cola.trabajos.get(mensajeId)).toEqual({ trabajo: { tenantId: TENANT_A, mensajeId }, retardoMs: 0 });
    expect(cola.trabajos.get('programado')?.retardoMs).toBe(60_000);
    expect(cola.trabajos.get('vencido')?.retardoMs).toBe(0);
  });

  it('TR-CA-187: con éxito queda ENVIADO con id_externo, remitente de NOT_REMITENTE e Idempotency-Key = mensajeId', async () => {
    await entregar.ejecutar(trabajo(), intento(1));

    expect(estado()).toMatchObject({ estado: 'ENVIADO', idExterno: `re_${mensajeId}`, enviadoEn: piezas.reloj.now() });
    expect(piezas.proveedor.enviados).toEqual([
      { mensajeId, remitente: 'Vitrina <no-responder@vitrina.pe>', destino: 'ana@ejemplo.pe', asunto: 'Prueba de correo de SazónPOS', html: expect.any(String) },
    ]);
    expect(piezas.mensajes.intentos).toEqual([expect.objectContaining({ numero: 1, resultado: 'ACEPTADO', respuestaProveedor: { id_externo: `re_${mensajeId}` } })]);
  });

  it('un mensaje que ya no está ENCOLADO no se vuelve a enviar (evento o trabajo repetido)', async () => {
    await entregar.ejecutar(trabajo(), intento(1));
    await entregar.ejecutar(trabajo(), intento(1));

    expect(piezas.proveedor.enviados).toHaveLength(1);
  });

  it('error temporal × 3: cada intento queda registrado, se relanza para BullMQ y al final FALLIDO con REINTENTOS_AGOTADOS', async () => {
    piezas.proveedor.responder(new ErrorTemporalProveedor('HTTP_503'), new ErrorTemporalProveedor('SIN_RESPUESTA'), new ErrorTemporalProveedor('rate_limit_exceeded'));

    await expect(entregar.ejecutar(trabajo(), intento(1))).rejects.toThrow(ErrorTemporalProveedor);
    expect(estado().estado).toBe('ENCOLADO');
    await expect(entregar.ejecutar(trabajo(), intento(2))).rejects.toThrow(ErrorTemporalProveedor);
    await expect(entregar.ejecutar(trabajo(), intento(3))).rejects.toThrow(ErrorTemporalProveedor);

    expect(estado()).toMatchObject({ estado: 'FALLIDO', motivoFallo: 'REINTENTOS_AGOTADOS' });
    expect(resultados()).toEqual(['ERROR_TEMPORAL', 'ERROR_TEMPORAL', 'ERROR_TEMPORAL']);
    expect(piezas.mensajes.intentos.map((registrado) => registrado.numero)).toEqual([1, 2, 3]);
    expect(piezas.proveedor.enviados).toHaveLength(3);
  });

  it('un temporal seguido de éxito deja ENVIADO', async () => {
    piezas.proveedor.responder(new ErrorTemporalProveedor('HTTP_500'));

    await expect(entregar.ejecutar(trabajo(), intento(1))).rejects.toThrow(ErrorTemporalProveedor);
    await entregar.ejecutar(trabajo(), intento(2));

    expect(estado().estado).toBe('ENVIADO');
    expect(resultados()).toEqual(['ERROR_TEMPORAL', 'ACEPTADO']);
  });

  it('error definitivo deja FALLIDO con el código del proveedor y no se relanza (sin reintento)', async () => {
    piezas.proveedor.responder(new ErrorDefinitivoProveedor('validation_error'));

    await expect(entregar.ejecutar(trabajo(), intento(1))).resolves.toBeUndefined();

    expect(estado()).toMatchObject({ estado: 'FALLIDO', motivoFallo: 'validation_error' });
    expect(resultados()).toEqual(['ERROR_DEFINITIVO']);
  });

  it('sin proveedor configurado falla con ProveedorNoConfiguradoError y el mensaje sigue ENCOLADO', async () => {
    const sinProveedor = new EntregarMensaje({ ...piezas.entrega, proveedor: PROVEEDOR_NO_CONFIGURADO });
    const sinRemitente = new EntregarMensaje({ ...piezas.entrega, remitente: undefined });

    await expect(sinProveedor.ejecutar(trabajo(), intento(3))).rejects.toThrow(ProveedorNoConfiguradoError);
    await expect(sinRemitente.ejecutar(trabajo(), intento(1))).rejects.toThrow(ProveedorNoConfiguradoError);

    expect(estado().estado).toBe('ENCOLADO');
    expect(piezas.mensajes.intentos).toHaveLength(0);
  });

  it('TR-RNF-026: los avisos llevan el mensaje y el código, nunca el destino', async () => {
    piezas.proveedor.responder(new ErrorTemporalProveedor('HTTP_503'));

    await expect(entregar.ejecutar(trabajo(), intento(1))).rejects.toThrow();

    expect(piezas.avisos.llamadas).toEqual([{ mensaje: expect.any(String), datos: { mensajeId, intento: 1, codigo: 'HTTP_503' } }]);
    expect(JSON.stringify(piezas.mensajes.intentos)).not.toContain('ejemplo.pe');
  });
});
