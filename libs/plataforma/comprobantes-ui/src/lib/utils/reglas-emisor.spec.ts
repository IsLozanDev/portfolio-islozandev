import { AHORA, emisorDePrueba, haceHoras, pruebaDePrueba } from '../../testing/emisor-de-prueba';
import { MOTIVOS_DESHABILITADA } from '../models/mensajes-emisor';
import {
  certificadoHabilitado,
  motivoPruebaDeshabilitada,
  motivoProduccionDeshabilitada,
  produccionHabilitada,
  pruebaHabilitada,
  seccionesIniciales,
} from './reglas-emisor';

const verificado = (horasDesdeElResultado: number) =>
  emisorDePrueba({ estado: 'VERIFICADO', prueba: pruebaDePrueba({ resultadoEn: haceHoras(horasDesdeElResultado) }) });

describe('produccionHabilitada', () => {
  it('prueba aceptada hace 23 h habilita producción; hace 25 h no y explica por qué', () => {
    expect(produccionHabilitada(verificado(23), AHORA)).toBe(true);
    expect(motivoProduccionDeshabilitada(verificado(23), AHORA)).toBeNull();
    expect(produccionHabilitada(verificado(25), AHORA)).toBe(false);
    expect(motivoProduccionDeshabilitada(verificado(25), AHORA)).toBe(MOTIVOS_DESHABILITADA.pruebaVencida);
  });

  it('sin prueba aceptada, sin emisor o en borrador: deshabilitada con su motivo; en producción, sin motivo', () => {
    expect(motivoProduccionDeshabilitada(emisorDePrueba(), AHORA)).toBe(MOTIVOS_DESHABILITADA.sinPruebaAceptada);
    expect(motivoProduccionDeshabilitada(null, AHORA)).toBe(MOTIVOS_DESHABILITADA.sinEmisor);
    expect(motivoProduccionDeshabilitada(emisorDePrueba({ estado: 'BORRADOR' }), AHORA)).toBe(MOTIVOS_DESHABILITADA.faltaConfigurar);
    const volviendoAProbar = emisorDePrueba({ estado: 'VERIFICADO', prueba: pruebaDePrueba({ estado: 'EN_PROCESO', resultadoEn: null }) });
    expect(motivoProduccionDeshabilitada(volviendoAProbar, AHORA)).toBe(MOTIVOS_DESHABILITADA.sinPruebaAceptada);
    expect(motivoProduccionDeshabilitada(emisorDePrueba({ estado: 'PRODUCCION', ambiente: 'PRODUCCION' }), AHORA)).toBeNull();
    expect(produccionHabilitada(emisorDePrueba({ estado: 'PRODUCCION', prueba: pruebaDePrueba({ resultadoEn: haceHoras(1) }) }), AHORA)).toBe(false);
  });
});

describe('habilitación de certificado y prueba', () => {
  it('certificado con emisor; prueba en CONFIGURADO o VERIFICADO', () => {
    expect([certificadoHabilitado(null), certificadoHabilitado(emisorDePrueba({ estado: 'BORRADOR' }))]).toEqual([false, true]);
    expect(pruebaHabilitada(emisorDePrueba({ estado: 'BORRADOR' }))).toBe(false);
    expect(pruebaHabilitada(emisorDePrueba())).toBe(true);
    expect(pruebaHabilitada(verificado(1))).toBe(true);
    expect(motivoPruebaDeshabilitada(null)).toBe(MOTIVOS_DESHABILITADA.sinEmisor);
    expect(motivoPruebaDeshabilitada(emisorDePrueba({ estado: 'BORRADOR' }))).toBe(MOTIVOS_DESHABILITADA.faltaConfigurar);
    expect(motivoPruebaDeshabilitada(emisorDePrueba({ estado: 'PRODUCCION' }))).toBe(MOTIVOS_DESHABILITADA.pruebaEnProduccion);
  });
});

describe('seccionesIniciales', () => {
  const expandidas = (secciones: Record<string, boolean>) => Object.keys(secciones).filter((seccion) => secciones[seccion]);

  it('expande solo el paso pendiente de cada estado', () => {
    expect(expandidas(seccionesIniciales(null, AHORA))).toEqual(['proveedor']);
    expect(expandidas(seccionesIniciales(emisorDePrueba({ estado: 'BORRADOR', certificado: null }), AHORA))).toEqual(['proveedor', 'certificado']);
    expect(expandidas(seccionesIniciales(emisorDePrueba({ estado: 'BORRADOR' }), AHORA))).toEqual(['proveedor']);
    expect(expandidas(seccionesIniciales(emisorDePrueba(), AHORA))).toEqual(['prueba']);
    expect(expandidas(seccionesIniciales(verificado(1), AHORA))).toEqual(['produccion']);
    expect(expandidas(seccionesIniciales(emisorDePrueba({ estado: 'PRODUCCION' }), AHORA))).toEqual([]);
  });

  it('el certificado por vencer o vencido siempre abre; la prueba en proceso también', () => {
    const porVencer = emisorDePrueba({ certificado: { ruc: '20601234561', venceEn: '2026-12-13T05:00:00.000Z', huellaSha256: 'ab' } });
    expect(expandidas(seccionesIniciales(porVencer, AHORA))).toEqual(['certificado', 'prueba']);
    const vencido = emisorDePrueba({ estado: 'PRODUCCION', certificado: { ruc: '20601234561', venceEn: haceHoras(1), huellaSha256: 'ab' } });
    expect(expandidas(seccionesIniciales(vencido, AHORA))).toEqual(['certificado']);
    const enCurso = verificado(1);
    enCurso.prueba = pruebaDePrueba({ estado: 'EN_PROCESO', resultadoEn: null });
    expect(expandidas(seccionesIniciales(enCurso, AHORA))).toEqual(['prueba', 'produccion']);
  });
});
