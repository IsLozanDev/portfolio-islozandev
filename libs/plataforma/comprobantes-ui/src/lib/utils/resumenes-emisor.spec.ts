import { AHORA, emisorDePrueba, haceHoras, pruebaDePrueba } from '../../testing/emisor-de-prueba';
import { resumenCertificado, resumenProduccion, resumenProveedor, resumenPrueba, seccionHecha } from './resumenes-emisor';

describe('resúmenes de las secciones del emisor', () => {
  it('proveedor: «{proveedor} · {usuario}»; vacío sin emisor', () => {
    expect(resumenProveedor(emisorDePrueba(), 'SUNAT directo')).toBe('SUNAT directo · MODDATOS');
    expect(resumenProveedor(null, '')).toBe('');
  });

  it('certificado: «RUC … · vence dd/mm/aa»; sin emisor, el motivo', () => {
    expect(resumenCertificado(emisorDePrueba())).toBe('RUC 20601234561 · vence 30/06/27');
    expect(resumenCertificado(emisorDePrueba({ certificado: null }))).toBe('Sin certificado');
    expect(resumenCertificado(null)).toBe('Guarda primero el proveedor');
  });

  it('prueba: número, estado y fecha; «Sin pruebas»; en BORRADOR, el motivo', () => {
    expect(resumenPrueba(emisorDePrueba({ prueba: pruebaDePrueba({ numero: 3 }) }))).toBe('Prueba n.º 3 · Aceptada · 25/11/26, 09:00');
    expect(resumenPrueba(emisorDePrueba())).toBe('Sin pruebas');
    expect(resumenPrueba(emisorDePrueba({ estado: 'BORRADOR' }))).toBe('Completa el proveedor y el certificado');
  });

  it('producción: el motivo, hasta cuándo vale la prueba o desde cuándo está en producción', () => {
    expect(resumenProduccion(emisorDePrueba(), AHORA)).toBe('Necesita una prueba aceptada');
    const verificado = emisorDePrueba({ estado: 'VERIFICADO', prueba: pruebaDePrueba({ resultadoEn: haceHoras(1) }) });
    expect(resumenProduccion(verificado, AHORA)).toBe('La prueba aceptada vale hasta el 26/11/26, 09:00.');
    expect(resumenProduccion(emisorDePrueba({ estado: 'PRODUCCION', produccionHabilitadaEn: '2026-11-20T15:00:00.000Z' }), AHORA)).toBe(
      'En producción desde 20/11/26',
    );
  });

  it('marca de hecho por sección', () => {
    const verificado = emisorDePrueba({ estado: 'VERIFICADO' });
    expect(['proveedor', 'certificado', 'prueba', 'produccion'].map((seccion) => seccionHecha(seccion as never, verificado))).toEqual([true, true, true, false]);
    expect(seccionHecha('proveedor', emisorDePrueba({ tieneCredencial: false }))).toBe(false);
    expect(seccionHecha('certificado', null)).toBe(false);
  });
});
