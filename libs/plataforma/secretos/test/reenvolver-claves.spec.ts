import { uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { ClavesDeDatos } from '../src/application/claves-de-datos.js';
import { ReenvolverClaves } from '../src/application/reenvolver-claves.js';
import { ServicioBoveda } from '../src/application/servicio-boveda.js';
import type { ClavesMaestras } from '../src/domain/claves-maestras.js';
import { BovedaNoConfiguradaError } from '../src/domain/errores.js';
import { CifradorAesGcm } from '../src/infrastructure/crypto/cifrador.aes-gcm.js';
import {
  AHORA,
  clavesMaestrasDePrueba,
  crearEscenario,
  relojFijo,
  TenantsPorReenvolverMemoria,
  unidadDeTrabajoDirecta,
  type EscenarioBoveda,
  type Registro,
} from './support/dobles.js';

const TIPO = 'pag.llave_privada';
const TOTAL_TENANTS = 205;

describe('ReenvolverClaves', () => {
  const usuario = uuidV7();
  const valor = new TextEncoder().encode('llave-de-la-pasarela');
  let escenario: EscenarioBoveda;
  let versionUno: ClavesMaestras;
  let avisos: Registro[];

  const reenvolvedor = (claves: ClavesMaestras | undefined) =>
    new ReenvolverClaves({
      unidadDeTrabajo: unidadDeTrabajoDirecta,
      contexto: escenario.contexto,
      reloj: relojFijo,
      clavesDeDatos: new ClavesDeDatos(new CifradorAesGcm(), escenario.clavesTenant, claves),
      clavesTenant: escenario.clavesTenant,
      tenantsPorReenvolver: new TenantsPorReenvolverMemoria(escenario.clavesTenant),
      informar: (mensaje, datos) => escenario.registros.push({ mensaje, datos }),
      avisar: (mensaje, datos) => avisos.push({ mensaje, datos }),
    });

  async function guardarEnTenants(claves: ClavesMaestras, cantidad: number): Promise<Map<string, string>> {
    const boveda = new ServicioBoveda(escenario.dependencias(claves));
    const secretoPorTenant = new Map<string, string>();
    for (let indice = 0; indice < cantidad; indice++) {
      const tenantId = uuidV7();
      secretoPorTenant.set(tenantId, await escenario.contexto.run({ tenantId, actorId: usuario }, () => boveda.guardar(TIPO, valor)));
    }
    return secretoPorTenant;
  }

  async function leerTodos(claves: ClavesMaestras, secretoPorTenant: Map<string, string>): Promise<Uint8Array[]> {
    const boveda = new ServicioBoveda(escenario.dependencias(claves));
    const leidos: Uint8Array[] = [];
    for (const [tenantId, secretoId] of secretoPorTenant) leidos.push(await escenario.contexto.run({ tenantId }, () => boveda.leer(secretoId)));
    return leidos;
  }

  beforeEach(() => {
    escenario = crearEscenario();
    versionUno = clavesMaestrasDePrueba([1], 1);
    avisos = [];
  });

  it('re-envuelve en lotes todas las claves con la activa sin tocar los secretos; después se lee sin la versión vieja', async () => {
    const secretoPorTenant = await guardarEnTenants(versionUno, TOTAL_TENANTS);
    const secretosAntes = structuredClone([...escenario.secretos.filas.values()]);
    const unoYDos = clavesMaestrasDePrueba([1, 2], 2, new Map([[1, versionUno.clave(1)]]));
    const reenvoltura = reenvolvedor(unoYDos);

    expect(await reenvoltura.contarPendientes()).toBe(TOTAL_TENANTS);
    expect(await leerTodos(unoYDos, secretoPorTenant)).toHaveLength(TOTAL_TENANTS);

    expect(await reenvoltura.ejecutar()).toEqual({ reenvueltas: TOTAL_TENANTS, pendientes: 0 });

    expect(await reenvoltura.contarPendientes()).toBe(0);
    for (const clave of escenario.clavesTenant.filas.values()) expect(clave).toMatchObject({ versionClaveMaestra: 2, reenvueltaEn: AHORA });
    expect([...escenario.secretos.filas.values()]).toEqual(secretosAntes);
    const soloLaDos = clavesMaestrasDePrueba([2], 2, new Map([[2, unoYDos.clave(2)]]));
    expect(escenario.registros.find((registro) => registro.mensaje === 'sec.claves.reenvueltas')).toEqual({
      mensaje: 'sec.claves.reenvueltas',
      datos: { reenvueltas: TOTAL_TENANTS, pendientes: 0, version_activa: 2 },
    });
    const leidos = await leerTodos(soloLaDos, secretoPorTenant);
    expect(leidos.every((leido) => Buffer.from(leido).equals(Buffer.from(valor)))).toBe(true);
  });

  it('cada re-envoltura usa un IV nuevo', async () => {
    const secretoPorTenant = await guardarEnTenants(versionUno, 1);
    const [tenantId] = [...secretoPorTenant.keys()];
    const ivAntes = escenario.clavesTenant.filas.get(tenantId ?? '')?.iv;

    await reenvolvedor(clavesMaestrasDePrueba([1, 2], 2, new Map([[1, versionUno.clave(1)]]))).ejecutar();

    expect(Buffer.from(escenario.clavesTenant.filas.get(tenantId ?? '')?.iv ?? []).equals(Buffer.from(ivAntes ?? []))).toBe(false);
  });

  it('sin la versión vieja configurada no avanza: avisa por tenant con el nombre del error y deja los pendientes', async () => {
    await guardarEnTenants(versionUno, 2);

    const resultado = await reenvolvedor(clavesMaestrasDePrueba([2, 3], 3)).ejecutar();

    expect(resultado).toEqual({ reenvueltas: 0, pendientes: 2 });
    expect(avisos).toHaveLength(2);
    expect(avisos[0]).toMatchObject({ mensaje: 'sec.clave.reenvoltura_fallida', datos: { error: 'ClaveMaestraDesconocidaError' } });
  });

  it('sin pendientes no escribe', async () => {
    await guardarEnTenants(versionUno, 1);
    const antes = structuredClone([...escenario.clavesTenant.filas.values()]);

    expect(await reenvolvedor(versionUno).ejecutar()).toEqual({ reenvueltas: 0, pendientes: 0 });
    expect([...escenario.clavesTenant.filas.values()]).toEqual(antes);
  });

  it('sin claves maestras lanza BovedaNoConfiguradaError', async () => {
    await expect(reenvolvedor(undefined).ejecutar()).rejects.toThrow(BovedaNoConfiguradaError);
    await expect(reenvolvedor(undefined).contarPendientes()).rejects.toThrow(BovedaNoConfiguradaError);
  });
});
