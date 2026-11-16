import { aDetalleCuota, aPaginaCuotas, type DetalleCuotaRespuesta } from './cuota';

const FILA_RESPUESTA = {
  tenant_id: 't-1',
  tenant_nombre: 'Pollería Doña Rosa',
  plan: 'BASICO',
  incluidas: 500,
  consumidas: 120,
  porcentaje: 24,
  avisado_umbral_en: null,
  avisado_agotada_en: null,
  version: 3,
} as const;

describe('mapeos de cuota', () => {
  it('mapea la página de la API a camelCase', () => {
    const pagina = aPaginaCuotas({ periodo: '2026-11', items: [FILA_RESPUESTA], total: 1, pagina: 1, tamano: 20 });

    expect(pagina).toEqual({
      periodo: '2026-11',
      items: [
        {
          tenantId: 't-1',
          tenantNombre: 'Pollería Doña Rosa',
          plan: 'BASICO',
          incluidas: 500,
          consumidas: 120,
          porcentaje: 24,
          avisadoUmbralEn: null,
          avisadoAgotadaEn: null,
          version: 3,
        },
      ],
      total: 1,
      pagina: 1,
      tamano: 20,
    });
  });

  it('mapea el detalle con su periodo, fecha de creación y consultas por resultado', () => {
    const consultas = { CACHE: 40, PROVEEDOR: 70, NO_ENCONTRADO: 5, INVALIDO: 2, CUOTA_AGOTADA: 0, PROVEEDOR_NO_DISPONIBLE: 3 };
    const respuesta: DetalleCuotaRespuesta = {
      ...FILA_RESPUESTA,
      avisado_umbral_en: '2026-11-10T15:00:00Z',
      periodo: '2026-11',
      creada_en: '2026-11-01T05:00:00Z',
      consultas_por_resultado: consultas,
    };

    expect(aDetalleCuota(respuesta)).toMatchObject({
      tenantId: 't-1',
      avisadoUmbralEn: '2026-11-10T15:00:00Z',
      periodo: '2026-11',
      creadaEn: '2026-11-01T05:00:00Z',
      consultasPorResultado: consultas,
    });
  });
});
