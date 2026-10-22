import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { IdentidadNoDisponibleError } from '../src/domain/errores.js';
import { SupabaseAdminProveedor } from '../src/infrastructure/supabase/supabase-admin.proveedor.js';

interface Peticion {
  metodo: string;
  ruta: string;
  redirectTo: string | null;
  autorizacion: string | undefined;
  cuerpo: Record<string, unknown>;
}

const USUARIO = '0193f3a0-0000-7000-8000-000000000902';
const REDIRECT = 'https://app.vitrina.pe/auth/invitacion?token=abc';

/** Auth de Supabase simulado en local: el adaptador habla HTTP real con supabase-js. */
describe('SupabaseAdminProveedor (HTTP contra un Auth simulado)', () => {
  let servidor: Server;
  let url: string;
  const peticiones: Peticion[] = [];
  let respuesta: { estado: number; cuerpo: unknown } = { estado: 200, cuerpo: {} };

  const leer = (req: IncomingMessage) =>
    new Promise<string>((ok) => {
      let datos = '';
      req.on('data', (c) => (datos += c));
      req.on('end', () => ok(datos));
    });

  beforeAll(async () => {
    servidor = createServer(async (req, res) => {
      const u = new URL(req.url ?? '/', 'http://local');
      const cuerpo = await leer(req);
      peticiones.push({
        metodo: req.method ?? '',
        ruta: u.pathname,
        redirectTo: u.searchParams.get('redirect_to'),
        autorizacion: req.headers.authorization,
        cuerpo: cuerpo ? JSON.parse(cuerpo) : {},
      });
      res.writeHead(respuesta.estado, { 'content-type': 'application/json' });
      res.end(JSON.stringify(respuesta.cuerpo));
    });
    await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok));
    url = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>((ok) => servidor.close(() => ok())));

  beforeEach(() => {
    peticiones.length = 0;
  });

  const proveedor = () => new SupabaseAdminProveedor({ url, secretKey: 'sb_secret_prueba' });

  it('invitar llama a /auth/v1/invite con el nombre como metadata, el redirect y la secret key', async () => {
    respuesta = { estado: 200, cuerpo: { id: USUARIO, aud: 'authenticated', email: 'rosa.huaman@gmail.com', app_metadata: {}, user_metadata: {} } };

    await expect(proveedor().invitar('rosa.huaman@gmail.com', 'Rosa Huamán', REDIRECT)).resolves.toEqual({ usuarioId: USUARIO });
    expect(peticiones).toEqual([
      {
        metodo: 'POST',
        ruta: '/auth/v1/invite',
        redirectTo: REDIRECT,
        autorizacion: 'Bearer sb_secret_prueba',
        cuerpo: expect.objectContaining({ email: 'rosa.huaman@gmail.com', data: { nombre: 'Rosa Huamán' } }),
      },
    ]);
  });

  it('enviarEnlace pide un OTP por correo sin crear usuario', async () => {
    respuesta = { estado: 200, cuerpo: {} };

    await proveedor().enviarEnlace('carlos.rojas@outlook.com', REDIRECT);
    expect(peticiones).toEqual([
      expect.objectContaining({
        metodo: 'POST',
        ruta: '/auth/v1/otp',
        redirectTo: REDIRECT,
        cuerpo: expect.objectContaining({ email: 'carlos.rojas@outlook.com', create_user: false }),
      }),
    ]);
  });

  it('un error de Supabase da IdentidadNoDisponibleError con su código y sin el correo', async () => {
    respuesta = { estado: 422, cuerpo: { code: 422, error_code: 'email_exists', msg: 'A user with this email address has already been registered' } };

    const error = await proveedor()
      .invitar('rosa.huaman@gmail.com', 'Rosa', REDIRECT)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(IdentidadNoDisponibleError);
    expect((error as Error).message).toContain('email_exists');
    expect((error as Error).message).not.toContain('rosa');

    respuesta = { estado: 429, cuerpo: { code: 429, error_code: 'over_email_send_rate_limit', msg: 'email rate limit exceeded' } };
    await expect(proveedor().enviarEnlace('carlos.rojas@outlook.com', REDIRECT)).rejects.toThrow(IdentidadNoDisponibleError);
  });

  it('sin respuesta del servidor también da IdentidadNoDisponibleError', async () => {
    const caido = new SupabaseAdminProveedor({ url: 'http://127.0.0.1:1', secretKey: 'sb_secret_prueba' });
    await expect(caido.invitar('rosa.huaman@gmail.com', 'Rosa', REDIRECT)).rejects.toThrow(IdentidadNoDisponibleError);
    await expect(caido.enviarEnlace('rosa.huaman@gmail.com', REDIRECT)).rejects.toThrow(IdentidadNoDisponibleError);
  });
});
