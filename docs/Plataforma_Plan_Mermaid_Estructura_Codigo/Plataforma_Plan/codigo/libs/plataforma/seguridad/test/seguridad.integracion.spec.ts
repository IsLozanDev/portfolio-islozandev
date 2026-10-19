// Prueba de integración: Nest + guards + verificador JWKS contra un JWKS local (simula Supabase Auth).
import 'reflect-metadata';
import http from 'node:http';
import assert from 'node:assert/strict';
import { Controller, Get, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SignJWT, exportJWK, generateKeyPair, UnsecuredJWT } from 'jose';
import request from 'supertest';
import { SeguridadModule, Publico, Permiso, UsuarioActual, CACHE_PERMISOS, type Principal, type CachePermisos } from '../src/index.js';
import { CachePermisosMemoria } from '../src/infrastructure/cache-permisos.memoria.js';

const T = '00000000-0000-0000-0000-0000000000a1';
const S1 = '00000000-0000-0000-0000-000000000051';
const S2 = '00000000-0000-0000-0000-000000000052';
const U = '11111111-1111-1111-1111-111111111111';
const permisos: Record<string, string[]> = { [S1]: ['plat.usuario.invitar', 'plat.rol.editar'] };

const { publicKey, privateKey } = await generateKeyPair('ES256');
const otra = await generateKeyPair('ES256');
const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'ES256', use: 'sig' };
const srv = http.createServer((_, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ keys: [jwk] })); });
await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
const port = (srv.address() as { port: number }).port;
const ISS = `http://127.0.0.1:${port}/auth/v1`;

const base = { role: 'authenticated', aal: 'aal1', session_id: 's1', email: 'ana@ejemplo.pe', tenant_id: T, tipo_usuario: 'INTERNO', is_anonymous: false };
async function token(claims: Record<string, unknown> = {}, o: { iss?: string; exp?: string | number; key?: CryptoKey; kid?: string } = {}) {
  return new SignJWT({ ...base, ...claims }).setProtectedHeader({ alg: 'ES256', kid: o.kid ?? 'k1' })
    .setSubject(U).setIssuer(o.iss ?? ISS).setAudience('authenticated').setIssuedAt().setExpirationTime(o.exp ?? '1h')
    .sign(o.key ?? privateKey);
}

@Controller()
class Ctrl {
  @Publico() @Get('salud') salud() { return { ok: true }; }
  @Get('yo') yo(@UsuarioActual() p: Principal) { return p; }
  @Permiso('plat.usuario.invitar') @Get('invitar') invitar() { return { ok: true }; }
  @Permiso('plat.rol.editar', { mfa: true }) @Get('rol') rol() { return { ok: true }; }
  @Permiso('plat.tenant.crear') @Get('tenant') tenant() { return { ok: true }; }
}
@Module({
  imports: [SeguridadModule.registrar({
    supabase: { emisor: ISS },
    repositorio: () => ({
      permisosEfectivos: async (_u, _t, s) => permisos[s] ?? [],
      sucursalesAccesibles: async () => [S1],
    }),
    cache: () => new CachePermisosMemoria(),
  })],
  controllers: [Ctrl],
})
class AppModule {}

const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
const app = mod.createNestApplication({ logger: false });
await app.init();
const h = app.getHttpServer();
const resultados: [string, boolean][] = [];
async function caso(nombre: string, fn: () => Promise<void>) {
  try { await fn(); resultados.push([nombre, true]); } catch (e) { resultados.push([nombre + ' -> ' + (e as Error).message, false]); }
}
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

await caso('01 endpoint @Publico sin token: 200', async () => { await request(h).get('/salud').expect(200); });
await caso('02 sin token: 401', async () => { await request(h).get('/yo').expect(401); });
await caso('03 token válido: 200 y principal con tenant, tipo y aal', async () => {
  const r = await request(h).get('/yo').set(bearer(await token())).expect(200);
  assert.equal(r.body.usuarioId, U); assert.equal(r.body.tenantId, T); assert.equal(r.body.tipo, 'INTERNO'); assert.equal(r.body.aal, 'aal1');
});
await caso('04 token expirado: 401', async () => { await request(h).get('/yo').set(bearer(await token({}, { exp: Math.floor(Date.now() / 1000) - 60 }))).expect(401); });
await caso('05 emisor distinto: 401', async () => { await request(h).get('/yo').set(bearer(await token({}, { iss: 'https://otro.supabase.co/auth/v1' }))).expect(401); });
await caso('06 firmado con otra llave (mismo kid): 401', async () => { await request(h).get('/yo').set(bearer(await token({}, { key: otra.privateKey }))).expect(401); });
await caso('07 kid desconocido: 401', async () => { await request(h).get('/yo').set(bearer(await token({}, { kid: 'kx', key: otra.privateKey }))).expect(401); });
await caso('08 HS256 con secreto compartido: 401', async () => {
  const t = await new SignJWT({ ...base }).setProtectedHeader({ alg: 'HS256', kid: 'k1' }).setSubject(U).setIssuer(ISS).setAudience('authenticated').setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode('secreto-legado-de-32-caracteres!!'));
  await request(h).get('/yo').set(bearer(t)).expect(401);
});
await caso('09 alg none: 401', async () => {
  const t = new UnsecuredJWT({ ...base }).setSubject(U).setIssuer(ISS).setAudience('authenticated').setIssuedAt().setExpirationTime('1h').encode();
  await request(h).get('/yo').set(bearer(t)).expect(401);
});
await caso('10 rol anon / usuario anónimo: 401', async () => {
  await request(h).get('/yo').set(bearer(await token({ role: 'anon' }))).expect(401);
  await request(h).get('/yo').set(bearer(await token({ is_anonymous: true }))).expect(401);
});
await caso('11 permiso con sucursal asignada: 200', async () => { await request(h).get('/invitar').set(bearer(await token())).set('X-Sucursal-Id', S1).expect(200); });
await caso('12 sin X-Sucursal-Id: 403 SIN_SUCURSAL', async () => {
  const r = await request(h).get('/invitar').set(bearer(await token())).expect(403); assert.equal(r.body.codigo, 'SIN_SUCURSAL');
});
await caso('13 sucursal no asignada: 403 SUCURSAL_NO_ASIGNADA', async () => {
  const r = await request(h).get('/invitar').set(bearer(await token())).set('X-Sucursal-Id', S2).expect(403); assert.equal(r.body.codigo, 'SUCURSAL_NO_ASIGNADA');
});
await caso('14 sin el permiso: 403 SIN_PERMISO', async () => {
  const r = await request(h).get('/tenant').set(bearer(await token())).set('X-Sucursal-Id', S1).expect(403); assert.equal(r.body.codigo, 'SIN_PERMISO');
});
await caso('15 permiso sensible con aal1: 403 MFA_REQUERIDA; con aal2: 200', async () => {
  const r = await request(h).get('/rol').set(bearer(await token())).set('X-Sucursal-Id', S1).expect(403); assert.equal(r.body.codigo, 'MFA_REQUERIDA');
  await request(h).get('/rol').set(bearer(await token({ aal: 'aal2' }))).set('X-Sucursal-Id', S1).expect(200);
});
await caso('16 token sin tenant: 403 SIN_TENANT', async () => {
  const r = await request(h).get('/invitar').set(bearer(await token({ tenant_id: null }))).set('X-Sucursal-Id', S1).expect(403); assert.equal(r.body.codigo, 'SIN_TENANT');
});
await caso('17 revocación: tras invalidar la caché del tenant, el permiso retirado se niega', async () => {
  await request(h).get('/invitar').set(bearer(await token())).set('X-Sucursal-Id', S1).expect(200);
  permisos[S1] = ['plat.rol.editar'];
  await request(h).get('/invitar').set(bearer(await token())).set('X-Sucursal-Id', S1).expect(200); // aún en caché
  await app.get<CachePermisos>(CACHE_PERMISOS).invalidarTenant(T);
  await request(h).get('/invitar').set(bearer(await token())).set('X-Sucursal-Id', S1).expect(403);
});
await caso('18 tipo_usuario manipulado a un valor no válido se trata como EXTERNO', async () => {
  const r = await request(h).get('/yo').set(bearer(await token({ tipo_usuario: 'ROOT' }))).expect(200); assert.equal(r.body.tipo, 'EXTERNO');
});

await app.close(); srv.close();
for (const [n, ok] of resultados) console.log(ok ? 'OK   ' : 'FALLA', n);
const fallas = resultados.filter((r) => !r[1]).length;
console.log(`${resultados.length - fallas}/${resultados.length} pruebas aprobadas`);
process.exit(fallas ? 1 : 0);
