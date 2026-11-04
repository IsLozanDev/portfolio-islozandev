import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ProveedorIngresoNoDisponibleError } from '../src/domain/errores.js';
import { ProveedorIngresoGotrue } from '../src/infrastructure/supabase/proveedor-ingreso.gotrue.js';

interface Peticion {
  ruta: string;
  apikey: string | undefined;
  autorizacion: string | undefined;
  reenviadaPara: string | undefined;
  cuerpo: Record<string, unknown>;
}

interface RespuestaSimulada {
  estado: number;
  cuerpo?: unknown;
  cabeceras?: Record<string, string>;
  demoraMs?: number;
  textoCrudo?: string;
}

const PUBLISHABLE_KEY = 'sb_publishable_prueba';
const IP = '190.42.10.8';
const USUARIO = '0193f3a0-0000-7000-8000-000000000901';
const FACTOR = '0193f3a0-0000-7000-8000-00000000fa01';
const DESAFIO = '0193f3a0-0000-7000-8000-00000000de01';
const TOKEN_AAL1 = 'token-aal1';
const TIEMPO_MAXIMO_PRUEBA_MS = 200;

const sesionDeGotrue = (accessToken: string) => ({
  access_token: accessToken,
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 1_700_000_000,
  refresh_token: 'refresh-1',
  user: { id: USUARIO, email: 'rosa.huaman@gmail.com' },
});

const errorDeGotrue = (estado: number, codigo: string): RespuestaSimulada => ({ estado, cuerpo: { code: estado, error_code: codigo, msg: 'x' } });

/** Supabase Auth simulado en local: el adaptador habla HTTP real con `fetch`. */
describe('ProveedorIngresoGotrue (HTTP contra un Auth simulado, spec 18b)', () => {
  let servidor: Server;
  let url: string;
  const peticiones: Peticion[] = [];
  let respuestas: RespuestaSimulada[] = [];

  const leer = (req: IncomingMessage) =>
    new Promise<string>((ok) => {
      let datos = '';
      req.on('data', (parte) => (datos += parte));
      req.on('end', () => ok(datos));
    });

  const proveedor = () => new ProveedorIngresoGotrue(`${url}/`, PUBLISHABLE_KEY, { tiempoMaximoMs: TIEMPO_MAXIMO_PRUEBA_MS });

  beforeAll(async () => {
    servidor = createServer(async (req, res) => {
      const cuerpo = await leer(req);
      peticiones.push({
        ruta: req.url ?? '',
        apikey: req.headers['apikey'] as string | undefined,
        autorizacion: req.headers.authorization,
        reenviadaPara: req.headers['x-forwarded-for'] as string | undefined,
        cuerpo: cuerpo ? JSON.parse(cuerpo) : {},
      });
      const respuesta = respuestas.shift() ?? { estado: 500, cuerpo: {} };
      if (respuesta.demoraMs) await new Promise((ok) => setTimeout(ok, respuesta.demoraMs));
      if (res.destroyed) return;
      res.writeHead(respuesta.estado, { 'content-type': 'application/json', ...respuesta.cabeceras });
      res.end(respuesta.textoCrudo ?? JSON.stringify(respuesta.cuerpo ?? {}));
    });
    await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok));
    url = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>((ok) => servidor.close(() => ok())));

  beforeEach(() => {
    peticiones.length = 0;
    respuestas = [];
  });

  describe('conClave', () => {
    it('pide el grant de contraseña con la publishable key y la IP del cliente, y devuelve la sesión', async () => {
      respuestas = [{ estado: 200, cuerpo: sesionDeGotrue('token-1') }];

      const resultado = await proveedor().conClave('rosa.huaman@gmail.com', 'Clave-segura-1', IP);

      expect(resultado).toEqual({
        exito: true,
        usuarioId: USUARIO,
        sesion: { accessToken: 'token-1', refreshToken: 'refresh-1', expiraEn: 3600, tipoToken: 'bearer' },
      });
      expect(peticiones).toEqual([
        {
          ruta: '/auth/v1/token?grant_type=password',
          apikey: PUBLISHABLE_KEY,
          autorizacion: undefined,
          reenviadaPara: IP,
          cuerpo: { email: 'rosa.huaman@gmail.com', password: 'Clave-segura-1' },
        },
      ]);
    });

    it.each([
      ['invalid_credentials', 'CREDENCIALES'],
      ['user_not_found', 'CREDENCIALES'],
      ['email_not_confirmed', 'CORREO_NO_CONFIRMADO'],
      ['user_banned', 'USUARIO_SUSPENDIDO'],
      ['validation_failed', 'CREDENCIALES'],
    ])('traduce %s a %s', async (codigo, motivo) => {
      respuestas = [errorDeGotrue(400, codigo)];

      expect(await proveedor().conClave('rosa.huaman@gmail.com', 'mala', IP)).toEqual({ exito: false, motivo });
    });

    it('un 429 del proveedor es su límite, con el Retry-After que manda', async () => {
      respuestas = [{ ...errorDeGotrue(429, 'over_request_rate_limit'), cabeceras: { 'retry-after': '42' } }];

      expect(await proveedor().conClave('rosa.huaman@gmail.com', 'x', IP)).toEqual({ exito: false, motivo: 'LIMITE_PROVEEDOR', reintentarEnSeg: 42 });
    });

    it('un 429 sin Retry-After espera 60 s', async () => {
      respuestas = [errorDeGotrue(429, 'over_request_rate_limit')];

      expect(await proveedor().conClave('rosa.huaman@gmail.com', 'x', IP)).toEqual({ exito: false, motivo: 'LIMITE_PROVEEDOR', reintentarEnSeg: 60 });
    });

    it.each<[string, RespuestaSimulada]>([
      ['un 5xx', { estado: 503, cuerpo: {} }],
      ['un cuerpo que no es JSON', { estado: 400, textoCrudo: '<html>' }],
      ['un 200 sin tokens', { estado: 200, cuerpo: { user: { id: USUARIO } } }],
      ['una respuesta que tarda más del máximo', { estado: 200, cuerpo: sesionDeGotrue('tarde'), demoraMs: TIEMPO_MAXIMO_PRUEBA_MS * 3 }],
    ])('%s es INGRESO_NO_DISPONIBLE', async (_caso, respuesta) => {
      respuestas = [respuesta];

      await expect(proveedor().conClave('rosa.huaman@gmail.com', 'x', IP)).rejects.toBeInstanceOf(ProveedorIngresoNoDisponibleError);
    });

    it('sin servidor es INGRESO_NO_DISPONIBLE', async () => {
      const sinServidor = new ProveedorIngresoGotrue('http://127.0.0.1:1', PUBLISHABLE_KEY, { tiempoMaximoMs: TIEMPO_MAXIMO_PRUEBA_MS });

      await expect(sinServidor.conClave('rosa.huaman@gmail.com', 'x', IP)).rejects.toBeInstanceOf(ProveedorIngresoNoDisponibleError);
    });
  });

  describe('verificarMfa', () => {
    it('pide el desafío y lo verifica con el token del usuario, y devuelve la sesión aal2', async () => {
      respuestas = [
        { estado: 200, cuerpo: { id: DESAFIO, type: 'totp', expires_at: 1_700_000_300 } },
        { estado: 200, cuerpo: sesionDeGotrue('token-aal2') },
      ];

      const resultado = await proveedor().verificarMfa(TOKEN_AAL1, FACTOR, '123456', IP);

      expect(resultado).toMatchObject({ exito: true, sesion: { accessToken: 'token-aal2' } });
      expect(peticiones.map(({ ruta, autorizacion, apikey, reenviadaPara, cuerpo }) => ({ ruta, autorizacion, apikey, reenviadaPara, cuerpo }))).toEqual([
        { ruta: `/auth/v1/factors/${FACTOR}/challenge`, autorizacion: `Bearer ${TOKEN_AAL1}`, apikey: PUBLISHABLE_KEY, reenviadaPara: IP, cuerpo: {} },
        {
          ruta: `/auth/v1/factors/${FACTOR}/verify`,
          autorizacion: `Bearer ${TOKEN_AAL1}`,
          apikey: PUBLISHABLE_KEY,
          reenviadaPara: IP,
          cuerpo: { challenge_id: DESAFIO, code: '123456' },
        },
      ]);
    });

    it.each([
      [400, 'mfa_verification_failed'],
      [422, 'mfa_challenge_expired'],
      [422, 'mfa_verification_rejected'],
      [400, 'otro_codigo'],
    ])('un %s %s en la verificación es CODIGO_MFA', async (estado, codigo) => {
      respuestas = [{ estado: 200, cuerpo: { id: DESAFIO } }, errorDeGotrue(estado, codigo)];

      expect(await proveedor().verificarMfa(TOKEN_AAL1, FACTOR, '000000', IP)).toEqual({ exito: false, motivo: 'CODIGO_MFA' });
    });

    it('un factor inexistente en el desafío es CODIGO_MFA y no verifica', async () => {
      respuestas = [errorDeGotrue(404, 'mfa_factor_not_found')];

      expect(await proveedor().verificarMfa(TOKEN_AAL1, FACTOR, '000000', IP)).toEqual({ exito: false, motivo: 'CODIGO_MFA' });
      expect(peticiones).toHaveLength(1);
    });

    it('un desafío sin id es INGRESO_NO_DISPONIBLE', async () => {
      respuestas = [{ estado: 200, cuerpo: {} }];

      await expect(proveedor().verificarMfa(TOKEN_AAL1, FACTOR, '000000', IP)).rejects.toBeInstanceOf(ProveedorIngresoNoDisponibleError);
    });
  });
});
