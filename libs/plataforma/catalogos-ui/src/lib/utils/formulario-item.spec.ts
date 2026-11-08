import type { ItemCatalogo } from '../models/item';
import { fechaDesdeIso } from './fecha-lima';
import { aSolicitudItem, cargarItem, crearGrupoItem, inicioFuturo, mensajeDeErrorItem, revalidarVigenciaFinal } from './formulario-item';

const ITEM: ItemCatalogo = {
  id: 'i-1',
  codigo: 'DNI',
  codigoExterno: '1',
  nombre: 'DNI',
  abreviatura: null,
  orden: null,
  atributos: { longitud: 8, valida_reniec: true, decimales: 0, etiqueta: { corta: 'D' } },
  vigenteDesde: '2026-01-01',
  vigenteHasta: '2026-12-31',
  activo: false,
  version: 2,
};

describe('formulario de ítem', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-08T15:00:00Z'));
  });

  afterEach(() => vi.useRealTimers());

  it('nace con vigente_desde hoy en Lima y sin errores en lo opcional', () => {
    const grupo = crearGrupoItem();
    grupo.patchValue({ codigo: 'YAPE', nombre: 'Yape' });
    expect(grupo.valid).toBe(true);
    expect(aSolicitudItem(grupo)).toEqual({
      codigo: 'YAPE',
      codigoExterno: null,
      nombre: 'Yape',
      abreviatura: null,
      orden: null,
      atributos: {},
      vigenteDesde: '2026-11-08',
      vigenteHasta: null,
      activo: true,
    });
  });

  it('cargar y volver a pedir la solicitud conserva todo, sin el código', () => {
    const grupo = crearGrupoItem();
    cargarItem(grupo, ITEM);
    expect(grupo.controls.codigo.disabled).toBe(true);
    expect(aSolicitudItem(grupo)).toEqual({
      codigoExterno: '1',
      nombre: 'DNI',
      abreviatura: null,
      orden: null,
      atributos: { longitud: 8, valida_reniec: true, decimales: 0, etiqueta: { corta: 'D' } },
      vigenteDesde: '2026-01-01',
      vigenteHasta: '2026-12-31',
      activo: false,
    });
  });

  it('longitud y orden deben ser enteros; longitud de 1 a 100', () => {
    const grupo = crearGrupoItem();
    grupo.controls.atributos.controls.longitud.setValue('8.5');
    expect(mensajeDeErrorItem(grupo.controls.atributos.controls.longitud.errors)).toBe('Ingrese un número entero');
    grupo.controls.atributos.controls.longitud.setValue('101');
    expect(mensajeDeErrorItem(grupo.controls.atributos.controls.longitud.errors)).toBe('El valor máximo es 100.');
    grupo.controls.orden.setValue('-3');
    expect(grupo.controls.orden.valid).toBe(true);
  });

  it('mover vigente_desde después de vigente_hasta invalida la vigencia final', () => {
    const grupo = crearGrupoItem();
    grupo.controls.vigenteHasta.setValue(fechaDesdeIso('2026-12-01'));
    expect(grupo.controls.vigenteHasta.valid).toBe(true);
    grupo.controls.vigenteDesde.setValue(fechaDesdeIso('2027-01-01'));
    revalidarVigenciaFinal(grupo);
    expect(grupo.controls.vigenteHasta.hasError('vigenciaInvertida')).toBe(true);
  });

  it('inicioFuturo solo con vigente_desde posterior a hoy', () => {
    const grupo = crearGrupoItem();
    expect(inicioFuturo(grupo)).toBeNull();
    grupo.controls.vigenteDesde.setValue(fechaDesdeIso('2027-01-01'));
    expect(inicioFuturo(grupo)).toBe('2027-01-01');
  });
});
