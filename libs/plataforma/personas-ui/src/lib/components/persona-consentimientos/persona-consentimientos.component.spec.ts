import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { estable } from '../../../testing/ficha-de-prueba';
import type { DecisionVigente } from '../../models/consentimiento';
import { ConsentimientosCliente } from '../../services/consentimientos.cliente';
import { PersonaConsentimientosComponent } from './persona-consentimientos.component';

const DECISIONES: DecisionVigente[] = [
  { finalidad: 'PRESTACION', estado: 'ACEPTA', versionTexto: '2026-03', canal: 'PRESENCIAL', fecha: '2026-03-02T14:15:00Z' },
  { finalidad: 'COMPARTIR_PRODUCTOS', estado: 'REVOCADO', versionTexto: '2026-03', canal: 'WHATSAPP', fecha: '2026-10-20T23:40:00Z' },
];

describe('PersonaConsentimientosComponent', () => {
  let fixture: ComponentFixture<PersonaConsentimientosComponent>;

  async function montar(decisiones: DecisionVigente[]): Promise<void> {
    TestBed.configureTestingModule({ providers: [{ provide: ConsentimientosCliente, useValue: { vigentes: vi.fn(async () => decisiones) } }] });
    fixture = TestBed.createComponent(PersonaConsentimientosComponent);
    fixture.componentRef.setInput('personaId', 'per-1');
    fixture.detectChanges();
    await estable(fixture);
  }

  it('muestra finalidad, decisión, versión, canal y fecha de Lima, en solo lectura', async () => {
    await montar(DECISIONES);
    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Prestación del servicio');
    expect(texto).toContain('Acepta');
    expect(texto).toContain('Revocado');
    expect(texto).toContain('v 2026-03');
    expect(texto).toContain('02/03/2026 09:15');
    expect((fixture.nativeElement as HTMLElement).querySelector('button[data-accion]')).toBeNull();
  });

  it('sin decisiones lo dice', async () => {
    await montar([]);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Sin decisiones registradas');
    expect(fixture.componentInstance.resumen()).toBe('Sin decisiones registradas');
  });

  it('el resumen cuenta las aceptadas de las finalidades con decisión', async () => {
    await montar(DECISIONES);
    expect(fixture.componentInstance.resumen()).toBe('1 de 2 vigentes');
  });
});
