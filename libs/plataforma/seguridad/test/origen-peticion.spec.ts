import { ipLegible, OrigenPeticion } from '../src/infrastructure/origen-peticion.js';

describe('OrigenPeticion (IP de la bitácora, spec 18)', () => {
  it('guarda las IPv4 mapeadas como IPv4 y deja igual las IPv6', () => {
    expect(ipLegible('::ffff:190.42.10.8')).toBe('190.42.10.8');
    expect(ipLegible('190.42.10.8')).toBe('190.42.10.8');
    expect(ipLegible('::1')).toBe('::1');
    expect(ipLegible('2800:200:e840::1')).toBe('2800:200:e840::1');
    expect(ipLegible(null)).toBeNull();
  });

  it('da la IP solo dentro de la petición y la aísla entre peticiones concurrentes', async () => {
    const origen = new OrigenPeticion();
    const leerTrasEspera = (ip: string) =>
      origen.ejecutarCon(ip, async () => {
        await new Promise((resolver) => setTimeout(resolver, 5));
        return origen.ipActual();
      });

    expect(origen.ipActual()).toBeNull();
    expect(await Promise.all([leerTrasEspera('10.0.0.1'), leerTrasEspera('10.0.0.2')])).toEqual(['10.0.0.1', '10.0.0.2']);
    expect(origen.ipActual()).toBeNull();
  });
});
