import { NotFoundError } from '@vitrina/plataforma/kernel';
import { AlcanceActorSeg, type ReposAlcance } from '../src/application/alcance-actor.js';
import type { MembresiaLeida } from '../src/application/ports/repositorios.js';
import type { Alcance, Ambito } from '../src/domain/alcance.js';
import { Asignacion } from '../src/domain/asignacion.js';

const TENANT = '0193f3a0-0000-7000-8000-000000000001';
const EMPRESA_LIMA = '0193f3a0-0000-7000-8000-000000000011';
const EMPRESA_AREQUIPA = '0193f3a0-0000-7000-8000-000000000012';
const JOCKEY = '0193f3a0-0000-7000-8000-000000000101';
const MIRAFLORES = '0193f3a0-0000-7000-8000-000000000102';
const CAYMA = '0193f3a0-0000-7000-8000-000000000201';
const ANA = '0193f3a0-0000-7000-8000-000000000901';
const MEMBRESIA_ANA = '0193f3a0-0000-7000-8000-000000000301';
const AHORA = new Date('2026-10-24T15:00:00Z');

/** Sucursal → empresa del tenant de prueba; cualquier otra no existe (otro tenant). */
const EMPRESA_DE_SUCURSAL: Record<string, string> = { [JOCKEY]: EMPRESA_LIMA, [MIRAFLORES]: EMPRESA_LIMA, [CAYMA]: EMPRESA_AREQUIPA };

function asignacionDeAna(alcance: Alcance, empresaId: string | null, sucursalId: string | null): Asignacion {
  return Asignacion.reconstituir('0193f3a0-0000-7000-8000-000000000401', 1, {
    tenantId: TENANT,
    membresiaId: MEMBRESIA_ANA,
    rolId: '0193f3a0-0000-7000-8000-000000000501',
    perfilId: null,
    alcance,
    empresaId,
    sucursalId,
    unidadId: null,
    vigenteDesde: '2026-10-01',
    vigenteHasta: null,
    otorgadoPor: null,
  });
}

function repositoriosCon(membresia: Partial<MembresiaLeida> | null, asignaciones: Asignacion[]): ReposAlcance {
  return {
    membresias: {
      buscar: async () => null,
      deUsuario: async () =>
        membresia && { id: MEMBRESIA_ANA, usuarioId: ANA, estado: 'ACTIVO', esPropietario: false, ultimaSucursalId: null, ...membresia },
    },
    asignaciones: {
      buscar: async () => null,
      guardar: async () => undefined,
      vigentesDe: async () => asignaciones,
      noRevocadasDe: async () => asignaciones,
    },
    ubicaciones: {
      resolver: async (ambito: Ambito): Promise<Ambito> => {
        if (ambito.alcance !== 'SUCURSAL') return ambito;
        const empresaId = EMPRESA_DE_SUCURSAL[ambito.sucursalId ?? ''];
        if (!empresaId) throw new NotFoundError('La sucursal no existe');
        return { ...ambito, empresaId };
      },
    },
  };
}

const tenant = { alcance: 'TENANT', empresaId: null, sucursalId: null } as const;
const empresa = (empresaId: string) => ({ alcance: 'EMPRESA', empresaId, sucursalId: null }) as const;
const sucursal = (sucursalId: string) => ({ alcance: 'SUCURSAL', empresaId: null, sucursalId }) as const;

describe('AlcanceActorSeg (spec 09, TR-RN-007)', () => {
  it('el propietario cubre cualquier nivel aunque no tenga asignaciones', async () => {
    const alcanceActor = new AlcanceActorSeg(repositoriosCon({ esPropietario: true }, []));
    expect(await alcanceActor.cubre(ANA, tenant, AHORA)).toBe(true);
    expect(await alcanceActor.cubre(ANA, sucursal(CAYMA), AHORA)).toBe(true);
  });

  it('alcance TENANT cubre tenant, empresas y sucursales', async () => {
    const alcanceActor = new AlcanceActorSeg(repositoriosCon({}, [asignacionDeAna('TENANT', null, null)]));
    for (const destino of [tenant, empresa(EMPRESA_AREQUIPA), sucursal(JOCKEY)]) expect(await alcanceActor.cubre(ANA, destino, AHORA)).toBe(true);
  });

  it('alcance EMPRESA cubre su empresa y sus sucursales, no otra empresa ni el tenant', async () => {
    const alcanceActor = new AlcanceActorSeg(repositoriosCon({}, [asignacionDeAna('EMPRESA', EMPRESA_LIMA, null)]));
    expect(await alcanceActor.cubre(ANA, empresa(EMPRESA_LIMA), AHORA)).toBe(true);
    expect(await alcanceActor.cubre(ANA, sucursal(JOCKEY), AHORA)).toBe(true);
    expect(await alcanceActor.cubre(ANA, sucursal(CAYMA), AHORA)).toBe(false);
    expect(await alcanceActor.cubre(ANA, empresa(EMPRESA_AREQUIPA), AHORA)).toBe(false);
    expect(await alcanceActor.cubre(ANA, tenant, AHORA)).toBe(false);
  });

  it('alcance SUCURSAL cubre solo esa sucursal', async () => {
    const alcanceActor = new AlcanceActorSeg(repositoriosCon({}, [asignacionDeAna('SUCURSAL', null, JOCKEY)]));
    expect(await alcanceActor.cubre(ANA, sucursal(JOCKEY), AHORA)).toBe(true);
    expect(await alcanceActor.cubre(ANA, sucursal(MIRAFLORES), AHORA)).toBe(false);
    expect(await alcanceActor.cubre(ANA, empresa(EMPRESA_LIMA), AHORA)).toBe(false);
    expect(await alcanceActor.cubre(ANA, tenant, AHORA)).toBe(false);
  });

  it('sin membresía ACTIVO no cubre nada, ni siendo propietario', async () => {
    expect(await new AlcanceActorSeg(repositoriosCon({ estado: 'SUSPENDIDO', esPropietario: true }, [])).cubre(ANA, tenant, AHORA)).toBe(false);
    expect(await new AlcanceActorSeg(repositoriosCon(null, [])).cubre(ANA, tenant, AHORA)).toBe(false);
  });

  it('una sucursal de otro tenant da NotFoundError', async () => {
    const alcanceActor = new AlcanceActorSeg(repositoriosCon({}, [asignacionDeAna('TENANT', null, null)]));
    await expect(alcanceActor.cubre(ANA, sucursal('0193f3a0-0000-7000-8000-0000000009ff'), AHORA)).rejects.toThrow(NotFoundError);
  });
});
