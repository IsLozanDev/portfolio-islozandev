import type { EventoSeguridadDetalle } from '../models/evento-seguridad';
import { datosLegibles, resumenLegible, tituloDatosLegibles } from './datos-ingreso-bitacora';

const evento = (tipo: EventoSeguridadDetalle['tipo'], detalle: Record<string, unknown>): EventoSeguridadDetalle => ({
  id: '1',
  tipo,
  ocurridoEn: new Date('2026-11-04T15:00:00Z'),
  usuario: null,
  resumen: null,
  ip: '190.42.10.8',
  destinatario: null,
  asignado: null,
  detalle,
});

const comoTabla = (detalle: EventoSeguridadDetalle) => datosLegibles(detalle).map(({ clave, valor, tono }) => [clave, valor, tono]);

describe('resumenLegible (spec 18b)', () => {
  it.each([
    ['LOGIN', 'password', 'Contraseña'],
    ['LOGIN', 'oauth', 'Proveedor externo'],
    ['LOGIN_FALLIDO', 'CREDENCIALES', 'Contraseña incorrecta o correo inexistente'],
    ['LOGIN_FALLIDO', 'BLOQUEO_MFA', 'Bloqueo del código de verificación'],
    ['EXPORTACION', '3', '3 filas'],
    ['ACCESO_DENEGADO', 'plat.rol.gestionar', 'plat.rol.gestionar'],
    ['LOGIN', 'metodo_nuevo', 'metodo_nuevo'],
  ] as const)('%s con %s se lee «%s»', (tipo, resumen, esperado) => {
    expect(resumenLegible({ tipo, resumen })).toBe(esperado);
  });

  it('sin resumen queda null', () => {
    expect(resumenLegible({ tipo: 'LOGIN', resumen: null })).toBeNull();
  });
});

describe('datosLegibles (spec 18b)', () => {
  it('LOGIN: método, nivel y navegador', () => {
    expect(comoTabla(evento('LOGIN', { sesion_id: 's-1', metodo: 'totp', aal: 'aal2', agente: 'Firefox/140' }))).toEqual([
      ['metodo', 'Código de verificación', null],
      ['aal', 'Con segundo factor (aal2)', null],
      ['agente', 'Firefox/140', null],
    ]);
  });

  it('LOGIN_FALLIDO con bloqueo: el motivo como chip de advertencia, alcance, hasta y correo enmascarado', () => {
    const datos = comoTabla(
      evento('LOGIN_FALLIDO', {
        etapa: 'CLAVE',
        motivo: 'BLOQUEO_INGRESO',
        alcance: 'CORREO_IP',
        hasta: '2026-11-04T15:15:00.000Z',
        correo: 'na****@gmail.com',
        agente: 'Firefox/140',
      }),
    );

    expect(datos).toEqual([
      ['etapa', 'Contraseña', null],
      ['motivo', 'Bloqueo por intentos fallidos (correo e IP, o IP)', 'advertencia'],
      ['alcance', 'Correo e IP', null],
      ['hasta', expect.stringContaining('10:15'), null],
      ['correo', 'na****@gmail.com', null],
      ['agente', 'Firefox/140', null],
    ]);
  });

  it('LOGIN_FALLIDO sin bloqueo: el motivo sin chip; sin motivo, igual aparece la fila', () => {
    expect(comoTabla(evento('LOGIN_FALLIDO', { etapa: 'MFA', motivo: 'CODIGO_MFA' }))).toEqual([
      ['etapa', 'Código de verificación', null],
      ['motivo', 'Código de verificación incorrecto', null],
    ]);
    expect(comoTabla(evento('LOGIN_FALLIDO', {}))).toEqual([['motivo', '—', null]]);
  });

  it('EXPORTACION: rango, filtros con etiquetas y filas', () => {
    expect(
      comoTabla(evento('EXPORTACION', { recurso: 'bitacora', filtros: { desde: '2026-10-27', hasta: '2026-11-02', tipo: 'LOGIN_FALLIDO', usuario: 'ana' }, filas: 3 })),
    ).toEqual([
      ['rango', '27/10/2026 – 02/11/2026', null],
      ['filtros', 'Tipo: Ingreso fallido · Usuario: ana', null],
      ['filas', '3', null],
    ]);
    expect(comoTabla(evento('EXPORTACION', { filtros: { desde: '2026-10-27', hasta: '2026-11-02' }, filas: 0 }))[1]).toEqual(['filtros', 'Sin filtros', null]);
  });

  it('los demás tipos no tienen sección legible', () => {
    expect(datosLegibles(evento('ACCESO_DENEGADO', { permiso: 'plat.rol.gestionar' }))).toEqual([]);
    expect(tituloDatosLegibles('ACCESO_DENEGADO')).toBeNull();
    expect([tituloDatosLegibles('LOGIN'), tituloDatosLegibles('LOGIN_FALLIDO'), tituloDatosLegibles('EXPORTACION')]).toEqual(['Ingreso', 'Ingreso', 'Exportación']);
  });
});
