import type { Clock, TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import { contextoDeSoporte } from '../src/application/contexto-soporte.js';
import type { AccesoDelAgente, SesionSoporte } from '../src/application/ports/lectura-soporte.js';
import type { OpcionMenu } from '../src/application/ports/permisos.port.js';
import { ResolverAccesoSoporteVigente } from '../src/application/resolver-acceso-soporte.js';
import { EntrarComoSoporte, SalirDeSoporte, type DependenciasSesionSoporte } from '../src/application/sesion-soporte.js';
import { SoporteNoEncontradoError, SoporteNoVigenteError } from '../src/domain/errores.js';

const AHORA = new Date('2026-11-04T15:00:00Z');
const enHoras = (horas: number) => new Date(AHORA.getTime() + horas * 3_600_000);
const AGENTE = '0193f3a0-0000-7000-8000-000000000990';
const CLIENTE = '0193f3a0-0000-7000-8000-000000000001';
const OPERADOR = '0193f3a0-0000-7000-8000-000000000002';

const unidadDeTrabajo = { run: <T>(trabajo: () => Promise<T>) => trabajo() } as UnitOfWork;
const contexto = { run: <T>(_valor: unknown, trabajo: () => T) => trabajo() } as unknown as TenantContext;
const relojEn = (instante: { valor: Date }): Clock => ({ now: () => instante.valor });

const opcion = (codigo: string, padre: string | null, ruta: string | null): OpcionMenu => ({ codigo, padre, nombre: codigo, ruta, icono: null, orden: 1 });

describe('contextoDeSoporte: lo que no ve el agente', () => {
  const menu = [
    opcion('plat.seguridad', null, null),
    opcion('plat.seguridad.usuarios', 'plat.seguridad', '/admin/usuarios'),
    opcion('plat.seguridad.bitacora', 'plat.seguridad', '/admin/bitacora'),
    opcion('plat.configuracion', null, null),
    opcion('plat.configuracion.roles', 'plat.configuracion', '/admin/roles'),
  ];
  const permisosPorOpcion = new Map([
    ['plat.seguridad', []],
    ['plat.seguridad.usuarios', ['plat.usuario.invitar']],
    ['plat.seguridad.bitacora', ['plat.seguridad.bitacora']],
    ['plat.configuracion', []],
    ['plat.configuracion.roles', ['plat.rol.gestionar']],
  ]);

  it('quita los permisos vetados, sus opciones y las agrupadoras que quedan vacías', () => {
    const resultado = contextoDeSoporte(
      { permisos: ['plat.rol.gestionar', 'plat.seguridad.bitacora', 'plat.usuario.invitar', 'rest.caja.ver'], menu },
      permisosPorOpcion,
    );
    expect(resultado.permisos).toEqual(['plat.seguridad.bitacora', 'rest.caja.ver']);
    expect(resultado.menu.map((item) => item.codigo)).toEqual(['plat.seguridad', 'plat.seguridad.bitacora']);
  });

  it('una opción que también muestra un permiso no vetado se queda', () => {
    const conDosPermisos = new Map(permisosPorOpcion).set('plat.seguridad.usuarios', ['plat.usuario.invitar', 'plat.seguridad.bitacora']);
    const resultado = contextoDeSoporte({ permisos: ['plat.seguridad.bitacora', 'plat.usuario.invitar'], menu }, conDosPermisos);
    expect(resultado.menu.map((item) => item.codigo)).toContain('plat.seguridad.usuarios');
  });
});

describe('ResolverAccesoSoporteVigente', () => {
  const sesion: SesionSoporte = { accesoId: 'a1', ticket: 'SOP-000245', modo: 'LECTURA', hasta: enHoras(2) };

  function armar() {
    const instante = { valor: AHORA };
    const estado = { vt: 1, consultas: 0, sesion: sesion as SesionSoporte | null };
    const resolver = new ResolverAccesoSoporteVigente({
      unidadDeTrabajo,
      contexto,
      reloj: relojEn(instante),
      versiones: { versiones: async () => ({ vt: estado.vt, vc: 1 }) },
      lectura: {
        vigenteDe: async () => {
          estado.consultas += 1;
          return estado.sesion;
        },
      },
    });
    return { resolver, instante, estado };
  }

  it('lee una vez y responde desde la caché con la misma versión de seguridad', async () => {
    const { resolver, estado } = armar();
    expect(await resolver.ejecutar(AGENTE, CLIENTE)).toEqual(sesion);
    expect(await resolver.ejecutar(AGENTE, CLIENTE)).toEqual(sesion);
    expect(estado.consultas).toBe(1);
  });

  it('al subir vt (aprobar, revocar, vencer) vuelve a leer', async () => {
    const { resolver, estado } = armar();
    await resolver.ejecutar(AGENTE, CLIENTE);
    estado.vt = 2;
    estado.sesion = null;
    expect(await resolver.ejecutar(AGENTE, CLIENTE)).toBeNull();
    expect(estado.consultas).toBe(2);
  });

  it('corta exacto en hasta aunque la entrada siga en caché', async () => {
    const { resolver, instante, estado } = armar();
    const porVencer = { ...sesion, hasta: new Date(AHORA.getTime() + 30_000) };
    estado.sesion = porVencer;
    await resolver.ejecutar(AGENTE, CLIENTE);
    instante.valor = new Date(porVencer.hasta.getTime() - 1);
    expect(await resolver.ejecutar(AGENTE, CLIENTE)).toEqual(porVencer);
    instante.valor = porVencer.hasta;
    expect(await resolver.ejecutar(AGENTE, CLIENTE)).toBeNull();
    expect(estado.consultas).toBe(1);
  });

  it('pasado el TTL de 60 s vuelve a leer, y la ausencia también se cachea', async () => {
    const { resolver, instante, estado } = armar();
    estado.sesion = null;
    await resolver.ejecutar(AGENTE, CLIENTE);
    await resolver.ejecutar(AGENTE, CLIENTE);
    expect(estado.consultas).toBe(1);
    instante.valor = new Date(AHORA.getTime() + 60_000);
    await resolver.ejecutar(AGENTE, CLIENTE);
    expect(estado.consultas).toBe(2);
  });
});

describe('EntrarComoSoporte y SalirDeSoporte', () => {
  const acceso = (cambios: Partial<AccesoDelAgente> = {}): AccesoDelAgente => ({
    id: 'a1',
    tenantId: CLIENTE,
    tenantNombre: 'Sabores del Sur',
    ticket: 'SOP-000245',
    modo: 'LECTURA',
    estado: 'APROBADO',
    horasSolicitadas: 2,
    solicitadoEn: AHORA,
    desde: AHORA,
    hasta: enHoras(2),
    motivoCierre: null,
    causaCierre: null,
    ...cambios,
  });

  function armar(accesos: AccesoDelAgente[]) {
    const preferidos: [string, string][] = [];
    const dependencias: DependenciasSesionSoporte = {
      unidadDeTrabajo,
      contexto,
      reloj: relojEn({ valor: AHORA }),
      lectura: { deAgente: async () => accesos },
      usuarios: { fijarTenantPreferido: async (usuarioId, tenantId) => void preferidos.push([usuarioId, tenantId]) },
      tenants: { idDelCodigo: async (codigo) => (codigo === 'plataforma' ? OPERADOR : null) },
      tenantOperador: 'plataforma',
    };
    return { dependencias, preferidos };
  }

  it('entrar fija el tenant del cliente como preferido y devuelve hasta', async () => {
    const { dependencias, preferidos } = armar([acceso()]);
    expect(await new EntrarComoSoporte(dependencias).ejecutar('a1', AGENTE, OPERADOR)).toEqual({ tenantId: CLIENTE, hasta: enHoras(2) });
    expect(preferidos).toEqual([[AGENTE, CLIENTE]]);
  });

  it('un acceso que no es del agente da SoporteNoEncontradoError', async () => {
    const { dependencias } = armar([acceso()]);
    await expect(new EntrarComoSoporte(dependencias).ejecutar('otro', AGENTE, OPERADOR)).rejects.toThrow(SoporteNoEncontradoError);
  });

  it.each([
    ['pendiente', { estado: 'PENDIENTE' as const, desde: null, hasta: null }],
    ['revocado', { estado: 'REVOCADO' as const }],
    ['aprobado vencido', { hasta: AHORA }],
  ])('un acceso %s da SoporteNoVigenteError y no cambia el preferido', async (_caso, cambios) => {
    const { dependencias, preferidos } = armar([acceso(cambios)]);
    await expect(new EntrarComoSoporte(dependencias).ejecutar('a1', AGENTE, OPERADOR)).rejects.toThrow(SoporteNoVigenteError);
    expect(preferidos).toEqual([]);
  });

  it('salir devuelve el preferido al tenant operador', async () => {
    const { dependencias, preferidos } = armar([]);
    await new SalirDeSoporte(dependencias).ejecutar(AGENTE, CLIENTE);
    await new SalirDeSoporte(dependencias).ejecutar(AGENTE, CLIENTE);
    expect(preferidos).toEqual([
      [AGENTE, OPERADOR],
      [AGENTE, OPERADOR],
    ]);
  });
});
