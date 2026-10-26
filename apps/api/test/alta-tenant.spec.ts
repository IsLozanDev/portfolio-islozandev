import { ConflictError, ValidationError, type TenantScope } from '@vitrina/plataforma/kernel';
import { IdentidadNoDisponibleError, type IdentidadPropietario } from '@vitrina/plataforma/seguridad';
import {
  AltaTenant,
  OperadorRequeridoError,
  RucInvalidoError,
  TenantDuplicadoError,
  type AltaTenantComando,
  type DependenciasAlta,
} from '../src/org/alta-tenant.js';

const OPERADOR = '0193f3a0-0000-7000-8000-0000000000aa';
const CLIENTE = '0193f3a0-0000-7000-8000-0000000000bb';
const NUEVO = '0193f3a0-0000-7000-8000-0000000000cc';
const ADMIN = '0193f3a0-0000-7000-8000-000000000901';
// 10:00 en Lima del 25/10/2026.
const AHORA = new Date('2026-10-25T15:00:00Z');

interface Escenario {
  dependencias: DependenciasAlta;
  /** Paso, tenant del contexto y si iba dentro de la transacción. */
  pasos: { paso: string; tenant: string | undefined; enTransaccion: boolean }[];
  fallos: Partial<Record<string, Error>>;
  identidad: IdentidadPropietario;
  codigosOcupados: Set<string>;
}

function escenario(): Escenario {
  const pila: TenantScope[] = [];
  let transacciones = 0;
  const pasos: Escenario['pasos'] = [];
  const fallos: Escenario['fallos'] = {};
  const codigosOcupados = new Set(['polleria-dona-rosa']);
  const identidad: IdentidadPropietario = { correo: 'rosa@vitrina.pe', usuarioId: 'u-rosa', usuarioNuevo: true, token: 't', redirectTo: 'https://app/inv?token=t' };
  const anotar = async (paso: string) => {
    pasos.push({ paso, tenant: pila.at(-1)?.tenantId, enTransaccion: transacciones > 0 });
    const fallo = fallos[paso];
    if (fallo) throw fallo;
  };

  const dependencias: DependenciasAlta = {
    unidadDeTrabajo: {
      run: async (trabajo) => {
        transacciones += 1;
        try {
          return await trabajo();
        } finally {
          transacciones -= 1;
        }
      },
    },
    contexto: {
      current: () => pila.at(-1) as TenantScope,
      run: async (alcance, trabajo) => {
        pila.push(alcance);
        try {
          return await trabajo();
        } finally {
          pila.pop();
        }
      },
    },
    ids: { next: () => NUEVO },
    reloj: { now: () => AHORA },
    tenants: { buscar: async (id) => ({ codigo: id === OPERADOR ? 'plataforma' : 'cliente-x' }) as never },
    codigos: { existe: async (codigo) => codigosOcupados.has(codigo) },
    parametros: { valor: async <T>() => ({ valor: 15 as T, origen: 'DEFECTO' as const }) },
    crearTenant: { ejecutar: async () => (await anotar('crearTenant'), { tenantId: NUEVO }) },
    gestionarSuscripcion: { ejecutar: async () => (await anotar('gestionarSuscripcion'), { suscripcionId: 's-1', nueva: true }) },
    registrarEmpresa: { ejecutar: async () => (await anotar('registrarEmpresa'), { empresaId: 'e-1', sucursalPrincipalId: 'suc-0000' }) },
    sembrarSeries: { ejecutar: async () => (await anotar('sembrarSeries'), []) },
    invitarPropietario: {
      prepararIdentidad: async () => (await anotar('prepararIdentidad'), identidad),
      registrar: async () => (await anotar('registrar'), { membresiaId: 'm-1', invitacionId: 'i-1', expiraEn: new Date('2026-10-28T15:00:00Z') }),
      notificar: async () => (await anotar('notificar'), { correoEnviado: true }),
    },
    tenantOperador: 'plataforma',
  };
  return { dependencias, pasos, fallos, identidad, codigosOcupados };
}

const comando = (cambios: Partial<AltaTenantComando> = {}): AltaTenantComando => ({
  codigo: 'polleria-nueva',
  nombre: 'Pollería Nueva',
  productoCodigo: 'REST',
  plan: 'BASICO',
  modalidad: 'PRUEBA',
  ruc: '20601234565',
  razonSocial: 'Pollería Nueva SAC',
  correoPropietario: 'rosa@vitrina.pe',
  nombrePropietario: 'Rosa Quispe',
  actor: { usuarioId: ADMIN, tenantId: OPERADOR },
  ...cambios,
});

describe('AltaTenant (TR-RF-001)', () => {
  it('prepara la identidad fuera de la transacción, registra todo en una sola con el tenant nuevo y notifica después', async () => {
    const e = escenario();

    const alta = await new AltaTenant(e.dependencias).ejecutar(comando());

    expect(e.pasos).toEqual([
      { paso: 'prepararIdentidad', tenant: NUEVO, enTransaccion: false },
      { paso: 'crearTenant', tenant: NUEVO, enTransaccion: true },
      { paso: 'gestionarSuscripcion', tenant: NUEVO, enTransaccion: true },
      { paso: 'registrarEmpresa', tenant: NUEVO, enTransaccion: true },
      { paso: 'sembrarSeries', tenant: NUEVO, enTransaccion: true },
      { paso: 'registrar', tenant: NUEVO, enTransaccion: true },
      { paso: 'notificar', tenant: NUEVO, enTransaccion: false },
    ]);
    expect(alta).toEqual({
      tenantId: NUEVO,
      estado: 'PRUEBA',
      suscripcionId: 's-1',
      vigenteHasta: '2026-11-09',
      empresaId: 'e-1',
      sucursalId: 'suc-0000',
      membresiaId: 'm-1',
      invitacionId: 'i-1',
      expiraEn: new Date('2026-10-28T15:00:00Z'),
      usuarioNuevo: true,
      correoEnviado: true,
    });
  });

  it('PRUEBA sin fecha dura plat.suscripcion.dias_prueba desde hoy en Lima', async () => {
    const e = escenario();
    let suscripcion: unknown;
    e.dependencias.gestionarSuscripcion = { ejecutar: async (c) => ((suscripcion = c), { suscripcionId: 's-1', nueva: true }) };

    await new AltaTenant(e.dependencias).ejecutar(comando());

    expect(suscripcion).toMatchObject({ tenantId: NUEVO, productoCodigo: 'REST', plan: 'BASICO', estado: 'PRUEBA', vigenteHasta: '2026-11-09' });
  });

  it('ACTIVO usa la fecha del comando y crea la suscripción ACTIVA', async () => {
    const e = escenario();
    let suscripcion: unknown;
    e.dependencias.gestionarSuscripcion = { ejecutar: async (c) => ((suscripcion = c), { suscripcionId: 's-1', nueva: true }) };

    const alta = await new AltaTenant(e.dependencias).ejecutar(comando({ modalidad: 'ACTIVO', vigenteHasta: '2027-10-31' }));

    expect(alta).toMatchObject({ estado: 'ACTIVO', vigenteHasta: '2027-10-31' });
    expect(suscripcion).toMatchObject({ estado: 'ACTIVA', vigenteHasta: '2027-10-31' });
  });

  it.each([
    ['sin fecha', undefined],
    ['con fecha de hoy', '2026-10-25'],
  ])('ACTIVO %s falla antes de llamar a Supabase', async (_caso, vigenteHasta) => {
    const e = escenario();
    await expect(new AltaTenant(e.dependencias).ejecutar(comando({ modalidad: 'ACTIVO', vigenteHasta }))).rejects.toThrow(ValidationError);
    expect(e.pasos).toEqual([]);
  });

  it('TR-CA-002: un código ocupado da TenantDuplicadoError sin llamar a Supabase ni escribir', async () => {
    const e = escenario();
    await expect(new AltaTenant(e.dependencias).ejecutar(comando({ codigo: 'polleria-dona-rosa' }))).rejects.toThrow('El código de tenant ya existe');
    await expect(new AltaTenant(e.dependencias).ejecutar(comando({ codigo: 'polleria-dona-rosa' }))).rejects.toThrow(TenantDuplicadoError);
    expect(e.pasos).toEqual([]);
  });

  it('TR-CA-003: RUC 20601234560 da «RUC inválido» sin llamar a Supabase', async () => {
    const e = escenario();
    await expect(new AltaTenant(e.dependencias).ejecutar(comando({ ruc: '20601234560' }))).rejects.toThrow(RucInvalidoError);
    await expect(new AltaTenant(e.dependencias).ejecutar(comando({ ruc: '20601234560' }))).rejects.toThrow('RUC inválido');
    expect(e.pasos).toEqual([]);
  });

  it('un actor de un tenant cliente recibe OperadorRequeridoError aunque tenga el permiso', async () => {
    const e = escenario();
    await expect(new AltaTenant(e.dependencias).ejecutar(comando({ actor: { usuarioId: ADMIN, tenantId: CLIENTE } }))).rejects.toThrow(OperadorRequeridoError);
    expect(e.pasos).toEqual([]);
  });

  it('un código con formato inválido falla sin llamar a Supabase', async () => {
    const e = escenario();
    await expect(new AltaTenant(e.dependencias).ejecutar(comando({ codigo: 'Polleria Rosa' }))).rejects.toThrow(ValidationError);
    expect(e.pasos).toEqual([]);
  });

  it('si Supabase no responde, no abre la transacción', async () => {
    const e = escenario();
    e.fallos.prepararIdentidad = new IdentidadNoDisponibleError('caído');
    await expect(new AltaTenant(e.dependencias).ejecutar(comando())).rejects.toThrow(IdentidadNoDisponibleError);
    expect(e.pasos.map((p) => p.paso)).toEqual(['prepararIdentidad']);
  });

  it('si falla la siembra de series no se registra el propietario ni se notifica', async () => {
    const e = escenario();
    e.fallos.sembrarSeries = new Error('seq caído');
    await expect(new AltaTenant(e.dependencias).ejecutar(comando())).rejects.toThrow('seq caído');
    expect(e.pasos.map((p) => p.paso)).toEqual(['prepararIdentidad', 'crearTenant', 'gestionarSuscripcion', 'registrarEmpresa', 'sembrarSeries']);
  });

  it('una carrera por el mismo código en el INSERT se traduce a TenantDuplicadoError', async () => {
    const e = escenario();
    e.fallos.crearTenant = new ConflictError('El código de tenant ya existe');
    await expect(new AltaTenant(e.dependencias).ejecutar(comando())).rejects.toThrow(TenantDuplicadoError);
  });

  it('correo existente: devuelve usuarioNuevo false y lo que diga notificar', async () => {
    const e = escenario();
    e.identidad.usuarioNuevo = false;
    e.dependencias.invitarPropietario.notificar = async () => ({ correoEnviado: false });

    await expect(new AltaTenant(e.dependencias).ejecutar(comando())).resolves.toMatchObject({ usuarioNuevo: false, correoEnviado: false });
  });
});
