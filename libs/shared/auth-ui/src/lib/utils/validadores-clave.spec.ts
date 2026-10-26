import { FormControl, FormGroup } from '@angular/forms';
import { clavesCoinciden, ERROR_CLAVES_DISTINTAS } from './validadores-clave';

describe('clavesCoinciden', () => {
  function grupo(clave: string, confirmacion: string): FormGroup {
    return new FormGroup({ clave: new FormControl(clave), confirmacion: new FormControl(confirmacion) }, { validators: clavesCoinciden });
  }

  it('iguales no tiene error', () => {
    expect(grupo('Clave-2026', 'Clave-2026').errors).toBeNull();
  });

  it('distintas marca clavesDistintas', () => {
    expect(grupo('Clave-2026', 'Clave-2025').hasError(ERROR_CLAVES_DISTINTAS)).toBe(true);
  });

  it('sin confirmación aún no marca error', () => {
    expect(grupo('Clave-2026', '').errors).toBeNull();
  });
});
