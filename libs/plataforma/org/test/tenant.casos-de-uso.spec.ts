import { ConflictError, ValidationError } from '@vitrina/plataforma/kernel';
import { CrearTenant } from '../src/application/crear-tenant.js';
import { RegistrarEmpresa } from '../src/application/empresa.casos-de-uso.js';
import type { UsoUsuariosPort } from '../src/application/ports/uso-usuarios.port.js';
import { CambiarEstadoTenant, GestionarSuscripcion, type GestionarSuscripcionComando } from '../src/application/tenant.casos-de-uso.js';
import { PadronRucNulo } from '../src/infrastructure/padron-ruc.nulo.js';
import { UsoUsuariosProvisional } from '../src/infrastructure/uso-usuarios.provisional.js';
import { crearEntorno, type Entorno } from './support/entorno.js';

const AHORA = new Date('2026-11-20T15:00:00Z');

describe('Suscripción y estado del tenant (PostgreSQL 16)', () => {
  let e: Entorno;
  let cambiarEstado: CambiarEstadoTenant;
  const gestionar = (uso: UsoUsuariosPort = new UsoUsuariosProvisional()) => new GestionarSuscripcion(e.uow, e.contexto, e.ids, e.eventos, e.repos, uso);

  beforeAll(async () => {
    e = await crearEntorno();
    cambiarEstado = new CambiarEstadoTenant(e.uow, e.contexto, e.ids, { now: () => AHORA }, e.eventos, e.repos.tenants);
  });

  afterAll(() => e?.cerrar());

  const nuevoTenant = async (codigo: string, estado: 'PRUEBA' | 'ACTIVO' = 'ACTIVO') =>
    (await new CrearTenant(e.uow, e.contexto, e.ids, e.eventos, e.repos.tenants).ejecutar({ codigo, nombre: `Tenant ${codigo}`, estado })).tenantId;
  const comando = (tenantId: string, cambios: Partial<GestionarSuscripcionComando> = {}): GestionarSuscripcionComando => ({
    tenantId,
    productoCodigo: 'CLI',
    edicion: null,
    plan: 'BASICO',
    estado: 'ACTIVA',
    limiteSucursales: null,
    limiteUsuarios: null,
    vigenteHasta: null,
    ...cambios,
  });
  const suscripcion = (tenantId: string, producto: string) =>
    e.dataSource.query('SELECT plan, estado, limite_sucursales, limite_usuarios FROM org.suscripcion WHERE tenant_id = $1 AND producto_codigo = $2', [tenantId, producto]).then((f) => f[0]);
  const tenant = (id: string) => e.dataSource.query('SELECT estado, estado_motivo, baja_en FROM org.tenant WHERE id = $1', [id]).then((f) => f[0]);
  const historial = (id: string) =>
    e.dataSource.query('SELECT estado_anterior, estado_nuevo, motivo, fecha_efectiva FROM org.tenant_estado_historial WHERE tenant_id = $1 ORDER BY registrado_en', [id]);

  describe('GestionarSuscripcion (TR-RF-005)', () => {
    it('TR-CA-013: CLI pasa de BASICO a PRO con 5 sucursales', async () => {
      const tenantId = await nuevoTenant('clinica-san-pablo');
      const { suscripcionId, nueva } = await gestionar().ejecutar(comando(tenantId));
      expect(nueva).toBe(true);

      await expect(gestionar().ejecutar(comando(tenantId, { plan: 'PRO', limiteSucursales: 5 }))).resolves.toEqual({ suscripcionId, nueva: false });
      expect(await suscripcion(tenantId, 'CLI')).toMatchObject({ plan: 'PRO', limite_sucursales: 5 });
      expect(await e.eventosDe(suscripcionId)).toEqual(['suscripcion.cambiada', 'suscripcion.cambiada']);
    });

    it('TR-CA-014 (puerto falso): con 12 usuarios activos en GYM no se fija limite_usuarios = 10', async () => {
      const tenantId = await nuevoTenant('gym-usuarios');
      const doce: UsoUsuariosPort = { activos: async () => 12 };
      await gestionar(doce).ejecutar(comando(tenantId, { productoCodigo: 'GYM' }));

      await expect(gestionar(doce).ejecutar(comando(tenantId, { productoCodigo: 'GYM', limiteUsuarios: 10 }))).rejects.toThrow(
        new ValidationError('Hay 12 usuarios activos; el límite no puede ser menor'),
      );
      expect(await suscripcion(tenantId, 'GYM')).toMatchObject({ limite_usuarios: null });
    });

    it('un límite de sucursales menor que las activas del tenant se rechaza', async () => {
      const tenantId = await nuevoTenant('limite-menor');
      const registrar = new RegistrarEmpresa(e.uow, e.contexto, e.ids, e.eventos, e.repos, new PadronRucNulo());
      for (const ruc of ['20512345671', '20601234565']) {
        await e.en(tenantId, () => registrar.ejecutar({ ruc, razonSocial: 'Empresa SAC', nombreComercial: null, direccionFiscal: null, ubigeo: null }));
      }
      await expect(gestionar().ejecutar(comando(tenantId, { limiteSucursales: 1 }))).rejects.toThrow(
        new ValidationError('Hay 2 sucursales activas; el límite no puede ser menor'),
      );
      await expect(gestionar().ejecutar(comando(tenantId, { limiteSucursales: 2 }))).resolves.toBeDefined();
    });

    it('TR-CA-015 (parte org): agregar DOC crea la suscripción y publica suscripcion.cambiada con nueva = true', async () => {
      const tenantId = await nuevoTenant('estudio-quispe');
      await gestionar().ejecutar(comando(tenantId, { productoCodigo: 'LEX' }));
      const { suscripcionId } = await gestionar().ejecutar(comando(tenantId, { productoCodigo: 'DOC' }));

      const [{ payload }] = await e.dataSource.query('SELECT payload FROM sync.outbox WHERE aggregate_id = $1', [suscripcionId]);
      expect(payload).toMatchObject({ producto_codigo: 'DOC', plan: 'BASICO', nueva: true });
    });

    it('VENCIDA no se asigna a mano', async () => {
      const tenantId = await nuevoTenant('vencida-a-mano');
      await gestionar().ejecutar(comando(tenantId));
      await expect(gestionar().ejecutar(comando(tenantId, { estado: 'VENCIDA' }))).rejects.toThrow(ValidationError);
    });

    it('falla si el tenant está en BAJA', async () => {
      const tenantId = await nuevoTenant('suscripcion-en-baja');
      await cambiarEstado.ejecutar({ tenantId, estadoNuevo: 'BAJA', motivo: 'Cliente cerró el negocio' });
      await expect(gestionar().ejecutar(comando(tenantId))).rejects.toThrow(new ConflictError('El tenant está dado de baja'));
    });
  });

  describe('CambiarEstadoTenant (TR-RF-006)', () => {
    it('TR-CA-016 (parte org): ACTIVO → SUSPENDIDO queda con motivo, historial y tenant.suspendido', async () => {
      const tenantId = await nuevoTenant('gym-fuerza-total');
      const actorId = e.ids.next();

      await expect(cambiarEstado.ejecutar({ tenantId, estadoNuevo: 'SUSPENDIDO', motivo: 'Deuda de 60 días', actorId })).resolves.toEqual({ cambiado: true });

      expect(await tenant(tenantId)).toMatchObject({ estado: 'SUSPENDIDO', estado_motivo: 'Deuda de 60 días', baja_en: null });
      expect(await historial(tenantId)).toEqual([{ estado_anterior: 'ACTIVO', estado_nuevo: 'SUSPENDIDO', motivo: 'Deuda de 60 días', fecha_efectiva: AHORA }]);
      const [{ actor_id }] = await e.dataSource.query('SELECT actor_id FROM org.tenant_estado_historial WHERE tenant_id = $1', [tenantId]);
      expect(actor_id).toBe(actorId);
      expect(await e.eventosDe(tenantId)).toEqual(['tenant.creado', 'tenant.suspendido']);
    });

    it('TR-CA-017: BAJA → ACTIVO se rechaza con el mensaje del SRS', async () => {
      const tenantId = await nuevoTenant('tenant-de-baja');
      await cambiarEstado.ejecutar({ tenantId, estadoNuevo: 'BAJA', motivo: 'Cliente cerró el negocio' });

      await expect(cambiarEstado.ejecutar({ tenantId, estadoNuevo: 'ACTIVO', motivo: 'Quiere volver a operar' })).rejects.toThrow(
        new ConflictError('Un tenant dado de baja no puede reactivarse; cree uno nuevo o restaure desde respaldo'),
      );
      expect(await tenant(tenantId)).toMatchObject({ estado: 'BAJA', baja_en: AHORA });
      expect(await historial(tenantId)).toHaveLength(1);
    });

    it('TR-CA-018: SUSPENDIDO sin motivo se rechaza y el estado no cambia', async () => {
      const tenantId = await nuevoTenant('sin-motivo');
      for (const motivo of ['', 'Deuda']) {
        await expect(cambiarEstado.ejecutar({ tenantId, estadoNuevo: 'SUSPENDIDO', motivo })).rejects.toThrow(ValidationError);
      }
      expect(await tenant(tenantId)).toMatchObject({ estado: 'ACTIVO' });
      expect(await historial(tenantId)).toEqual([]);
      expect(await e.eventosDe(tenantId)).toEqual(['tenant.creado']);
    });

    it('PRUEBA → ACTIVO publica tenant.reactivado y respeta la fecha efectiva del comando', async () => {
      const tenantId = await nuevoTenant('conversion', 'PRUEBA');
      const fecha = new Date('2026-12-01T05:00:00Z');
      await cambiarEstado.ejecutar({ tenantId, estadoNuevo: 'ACTIVO', motivo: 'Pago del primer mes recibido', fechaEfectiva: fecha });

      expect(await historial(tenantId)).toEqual([{ estado_anterior: 'PRUEBA', estado_nuevo: 'ACTIVO', motivo: 'Pago del primer mes recibido', fecha_efectiva: fecha }]);
      expect(await e.eventosDe(tenantId)).toEqual(['tenant.creado', 'tenant.reactivado']);
    });

    it('repetir el cambio al estado actual no deja historial ni evento (TR-RNF-008)', async () => {
      const tenantId = await nuevoTenant('reintento');
      await cambiarEstado.ejecutar({ tenantId, estadoNuevo: 'SUSPENDIDO', motivo: 'Deuda de 60 días' });
      await expect(cambiarEstado.ejecutar({ tenantId, estadoNuevo: 'SUSPENDIDO', motivo: 'Deuda de 60 días' })).resolves.toEqual({ cambiado: false });

      expect(await historial(tenantId)).toHaveLength(1);
      expect(await e.eventosDe(tenantId)).toEqual(['tenant.creado', 'tenant.suspendido']);
    });
  });
});
