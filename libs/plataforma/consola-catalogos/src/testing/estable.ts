import type { ComponentFixture } from '@angular/core/testing';

/**
 * Espera a que terminen las promesas de la página (los clientes usan `firstValueFrom`, que Angular no
 * cuenta como tarea pendiente) y luego a que se pinte el cambio.
 */
export async function estable(fixture: ComponentFixture<unknown>): Promise<void> {
  await new Promise((resolver) => setTimeout(resolver));
  await fixture.whenStable();
}
