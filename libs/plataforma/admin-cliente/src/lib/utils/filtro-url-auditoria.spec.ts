import { convertToParamMap } from '@angular/router';
import type { FiltroAuditoria } from '../models/evento-auditoria';
import { accionNormalizada, filtroAuditoriaDesdeUrl, filtroAuditoriaParaUrl } from './filtro-url-auditoria';

/** 03/11 a las 23:30 en Lima ya es 04/11 en UTC. */
const AHORA = new Date('2026-11-04T04:30:00Z');

const COMPLETO: FiltroAuditoria = {
  desde: '2026-10-01',
  hasta: '2026-10-31',
  usuario: 'rosa',
  accion: 'rest.venta.anular',
  tipo: 'ACCESO_SENSIBLE',
  sucursalId: 's-1',
  entidadTipo: 'venta',
  entidadId: 'V-000981',
  personaTitularId: 'p-1',
  pagina: 2,
  tamano: 50,
};

describe('filtro de la auditoría en la URL (spec 20c)', () => {
  it('sin parámetros, los últimos 7 días en Lima, página 1 y tamaño 20', () => {
    expect(filtroAuditoriaDesdeUrl(convertToParamMap({}), AHORA)).toMatchObject({ desde: '2026-10-28', hasta: '2026-11-03', pagina: 1, tamano: 20 });
  });

  it('ida y vuelta con todos los filtros, con los nombres de la API', () => {
    const parametros = filtroAuditoriaParaUrl(COMPLETO);
    expect(parametros).toMatchObject({ sucursal_id: 's-1', entidad_tipo: 'venta', entidad_id: 'V-000981', persona_titular_id: 'p-1' });
    expect(filtroAuditoriaDesdeUrl(convertToParamMap(parametros), AHORA)).toEqual(COMPLETO);
  });

  it.each([
    ['un tipo fuera del catálogo', { tipo: 'OTRO' }, { tipo: undefined }],
    ['un usuario de 1 carácter', { usuario: 'r' }, { usuario: undefined }],
    ['un rango incompleto', { desde: '2026-10-01' }, { desde: '2026-10-28', hasta: '2026-11-03' }],
    ['una entidad en blanco', { entidad_tipo: '  ' }, { entidadTipo: undefined }],
  ])('%s se ignora', (_caso, parametros, esperado) => {
    expect(filtroAuditoriaDesdeUrl(convertToParamMap(parametros), AHORA)).toMatchObject(esperado);
  });

  it('a la URL: el rango siempre va; lo vacío, la primera página y el tamaño por defecto, no', () => {
    expect(filtroAuditoriaParaUrl({ desde: '2026-10-28', hasta: '2026-11-03', pagina: 1, tamano: 20 })).toEqual({
      desde: '2026-10-28',
      hasta: '2026-11-03',
      usuario: null,
      accion: null,
      tipo: null,
      sucursal_id: null,
      entidad_tipo: null,
      entidad_id: null,
      persona_titular_id: null,
      pagina: null,
      tamano: null,
    });
  });

  it('la acción se recorta y pasa a minúsculas; vacía, sin filtro', () => {
    expect(accionNormalizada('  Rest.Venta.ANULAR ')).toBe('rest.venta.anular');
    expect(accionNormalizada('   ')).toBeUndefined();
    expect(accionNormalizada(null)).toBeUndefined();
  });
});
