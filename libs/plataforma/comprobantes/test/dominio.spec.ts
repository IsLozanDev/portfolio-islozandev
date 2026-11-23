import { debeAvisar, diasRestantes, limiteDeRevision } from '../src/domain/aviso-certificado.js';
import { CertificadoLeido } from '../src/domain/certificado-leido.js';
import { Emisor } from '../src/domain/emisor.js';
import {
  CertificadoNoVigenteError,
  CertificadoOtroRucError,
  CertificadoSinRucError,
  CertificadoVencidoError,
  DatosEmisorInvalidosError,
} from '../src/domain/errores.js';
import { emisorConfigurado, EVENTOS_FE, VERSION_ESQUEMA_FE } from '../src/domain/eventos-fe.js';
import { esRegimenIgv } from '../src/domain/regimen-igv.js';
import { extraerRuc } from '../src/domain/ruc-certificado.js';

const RUC = '20601234561';
const AHORA = new Date('2026-11-22T15:00:00.000Z');
const HUELLA = 'a'.repeat(64);
/** Medianoche de Lima del 5 de noviembre: el vencimiento de TR-CA-135. */
const VENCE_5_NOV = new Date('2026-11-05T05:00:00.000Z');

const leido = (cambios: Partial<{ ruc: string; venceEn: Date; emitidoEn: Date; huella: string }> = {}) =>
  new CertificadoLeido(
    cambios.ruc ?? RUC,
    cambios.venceEn ?? new Date('2027-11-22T15:00:00.000Z'),
    cambios.emitidoEn ?? new Date('2026-11-01T15:00:00.000Z'),
    cambios.huella ?? HUELLA,
    [],
  );

const nuevo = () => Emisor.crear({ id: 'emisor-1', tenantId: 'tenant-1', empresaId: 'empresa-1', creadoPor: 'usuario-1', ahora: AHORA });
const configuracion = { proveedor: 'SIMULADO', usuarioProveedor: 'MODDATOS', regimenIgv: 'GENERAL', leyendaPie: null };

describe('extraerRuc: serialNumber, OU, CN y O, en ese orden', () => {
  it('RUC en serialNumber', () => {
    expect(extraerRuc([{ nombre: 'commonName', nombreCorto: 'CN', valor: 'JUAN' }, { nombre: 'serialNumber', valor: RUC }])).toBe(RUC);
  });

  it('RUC en OU con texto `RUC:20601234561`', () => {
    expect(extraerRuc([{ nombre: 'organizationalUnitName', nombreCorto: 'OU', valor: `RUC:${RUC}` }])).toBe(RUC);
  });

  it('serialNumber gana a CN y O aunque estos vayan antes', () => {
    const atributos = [
      { nombreCorto: 'O', valor: 'RUC 20512345678' },
      { nombreCorto: 'CN', valor: '10456789012 JUAN' },
      { nombre: 'serialNumber', valor: `RUC${RUC}` },
    ];
    expect(extraerRuc(atributos)).toBe(RUC);
  });

  it('un DNI en serialNumber no es RUC: sigue con OU', () => {
    expect(extraerRuc([{ nombre: 'serialNumber', valor: 'DNI:12345678' }, { nombreCorto: 'OU', valor: `RUC:${RUC}` }])).toBe(RUC);
  });

  it('no toma 11 dígitos dentro de un número más largo ni un prefijo inválido', () => {
    expect(() => extraerRuc([{ nombre: 'serialNumber', valor: `9${RUC}` }])).toThrow(CertificadoSinRucError);
    expect(() => extraerRuc([{ nombreCorto: 'CN', valor: '30601234561' }])).toThrow(CertificadoSinRucError);
  });

  it('sin RUC → CertificadoSinRucError', () => {
    expect(() => extraerRuc([{ nombreCorto: 'CN', valor: 'JUAN PEREZ' }])).toThrow(CertificadoSinRucError);
    expect(() => extraerRuc([])).toThrow(CertificadoSinRucError);
  });
});

describe('CertificadoLeido.validarPara', () => {
  it('vigente y del RUC de la empresa', () => {
    expect(() => leido().validarPara(RUC, AHORA)).not.toThrow();
  });

  it('otro RUC → CertificadoOtroRucError con el mensaje de TR-CA-134', () => {
    expect(() => leido({ ruc: '20512345678' }).validarPara(RUC, AHORA)).toThrow('El certificado no corresponde al RUC de la empresa');
    expect(() => leido({ ruc: '20512345678' }).validarPara(RUC, AHORA)).toThrow(CertificadoOtroRucError);
  });

  it('vence justo ahora o antes → vencido', () => {
    expect(() => leido({ venceEn: AHORA }).validarPara(RUC, AHORA)).toThrow(CertificadoVencidoError);
  });

  it('emitido después de ahora → aún no vigente', () => {
    expect(() => leido({ emitidoEn: new Date(AHORA.getTime() + 1) }).validarPara(RUC, AHORA)).toThrow(CertificadoNoVigenteError);
  });
});

describe('debeAvisar y diasRestantes, en días de Lima (TR-CA-135)', () => {
  it.each([
    ['vence hoy', '2026-11-05', 0, true],
    ['vence mañana', '2026-11-04', 1, true],
    ['vence en 30 días', '2026-10-06', 30, true],
    ['vence en 31 días', '2026-10-05', 31, false],
    ['venció ayer', '2026-11-06', -1, true],
  ])('%s', (_caso, hoy, dias, avisa) => {
    expect(diasRestantes(VENCE_5_NOV, hoy)).toBe(dias);
    expect(debeAvisar(VENCE_5_NOV, hoy, 30)).toBe(avisa);
  });

  it('un vencimiento a las 23:30 de Lima cuenta en su día de Lima, no en el de UTC', () => {
    expect(diasRestantes(new Date('2026-11-06T04:30:00.000Z'), '2026-11-05')).toBe(0);
  });

  it('el límite de revisión es la medianoche de Lima del día hoy + 91', () => {
    expect(limiteDeRevision('2026-10-06').toISOString()).toBe('2027-01-05T05:00:00.000Z');
  });
});

describe('Emisor', () => {
  it('nace BORRADOR, en BETA, con régimen GENERAL y versión 1', () => {
    const datos = nuevo().datos;
    expect([datos.estado, datos.ambiente, datos.regimenIgv, datos.version, datos.certificado]).toEqual(['BORRADOR', 'BETA', 'GENERAL', 1, null]);
  });

  it('configurarProveedor recorta y valida usuario, régimen y leyenda', () => {
    const emisor = nuevo();
    emisor.configurarProveedor({ ...configuracion, usuarioProveedor: '  MODDATOS  ', leyendaPie: '   ' });
    expect([emisor.datos.usuarioProveedor, emisor.datos.leyendaPie]).toEqual(['MODDATOS', null]);

    expect(() => emisor.configurarProveedor({ ...configuracion, usuarioProveedor: '   ' })).toThrow(DatosEmisorInvalidosError);
    expect(() => emisor.configurarProveedor({ ...configuracion, usuarioProveedor: 'u'.repeat(101) })).toThrow(DatosEmisorInvalidosError);
    expect(() => emisor.configurarProveedor({ ...configuracion, regimenIgv: 'MYPE' })).toThrow(DatosEmisorInvalidosError);
    expect(() => emisor.configurarProveedor({ ...configuracion, leyendaPie: 'x'.repeat(301) })).toThrow(DatosEmisorInvalidosError);
    expect(() => emisor.configurarProveedor({ ...configuracion, proveedor: '' })).toThrow(DatosEmisorInvalidosError);
  });

  it('sin credencial sigue BORRADOR aunque el proveedor no pida certificado', () => {
    const emisor = nuevo();
    emisor.configurarProveedor(configuracion);
    expect(emisor.recalcularEstado(false, AHORA)).toBe(false);
    expect(emisor.datos.estado).toBe('BORRADOR');
  });

  it('con credencial y un proveedor sin certificado pasa a CONFIGURADO una sola vez', () => {
    const emisor = nuevo();
    emisor.configurarProveedor(configuracion);
    emisor.asignarCredencial('secreto-1');
    expect(emisor.recalcularEstado(false, AHORA)).toBe(true);
    expect(emisor.recalcularEstado(false, AHORA)).toBe(false);
    expect(emisor.datos.estado).toBe('CONFIGURADO');
  });

  it('si el proveedor pide certificado sigue BORRADOR hasta tener uno vigente', () => {
    const emisor = nuevo();
    emisor.configurarProveedor(configuracion);
    emisor.asignarCredencial('secreto-1');
    expect(emisor.recalcularEstado(true, AHORA)).toBe(false);

    emisor.asignarCertificado(leido({ venceEn: new Date(AHORA.getTime() + 1000) }), { certificadoId: 'secreto-2', claveId: 'secreto-3' });
    expect(emisor.recalcularEstado(true, AHORA)).toBe(true);
    expect(emisor.secretosCertificado).toEqual({ certificadoId: 'secreto-2', claveId: 'secreto-3' });
    expect(emisor.certificado).toEqual({ ruc: RUC, venceEn: new Date(AHORA.getTime() + 1000), huellaSha256: HUELLA });

    // Cuando vence, el recálculo lo devuelve a BORRADOR.
    expect(emisor.recalcularEstado(true, new Date(AHORA.getTime() + 1000))).toBe(false);
    expect(emisor.datos.estado).toBe('BORRADOR');
  });

  it('en VERIFICADO o PRODUCCION (spec 50) el recálculo no toca el estado', () => {
    const emisor = Emisor.reconstituir({ ...nuevo().datos, estado: 'VERIFICADO' });
    expect(emisor.recalcularEstado(true, AHORA)).toBe(false);
    expect(emisor.datos.estado).toBe('VERIFICADO');
  });

  it('registrarModificacion sube la versión una vez y anota quién y cuándo', () => {
    const emisor = nuevo();
    emisor.registrarModificacion('usuario-2', AHORA);
    expect([emisor.version, emisor.datos.modificadoPor, emisor.datos.modificadoEn]).toEqual([2, 'usuario-2', AHORA]);
  });

  it('el evento fe.emisor.configurado no lleva usuario, clave ni certificado', () => {
    const emisor = nuevo();
    emisor.configurarProveedor(configuracion);
    const evento = emisorConfigurado(emisor.version, emisor.cargaConfigurado(), AHORA);
    expect(evento).toMatchObject({ eventType: EVENTOS_FE.emisorConfigurado, aggregateId: 'emisor-1', schemaVersion: VERSION_ESQUEMA_FE });
    expect(evento.payload).toEqual({ emisor_id: 'emisor-1', empresa_id: 'empresa-1', proveedor: 'SIMULADO', ambiente: 'BETA' });
  });

  it('las copias no comparten el certificado', () => {
    const emisor = nuevo();
    emisor.asignarCertificado(leido(), { certificadoId: 's1', claveId: 's2' });
    const copia = Emisor.reconstituir(emisor.datos);
    emisor.asignarCertificado(leido({ huella: 'b'.repeat(64) }), { certificadoId: 's1', claveId: 's2' });
    expect(copia.certificado?.huellaSha256).toBe(HUELLA);
  });

  it('esRegimenIgv', () => {
    expect([esRegimenIgv('GENERAL'), esRegimenIgv('REDUCIDO_RESTAURANTES'), esRegimenIgv('MYPE')]).toEqual([true, true, false]);
  });
});
