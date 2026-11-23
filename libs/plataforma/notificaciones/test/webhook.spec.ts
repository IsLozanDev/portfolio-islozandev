import 'reflect-metadata';
import { Module, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { Resend } from 'resend';
import request from 'supertest';
import { EntregarMensaje } from '../src/application/entregar-mensaje.js';
import { EnviarNotificacion } from '../src/application/enviar-notificacion.js';
import { ProcesarEventoProveedor } from '../src/application/procesar-evento-proveedor.js';
import { FirmaWebhookInvalidaError } from '../src/domain/errores.js';
import { VERIFICADOR_NO_CONFIGURADO } from '../src/infrastructure/resend/no-configurado.js';
import { VerificadorWebhookResend } from '../src/infrastructure/resend/verificador-webhook.resend.js';
import { WebhooksController } from '../src/interface/webhooks.controller.js';
import { escenario, TENANT_A, TENANT_B } from './support/dobles.js';
import { avisoResend, firmar, SECRETO_PRUEBA } from './support/firma-svix.js';

const RUTA = '/v1/notificaciones/webhooks/resend';
const MINUTOS_FUERA_DE_TOLERANCIA = 6;
const MINUTOS_DENTRO_DE_TOLERANCIA = 4;
const REBOTE_DURO = { bounce: { type: 'Permanent', subType: 'General', message: 'no existe' } };

const verificadorReal = (secreto = SECRETO_PRUEBA) => new VerificadorWebhookResend(new Resend('re_prueba').webhooks, secreto);

describe('VerificadorWebhookResend (firma Svix con el SDK)', () => {
  const verificador = verificadorReal();
  const verificar = ({ cuerpo, cabeceras }: ReturnType<typeof firmar>) => verificador.verificar(cuerpo, cabeceras);

  it('acepta una carga firmada y la traduce', () => {
    expect(verificar(firmar(avisoResend('email.delivered', 're_1')))).toEqual({ tipo: 'ENTREGADO', idExterno: 're_1', en: new Date('2026-11-20T15:00:05.000Z') });
    expect(verificar(firmar(avisoResend('email.sent', 're_1')))).toMatchObject({ tipo: 'ENVIADO' });
    expect(verificar(firmar(avisoResend('email.opened', 're_1')))).toMatchObject({ tipo: 'LEIDO' });
    expect(verificar(firmar(avisoResend('email.complained', 're_1')))).toMatchObject({ tipo: 'QUEJA_SPAM' });
    expect(verificar(firmar(avisoResend('email.bounced', 're_1', REBOTE_DURO)))).toMatchObject({ tipo: 'REBOTE_DURO', detalle: 'General' });
  });

  it('ignora el rebote transitorio, delivery_delayed y clicked', () => {
    const transitorio = { bounce: { type: 'Transient', subType: 'MailboxFull', message: 'lleno' } };
    expect(verificar(firmar(avisoResend('email.bounced', 're_1', transitorio)))).toEqual({ tipo: 'IGNORADO', idExterno: 're_1' });
    expect(verificar(firmar(avisoResend('email.delivery_delayed', 're_1')))).toEqual({ tipo: 'IGNORADO' });
    expect(verificar(firmar(avisoResend('email.clicked', 're_1')))).toEqual({ tipo: 'IGNORADO' });
  });

  it('TR-RNF-109: rechaza firma alterada, otro secreto, cuerpo cambiado, cabeceras faltantes y marca de hace 6 min', () => {
    const valida = firmar(avisoResend('email.delivered', 're_1'));
    const firmaAlterada = { ...valida, cabeceras: { ...valida.cabeceras, 'svix-signature': 'v1,AAAA' } };
    const cuerpoCambiado = { ...valida, cuerpo: Buffer.from(valida.cuerpo.toString().replace('re_1', 're_2')) };
    const sinId = { 'svix-timestamp': valida.cabeceras['svix-timestamp'], 'svix-signature': valida.cabeceras['svix-signature'] };

    expect(() => verificar(firmaAlterada)).toThrow(FirmaWebhookInvalidaError);
    expect(() => verificar(cuerpoCambiado)).toThrow(FirmaWebhookInvalidaError);
    expect(() => verificar({ ...valida, cabeceras: sinId })).toThrow(FirmaWebhookInvalidaError);
    expect(() => verificar(firmar(avisoResend('email.delivered', 're_1'), { haceMinutos: MINUTOS_FUERA_DE_TOLERANCIA }))).toThrow(FirmaWebhookInvalidaError);
    expect(() => verificadorReal(`whsec_${Buffer.from('otro-secreto-de-32-bytes-de-largo').toString('base64')}`).verificar(valida.cuerpo, valida.cabeceras)).toThrow(
      FirmaWebhookInvalidaError,
    );
    expect(verificar(firmar(avisoResend('email.delivered', 're_1'), { haceMinutos: MINUTOS_DENTRO_DE_TOLERANCIA }))).toMatchObject({ tipo: 'ENTREGADO' });
  });
});

describe('ProcesarEventoProveedor y webhook HTTP (TR-CA-197, TR-CA-198)', () => {
  let piezas: ReturnType<typeof escenario>;
  let app: INestApplication;
  let mensajeId: string;
  let idExterno: string;

  async function levantar(procesar: ProcesarEventoProveedor): Promise<INestApplication> {
    @Module({ controllers: [WebhooksController], providers: [{ provide: ProcesarEventoProveedor, useValue: procesar }] })
    class ModuloPrueba {}
    const nueva = await NestFactory.create(ModuloPrueba, { rawBody: true, logger: false });
    nueva.setGlobalPrefix('v1');
    await nueva.init();
    return nueva;
  }

  async function enviarYEntregar(correo = 'ana@ejemplo.pe'): Promise<string> {
    const registrada = await piezas.enTenant(TENANT_A, () =>
      new EnviarNotificacion(piezas.envio).enviar({
        plantilla: 'PRUEBA_CORREO',
        destinatario: { correo },
        variables: { nombre: 'Ana', producto: 'SazónPOS' },
        finalidad: 'TRANSACCIONAL',
        claveIdempotencia: uuidV7(),
      }),
    );
    await new EntregarMensaje(piezas.entrega).ejecutar({ tenantId: TENANT_A, mensajeId: registrada.mensajeId }, { numero: 1, esUltimo: false });
    return registrada.mensajeId;
  }

  const publicar = ({ cuerpo, cabeceras }: ReturnType<typeof firmar>) =>
    request(app.getHttpServer()).post(RUTA).set(cabeceras).set('content-type', 'application/json').send(cuerpo.toString());
  const estado = () => piezas.mensajes.guardado(mensajeId).instantanea();

  beforeEach(async () => {
    piezas = escenario();
    app = await levantar(new ProcesarEventoProveedor({ ...piezas.webhook, verificador: verificadorReal() }));
    mensajeId = await enviarYEntregar();
    idExterno = `re_${mensajeId}`;
  });

  afterEach(() => app.close());

  it('TR-CA-197: email.delivered firmado → 204 y ENTREGADO con entregado_en, con un intento CALLBACK', async () => {
    await publicar(firmar(avisoResend('email.delivered', idExterno))).expect(204);

    expect(estado()).toMatchObject({ estado: 'ENTREGADO', entregadoEn: new Date('2026-11-20T15:00:05.000Z') });
    expect(piezas.mensajes.intentos.map((intento) => [intento.numero, intento.resultado])).toEqual([
      [1, 'ACEPTADO'],
      [2, 'CALLBACK'],
    ]);
  });

  it('repetido o fuera de orden (delivered y después sent) no cambia el estado ni duplica intentos', async () => {
    const entregado = firmar(avisoResend('email.delivered', idExterno));
    await publicar(entregado).expect(204);
    await publicar(entregado).expect(204);
    await publicar(firmar(avisoResend('email.sent', idExterno))).expect(204);

    expect(estado().estado).toBe('ENTREGADO');
    expect(piezas.mensajes.intentos).toHaveLength(2);
  });

  it('id externo desconocido → 204 sin cambios y aviso con el id externo', async () => {
    await publicar(firmar(avisoResend('email.delivered', 're_desconocido'))).expect(204);

    expect(estado().estado).toBe('ENVIADO');
    expect(piezas.avisos.llamadas).toEqual([{ mensaje: expect.any(String), datos: { idExterno: 're_desconocido', tipo: 'ENTREGADO' } }]);
  });

  it('TR-CA-198: rebote duro → FALLIDO con motivo, contacto inválido y el siguiente envío al mismo correo DESCARTADO', async () => {
    await publicar(firmar(avisoResend('email.bounced', idExterno, REBOTE_DURO))).expect(204);

    expect(estado()).toMatchObject({ estado: 'FALLIDO', motivoFallo: 'REBOTE_DURO: General' });
    const siguiente = await piezas.enTenant(TENANT_A, () =>
      new EnviarNotificacion(piezas.envio).enviar({
        plantilla: 'PRUEBA_CORREO',
        destinatario: { correo: 'ANA@ejemplo.pe' },
        variables: { nombre: 'Ana', producto: 'SazónPOS' },
        finalidad: 'TRANSACCIONAL',
        claveIdempotencia: uuidV7(),
      }),
    );
    expect(siguiente.estado).toBe('DESCARTADO');
    const enB = await piezas.enTenant(TENANT_B, () =>
      new EnviarNotificacion(piezas.envio).enviar({
        plantilla: 'PRUEBA_CORREO',
        destinatario: { correo: 'ana@ejemplo.pe' },
        variables: { nombre: 'Ana', producto: 'SazónPOS' },
        finalidad: 'TRANSACCIONAL',
        claveIdempotencia: uuidV7(),
      }),
    );
    expect(enB.estado).toBe('ENCOLADO');
    expect(piezas.proveedor.enviados).toHaveLength(1);
  });

  it('TR-RNF-109: firma inválida o marca de hace 6 min → 401 FIRMA_WEBHOOK_INVALIDA y el mensaje no cambia', async () => {
    const valida = firmar(avisoResend('email.delivered', idExterno));

    const alterada = await publicar({ ...valida, cabeceras: { ...valida.cabeceras, 'svix-signature': 'v1,AAAA' } }).expect(401);
    await publicar(firmar(avisoResend('email.delivered', idExterno), { haceMinutos: MINUTOS_FUERA_DE_TOLERANCIA })).expect(401);

    expect(alterada.body).toMatchObject({ statusCode: 401, code: 'FIRMA_WEBHOOK_INVALIDA' });
    expect(estado().estado).toBe('ENVIADO');
  });

  it('sin secreto configurado → 503 PROVEEDOR_NO_CONFIGURADO', async () => {
    await app.close();
    app = await levantar(new ProcesarEventoProveedor({ ...piezas.webhook, verificador: VERIFICADOR_NO_CONFIGURADO }));

    const respuesta = await publicar(firmar(avisoResend('email.delivered', idExterno))).expect(503);

    expect(respuesta.body).toMatchObject({ code: 'PROVEEDOR_NO_CONFIGURADO' });
  });
});
