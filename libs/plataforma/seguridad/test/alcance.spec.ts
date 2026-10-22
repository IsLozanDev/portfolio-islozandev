import { ValidationError } from '@vitrina/plataforma/kernel';
import { ALCANCES, RANGO_ALCANCE, alcanceAlMenos, cubre, type Alcance, type Ambito } from '../src/domain/alcance.js';
import { CodigoPermiso } from '../src/domain/codigo-permiso.js';

// Una cadena completa: empresa E > sucursal S > unidad U, y otra rama E2 > S2 > U2.
const E = 'e', S = 's', U = 'u';
const E2 = 'e2', S2 = 's2', U2 = 'u2';
const EN_CADENA: Record<Alcance, Ambito> = {
  TENANT: { alcance: 'TENANT', empresaId: null, sucursalId: null, unidadId: null },
  EMPRESA: { alcance: 'EMPRESA', empresaId: E, sucursalId: null, unidadId: null },
  SUCURSAL: { alcance: 'SUCURSAL', empresaId: E, sucursalId: S, unidadId: null },
  UNIDAD: { alcance: 'UNIDAD', empresaId: E, sucursalId: S, unidadId: U },
};

describe('cubre (TR-RF-013: otorgante con alcance igual o mayor)', () => {
  const combinaciones = ALCANCES.flatMap((o) => ALCANCES.map((d) => [o, d, RANGO_ALCANCE[o] >= RANGO_ALCANCE[d]] as const));

  it.each(combinaciones)('otorgante %s sobre destino %s de su misma rama: %s', (o, d, esperado) => {
    expect(cubre(EN_CADENA[o], EN_CADENA[d])).toBe(esperado);
  });

  it('EMPRESA no cubre una sucursal de otra empresa', () => {
    expect(cubre(EN_CADENA.EMPRESA, { alcance: 'SUCURSAL', empresaId: E2, sucursalId: S2, unidadId: null })).toBe(false);
  });

  it('SUCURSAL no cubre una unidad de otra sucursal', () => {
    expect(cubre(EN_CADENA.SUCURSAL, { alcance: 'UNIDAD', empresaId: E, sucursalId: S2, unidadId: U2 })).toBe(false);
  });

  it('UNIDAD no cubre otra unidad', () => {
    expect(cubre(EN_CADENA.UNIDAD, { alcance: 'UNIDAD', empresaId: E, sucursalId: S, unidadId: U2 })).toBe(false);
  });

  it('un ámbito sin el id que su alcance exige no cubre nada', () => {
    expect(cubre({ alcance: 'EMPRESA', empresaId: null, sucursalId: null, unidadId: null }, EN_CADENA.UNIDAD)).toBe(false);
  });
});

describe('alcanceAlMenos', () => {
  it('compara por rango', () => {
    expect(alcanceAlMenos('SUCURSAL', 'UNIDAD')).toBe(true);
    expect(alcanceAlMenos('SUCURSAL', 'SUCURSAL')).toBe(true);
    expect(alcanceAlMenos('UNIDAD', 'SUCURSAL')).toBe(false);
  });
});

describe('CodigoPermiso (TR-RN-007)', () => {
  it.each(['rest.caja.cerrar', 'plat.asignacion.otorgar', 'gym.acceso_rapido.registrar', 'lib.v2.ver'])('acepta %s', (codigo) => {
    expect(CodigoPermiso.de(codigo).valor).toBe(codigo);
  });

  it.each(['rest-caja-cerrar', 'rest.caja', 'REST.caja.cerrar', 'rest.caja.cerrar.ya', 'r.caja.cerrar', 'rest.1caja.cerrar', ''])(
    'rechaza %p',
    (codigo) => {
      expect(CodigoPermiso.esValido(codigo)).toBe(false);
      expect(() => CodigoPermiso.de(codigo)).toThrow(ValidationError);
    },
  );

  it('TR-CA-024: el mensaje nombra el permiso mal formado', () => {
    expect(() => CodigoPermiso.de('rest-caja-cerrar')).toThrow('Código de permiso inválido: rest-caja-cerrar');
  });

  it('deriva el producto del prefijo y exige que coincida', () => {
    expect(CodigoPermiso.de('rest.propina.configurar', 'REST').productoCodigo).toBe('REST');
    expect(() => CodigoPermiso.de('gym.acceso.registrar', 'REST')).toThrow('no pertenece al producto REST');
  });
});
