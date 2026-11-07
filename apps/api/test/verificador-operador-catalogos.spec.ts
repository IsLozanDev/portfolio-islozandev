import type { TenantScope } from '@vitrina/plataforma/kernel';
import { VerificadorOperadorOrg } from '../src/catalogos/verificador-operador.js';
import { ExigirOperador, OperadorRequeridoError } from '../src/org/operador.js';

const OPERADOR = '0193f3a0-0000-7000-8000-000000000001';
const CLIENTE = '0193f3a0-0000-7000-8000-000000000002';
const CODIGOS: Record<string, string> = { [OPERADOR]: 'plataforma', [CLIENTE]: 'sabor-arequipeno' };

function verificador(): VerificadorOperadorOrg {
  let alcance: TenantScope = { tenantId: '' };
  const exigirOperador = new ExigirOperador({
    unidadDeTrabajo: { run: (trabajo) => trabajo() },
    contexto: {
      current: () => alcance,
      run: async (nuevo, trabajo) => {
        alcance = nuevo;
        return trabajo();
      },
    },
    tenants: { buscar: async (id) => ({ codigo: CODIGOS[id] }) as never },
    tenantOperador: 'plataforma',
  });
  return new VerificadorOperadorOrg(exigirOperador);
}

describe('VerificadorOperadorOrg (spec 19a)', () => {
  it('deja pasar al tenant operador', async () => {
    await expect(verificador().exigir(OPERADOR)).resolves.toBeUndefined();
  });

  it('a un cliente le responde OPERADOR_REQUERIDO con el mensaje de catálogos', async () => {
    const error = await verificador()
      .exigir(CLIENTE)
      .catch((capturado: unknown) => capturado);
    expect(error).toBeInstanceOf(OperadorRequeridoError);
    expect(error).toMatchObject({ code: 'OPERADOR_REQUERIDO', message: 'Solo el tenant operador puede administrar catálogos globales' });
  });

  it('OperadorRequeridoError conserva el mensaje de tenants por defecto', () => {
    expect(new OperadorRequeridoError().message).toBe('Solo el tenant operador puede administrar tenants');
  });
});
