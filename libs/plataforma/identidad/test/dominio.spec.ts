import { evaluarAptoFactura } from '../src/domain/apto-factura.js';
import { recortarCamposMinimos } from '../src/domain/campos-minimos.js';
import { esTipoConsultable, type DatosDni, type DatosRuc } from '../src/domain/datos-identidad.js';
import { crearEntradaCache, estaVigente } from '../src/domain/entrada-cache.js';
import { DocumentoInvalidoError, ProveedorNoDisponibleError } from '../src/domain/errores.js';
import { esMotivoConsulta } from '../src/domain/motivo-consulta.js';

const RUC_ACTIVO_HABIDO: DatosRuc = {
  razonSocial: 'Comercial Andina SAC',
  estado: 'ACTIVO',
  condicion: 'HABIDO',
  direccionFiscal: 'Av. Larco 123, Miraflores',
  ubigeo: '150122',
};

describe('evaluarAptoFactura', () => {
  it('TR-CA-118: ACTIVO y HABIDO es apto', () => {
    expect(evaluarAptoFactura(RUC_ACTIVO_HABIDO)).toEqual({ apto: true });
  });

  it('TR-CA-119: BAJA DE OFICIO no es apto y el motivo nombra el estado', () => {
    expect(evaluarAptoFactura({ ...RUC_ACTIVO_HABIDO, estado: 'BAJA DE OFICIO' })).toEqual({
      apto: false,
      motivo: 'Estado BAJA DE OFICIO',
    });
  });

  it('NO HABIDO no es apto y el motivo nombra la condición', () => {
    expect(evaluarAptoFactura({ ...RUC_ACTIVO_HABIDO, condicion: 'NO HABIDO' })).toEqual({
      apto: false,
      motivo: 'Condición NO HABIDO',
    });
  });

  it('con estado y condición malos gana el estado', () => {
    expect(evaluarAptoFactura({ ...RUC_ACTIVO_HABIDO, estado: 'SUSPENSION TEMPORAL', condicion: 'NO HALLADO' })).toEqual({
      apto: false,
      motivo: 'Estado SUSPENSION TEMPORAL',
    });
  });
});

describe('recortarCamposMinimos (TR-RN-032)', () => {
  it('TR-CA-117: de un DNI solo quedan nombres y apellidos', () => {
    const datosConDeMas = { nombres: 'Juana', apellidos: 'Quispe Mamani', direccion: 'Jr. Lima 1', fechaNacimiento: '1990-01-01' };
    expect(recortarCamposMinimos({ tipo: 'DNI', datos: datosConDeMas as DatosDni })).toEqual({
      tipo: 'DNI',
      datos: { nombres: 'Juana', apellidos: 'Quispe Mamani' },
    });
  });

  it('de un RUC solo quedan los cinco campos', () => {
    const datosConDeMas = { ...RUC_ACTIVO_HABIDO, representanteLegal: 'Pedro Pérez', telefono: '999' };
    expect(recortarCamposMinimos({ tipo: 'RUC', datos: datosConDeMas as DatosRuc })).toEqual({
      tipo: 'RUC',
      datos: RUC_ACTIVO_HABIDO,
    });
  });
});

describe('entrada de caché', () => {
  const consultadoEn = new Date('2026-11-01T10:00:00Z');
  const entrada = crearEntradaCache({
    documento: { tipo: 'DNI', datos: { nombres: 'Juana', apellidos: 'Quispe Mamani', direccion: 'x' } as DatosDni },
    numero: '45781236',
    fuente: 'DECOLECTA',
    consultadoEn,
    ttlDias: 30,
  });

  it('expira a los ttl días y guarda solo los campos mínimos', () => {
    expect(entrada.expiraEn).toEqual(new Date('2026-12-01T10:00:00Z'));
    expect(entrada.datos).toEqual({ nombres: 'Juana', apellidos: 'Quispe Mamani' });
  });

  it('TR-CA-115: a los 10 días sigue vigente', () => {
    expect(estaVigente(entrada, new Date('2026-11-11T10:00:00Z'))).toBe(true);
  });

  it('al llegar a expira_en ya no está vigente', () => {
    expect(estaVigente(entrada, new Date('2026-12-01T10:00:00Z'))).toBe(false);
    expect(estaVigente(entrada, new Date('2026-12-15T10:00:00Z'))).toBe(false);
  });
});

describe('tipos y motivos', () => {
  it('solo DNI y RUC son consultables', () => {
    expect(esTipoConsultable('DNI')).toBe(true);
    expect(esTipoConsultable('RUC')).toBe(true);
    expect(esTipoConsultable('CE')).toBe(false);
    expect(esTipoConsultable('PAS')).toBe(false);
  });

  it('acepta solo los motivos del CHECK', () => {
    expect(esMotivoConsulta('REGISTRO_CLIENTE')).toBe(true);
    expect(esMotivoConsulta('MARKETING')).toBe(false);
  });
});

describe('errores', () => {
  it('DocumentoInvalidoError lleva el motivo y el código', () => {
    const error = new DocumentoInvalidoError('PREFIJO');
    expect(error.code).toBe('DOCUMENTO_INVALIDO');
    expect(error.motivo).toBe('PREFIJO');
  });

  it('ProveedorNoDisponibleError tiene su código', () => {
    expect(new ProveedorNoDisponibleError().code).toBe('PROVEEDOR_NO_DISPONIBLE');
  });
});
