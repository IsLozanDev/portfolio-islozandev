import { generateKeyPair, SignJWT, type JWTPayload } from 'jose';
import { AutenticacionNoDisponibleError, TokenInvalidoError } from '../src/domain/errores.js';
import { SupabaseJwksVerificador } from '../src/infrastructure/supabase/supabase-jwks.verificador.js';
import { ahoraSeg, claimsBase, EMISOR, firmar, JwksLocal, nuevaLlave, type Llave } from './support/jwks-local.js';

const jwks = new JwksLocal();
let url: string;
let llave: Llave;

const verificador = (op: { enfriamientoMs?: number } = {}) => new SupabaseJwksVerificador({ emisor: EMISOR, jwksUrl: url, ...op });

async function motivoDe(promesa: Promise<unknown>): Promise<string> {
  const e = await promesa.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(TokenInvalidoError);
  return (e as TokenInvalidoError).motivo;
}

const sinClaim = (nombre: string): JWTPayload => {
  const c = claimsBase();
  delete c[nombre];
  return c;
};

beforeAll(async () => {
  llave = await nuevaLlave('kid-1');
  url = await jwks.iniciar();
});

beforeEach(() => {
  jwks.publicar(llave);
  jwks.peticiones = 0;
});

afterAll(() => jwks.detener());

describe('SupabaseJwksVerificador', () => {
  it('un token válido produce el principal con amr', async () => {
    const t = ahoraSeg() - 120;
    const p = await verificador().verificar(
      await firmar(llave, claimsBase({ aal: 'aal2', amr: [{ method: 'password', timestamp: t - 10 }, { method: 'totp', timestamp: t }] })),
    );
    expect(p).toEqual({
      usuarioId: '0193f3a0-0000-7000-8000-000000000001',
      tenantId: '0193f3a0-0000-7000-8000-0000000000aa',
      tipo: 'INTERNO',
      aal: 'aal2',
      sesionId: 'b2c1e6d0-0000-4000-8000-000000000001',
      amr: [
        { method: 'password', timestamp: t - 10 },
        { method: 'totp', timestamp: t },
      ],
    });
  });

  it('rechaza un token expirado hace más de 5 s y tolera 3 s', async () => {
    expect(await motivoDe(verificador().verificar(await firmar(llave, claimsBase(), { expSeg: ahoraSeg() - 10 })))).toBe('expirado');
    await expect(verificador().verificar(await firmar(llave, claimsBase(), { expSeg: ahoraSeg() - 3 }))).resolves.toBeDefined();
  });

  it('rechaza iss y aud ajenos', async () => {
    const v = verificador();
    expect(await motivoDe(v.verificar(await firmar(llave, claimsBase(), { emisor: 'https://otro.supabase.co/auth/v1' })))).toBe('claim iss');
    expect(await motivoDe(v.verificar(await firmar(llave, claimsBase(), { audiencia: 'anon' })))).toBe('claim aud');
  });

  it('rechaza RS256, HS256 y alg none', async () => {
    const v = verificador();
    const rsa = await generateKeyPair('RS256');
    const rs256 = await new SignJWT(claimsBase()).setProtectedHeader({ alg: 'RS256', kid: 'kid-1' }).setIssuer(EMISOR).setAudience('authenticated').setIssuedAt().setExpirationTime('15m').sign(rsa.privateKey);
    const hs256 = await new SignJWT(claimsBase()).setProtectedHeader({ alg: 'HS256' }).setIssuer(EMISOR).setAudience('authenticated').setIssuedAt().setExpirationTime('15m').sign(new TextEncoder().encode('secreto-legacy-de-32-bytes-minimo!!'));
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const none = `${b64({ alg: 'none' })}.${b64({ ...claimsBase(), iss: EMISOR, aud: 'authenticated', iat: ahoraSeg(), exp: ahoraSeg() + 900 })}.`;
    expect(await motivoDe(v.verificar(rs256))).toBe('algoritmo');
    expect(await motivoDe(v.verificar(hs256))).toBe('algoritmo');
    expect(await motivoDe(v.verificar(none))).toBe('algoritmo');
  });

  it('rechaza una firma que no corresponde a la llave del kid', async () => {
    const intrusa = await nuevaLlave('kid-1');
    expect(await motivoDe(verificador().verificar(await firmar(intrusa)))).toBe('firma');
  });

  it('rechaza un kid desconocido', async () => {
    const otra = await nuevaLlave('kid-x');
    expect(await motivoDe(verificador().verificar(await firmar(otra)))).toBe('kid');
  });

  it('acepta una llave rotada después de arrancar sin reiniciar', async () => {
    const v = verificador({ enfriamientoMs: 0 });
    await v.verificar(await firmar(llave));
    const nueva = await nuevaLlave('kid-2');
    jwks.publicar(llave, nueva);
    await expect(v.verificar(await firmar(nueva))).resolves.toMatchObject({ usuarioId: '0193f3a0-0000-7000-8000-000000000001' });
    expect(jwks.peticiones).toBe(2);
  });

  it('rechaza role distinto de authenticated y anónimos', async () => {
    const v = verificador();
    expect(await motivoDe(v.verificar(await firmar(llave, claimsBase({ role: 'anon' }))))).toBe('rol');
    expect(await motivoDe(v.verificar(await firmar(llave, claimsBase({ is_anonymous: true }))))).toBe('rol');
  });

  it('rechaza tokens sin session_id o sin aal', async () => {
    const v = verificador();
    expect(await motivoDe(v.verificar(await firmar(llave, sinClaim('session_id'))))).toBe('claim session_id');
    expect(await motivoDe(v.verificar(await firmar(llave, sinClaim('aal'))))).toBe('claim aal');
  });

  it('rechaza un token mal formado', async () => {
    expect(await motivoDe(verificador().verificar('no.es.jwt'))).toBe('formato');
  });

  it('tipo_usuario inválido o ausente pasa a EXTERNO y tenant_id ausente a null', async () => {
    const v = verificador();
    expect((await v.verificar(await firmar(llave, claimsBase({ tipo_usuario: 'ROOT' })))).tipo).toBe('EXTERNO');
    const sinTenant = sinClaim('tenant_id');
    delete sinTenant['tipo_usuario'];
    expect(await v.verificar(await firmar(llave, sinTenant))).toMatchObject({ tipo: 'EXTERNO', tenantId: null });
  });

  it('descarta entradas de amr sin método o timestamp', async () => {
    const p = await verificador().verificar(await firmar(llave, claimsBase({ amr: ['password', { method: 'totp' }, { method: 'totp', timestamp: 123 }] })));
    expect(p.amr).toEqual([{ method: 'totp', timestamp: 123 }]);
  });

  it('no vuelve a pedir el JWKS mientras la llave está en caché', async () => {
    const v = verificador();
    for (let i = 0; i < 5; i++) await v.verificar(await firmar(llave));
    expect(jwks.peticiones).toBe(1);
  });

  it('con el JWKS apagado y sin caché lanza AutenticacionNoDisponibleError', async () => {
    const caido = new SupabaseJwksVerificador({ emisor: EMISOR, jwksUrl: 'http://127.0.0.1:1/auth/v1/.well-known/jwks.json' });
    await expect(caido.verificar(await firmar(llave))).rejects.toBeInstanceOf(AutenticacionNoDisponibleError);
  });
});
