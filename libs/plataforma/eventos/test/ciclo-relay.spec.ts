import { CicloRelay, type Despacho } from '../src/application/ciclo-relay.js';
import { esperarHasta } from './support/entorno.js';

const INTERVALO_MS = 5;
const LIMITE_ESPERA_MS = 2000;

/** Cuenta las vueltas; la vuelta indicada falla y las demás tardan `duracionMs`. */
class DespachoDePrueba implements Despacho {
  vueltas = 0;
  enCurso = 0;
  maximoSimultaneo = 0;

  constructor(
    private readonly duracionMs = 0,
    private readonly vueltaQueFalla = 0,
  ) {}

  async ejecutar(): Promise<void> {
    this.vueltas += 1;
    this.enCurso += 1;
    this.maximoSimultaneo = Math.max(this.maximoSimultaneo, this.enCurso);
    try {
      await new Promise((resolver) => setTimeout(resolver, this.duracionMs));
      if (this.vueltas === this.vueltaQueFalla) throw new Error('Redis no responde');
    } finally {
      this.enCurso -= 1;
    }
  }
}

describe('CicloRelay', () => {
  test('corre una vuelta tras otra, sin dos a la vez', async () => {
    const despacho = new DespachoDePrueba(10);
    const ciclo = new CicloRelay(despacho, INTERVALO_MS, () => undefined);

    ciclo.iniciar();
    await esperarHasta(async () => despacho.vueltas >= 3, LIMITE_ESPERA_MS);
    await ciclo.detener();

    expect(despacho.maximoSimultaneo).toBe(1);
  });

  test('una vuelta que falla se avisa y el ciclo sigue', async () => {
    const despacho = new DespachoDePrueba(0, 1);
    const avisos: Record<string, unknown>[] = [];
    const ciclo = new CicloRelay(despacho, INTERVALO_MS, (_mensaje, datos) => avisos.push(datos));

    ciclo.iniciar();
    await esperarHasta(async () => despacho.vueltas >= 2, LIMITE_ESPERA_MS);
    await ciclo.detener();

    expect(avisos).toEqual([{ error: 'Error', mensaje: 'Redis no responde' }]);
  });

  test('detener espera la vuelta en curso y no programa otra', async () => {
    const despacho = new DespachoDePrueba(100);
    const ciclo = new CicloRelay(despacho, INTERVALO_MS, () => undefined);

    ciclo.iniciar();
    await esperarHasta(async () => despacho.enCurso === 1, LIMITE_ESPERA_MS);
    await ciclo.detener();
    const vueltasAlDetener = despacho.vueltas;
    await new Promise((resolver) => setTimeout(resolver, INTERVALO_MS * 10));

    expect(despacho.enCurso).toBe(0);
    expect(despacho.vueltas).toBe(vueltasAlDetener);
  });
});
