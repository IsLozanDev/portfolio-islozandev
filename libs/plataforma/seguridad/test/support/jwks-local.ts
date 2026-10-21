import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWK, type JWTPayload } from 'jose';

export const EMISOR = 'https://proyecto-prueba.supabase.co/auth/v1';

export interface Llave {
  kid: string;
  privada: CryptoKey;
  publica: JWK;
}

export async function nuevaLlave(kid: string): Promise<Llave> {
  const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
  return { kid, privada: privateKey, publica: { ...(await exportJWK(publicKey)), kid, alg: 'ES256', use: 'sig' } };
}

/** Servidor JWKS en 127.0.0.1 con llaves intercambiables y contador de peticiones. */
export class JwksLocal {
  peticiones = 0;
  private llaves: JWK[] = [];
  private servidor?: Server;

  publicar(...llaves: Llave[]): void {
    this.llaves = llaves.map((l) => l.publica);
  }

  async iniciar(): Promise<string> {
    const servidor = createServer((_req, res) => {
      this.peticiones++;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ keys: this.llaves }));
    });
    this.servidor = servidor;
    await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok));
    const { port } = servidor.address() as AddressInfo;
    return `http://127.0.0.1:${port}/auth/v1/.well-known/jwks.json`;
  }

  async detener(): Promise<void> {
    const s = this.servidor;
    this.servidor = undefined;
    if (s) await new Promise<void>((ok) => s.close(() => ok()));
  }
}

export const ahoraSeg = () => Math.floor(Date.now() / 1000);

/** Claims de un access token de Supabase con el hook del spec 04. */
export function claimsBase(extra: JWTPayload = {}): JWTPayload {
  return {
    sub: '0193f3a0-0000-7000-8000-000000000001',
    role: 'authenticated',
    aal: 'aal1',
    session_id: 'b2c1e6d0-0000-4000-8000-000000000001',
    is_anonymous: false,
    amr: [{ method: 'password', timestamp: ahoraSeg() - 60 }],
    tenant_id: '0193f3a0-0000-7000-8000-0000000000aa',
    tipo_usuario: 'INTERNO',
    ...extra,
  };
}

export interface OpcionesFirma {
  emisor?: string;
  audiencia?: string;
  expSeg?: number;
}

export function firmar(llave: Llave, claims: JWTPayload = claimsBase(), op: OpcionesFirma = {}): Promise<string> {
  const ahora = ahoraSeg();
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'ES256', kid: llave.kid, typ: 'JWT' })
    .setIssuer(op.emisor ?? EMISOR)
    .setAudience(op.audiencia ?? 'authenticated')
    .setIssuedAt(ahora - 1)
    .setExpirationTime(op.expSeg ?? ahora + 900)
    .sign(llave.privada);
}
