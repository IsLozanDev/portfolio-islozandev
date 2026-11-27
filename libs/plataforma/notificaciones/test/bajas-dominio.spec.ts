import { Baja, bloqueaEnvio, esAlcanceBaja, type AlcanceBaja } from '../src/domain/baja.js';
import {
  agregarPiePreferencias,
  enlaceVigente,
  enmascararCorreo,
  llevaPiePreferencias,
  urlPreferencias,
  vencimientoEnlace,
  VIGENCIA_ENLACE_DIAS,
} from '../src/domain/enlace-preferencias.js';
import { EnlaceInvalidoError } from '../src/domain/errores.js';
import { AHORA, TENANT_A } from './support/dobles.js';

const UN_DIA_MS = 86_400_000;
const PERSONA = '46000000-0000-7000-8000-0000000000f1';

function baja(alcance: AlcanceBaja, personaId: string | null = null): Baja {
  return Baja.registrar({
    id: `46000000-0000-7000-8000-0000000000${alcance === 'CANAL' ? 'c1' : 'b1'}`,
    tenantId: TENANT_A,
    canal: 'CORREO',
    alcance,
    destinoHash: 'sha256:ana',
    personaId,
  });
}

describe('Baja (TR-RF-077)', () => {
  it('se registra con su alcance y la persona opcional', () => {
    const registrada = baja('PROMOCIONAL', PERSONA);

    expect(registrada.instantanea()).toEqual({
      id: '46000000-0000-7000-8000-0000000000b1',
      tenantId: TENANT_A,
      canal: 'CORREO',
      alcance: 'PROMOCIONAL',
      destinoHash: 'sha256:ana',
      personaId: PERSONA,
    });
    expect(registrada.alcance).toBe('PROMOCIONAL');
    expect(registrada.personaId).toBe(PERSONA);
    expect(registrada.id).toBe('46000000-0000-7000-8000-0000000000b1');
  });

  it('reconoce solo los alcances PROMOCIONAL y CANAL', () => {
    expect(esAlcanceBaja('PROMOCIONAL')).toBe(true);
    expect(esAlcanceBaja('CANAL')).toBe(true);
    expect(esAlcanceBaja('TODO')).toBe(false);
  });
});

describe('bloqueaEnvio (TR-RN-025)', () => {
  it('sin bajas no bloquea', () => {
    expect(bloqueaEnvio([], 'PROMOCIONAL')).toBeNull();
    expect(bloqueaEnvio([], 'TRANSACCIONAL')).toBeNull();
  });

  it('la baja CANAL bloquea las dos finalidades con BAJA_CANAL', () => {
    expect(bloqueaEnvio([baja('CANAL')], 'TRANSACCIONAL')).toBe('BAJA_CANAL');
    expect(bloqueaEnvio([baja('CANAL')], 'PROMOCIONAL')).toBe('BAJA_CANAL');
  });

  it('TR-CA-193: la baja PROMOCIONAL bloquea las promocionales y deja salir las transaccionales', () => {
    expect(bloqueaEnvio([baja('PROMOCIONAL')], 'PROMOCIONAL')).toBe('BAJA_PROMOCIONAL');
    expect(bloqueaEnvio([baja('PROMOCIONAL')], 'TRANSACCIONAL')).toBeNull();
  });

  it('con las dos bajas manda la del canal', () => {
    expect(bloqueaEnvio([baja('PROMOCIONAL'), baja('CANAL')], 'PROMOCIONAL')).toBe('BAJA_CANAL');
  });
});

describe('Enlace de preferencias', () => {
  it(`vence a los ${VIGENCIA_ENLACE_DIAS} días`, () => {
    const venceEn = vencimientoEnlace(AHORA);
    const carga = { tenantId: TENANT_A, canal: 'CORREO' as const, destinoHash: 'sha256:ana', venceEn };

    expect(venceEn.getTime() - AHORA.getTime()).toBe(30 * UN_DIA_MS);
    expect(enlaceVigente(carga, new Date(venceEn.getTime() - 1))).toBe(true);
    expect(enlaceVigente(carga, venceEn)).toBe(false);
  });

  it.each([
    ['juana@gmail.com', 'j***@gmail.com'],
    ['a@ejemplo.pe', 'a***@ejemplo.pe'],
    ['ab@x.io', 'a***@x.io'],
  ])('enmascara %s como %s', (correo, esperado) => {
    expect(enmascararCorreo(correo)).toBe(esperado);
  });

  it('un valor sin usuario antes de la arroba queda solo como máscara', () => {
    expect(enmascararCorreo('@ejemplo.pe')).toBe('***');
    expect(enmascararCorreo('sin-arroba')).toBe('***');
  });

  it('TR-CA-194: el error del enlace no lleva datos', () => {
    const error = new EnlaceInvalidoError();

    expect(error.code).toBe('ENLACE_INVALIDO');
    expect(error.message).toBe('Enlace inválido o vencido');
  });

  it('la URL lleva el token en el fragmento, sin barras dobles', () => {
    expect(urlPreferencias('https://admin.vitrina.pe/', 'abc.def')).toBe('https://admin.vitrina.pe/preferencias#t=abc.def');
    expect(urlPreferencias('https://admin.vitrina.pe', 'abc.def')).toBe('https://admin.vitrina.pe/preferencias#t=abc.def');
  });

  it('el pie va al final y escapa la URL', () => {
    expect(agregarPiePreferencias('<p>Hola</p>', 'https://x.pe/preferencias#t="a"')).toBe(
      '<p>Hola</p><hr><p>¿No quieres recibir estos correos? <a href="https://x.pe/preferencias#t=&quot;a&quot;">Gestiona tus preferencias</a>.</p>',
    );
  });

  it('solo los avisos de plataforma van sin pie', () => {
    expect(llevaPiePreferencias('PRUEBA_CORREO')).toBe(true);
    for (const codigo of ['SUSCRIPCION_POR_VENCER', 'TENANT_SUSPENDIDO', 'SOPORTE_SOLICITADO', 'INTEGRIDAD_ROTA']) {
      expect(llevaPiePreferencias(codigo)).toBe(false);
    }
  });
});
