import { estaHabilitado } from '../src/domain/canal.js';
import { normalizarCorreo } from '../src/domain/correo-destino.js';
import { AsuntoDemasiadoLargoError, DestinoInvalidoError, VariableNoPermitidaError, VariablesIncompletasError } from '../src/domain/errores.js';
import { avanzar, esFinal } from '../src/domain/estado-mensaje.js';
import { LARGO_MAXIMO_MOTIVO_FALLO, Mensaje, type MensajeNuevo } from '../src/domain/mensaje.js';
import { renderizar } from '../src/domain/renderizador-plantilla.js';
import { programarPromocional } from '../src/domain/ventana-promocional.js';
import { AHORA, PLANTILLA_PRUEBA, TENANT_A } from './support/dobles.js';

const LIMA = 'America/Lima';
const VARIABLES = { nombre: 'Ana', producto: 'SazónPOS' };

function nuevo(cambios: Partial<MensajeNuevo> = {}): Mensaje {
  return Mensaje.registrar({
    id: '42000000-0000-7000-8000-0000000000a1',
    tenantId: TENANT_A,
    plantillaId: PLANTILLA_PRUEBA.id,
    canal: 'CORREO',
    destino: 'ana@ejemplo.pe',
    destinoHash: 'sha256:ana',
    personaId: null,
    finalidad: 'TRANSACCIONAL',
    asunto: 'Prueba',
    cuerpo: '<p>Hola</p>',
    claveIdempotencia: '42000000-0000-7000-8000-0000000000c1',
    estado: 'ENCOLADO',
    motivoFallo: null,
    programadoPara: null,
    creadoPor: null,
    ...cambios,
  });
}

describe('estados del mensaje', () => {
  it('solo avanzan: ENCOLADO < ENVIADO < ENTREGADO < LEIDO', () => {
    expect(avanzar('ENCOLADO', 'ENVIADO')).toBe('ENVIADO');
    expect(avanzar('ENVIADO', 'LEIDO')).toBe('LEIDO');
    expect(avanzar('ENTREGADO', 'ENVIADO')).toBeNull();
    expect(avanzar('ENTREGADO', 'ENTREGADO')).toBeNull();
  });

  it('FALLIDO desde cualquier estado no final; desde un final nada cambia', () => {
    expect(avanzar('ENTREGADO', 'FALLIDO')).toBe('FALLIDO');
    expect(avanzar('FALLIDO', 'ENTREGADO')).toBeNull();
    expect(avanzar('DESCARTADO', 'ENVIADO')).toBeNull();
    expect(avanzar('ENCOLADO', 'OMITIDO_SIN_CONSENTIMIENTO')).toBeNull();
    expect(esFinal('OMITIDO_SIN_CONSENTIMIENTO')).toBe(true);
    expect(esFinal('LEIDO')).toBe(false);
  });

  it('el mensaje guarda el id externo y las fechas al avanzar, y no retrocede', () => {
    const mensaje = nuevo();
    const enviado = new Date('2026-11-20T15:00:01Z');
    const entregado = new Date('2026-11-20T15:00:05Z');

    expect(mensaje.marcarEnviado('re_1', enviado)).toBe(true);
    expect(mensaje.marcarEntregado(entregado)).toBe(true);
    expect(mensaje.marcarEnviado('re_2', entregado)).toBe(false);
    expect(mensaje.marcarLeido(entregado)).toBe(true);

    const datos = mensaje.instantanea();
    expect(datos).toMatchObject({ estado: 'LEIDO', idExterno: 're_1', enviadoEn: enviado, entregadoEn: entregado, modificadoEn: entregado });
    expect(mensaje.version).toBe(1);
  });

  it('marcarFallido recorta el motivo al largo de la columna', () => {
    const mensaje = nuevo();
    expect(mensaje.marcarFallido('x'.repeat(400), AHORA)).toBe(true);
    expect(mensaje.instantanea().motivoFallo).toHaveLength(LARGO_MAXIMO_MOTIVO_FALLO);
    expect(mensaje.marcarFallido('otra vez', AHORA)).toBe(false);
  });
});

describe('renderizador de plantillas', () => {
  it('inserta las variables con espacios opcionales en las llaves', () => {
    const contenido = renderizar({ ...PLANTILLA_PRUEBA, cuerpo: '<p>{{ nombre }} y {{nombre}} en {{producto}}</p>' }, VARIABLES);

    expect(contenido).toEqual({ asunto: 'Prueba de correo de SazónPOS', cuerpo: '<p>Ana y Ana en SazónPOS</p>' });
  });

  it('TR-CA-185: una variable no declarada se rechaza por su nombre', () => {
    expect(() => renderizar(PLANTILLA_PRUEBA, { ...VARIABLES, diagnostico: 'gripe' })).toThrow(new VariableNoPermitidaError(['diagnostico']));
    expect(() => renderizar(PLANTILLA_PRUEBA, { ...VARIABLES, diagnostico: 'gripe' })).toThrow('Variable no permitida: diagnostico');
  });

  it('una variable usada y no recibida se lista sin valores', () => {
    const error = captura(() => renderizar(PLANTILLA_PRUEBA, { nombre: 'Ana' }));

    expect(error).toBeInstanceOf(VariablesIncompletasError);
    expect((error as VariablesIncompletasError).nombres).toEqual(['producto']);
    expect((error as Error).message).not.toContain('Ana');
  });

  it('escapa el HTML de los valores en el cuerpo y deja el asunto en una línea', () => {
    const contenido = renderizar(PLANTILLA_PRUEBA, { nombre: `<script>alert("x")</script> & 'y'`, producto: 'Línea 1\r\nLínea 2' });

    expect(contenido.cuerpo).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;');
    expect(contenido.cuerpo).not.toContain('<script>');
    expect(contenido.asunto).toBe('Prueba de correo de Línea 1 Línea 2');
  });

  it('acepta números y rechaza un asunto que pasa de 150 caracteres', () => {
    expect(renderizar(PLANTILLA_PRUEBA, { nombre: 'Ana', producto: 42 }).asunto).toBe('Prueba de correo de 42');
    expect(() => renderizar(PLANTILLA_PRUEBA, { nombre: 'Ana', producto: 'x'.repeat(140) })).toThrow(AsuntoDemasiadoLargoError);
  });
});

describe('ventana de promocionales (TR-RN-025, Lima UTC-5)', () => {
  it('TR-CA-189: a las 21:30 se programa a las 08:00 del día siguiente', () => {
    expect(programarPromocional(new Date('2026-11-21T02:30:00Z'), LIMA)).toEqual(new Date('2026-11-21T13:00:00Z'));
  });

  it('a las 06:00 se programa a las 08:00 del mismo día', () => {
    expect(programarPromocional(new Date('2026-11-20T11:00:00Z'), LIMA)).toEqual(new Date('2026-11-20T13:00:00Z'));
  });

  it('a las 19:59 y a las 08:00 sale sin programar; a las 20:00 ya no', () => {
    expect(programarPromocional(new Date('2026-11-21T00:59:59Z'), LIMA)).toBeNull();
    expect(programarPromocional(new Date('2026-11-20T13:00:00Z'), LIMA)).toBeNull();
    expect(programarPromocional(new Date('2026-11-21T01:00:00Z'), LIMA)).toEqual(new Date('2026-11-21T13:00:00Z'));
  });

  it('cruza el fin de mes', () => {
    expect(programarPromocional(new Date('2026-12-01T04:00:00Z'), LIMA)).toEqual(new Date('2026-12-01T13:00:00Z'));
  });
});

describe('correo destino', () => {
  it('normaliza espacios y mayúsculas', () => {
    expect(normalizarCorreo('  Ana.Perez@Ejemplo.PE ')).toBe('ana.perez@ejemplo.pe');
  });

  it('rechaza formatos inválidos y más de 254 caracteres sin mostrar el valor', () => {
    expect(() => normalizarCorreo('ana@')).toThrow(DestinoInvalidoError);
    expect(() => normalizarCorreo(`${'a'.repeat(250)}@ejemplo.pe`)).toThrow(DestinoInvalidoError);
    expect(captura(() => normalizarCorreo('ana@'))?.message).not.toContain('ana@');
  });

  it('solo CORREO está habilitado', () => {
    expect(estaHabilitado('CORREO')).toBe(true);
    expect(estaHabilitado('SMS')).toBe(false);
  });
});

function captura(accion: () => unknown): Error | undefined {
  try {
    accion();
    return undefined;
  } catch (error) {
    return error as Error;
  }
}
