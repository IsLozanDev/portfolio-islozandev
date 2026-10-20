import { ConflictError, NotFoundError, ValidationError } from '@vitrina/plataforma/kernel';
import { CrearTenant } from '../src/application/crear-tenant.js';
import { EditarEmpresa, RegistrarEmpresa, type RegistrarEmpresaComando } from '../src/application/empresa.casos-de-uso.js';
import type { PadronRucPort } from '../src/application/ports/padron-ruc.port.js';
import { Suscripcion } from '../src/domain/suscripcion.js';
import { PadronRucNulo } from '../src/infrastructure/padron-ruc.nulo.js';
import { crearEntorno, type Entorno } from './support/entorno.js';

const COMANDO: RegistrarEmpresaComando = {
  ruc: '20512345671',
  razonSocial: 'Sabores del Sur SAC',
  nombreComercial: 'Sabores',
  direccionFiscal: 'Av. Ejército 101',
  ubigeo: '040101',
};

describe('Casos de uso de tenant y empresa (PostgreSQL 16)', () => {
  let e: Entorno;
  let crearTenant: CrearTenant;
  const registrar = (padron: PadronRucPort = new PadronRucNulo()) => new RegistrarEmpresa(e.uow, e.contexto, e.ids, e.eventos, e.repos, padron);

  beforeAll(async () => {
    e = await crearEntorno();
    crearTenant = new CrearTenant(e.uow, e.contexto, e.ids, e.eventos, e.repos.tenants);
  });

  afterAll(() => e?.cerrar());

  const nuevoTenant = async (codigo: string, estado: 'PRUEBA' | 'ACTIVO' = 'ACTIVO') => (await crearTenant.ejecutar({ codigo, nombre: `Tenant ${codigo}`, estado })).tenantId;
  const contar = async (tabla: string, tenantId: string) =>
    Number((await e.dataSource.query(`SELECT count(*) AS n FROM org.${tabla} WHERE tenant_id = $1`, [tenantId]))[0].n);

  describe('CrearTenant', () => {
    it('guarda el tenant y publica tenant.creado en el outbox de ese tenant', async () => {
      const tenantId = await nuevoTenant('polleria-dona-rosa', 'PRUEBA');

      const [fila] = await e.dataSource.query('SELECT codigo, estado, version FROM org.tenant WHERE id = $1', [tenantId]);
      expect(fila).toMatchObject({ codigo: 'polleria-dona-rosa', estado: 'PRUEBA' });
      expect(await e.eventosDe(tenantId)).toEqual(['tenant.creado']);
      const [{ tenant_id }] = await e.dataSource.query('SELECT tenant_id FROM sync.outbox WHERE aggregate_id = $1', [tenantId]);
      expect(tenant_id).toBe(tenantId);
    });

    it('un código repetido no deja filas ni eventos', async () => {
      await nuevoTenant('codigo-unico');
      await expect(nuevoTenant('codigo-unico')).rejects.toThrow(new ConflictError('El código de tenant ya existe'));
      const [{ n }] = await e.dataSource.query("SELECT count(*)::int AS n FROM org.tenant WHERE codigo = 'codigo-unico'");
      expect(n).toBe(1);
    });
  });

  describe('RegistrarEmpresa (TR-RF-002)', () => {
    it('TR-CA-004 (adaptado): empresa activa con su sucursal principal 0000 y ambos eventos en el outbox', async () => {
      const tenantId = await nuevoTenant('grupo-sabores');
      const { empresaId, sucursalPrincipalId } = await e.en(tenantId, () => registrar().ejecutar(COMANDO));

      const [empresa] = await e.dataSource.query('SELECT ruc, razon_social, activo FROM org.empresa WHERE id = $1', [empresaId]);
      expect(empresa).toEqual({ ruc: '20512345671', razon_social: 'Sabores del Sur SAC', activo: true });
      const [principal] = await e.dataSource.query('SELECT empresa_id, es_principal, codigo_establecimiento_sunat FROM org.sucursal WHERE id = $1', [
        sucursalPrincipalId,
      ]);
      expect(principal).toEqual({ empresa_id: empresaId, es_principal: true, codigo_establecimiento_sunat: '0000' });
      expect(await e.eventosDe(empresaId)).toEqual(['empresa.creada']);
      expect(await e.eventosDe(sucursalPrincipalId)).toEqual(['sucursal.creada']);
    });

    it('TR-CA-005: el mismo RUC en el mismo tenant se rechaza y no deja filas nuevas ni eventos', async () => {
      const tenantId = await nuevoTenant('ruc-duplicado');
      await e.en(tenantId, () => registrar().ejecutar(COMANDO));
      const eventosAntes = (await e.dataSource.query('SELECT count(*)::int AS n FROM sync.outbox WHERE tenant_id = $1', [tenantId]))[0].n;

      await expect(e.en(tenantId, () => registrar().ejecutar(COMANDO))).rejects.toThrow(
        new ConflictError('La empresa ya está registrada en este tenant'),
      );
      expect(await contar('empresa', tenantId)).toBe(1);
      expect(await contar('sucursal', tenantId)).toBe(1);
      const eventosDespues = (await e.dataSource.query('SELECT count(*)::int AS n FROM sync.outbox WHERE tenant_id = $1', [tenantId]))[0].n;
      expect(eventosDespues).toBe(eventosAntes);
    });

    it('el mismo RUC se registra en otro tenant', async () => {
      const a = await nuevoTenant('ruc-tenant-a');
      const b = await nuevoTenant('ruc-tenant-b');
      await e.en(a, () => registrar().ejecutar(COMANDO));
      await expect(e.en(b, () => registrar().ejecutar(COMANDO))).resolves.toHaveProperty('empresaId');
    });

    it('TR-CA-003: un RUC con dígito verificador inválido falla antes de abrir la transacción', async () => {
      const tenantId = await nuevoTenant('ruc-invalido');
      let abrioTransaccion = false;
      const uow = { run: <T>(work: () => Promise<T>) => ((abrioTransaccion = true), e.uow.run(work)) };
      const caso = new RegistrarEmpresa(uow, e.contexto, e.ids, e.eventos, e.repos, new PadronRucNulo());

      await expect(e.en(tenantId, () => caso.ejecutar({ ...COMANDO, ruc: '20601234560' }))).rejects.toThrow(new ValidationError('RUC inválido'));
      expect(abrioTransaccion).toBe(false);
    });

    it('sin datos del padrón la razón social es obligatoria', async () => {
      const tenantId = await nuevoTenant('sin-razon-social');
      await expect(e.en(tenantId, () => registrar().ejecutar({ ...COMANDO, razonSocial: null }))).rejects.toThrow(
        new ValidationError('La razón social es obligatoria'),
      );
    });

    it('con datos del padrón usa su razón social', async () => {
      const tenantId = await nuevoTenant('con-padron');
      const padron: PadronRucPort = { consultar: async () => ({ razonSocial: 'SABORES DEL SUR S.A.C.', estado: 'ACTIVO', condicion: 'HABIDO' }) };
      const { empresaId } = await e.en(tenantId, () => registrar(padron).ejecutar({ ...COMANDO, razonSocial: null }));
      const [{ razon_social }] = await e.dataSource.query('SELECT razon_social FROM org.empresa WHERE id = $1', [empresaId]);
      expect(razon_social).toBe('SABORES DEL SUR S.A.C.');
    });

    it('falla si el tenant está SUSPENDIDO', async () => {
      const tenantId = await nuevoTenant('tenant-suspendido');
      await e.en(tenantId, () =>
        e.uow.run(async () => {
          const tenant = await e.repos.tenants.buscar(tenantId);
          tenant?.cambiarEstado('SUSPENDIDO', 'Deuda de 60 días', new Date());
          if (tenant) await e.repos.tenants.guardar(tenant);
        }),
      );
      await expect(e.en(tenantId, () => registrar().ejecutar(COMANDO))).rejects.toThrow(ConflictError);
      expect(await contar('empresa', tenantId)).toBe(0);
    });

    it('la sucursal principal respeta el tope del plan', async () => {
      const tenantId = await nuevoTenant('tope-plan');
      await e.en(tenantId, () =>
        e.uow.run(() =>
          e.repos.suscripciones.guardar(
            Suscripcion.crear(e.ids.next(), tenantId, 'REST', { edicion: null, plan: 'BASICO', estado: 'ACTIVA', limiteSucursales: 1, limiteUsuarios: null, vigenteHasta: null }, { sucursalesActivas: 0, usuariosActivos: 0 }),
          ),
        ),
      );
      await e.en(tenantId, () => registrar().ejecutar(COMANDO));
      await expect(e.en(tenantId, () => registrar().ejecutar({ ...COMANDO, ruc: '20601234565' }))).rejects.toThrow(
        new ConflictError('Su plan permite 1 sucursales; amplíe su plan'),
      );
      expect(await contar('empresa', tenantId)).toBe(1);
    });
  });

  describe('EditarEmpresa', () => {
    it('actualiza los datos y publica empresa.actualizada', async () => {
      const tenantId = await nuevoTenant('editar-empresa');
      const { empresaId } = await e.en(tenantId, () => registrar().ejecutar(COMANDO));
      const editar = new EditarEmpresa(e.uow, e.contexto, e.eventos, e.repos);

      await e.en(tenantId, () => editar.ejecutar({ empresaId, razonSocial: 'Sabores del Sur SAC', nombreComercial: 'Sabores Arequipa', direccionFiscal: null, ubigeo: null }));

      const [fila] = await e.dataSource.query('SELECT nombre_comercial, version FROM org.empresa WHERE id = $1', [empresaId]);
      expect(fila.nombre_comercial).toBe('Sabores Arequipa');
      expect(Number(fila.version)).toBe(2);
      expect(await e.eventosDe(empresaId)).toEqual(['empresa.creada', 'empresa.actualizada']);
    });

    it('una empresa de otro tenant no existe para el actor', async () => {
      const a = await nuevoTenant('editar-tenant-a');
      const b = await nuevoTenant('editar-tenant-b');
      const { empresaId } = await e.en(a, () => registrar().ejecutar(COMANDO));
      const editar = new EditarEmpresa(e.uow, e.contexto, e.eventos, e.repos);
      await expect(
        e.en(b, () => editar.ejecutar({ empresaId, razonSocial: 'Tomada SAC', nombreComercial: null, direccionFiscal: null, ubigeo: null })),
      ).rejects.toThrow(NotFoundError);
    });
  });
});
