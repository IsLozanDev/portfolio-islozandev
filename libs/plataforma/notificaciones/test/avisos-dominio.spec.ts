import {
  CODIGOS_AVISO,
  fechaDeCalendarioDiaMesAnio,
  instanteDiaMesAnio,
  variablesIntegridadRota,
  variablesSoporteSolicitado,
  variablesSuscripcionPorVencer,
  variablesTenantSuspendido,
} from '../src/domain/avisos-plataforma.js';
import { claveDeAviso } from '../src/domain/clave-aviso.js';
import { renderizar } from '../src/domain/renderizador-plantilla.js';
import { SaneadorHtmlSanitize } from '../src/infrastructure/sanitize-html/saneador-html.sanitize.js';
import { plantillasDeLaSemilla } from './support/plantillas-avisos.js';

const ZONA_LIMA = 'America/Lima';
const EVENTO = '0190c6f2-7a3b-7c4d-8e5f-1a2b3c4d5e6f';
const TENANT = '44000000-0000-7000-8000-00000000000a';
const UUID_V8 = /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('avisos de plataforma: variables de cada carga (spec 44)', () => {
  it('suscripcion.por_vencer: producto, vigente_hasta en dd/mm/aaaa y días', () => {
    expect(variablesSuscripcionPorVencer({ producto_codigo: 'REST', vigente_hasta: '2026-11-27', dias_antes: 3 }, 'El Buen Sabor')).toEqual({
      tenant: 'El Buen Sabor',
      producto: 'REST',
      vigente_hasta: '27/11/2026',
      dias: 3,
    });
  });

  it('tenant.suspendido: la fecha efectiva se lee en la zona de Lima', () => {
    // 03:00 UTC del 25 son las 22:00 del 24 en Lima.
    expect(variablesTenantSuspendido({ estado_anterior: 'ACTIVO', motivo: 'Fin de gracia', fecha_efectiva: '2026-11-25T03:00:00.000Z' }, 'El Buen Sabor', ZONA_LIMA)).toEqual({
      tenant: 'El Buen Sabor',
      motivo: 'Fin de gracia',
      fecha_efectiva: '24/11/2026',
    });
  });

  it('soporte.solicitado: ticket, modo y horas', () => {
    expect(variablesSoporteSolicitado({ ticket: 'SOP-1024', modo: 'LECTURA', horas_solicitadas: 4 }, 'El Buen Sabor')).toEqual({
      tenant: 'El Buen Sabor',
      ticket: 'SOP-1024',
      modo: 'LECTURA',
      horas: 4,
    });
  });

  it('aud.integridad.rota: tenant_id, número, motivo y modo, sin datos personales', () => {
    expect(variablesIntegridadRota({ numero_roto: '1532', motivo: 'HASH', modo: 'INCREMENTAL' }, TENANT)).toEqual({
      tenant_id: TENANT,
      numero_roto: '1532',
      motivo: 'HASH',
      modo: 'INCREMENTAL',
    });
  });

  it('un texto que no es fecha llega sin cambios', () => {
    expect(fechaDeCalendarioDiaMesAnio('mañana')).toBe('mañana');
    expect(instanteDiaMesAnio('no-es-instante', ZONA_LIMA)).toBe('no-es-instante');
  });
});

describe('claveDeAviso (TR-RNF-008)', () => {
  it('misma entrada, misma clave; con formato UUID v8', () => {
    const clave = claveDeAviso(EVENTO, 'ana@prueba.pe');
    expect(clave).toMatch(UUID_V8);
    expect(claveDeAviso(EVENTO, 'ana@prueba.pe')).toBe(clave);
    expect(claveDeAviso(EVENTO, ' Ana@Prueba.pe ')).toBe(clave);
  });

  it('destino o evento distinto, clave distinta', () => {
    const clave = claveDeAviso(EVENTO, 'ana@prueba.pe');
    expect(claveDeAviso(EVENTO, 'luis@prueba.pe')).not.toBe(clave);
    expect(claveDeAviso('0190c6f2-7a3b-7c4d-8e5f-1a2b3c4d5e70', 'ana@prueba.pe')).not.toBe(clave);
  });
});

describe('semilla 01s_not_avisos_plataforma', () => {
  const saneador = new SaneadorHtmlSanitize();

  it('trae las cuatro bases; sus cuerpos pasan el saneador sin cambios y se renderizan con las variables de su carga', async () => {
    const plantillas = await plantillasDeLaSemilla();
    expect(plantillas.map((plantilla) => plantilla.codigo).sort()).toEqual(Object.values(CODIGOS_AVISO).sort());
    const variablesPorCodigo = {
      [CODIGOS_AVISO.suscripcionPorVencer]: variablesSuscripcionPorVencer({ producto_codigo: 'REST', vigente_hasta: '2026-11-27', dias_antes: 3 }, 'Sabor'),
      [CODIGOS_AVISO.tenantSuspendido]: variablesTenantSuspendido({ estado_anterior: 'ACTIVO', motivo: 'Gracia', fecha_efectiva: '2026-11-24T15:00:00Z' }, 'Sabor', ZONA_LIMA),
      [CODIGOS_AVISO.soporteSolicitado]: variablesSoporteSolicitado({ ticket: 'SOP-1', modo: 'LECTURA', horas_solicitadas: 2 }, 'Sabor'),
      [CODIGOS_AVISO.integridadRota]: variablesIntegridadRota({ numero_roto: '7', motivo: 'HASH', modo: 'COMPLETA' }, TENANT),
    };
    for (const plantilla of plantillas) {
      expect(saneador.sanear(plantilla.cuerpo)).toBe(plantilla.cuerpo);
      expect(plantilla.variables.every((variable) => variable.ejemplo !== undefined)).toBe(true);
      const variables = variablesPorCodigo[plantilla.codigo as keyof typeof variablesPorCodigo];
      expect(Object.keys(variables).sort()).toEqual(plantilla.variables.map((variable) => variable.nombre).sort());
      expect(() => renderizar(plantilla, variables)).not.toThrow();
    }
  });
});
