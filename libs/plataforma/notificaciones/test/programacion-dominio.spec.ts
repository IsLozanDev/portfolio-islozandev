import { FechaEnvioFueraDeHorizonteError, FechaEnvioNoFuturaError, ReferenciaInvalidaError } from '../src/domain/errores.js';
import { HORIZONTE_MAXIMO_DIAS, Programacion, type DatosProgramables, type ProgramacionNueva } from '../src/domain/programacion.js';
import { validarReferencia } from '../src/domain/referencia-programacion.js';
import { AHORA, TENANT_A } from './support/dobles.js';

const UN_DIA_MS = 86_400_000;
const EN_UNA_HORA = new Date(AHORA.getTime() + 3_600_000);
const MENSAJE = '45000000-0000-7000-8000-0000000000e1';

function nueva(cambios: Partial<ProgramacionNueva> = {}): ProgramacionNueva {
  return {
    id: '45000000-0000-7000-8000-0000000000a1',
    tenantId: TENANT_A,
    referencia: { tipo: 'psi.cita', id: 'cita-1' },
    plantillaCodigo: 'PRUEBA_CORREO',
    creadoPor: null,
    destinatario: { correo: 'ana@ejemplo.pe' },
    variables: { nombre: 'Ana', producto: 'SazónPOS' },
    finalidad: 'TRANSACCIONAL',
    enviarEn: EN_UNA_HORA,
    ...cambios,
  };
}

function programables(enviarEn: Date): DatosProgramables {
  return { destinatario: { correo: 'beto@ejemplo.pe' }, variables: { nombre: 'Beto', producto: 'X' }, finalidad: 'TRANSACCIONAL', enviarEn };
}

describe('Programacion (TR-RF-076)', () => {
  it('nace PROGRAMADA en la versión 1, sin mensaje ni motivo', () => {
    const programacion = Programacion.programar(nueva(), AHORA);

    expect(programacion.instantanea()).toMatchObject({ estado: 'PROGRAMADA', version: 1, mensajeId: null, motivo: null, modificadoEn: null });
    expect(programacion.estaViva).toBe(true);
    expect(programacion.enviarEn).toEqual(EN_UNA_HORA);
  });

  it('TR-CA-192: enviarEn igual o anterior a ahora → FechaEnvioNoFuturaError «La fecha de envío debe ser futura»', () => {
    expect(() => Programacion.programar(nueva({ enviarEn: AHORA }), AHORA)).toThrow(new FechaEnvioNoFuturaError());
    expect(() => Programacion.programar(nueva({ enviarEn: new Date(AHORA.getTime() - 1) }), AHORA)).toThrow('La fecha de envío debe ser futura');
  });

  it('más allá de 366 días → FechaEnvioFueraDeHorizonteError; justo en el horizonte se acepta', () => {
    const enElHorizonte = new Date(AHORA.getTime() + HORIZONTE_MAXIMO_DIAS * UN_DIA_MS);

    expect(Programacion.programar(nueva({ enviarEn: enElHorizonte }), AHORA).enviarEn).toEqual(enElHorizonte);
    expect(() => Programacion.programar(nueva({ enviarEn: new Date(enElHorizonte.getTime() + 1) }), AHORA)).toThrow(FechaEnvioFueraDeHorizonteError);
  });

  it('reprogramar cambia fecha, destinatario y variables y suma la versión', () => {
    const programacion = Programacion.programar(nueva(), AHORA);
    const nuevaHora = new Date(AHORA.getTime() + 2 * 3_600_000);

    expect(programacion.reprogramar(programables(nuevaHora), AHORA)).toBe(true);

    expect(programacion.instantanea()).toMatchObject({
      estado: 'PROGRAMADA',
      version: 2,
      enviarEn: nuevaHora,
      destinatario: { correo: 'beto@ejemplo.pe' },
      variables: { nombre: 'Beto', producto: 'X' },
      modificadoEn: AHORA,
    });
  });

  it('reprogramar a una fecha pasada lanza y no cambia nada', () => {
    const programacion = Programacion.programar(nueva(), AHORA);

    expect(() => programacion.reprogramar(programables(AHORA), AHORA)).toThrow(FechaEnvioNoFuturaError);
    expect(programacion.instantanea()).toMatchObject({ version: 1, enviarEn: EN_UNA_HORA });
  });

  it('cancelar, marcarEnviada y descartar terminan la programación y suben la versión', () => {
    const cancelada = Programacion.programar(nueva(), AHORA);
    const enviada = Programacion.programar(nueva(), AHORA);
    const descartada = Programacion.programar(nueva(), AHORA);

    expect(cancelada.cancelar(AHORA)).toBe(true);
    expect(enviada.marcarEnviada(MENSAJE, AHORA)).toBe(true);
    expect(descartada.descartar('DESCARTADO', MENSAJE, AHORA)).toBe(true);

    expect(cancelada.instantanea()).toMatchObject({ estado: 'CANCELADA', version: 2 });
    expect(enviada.instantanea()).toMatchObject({ estado: 'ENVIADA', mensajeId: MENSAJE, version: 2 });
    expect(descartada.instantanea()).toMatchObject({ estado: 'DESCARTADA', motivo: 'DESCARTADO', mensajeId: MENSAJE, version: 2 });
    expect([cancelada, enviada, descartada].some((programacion) => programacion.estaViva)).toBe(false);
  });

  it('las transiciones solo salen de PROGRAMADA: desde un estado final no cambian nada', () => {
    const programacion = Programacion.programar(nueva(), AHORA);
    programacion.cancelar(AHORA);
    const antes = programacion.instantanea();

    expect(programacion.cancelar(AHORA)).toBe(false);
    expect(programacion.marcarEnviada(MENSAJE, AHORA)).toBe(false);
    expect(programacion.descartar('DESCARTADO', null, AHORA)).toBe(false);
    expect(programacion.reprogramar(programables(EN_UNA_HORA), AHORA)).toBe(false);
    expect(programacion.instantanea()).toEqual(antes);
  });

  it('el motivo se recorta al largo de la columna', () => {
    const programacion = Programacion.programar(nueva(), AHORA);

    programacion.descartar('X'.repeat(60), null, AHORA);

    expect(programacion.instantanea().motivo).toHaveLength(40);
  });
});

describe('ReferenciaProgramacion', () => {
  it('acepta un tipo en minúsculas con punto y un id de 1 a 100 caracteres', () => {
    expect(validarReferencia({ tipo: 'psi.cita', id: 'c' })).toEqual({ tipo: 'psi.cita', id: 'c' });
    expect(validarReferencia({ tipo: 'pag.vencimiento_cuota', id: 'x'.repeat(100) }).id).toHaveLength(100);
  });

  it.each([
    { tipo: 'Cita', id: '1' },
    { tipo: 'c', id: '1' },
    { tipo: '1cita', id: '1' },
    { tipo: 'cita', id: '' },
    { tipo: 'cita', id: 'x'.repeat(101) },
  ])('rechaza %j con ReferenciaInvalidaError', (referencia) => {
    expect(() => validarReferencia(referencia)).toThrow(ReferenciaInvalidaError);
  });
});
