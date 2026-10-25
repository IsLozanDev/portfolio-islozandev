import type { TenantScope } from '@vitrina/plataforma/kernel';
import { ObtenerSiguiente } from '../src/application/obtener-siguiente.js';
import type { SolicitudNumero } from '../src/application/ports/correlativo.port.js';
import type { FilaNumerada, NumeracionSql } from '../src/application/ports/repositorios.js';
import { SerieInactivaError, SerieNoEncontradaError } from '../src/domain/errores.js';

const TENANT = '0193f3a0-0000-7000-8000-000000000001';
const EMPRESA = '0193f3a0-0000-7000-8000-000000000011';
const AHORA = new Date('2026-10-10T13:01:00Z');
const B002: SolicitudNumero = { empresaId: EMPRESA, tipo: 'BOLETA', serie: 'B002' };

interface Llamada {
  tenantId: string;
  solicitud: SolicitudNumero;
  instante: Date;
}

function numeracion(fila: FilaNumerada | null, estado: 'INACTIVA' | null = null): NumeracionSql & { llamadas: Llamada[] } {
  const llamadas: Llamada[] = [];
  return {
    llamadas,
    siguiente: async (tenantId, solicitud, instante) => {
      llamadas.push({ tenantId, solicitud, instante });
      return fila;
    },
    estado: async () => estado,
  };
}

const contexto = { current: (): TenantScope => ({ tenantId: TENANT }), run: <T>(_alcance: TenantScope, trabajo: () => T) => trabajo() };
const reloj = { now: () => AHORA };

describe('ObtenerSiguiente (TR-RF-036, TR-RF-037)', () => {
  it('TR-CA-093: devuelve el número y su formato con los dígitos de la serie', async () => {
    const sql = numeracion({ serie: 'B002', numero: 125n, digitos: 8 });
    expect(await new ObtenerSiguiente(contexto, reloj, sql).siguiente(B002)).toEqual({ serie: 'B002', numero: 125n, numeroFormateado: 'B002-00000125' });
  });

  it('pasa el tenant del contexto y el instante del reloj a la base', async () => {
    const sql = numeracion({ serie: 'A', numero: 1n, digitos: 3 });
    await new ObtenerSiguiente(contexto, reloj, sql).siguiente({ empresaId: EMPRESA, tipo: 'TICKET', serie: 'A' });
    expect(sql.llamadas).toEqual([{ tenantId: TENANT, solicitud: { empresaId: EMPRESA, tipo: 'TICKET', serie: 'A' }, instante: AHORA }]);
  });

  it('una serie inactiva lanza SERIE_INACTIVA', async () => {
    await expect(new ObtenerSiguiente(contexto, reloj, numeracion(null, 'INACTIVA')).siguiente(B002)).rejects.toThrow(SerieInactivaError);
  });

  it('una serie inexistente lanza SERIE_NO_ENCONTRADA', async () => {
    await expect(new ObtenerSiguiente(contexto, reloj, numeracion(null)).siguiente(B002)).rejects.toThrow(SerieNoEncontradaError);
  });

  it('escribe un registro de depuración sin datos personales', async () => {
    const registros: unknown[] = [];
    const sql = numeracion({ serie: 'B002', numero: 125n, digitos: 8 });
    await new ObtenerSiguiente(contexto, reloj, sql, (mensaje, datos) => registros.push({ mensaje, datos })).siguiente(B002);
    expect(registros).toEqual([{ mensaje: 'seq.numero.emitido', datos: { tipo: 'BOLETA', serie: 'B002', numero: '125' } }]);
  });
});
