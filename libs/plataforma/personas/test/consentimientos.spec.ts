import { Consentimiento } from '../src/domain/consentimiento.js';
import { ConsentimientosDePersona, type DecisionDelLote, type RegistroDelLote } from '../src/domain/consentimientos-de-persona.js';
import {
  AccionExpresaRequeridaError,
  DatosConsentimientoInvalidosError,
  FinalidadRepetidaError,
  SinConsentimientoVigenteError,
  TextoFinalidadInvalidoError,
  TextoNoPublicadoError,
  VersionTextoNoVigenteError,
} from '../src/domain/errores.js';
import { EVENTOS_PER, eventoConsentimientoRevocado } from '../src/domain/eventos-per.js';
import { TextoFinalidad } from '../src/domain/texto-finalidad.js';

const PERSONA = '37000000-0000-4000-8000-0000000000a1';
const OPERADOR = '37000000-0000-4000-8000-0000000000e1';
const ANTES = new Date('2026-03-10T15:00:00Z');
const AHORA = new Date('2026-11-20T15:00:00Z');
const TEXTO_LEGAL = 'Acepto recibir promociones por WhatsApp y correo.';

const texto = (finalidad: string, version: string) =>
  TextoFinalidad.publicar({ id: `texto-${finalidad}-${version}`, finalidad, version, texto: TEXTO_LEGAL, publicadoPor: OPERADOR, publicadoEn: ANTES });

const TEXTOS_VIGENTES = [texto('PRESTACION', 'v1'), texto('PROMOCIONES', '2026-03')];

function registro(): RegistroDelLote {
  let siguiente = 0;
  return {
    canal: 'PRESENCIAL',
    evidenciaArchivoId: null,
    registradoPor: OPERADOR,
    registradoEn: AHORA,
    nuevoId: () => `consentimiento-${(siguiente += 1)}`,
  };
}

const acepta = (finalidad: string, versionTexto: string): DecisionDelLote => ({ finalidad, decision: 'ACEPTA', versionTexto, accionExpresa: true });
const rechaza = (finalidad: string, versionTexto: string): DecisionDelLote => ({ finalidad, decision: 'RECHAZA', versionTexto, accionExpresa: true });

function aceptadoAntes(finalidad: 'PRESTACION' | 'PROMOCIONES', versionTexto: string): Consentimiento {
  return Consentimiento.reconstituir({
    id: `previo-${finalidad}`,
    personaId: PERSONA,
    finalidad,
    decision: 'ACEPTA',
    versionTexto,
    canal: 'WEB',
    evidenciaArchivoId: null,
    registradoPor: OPERADOR,
    registradoEn: ANTES,
    revocacion: null,
  });
}

describe('ConsentimientosDePersona.registrar (TR-RF-043)', () => {
  it('TR-CA-109: PRESTACION ACEPTA y PROMOCIONES RECHAZA crea dos decisiones con versión, canal, usuario y fecha', () => {
    const consentimientos = new ConsentimientosDePersona(PERSONA, []);

    const { nuevas, revocadas, reemplazadas } = consentimientos.registrar(
      [acepta('PRESTACION', 'v1'), rechaza('PROMOCIONES', '2026-03')],
      TEXTOS_VIGENTES,
      registro(),
    );

    expect(nuevas.map((nueva) => [nueva.personaId, nueva.finalidad, nueva.decision, nueva.versionTexto, nueva.canal, nueva.registradoPor, nueva.registradoEn])).toEqual([
      [PERSONA, 'PRESTACION', 'ACEPTA', 'v1', 'PRESENCIAL', OPERADOR, AHORA],
      [PERSONA, 'PROMOCIONES', 'RECHAZA', '2026-03', 'PRESENCIAL', OPERADOR, AHORA],
    ]);
    expect(nuevas.map((nueva) => nueva.consiente)).toEqual([true, false]);
    expect([revocadas, reemplazadas]).toEqual([[], []]);
  });

  it('TR-CA-111: una decisión sin acción expresa rechaza el lote completo', () => {
    const lote = [acepta('PRESTACION', 'v1'), { ...rechaza('PROMOCIONES', '2026-03'), accionExpresa: false }];
    const sinCasilla = [acepta('PRESTACION', 'v1'), { finalidad: 'PROMOCIONES', decision: 'ACEPTA', versionTexto: '2026-03' }];
    const consentimientos = new ConsentimientosDePersona(PERSONA, []);

    expect(() => consentimientos.registrar(lote, TEXTOS_VIGENTES, registro())).toThrow(AccionExpresaRequeridaError);
    expect(() => consentimientos.registrar(sinCasilla, TEXTOS_VIGENTES, registro())).toThrow(AccionExpresaRequeridaError);
  });

  it('TR-CA-111: una decisión sin decisión o fuera de lista → DATOS_INVALIDOS', () => {
    const consentimientos = new ConsentimientosDePersona(PERSONA, []);
    const sinDecision = { finalidad: 'PRESTACION', versionTexto: 'v1', accionExpresa: true };

    expect(() => consentimientos.registrar([sinDecision], TEXTOS_VIGENTES, registro())).toThrow(
      expect.objectContaining({ code: 'DATOS_INVALIDOS' }),
    );
    expect(() => consentimientos.registrar([{ ...sinDecision, decision: 'TALVEZ' }], TEXTOS_VIGENTES, registro())).toThrow(
      DatosConsentimientoInvalidosError,
    );
  });

  it('rechaza un lote vacío, un canal y una finalidad fuera de lista', () => {
    const consentimientos = new ConsentimientosDePersona(PERSONA, []);

    expect(() => consentimientos.registrar([], TEXTOS_VIGENTES, registro())).toThrow(DatosConsentimientoInvalidosError);
    expect(() => consentimientos.registrar([acepta('PRESTACION', 'v1')], TEXTOS_VIGENTES, { ...registro(), canal: 'CORREO' })).toThrow(
      DatosConsentimientoInvalidosError,
    );
    expect(() => consentimientos.registrar([acepta('MARKETING', 'v1')], TEXTOS_VIGENTES, registro())).toThrow(
      DatosConsentimientoInvalidosError,
    );
  });

  it('versión distinta de la vigente → VERSION_TEXTO_NO_VIGENTE con la vigente; sin texto → TEXTO_NO_PUBLICADO', () => {
    const consentimientos = new ConsentimientosDePersona(PERSONA, []);
    const conVersionVieja = () => consentimientos.registrar([acepta('PRESTACION', 'v1'), acepta('PROMOCIONES', '2025-01')], TEXTOS_VIGENTES, registro());

    expect(conVersionVieja).toThrow(VersionTextoNoVigenteError);
    expect(conVersionVieja).toThrow(expect.objectContaining({ finalidad: 'PROMOCIONES', versionVigente: '2026-03' }));
    expect(() => consentimientos.registrar([acepta('DATOS_SALUD', 'v1')], TEXTOS_VIGENTES, registro())).toThrow(TextoNoPublicadoError);
  });

  it('finalidad repetida en el lote → FINALIDAD_REPETIDA', () => {
    const consentimientos = new ConsentimientosDePersona(PERSONA, []);

    expect(() => consentimientos.registrar([acepta('PRESTACION', 'v1'), rechaza('PRESTACION', 'v1')], TEXTOS_VIGENTES, registro())).toThrow(
      FinalidadRepetidaError,
    );
  });

  it('un RECHAZA sobre un ACEPTA vigente revoca ese ACEPTA con el mismo canal, usuario y fecha', () => {
    const consentimientos = new ConsentimientosDePersona(PERSONA, [aceptadoAntes('PROMOCIONES', '2026-03')]);

    const { nuevas, revocadas, reemplazadas } = consentimientos.registrar([rechaza('PROMOCIONES', '2026-03')], TEXTOS_VIGENTES, registro());

    expect(nuevas.map((nueva) => nueva.decision)).toEqual(['RECHAZA']);
    expect(revocadas.map((revocada) => [revocada.id, revocada.revocacion])).toEqual([
      ['previo-PROMOCIONES', { revocadoEn: AHORA, revocadoPor: OPERADOR, canal: 'PRESENCIAL' }],
    ]);
    expect(reemplazadas).toEqual([]);
  });

  it('un ACEPTA nuevo sobre un ACEPTA vigente lo reemplaza sin contarlo como revocación', () => {
    const consentimientos = new ConsentimientosDePersona(PERSONA, [aceptadoAntes('PROMOCIONES', '2025-01')]);

    const { revocadas, reemplazadas } = consentimientos.registrar([acepta('PROMOCIONES', '2026-03')], TEXTOS_VIGENTES, registro());

    expect(revocadas).toEqual([]);
    expect(reemplazadas.map((reemplazada) => reemplazada.id)).toEqual(['previo-PROMOCIONES']);
  });
});

describe('ConsentimientosDePersona: vigencia y revocación', () => {
  it('el consentimiento vigente no depende de que su versión siga siendo la vigente del texto', () => {
    const consentimientos = new ConsentimientosDePersona(PERSONA, [aceptadoAntes('PROMOCIONES', '2025-01')]);

    expect(consentimientos.consentimientoVigente('PROMOCIONES')?.versionTexto).toBe('2025-01');
  });

  it('la decisión vigente es la más reciente: un RECHAZA posterior deja sin consentimiento', () => {
    const rechazo = Consentimiento.crear({ ...rechaza('PROMOCIONES', '2026-03'), id: 'nuevo', personaId: PERSONA, canal: 'WEB', evidenciaArchivoId: null, registradoPor: OPERADOR, registradoEn: AHORA });
    const consentimientos = new ConsentimientosDePersona(PERSONA, [rechazo, aceptadoAntes('PROMOCIONES', '2026-03')]);

    expect(consentimientos.decisionVigente('PROMOCIONES')?.id).toBe('nuevo');
    expect(consentimientos.consentimientoVigente('PROMOCIONES')).toBeNull();
    expect(consentimientos.decisionVigente('PRESTACION')).toBeNull();
  });

  it('TR-CA-110: revocar marca fecha, usuario y canal, y el evento no lleva datos personales', () => {
    const consentimientos = new ConsentimientosDePersona(PERSONA, [aceptadoAntes('PROMOCIONES', '2026-03')]);

    const revocado = consentimientos.revocar('PROMOCIONES', OPERADOR, 'WHATSAPP', AHORA);
    const evento = eventoConsentimientoRevocado(revocado, 3);

    expect(revocado.revocacion).toEqual({ revocadoEn: AHORA, revocadoPor: OPERADOR, canal: 'WHATSAPP' });
    expect(revocado.consiente).toBe(false);
    expect(evento).toMatchObject({ eventType: EVENTOS_PER.consentimientoRevocado, aggregateType: 'persona', aggregateId: PERSONA, aggregateVersion: 3 });
    expect(evento.payload).toEqual({
      persona_id: PERSONA,
      finalidad: 'PROMOCIONES',
      version_texto: '2026-03',
      canal: 'WHATSAPP',
      revocado_en: AHORA.toISOString(),
    });
  });

  it('revocar sin ACEPTA vigente, o dos veces → SIN_CONSENTIMIENTO_VIGENTE', () => {
    const consentimientos = new ConsentimientosDePersona(PERSONA, []);
    const revocado = aceptadoAntes('PROMOCIONES', '2026-03').revocar(OPERADOR, 'WEB', AHORA);

    expect(() => consentimientos.revocar('PROMOCIONES', OPERADOR, 'WEB', AHORA)).toThrow(SinConsentimientoVigenteError);
    expect(() => revocado.revocar(OPERADOR, 'WEB', AHORA)).toThrow(SinConsentimientoVigenteError);
    expect(() => eventoConsentimientoRevocado(aceptadoAntes('PROMOCIONES', 'v1'), 1)).toThrow();
  });
});

describe('TextoFinalidad.publicar', () => {
  it('publica un texto con versión y largo válidos', () => {
    expect(texto('PROMOCIONES', '2026-11').version).toBe('2026-11');
  });

  it.each([
    ['versión con espacio', { version: 'v 2' }],
    ['versión de 21 caracteres', { version: 'a'.repeat(21) }],
    ['texto de 19 caracteres', { texto: 'a'.repeat(19) }],
    ['texto de 10001 caracteres', { texto: 'a'.repeat(10_001) }],
  ])('rechaza %s con DATOS_INVALIDOS', (_caso, cambio) => {
    const publicar = () =>
      TextoFinalidad.publicar({ id: 'texto', finalidad: 'PRESTACION', version: 'v1', texto: TEXTO_LEGAL, publicadoPor: OPERADOR, publicadoEn: AHORA, ...cambio });

    expect(publicar).toThrow(TextoFinalidadInvalidoError);
    expect(publicar).toThrow(expect.objectContaining({ code: 'DATOS_INVALIDOS' }));
  });

  it('rechaza una finalidad fuera de lista', () => {
    expect(() => texto('MARKETING', 'v1')).toThrow(DatosConsentimientoInvalidosError);
  });
});
