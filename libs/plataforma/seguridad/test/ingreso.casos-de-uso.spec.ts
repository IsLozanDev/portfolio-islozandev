import { IngresarConClave, type DependenciasIngreso } from '../src/application/ingresar-con-clave.js';
import type { ResultadoIngreso } from '../src/application/ports/proveedor-ingreso.port.js';
import { VerificarMfa } from '../src/application/verificar-mfa.js';
import { CodigoMfaInvalidoError, CredencialesInvalidasError, IngresoBloqueadoError, ProveedorIngresoNoDisponibleError } from '../src/domain/errores.js';
import { BitacoraIngresoEnMemoria, ContadorIntentosEnMemoria, ProveedorIngresoDoble } from './support/ingreso-en-memoria.js';

const AHORA = Date.parse('2026-11-04T15:00:00Z');
const TENANT = '0193f3a0-0000-7000-8000-000000000001';
const ROSA = '0193f3a0-0000-7000-8000-000000000901';
const CORREO = 'rosa.huaman@gmail.com';
const IP = '190.42.10.8';
const FACTOR = '0193f3a0-0000-7000-8000-00000000fa01';
const AGENTE = 'Mozilla/5.0 '.repeat(30);

const exito: ResultadoIngreso = {
  exito: true,
  usuarioId: ROSA,
  sesion: { accessToken: 'token-1', refreshToken: 'refresh-1', expiraEn: 3600, tipoToken: 'bearer' },
};
const fallo = (motivo: 'CREDENCIALES' | 'CORREO_NO_CONFIRMADO' | 'USUARIO_SUSPENDIDO' | 'CODIGO_MFA'): ResultadoIngreso => ({ exito: false, motivo });

function escenario() {
  const proveedor = new ProveedorIngresoDoble();
  const contador = new ContadorIntentosEnMemoria(() => AHORA);
  const bitacora = new BitacoraIngresoEnMemoria();
  const avisos: Array<{ mensaje: string; datos: Record<string, unknown> }> = [];
  const dependencias: DependenciasIngreso = { proveedor, contador, bitacora, avisar: (mensaje, datos) => avisos.push({ mensaje, datos }) };
  bitacora.usuarios.set(CORREO, { usuarioId: ROSA, tenantId: TENANT });
  return { proveedor, contador, bitacora, avisos, ingresar: new IngresarConClave(dependencias), verificar: new VerificarMfa(dependencias) };
}

const ingreso = (correo = CORREO, ip = IP) => ({ correo, clave: 'Clave-mala-1', ip, agente: AGENTE });

describe('IngresarConClave (spec 18b)', () => {
  it('con la clave correcta devuelve la sesión, limpia el contador y no escribe fila', async () => {
    const { proveedor, contador, bitacora, ingresar } = escenario();
    proveedor.responde(fallo('CREDENCIALES'), exito);
    await expect(ingresar.ejecutar(ingreso())).rejects.toThrow(CredencialesInvalidasError);

    expect(await ingresar.ejecutar(ingreso())).toEqual(exito.exito && exito.sesion);

    expect(contador.fallosDe({ alcance: 'CORREO_IP', correo: CORREO, ip: IP })).toBe(0);
    expect(contador.fallosDe({ alcance: 'IP', ip: IP })).toBe(1);
    expect(bitacora.eventos).toHaveLength(1);
  });

  it('una clave incorrecta escribe LOGIN_FALLIDO en el tenant del usuario, con el agente recortado', async () => {
    const { bitacora, ingresar } = escenario();

    await expect(ingresar.ejecutar(ingreso())).rejects.toThrow(CredencialesInvalidasError);

    expect(bitacora.eventos).toEqual([
      {
        tipo: 'LOGIN_FALLIDO',
        tenantId: TENANT,
        usuarioId: ROSA,
        detalle: { etapa: 'CLAVE', motivo: 'CREDENCIALES', agente: AGENTE.slice(0, 200) },
        ip: IP,
      },
    ]);
  });

  it('un correo inexistente queda sin tenant y con el correo enmascarado', async () => {
    const { bitacora, ingresar } = escenario();

    await expect(ingresar.ejecutar(ingreso('nadie.existe@gmail.com'))).rejects.toThrow(CredencialesInvalidasError);

    expect(bitacora.eventos[0]).toMatchObject({ tenantId: null, usuarioId: null, detalle: { motivo: 'CREDENCIALES', correo: 'na****@gmail.com' } });
  });

  it.each(['CORREO_NO_CONFIRMADO', 'USUARIO_SUSPENDIDO'] as const)('%s responde CREDENCIALES_INVALIDAS, registra su motivo y no cuenta', async (motivo) => {
    const { proveedor, contador, bitacora, ingresar } = escenario();
    proveedor.responde(fallo(motivo));

    await expect(ingresar.ejecutar(ingreso())).rejects.toThrow(CredencialesInvalidasError);

    expect(bitacora.eventos[0]?.detalle).toMatchObject({ motivo });
    expect(contador.fallosDe({ alcance: 'CORREO_IP', correo: CORREO, ip: IP })).toBe(0);
  });

  it('el quinto fallo de correo+IP bloquea con una fila BLOQUEO_INGRESO, y el sexto ni llama al proveedor', async () => {
    const { proveedor, bitacora, ingresar } = escenario();
    for (let intento = 1; intento < 5; intento += 1) await expect(ingresar.ejecutar(ingreso())).rejects.toThrow(CredencialesInvalidasError);

    const bloqueo = await ingresar.ejecutar(ingreso()).catch((error: unknown) => error);

    expect(bloqueo).toBeInstanceOf(IngresoBloqueadoError);
    expect((bloqueo as IngresoBloqueadoError).reintentarEnSeg).toBe(900);
    expect(bitacora.eventos.at(-1)).toMatchObject({
      tenantId: TENANT,
      detalle: { etapa: 'CLAVE', motivo: 'BLOQUEO_INGRESO', alcance: 'CORREO_IP', hasta: '2026-11-04T15:15:00.000Z' },
    });

    proveedor.responde(exito);
    await expect(ingresar.ejecutar(ingreso())).rejects.toThrow(IngresoBloqueadoError);
    expect(proveedor.llamadas).toHaveLength(5);
    expect(bitacora.eventos).toHaveLength(6);
  });

  it('20 fallos desde una IP con correos distintos bloquean la IP', async () => {
    const { bitacora, ingresar } = escenario();
    for (let intento = 1; intento < 20; intento += 1) {
      await expect(ingresar.ejecutar(ingreso(`persona${intento}@gmail.com`))).rejects.toThrow(CredencialesInvalidasError);
    }

    await expect(ingresar.ejecutar(ingreso('persona20@gmail.com'))).rejects.toThrow(IngresoBloqueadoError);

    expect(bitacora.eventos.at(-1)?.detalle).toMatchObject({ motivo: 'BLOQUEO_INGRESO', alcance: 'IP' });
  });

  it('un 429 del proveedor es INGRESO_BLOQUEADO con su espera, sin fila', async () => {
    const { proveedor, bitacora, ingresar } = escenario();
    proveedor.responde({ exito: false, motivo: 'LIMITE_PROVEEDOR', reintentarEnSeg: 42 });

    await expect(ingresar.ejecutar(ingreso())).rejects.toMatchObject({ code: 'INGRESO_BLOQUEADO', reintentarEnSeg: 42 });
    expect(bitacora.eventos).toEqual([]);
  });

  it('si el proveedor no responde, no cuenta ni escribe', async () => {
    const { proveedor, contador, bitacora, ingresar } = escenario();
    proveedor.falla(new ProveedorIngresoNoDisponibleError());

    await expect(ingresar.ejecutar(ingreso())).rejects.toThrow(ProveedorIngresoNoDisponibleError);
    expect(contador.fallosDe({ alcance: 'IP', ip: IP })).toBe(0);
    expect(bitacora.eventos).toEqual([]);
  });

  it('si la bitácora falla, responde igual y avisa sin el correo', async () => {
    const { bitacora, avisos, ingresar } = escenario();
    bitacora.fallaAlEscribir = true;

    await expect(ingresar.ejecutar(ingreso())).rejects.toThrow(CredencialesInvalidasError);

    expect(avisos).toEqual([{ mensaje: 'seg.ingreso.bitacora_error', datos: { tipo: 'LOGIN_FALLIDO', error: 'Error' } }]);
    expect(JSON.stringify(avisos)).not.toContain('rosa');
  });
});

describe('VerificarMfa (spec 18b)', () => {
  const verificacion = { usuarioId: ROSA, tenantId: TENANT, accessToken: 'token-aal1', factorId: FACTOR, codigo: '000000', ip: IP, agente: 'Firefox' };

  it('un código correcto devuelve la sesión aal2 y limpia el contador', async () => {
    const { proveedor, contador, verificar } = escenario();
    proveedor.responde(fallo('CODIGO_MFA'), exito);
    await expect(verificar.ejecutar(verificacion)).rejects.toThrow(CodigoMfaInvalidoError);

    await verificar.ejecutar(verificacion);

    expect(contador.fallosDe({ alcance: 'MFA', usuarioId: ROSA })).toBe(0);
  });

  it('cuatro códigos incorrectos dan 400 con fila de etapa MFA; el quinto bloquea con BLOQUEO_MFA', async () => {
    const { proveedor, bitacora, verificar } = escenario();
    proveedor.responde(...Array.from({ length: 5 }, () => fallo('CODIGO_MFA')));
    for (let intento = 1; intento < 5; intento += 1) await expect(verificar.ejecutar(verificacion)).rejects.toThrow(CodigoMfaInvalidoError);

    await expect(verificar.ejecutar(verificacion)).rejects.toThrow(IngresoBloqueadoError);

    expect(bitacora.eventos[0]).toEqual({
      tipo: 'LOGIN_FALLIDO',
      tenantId: TENANT,
      usuarioId: ROSA,
      detalle: { etapa: 'MFA', motivo: 'CODIGO_MFA', factor: 'totp', agente: 'Firefox' },
      ip: IP,
    });
    expect(bitacora.eventos.at(-1)?.detalle).toMatchObject({ motivo: 'BLOQUEO_MFA', hasta: '2026-11-04T15:15:00.000Z' });
    expect(bitacora.eventos).toHaveLength(6);
    await expect(verificar.ejecutar(verificacion)).rejects.toThrow(IngresoBloqueadoError);
    expect(proveedor.llamadas).toHaveLength(5);
  });

  it('un 429 del proveedor es INGRESO_BLOQUEADO con su espera', async () => {
    const { proveedor, verificar } = escenario();
    proveedor.responde({ exito: false, motivo: 'LIMITE_PROVEEDOR', reintentarEnSeg: 30 });

    await expect(verificar.ejecutar(verificacion)).rejects.toMatchObject({ code: 'INGRESO_BLOQUEADO', reintentarEnSeg: 30 });
  });
});
