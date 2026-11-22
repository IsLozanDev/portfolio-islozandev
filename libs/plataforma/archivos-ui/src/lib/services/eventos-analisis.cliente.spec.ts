import { TestBed } from '@angular/core/testing';
import { EventosSseCliente, type EventoSse } from '@vitrina/shared/auth';
import { firstValueFrom, of, toArray } from 'rxjs';
import { EventosAnalisisCliente } from './eventos-analisis.cliente';

describe('EventosAnalisisCliente', () => {
  let cliente: EventosAnalisisCliente;
  let abrir: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    abrir = vi.fn(() =>
      of<EventoSse[]>(
        { evento: 'estado', datos: '{"tipo":"estado","numero":2,"estado":"EN_ANALISIS"}' },
        {
          evento: 'fin',
          datos: '{"tipo":"fin","numero":2,"resultado":"RECHAZADO","motivo":"IDENTICA","version_coincidente":1,"mensaje":"El archivo es idéntico a la versión vigente"}',
        },
      ),
    );
    TestBed.configureTestingModule({ providers: [{ provide: EventosSseCliente, useValue: { abrir } }] });
    cliente = TestBed.inject(EventosAnalisisCliente);
  });

  it('la versión 1 usa /archivos/{id}/eventos y termina en el evento fin', async () => {
    await firstValueFrom(cliente.abrir('arc 1', 1).pipe(toArray()));

    const [ruta, esFin] = abrir.mock.calls[0] as [string, (evento: EventoSse) => boolean];
    expect(ruta).toBe('/archivos/arc%201/eventos');
    expect(esFin({ evento: 'fin', datos: '{}' })).toBe(true);
    expect(esFin({ evento: 'estado', datos: '{}' })).toBe(false);
  });

  it('una versión n > 1 usa /versiones/{n}/eventos y mapea los avisos a camelCase', async () => {
    const avisos = await firstValueFrom(cliente.abrir('arc-1', 2).pipe(toArray()));

    expect(abrir.mock.calls[0]?.[0]).toBe('/archivos/arc-1/versiones/2/eventos');
    expect(avisos).toEqual([
      { tipo: 'estado', numero: 2 },
      { tipo: 'fin', numero: 2, resultado: 'RECHAZADO', motivo: 'IDENTICA', versionCoincidente: 1, mensaje: 'El archivo es idéntico a la versión vigente' },
    ]);
  });
});
