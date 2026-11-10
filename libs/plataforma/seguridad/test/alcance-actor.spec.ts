import { NotFoundError } from '@vitrina/plataforma/kernel';
import { AlcanceActorSeg, type ReposAlcanceActor } from '../src/application/alcance-actor.js';
import type { MembresiaLeida } from '../src/application/ports/repositorios.js';
import type { Alcance, Ambito } from '../src/domain/alcance.js';
import { Asignacion } from '../src/domain/asignacion.js';
import { Perfil } from '../src/domain/perfil.js';
import { Rol } from '../src/domain/rol.js';

const TENANT = '0193f3a0-0000-7000-8000-000000000001';
const EMPRESA_LIMA = '0193f3a0-0000-7000-8000-000000000011';
const EMPRESA_AREQUIPA = '0193f3a0-0000-7000-8000-000000000012';
const JOCKEY = '0193f3a0-0000-7000-8000-000000000101';
const MIRAFLORES = '0193f3a0-0000-7000-8000-000000000102';
const CAYMA = '0193f3a0-0000-7000-8000-000000000201';
const ANA = '0193f3a0-0000-7000-8000-000000000901';
const MEMBRESIA_ANA = '0193f3a0-0000-7000-8000-000000000301';
const AHORA = new Date('2026-10-24T15:00:00Z');
const CONSULTAR_AUDITORIA = 'plat.auditoria.consultar';
const ROL_AUDITOR = '0193f3a0-0000-7000-8000-000000000501';
const ROL_CAJERO = '0193f3a0-0000-7000-8000-000000000502';
const ROL_AUDITOR_INACTIVO = '0193f3a0-0000-7000-8000-000000000503';
const PERFIL_CONTROL = '0193f3a0-0000-7000-8000-000000000601';

function rol(id: string, permisos: string[], activo = true): Rol {
  return Rol.reconstituir(id, 1, { tenantId: TENANT, productoCodigo: 'PLAT', codigo: id, nombre: 'Rol de prueba', activo, obsoleto: false, permisos });
}

const ROLES = new Map([
  [ROL_AUDITOR, rol(ROL_AUDITOR, [CONSULTAR_AUDITORIA, 'plat.sesion.contexto'])],
  [ROL_CAJERO, rol(ROL_CAJERO, ['rest.caja.cerrar'])],
  [ROL_AUDITOR_INACTIVO, rol(ROL_AUDITOR_INACTIVO, [CONSULTAR_AUDITORIA], false)],
]);
const PERFILES = new Map([[PERFIL_CONTROL, Perfil.reconstituir(PERFIL_CONTROL, 1, { tenantId: TENANT, codigo: 'CONTROL', nombre: 'Control interno', roles: [ROL_CAJERO, ROL_AUDITOR] })]]);

interface OpcionesAsignacion {
  destino?: { rolId: string } | { perfilId: string };
  vigencia?: { desde: string; hasta: string | null };
}

/** Sucursal → empresa del tenant de prueba; cualquier otra no existe (otro tenant). */
const EMPRESA_DE_SUCURSAL: Record<string, string> = { [JOCKEY]: EMPRESA_LIMA, [MIRAFLORES]: EMPRESA_LIMA, [CAYMA]: EMPRESA_AREQUIPA };

function asignacionDeAna(alcance: Alcance, empresaId: string | null, sucursalId: string | null, opciones: OpcionesAsignacion = {}): Asignacion {
  const destino = opciones.destino ?? { rolId: ROL_AUDITOR };
  const vigencia = opciones.vigencia ?? { desde: '2026-10-01', hasta: null };
  return Asignacion.reconstituir('0193f3a0-0000-7000-8000-000000000401', 1, {
    tenantId: TENANT,
    membresiaId: MEMBRESIA_ANA,
    rolId: 'rolId' in destino ? destino.rolId : null,
    perfilId: 'perfilId' in destino ? destino.perfilId : null,
    alcance,
    empresaId,
    sucursalId,
    unidadId: null,
    vigenteDesde: vigencia.desde,
    vigenteHasta: vigencia.hasta,
    otorgadoPor: null,
  });
}

const vigenteEn = (asignacion: Asignacion, hoy: string) =>
  asignacion.vigenteDesde <= hoy && (asignacion.vigenteHasta === null || asignacion.vigenteHasta >= hoy);

function repositoriosCon(membresia: Partial<MembresiaLeida> | null, asignaciones: Asignacion[]): ReposAlcanceActor {
  return {
    membresias: {
      buscar: async () => null,
      deUsuario: async () =>
        membresia && { id: MEMBRESIA_ANA, usuarioId: ANA, estado: 'ACTIVO', esPropietario: false, ultimaSucursalId: null, ...membresia },
    },
    asignaciones: {
      buscar: async () => null,
      guardar: async () => undefined,
      vigentesDe: async (_membresiaId, hoy) => asignaciones.filter((asignacion) => vigenteEn(asignacion, hoy)),
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
    roles: { buscarVarios: async (ids) => ids.flatMap((id) => ROLES.get(id) ?? []) },
    perfiles: { buscar: async (id) => PERFILES.get(id) ?? null },
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

describe('AlcanceActorSeg.alcanzaTenant (spec 20b)', () => {
  const alcanza = (membresia: Partial<MembresiaLeida> | null, asignaciones: Asignacion[]) =>
    new AlcanceActorSeg(repositoriosCon(membresia, asignaciones)).alcanzaTenant(ANA, CONSULTAR_AUDITORIA, AHORA);

  it('el propietario alcanza el tenant sin asignaciones', async () => {
    expect(await alcanza({ esPropietario: true }, [])).toBe(true);
  });

  it('una asignación TENANT con un rol que incluye el permiso alcanza el tenant', async () => {
    expect(await alcanza({}, [asignacionDeAna('TENANT', null, null)])).toBe(true);
  });

  it('una asignación TENANT con un perfil que incluye el permiso alcanza el tenant', async () => {
    expect(await alcanza({}, [asignacionDeAna('TENANT', null, null, { destino: { perfilId: PERFIL_CONTROL } })])).toBe(true);
  });

  it('una asignación SUCURSAL con el permiso no alcanza el tenant', async () => {
    expect(await alcanza({}, [asignacionDeAna('SUCURSAL', null, JOCKEY)])).toBe(false);
  });

  it('una asignación TENANT sin el permiso, o con el rol inactivo, no alcanza el tenant', async () => {
    expect(await alcanza({}, [asignacionDeAna('TENANT', null, null, { destino: { rolId: ROL_CAJERO } })])).toBe(false);
    expect(await alcanza({}, [asignacionDeAna('TENANT', null, null, { destino: { rolId: ROL_AUDITOR_INACTIVO } })])).toBe(false);
  });

  it('una asignación TENANT vencida no cuenta', async () => {
    expect(await alcanza({}, [asignacionDeAna('TENANT', null, null, { vigencia: { desde: '2026-09-01', hasta: '2026-09-30' } })])).toBe(false);
  });

  it('sin membresía ACTIVO no alcanza el tenant, ni siendo propietario', async () => {
    expect(await alcanza({ estado: 'SUSPENDIDO', esPropietario: true }, [])).toBe(false);
    expect(await alcanza(null, [])).toBe(false);
  });
});
