import { DataSource } from 'typeorm';
import { ConflictError } from '@vitrina/plataforma/kernel';
import { AlsTenantContext, TypeOrmUnitOfWork, uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { Empresa } from '../src/domain/empresa.js';
import { Sucursal } from '../src/domain/sucursal.js';
import { Suscripcion, type DatosSuscripcion } from '../src/domain/suscripcion.js';
import { Tenant } from '../src/domain/tenant.js';
import { UnidadOperativa } from '../src/domain/unidad-operativa.js';
import { EmpresaRepositorioTypeOrm } from '../src/infrastructure/typeorm/empresa.repositorio.js';
import { SucursalRepositorioTypeOrm } from '../src/infrastructure/typeorm/sucursal.repositorio.js';
import { SuscripcionRepositorioTypeOrm } from '../src/infrastructure/typeorm/suscripcion.repositorio.js';
import { TenantRepositorioTypeOrm } from '../src/infrastructure/typeorm/tenant.repositorio.js';
import { UnidadRepositorioTypeOrm } from '../src/infrastructure/typeorm/unidad.repositorio.js';
import { datosSucursal } from './support/fabricas.js';
import { createTempDb, type TempDb } from './support/temp-db.js';

const hallado = <T>(valor: T | null): T => {
  if (valor === null) throw new Error('se esperaba un registro');
  return valor;
};

const SIN_TOPE = { activas: 0, tope: null };
const BASICO: DatosSuscripcion = {
  edicion: null,
  plan: 'BASICO',
  estado: 'PRUEBA',
  limiteSucursales: 3,
  limiteUsuarios: null,
  vigenteHasta: '2026-12-31',
};

describe('Repositorios org (PostgreSQL 16)', () => {
  let db: TempDb;
  let dataSource: DataSource;
  const tenants = new AlsTenantContext();
  let uow: TypeOrmUnitOfWork;
  let repos: {
    tenants: TenantRepositorioTypeOrm;
    suscripciones: SuscripcionRepositorioTypeOrm;
    empresas: EmpresaRepositorioTypeOrm;
    sucursales: SucursalRepositorioTypeOrm;
    unidades: UnidadRepositorioTypeOrm;
  };

  beforeAll(async () => {
    db = await createTempDb();
    dataSource = new DataSource({ type: 'postgres', url: db.url });
    await dataSource.initialize();
    uow = new TypeOrmUnitOfWork(dataSource, tenants);
    repos = {
      tenants: new TenantRepositorioTypeOrm(uow, tenants),
      suscripciones: new SuscripcionRepositorioTypeOrm(uow, tenants),
      empresas: new EmpresaRepositorioTypeOrm(uow, tenants),
      sucursales: new SucursalRepositorioTypeOrm(uow, tenants),
      unidades: new UnidadRepositorioTypeOrm(uow, tenants),
    };
  });

  afterAll(async () => {
    await dataSource?.destroy();
    await db?.drop();
  });

  const en = <T>(tenantId: string, fn: () => Promise<T>) => tenants.run({ tenantId }, () => uow.run(fn));

  /** Tenant con empresa y sucursal principal ya guardados. */
  async function sembrar(codigo: string, ruc = '20512345671') {
    const tenant = Tenant.crear({ id: uuidV7(), codigo, nombre: `Tenant ${codigo}`, estado: 'ACTIVO' });
    const empresa = Empresa.crear(uuidV7(), tenant.id, ruc, { razonSocial: 'Sabores del Sur SAC', nombreComercial: null, direccionFiscal: null, ubigeo: '040101' });
    const principal = Sucursal.crearPrincipal(uuidV7(), empresa, SIN_TOPE);
    await en(tenant.id, async () => {
      await repos.tenants.guardar(tenant);
      await repos.empresas.guardar(empresa);
      await repos.sucursales.guardar(principal);
    });
    return { tenant, empresa, principal };
  }

  describe('tenant', () => {
    it('guarda, lee y actualiza con su historial', async () => {
      const { tenant } = await sembrar('tenant-ida-vuelta');

      await en(tenant.id, async () => {
        const leido = hallado(await repos.tenants.buscar(tenant.id));
        expect(leido).toMatchObject({ codigo: 'tenant-ida-vuelta', estado: 'ACTIVO', version: 1 });

        const fecha = new Date('2026-11-20T15:00:00Z');
        const cambio = hallado(leido.cambiarEstado('SUSPENDIDO', 'Deuda de 60 días', fecha));
        await repos.tenants.guardar(leido);
        await repos.tenants.registrarCambioEstado(uuidV7(), tenant.id, cambio, null);
      });

      await en(tenant.id, async () => {
        const leido = hallado(await repos.tenants.buscar(tenant.id));
        expect(leido).toMatchObject({ estado: 'SUSPENDIDO', estadoMotivo: 'Deuda de 60 días', version: 2 });
        expect(leido.estadoCambiadoEn).toEqual(new Date('2026-11-20T15:00:00Z'));
      });
      const historial = await dataSource.query('SELECT estado_anterior, estado_nuevo FROM org.tenant_estado_historial WHERE tenant_id = $1', [tenant.id]);
      expect(historial).toEqual([{ estado_anterior: 'ACTIVO', estado_nuevo: 'SUSPENDIDO' }]);
    });

    it('un código repetido se traduce a «El código de tenant ya existe»', async () => {
      await sembrar('codigo-repetido');
      const otro = Tenant.crear({ id: uuidV7(), codigo: 'codigo-repetido', nombre: 'Otro', estado: 'PRUEBA' });
      await expect(en(otro.id, () => repos.tenants.guardar(otro))).rejects.toThrow(new ConflictError('El código de tenant ya existe'));
    });

    it('no devuelve un tenant distinto al del contexto', async () => {
      const a = await sembrar('tenant-a-aislado');
      const b = await sembrar('tenant-b-aislado');
      await en(b.tenant.id, async () => {
        expect(await repos.tenants.buscar(a.tenant.id)).toBeNull();
        expect(await repos.empresas.buscar(a.empresa.id)).toBeNull();
        expect(await repos.sucursales.buscar(a.principal.id)).toBeNull();
      });
    });

    it('guardar sin cambios no toca la fila', async () => {
      const { tenant } = await sembrar('sin-cambios');
      await en(tenant.id, async () => {
        const leido = hallado(await repos.tenants.buscar(tenant.id));
        expect(leido.cambiarEstado('ACTIVO', '', new Date())).toBeNull();
        await repos.tenants.guardar(leido);
      });
      const [{ version }] = await dataSource.query('SELECT version FROM org.tenant WHERE id = $1', [tenant.id]);
      expect(Number(version)).toBe(1);
    });
  });

  describe('bloqueo optimista', () => {
    it('la segunda escritura sobre la misma versión lanza ConflictError y no pisa la primera', async () => {
      const { tenant, empresa } = await sembrar('concurrencia');
      const [primera, segunda] = (await en(tenant.id, () => Promise.all([repos.empresas.buscar(empresa.id), repos.empresas.buscar(empresa.id)]))).map(hallado);

      primera.editar({ ...primera.datos, nombreComercial: 'Primera' });
      await en(tenant.id, () => repos.empresas.guardar(primera));

      segunda.editar({ ...segunda.datos, nombreComercial: 'Segunda' });
      await expect(en(tenant.id, () => repos.empresas.guardar(segunda))).rejects.toThrow(ConflictError);

      const leida = hallado(await en(tenant.id, () => repos.empresas.buscar(empresa.id)));
      expect(leida.datos.nombreComercial).toBe('Primera');
    });
  });

  describe('suscripción', () => {
    it('conserva vigente_hasta como fecha sin hora y lista por tenant', async () => {
      const { tenant } = await sembrar('suscripciones');
      await en(tenant.id, async () => {
        await repos.suscripciones.guardar(Suscripcion.crear(uuidV7(), tenant.id, 'REST', BASICO, { sucursalesActivas: 1, usuariosActivos: 0 }));
        await repos.suscripciones.guardar(Suscripcion.crear(uuidV7(), tenant.id, 'DOC', { ...BASICO, vigenteHasta: null }, { sucursalesActivas: 1, usuariosActivos: 0 }));
      });

      await en(tenant.id, async () => {
        expect(hallado(await repos.suscripciones.buscar('REST')).datos).toEqual(BASICO);
        expect((await repos.suscripciones.listar()).map((s) => s.productoCodigo)).toEqual(['DOC', 'REST']);
        expect(await repos.suscripciones.buscar('GYM')).toBeNull();
      });
    });

    it('un producto repetido se traduce a ConflictError', async () => {
      const { tenant } = await sembrar('suscripcion-repetida');
      const uso = { sucursalesActivas: 1, usuariosActivos: 0 };
      await en(tenant.id, () => repos.suscripciones.guardar(Suscripcion.crear(uuidV7(), tenant.id, 'REST', BASICO, uso)));
      await expect(en(tenant.id, () => repos.suscripciones.guardar(Suscripcion.crear(uuidV7(), tenant.id, 'REST', BASICO, uso)))).rejects.toThrow(
        new ConflictError('El tenant ya tiene una suscripción a este producto'),
      );
    });
  });

  describe('empresa', () => {
    it('TR-CA-005 (persistencia): un RUC repetido en el tenant se traduce al mensaje del SRS', async () => {
      const { tenant } = await sembrar('ruc-repetido');
      const otra = Empresa.crear(uuidV7(), tenant.id, '20512345671', { razonSocial: 'Duplicada SAC', nombreComercial: null, direccionFiscal: null, ubigeo: null });
      await expect(en(tenant.id, () => repos.empresas.guardar(otra))).rejects.toThrow(
        new ConflictError('La empresa ya está registrada en este tenant'),
      );
    });

    it('el mismo RUC se guarda en otro tenant', async () => {
      await sembrar('ruc-tenant-1', '20601234565');
      await expect(sembrar('ruc-tenant-2', '20601234565')).resolves.toBeDefined();
    });
  });

  describe('sucursal', () => {
    it('cuenta activas, busca la principal y guarda el traslado en el orden correcto', async () => {
      const { tenant, empresa, principal } = await sembrar('sucursales');
      const cayma = Sucursal.crear(uuidV7(), empresa, datosSucursal(), { activas: 1, tope: 3 });

      await en(tenant.id, async () => {
        await repos.sucursales.guardar(cayma);
        expect(await repos.sucursales.contarActivas()).toBe(2);
        expect(hallado(await repos.sucursales.buscarPrincipal(empresa.id)).id).toBe(principal.id);
      });

      await en(tenant.id, async () => {
        const desde = hallado(await repos.sucursales.buscarPrincipal(empresa.id));
        const hacia = hallado(await repos.sucursales.buscar(cayma.id));
        Sucursal.trasladarPrincipal(desde, hacia);
        await repos.sucursales.guardar(desde);
        await repos.sucursales.guardar(hacia);
      });

      await en(tenant.id, async () => {
        const nueva = hallado(await repos.sucursales.buscarPrincipal(empresa.id));
        expect(nueva.id).toBe(cayma.id);
        expect(nueva.datos.codigoEstablecimientoSunat).toBe('0000');
        expect(hallado(await repos.sucursales.buscar(principal.id)).datos.codigoEstablecimientoSunat).toBeNull();
      });
    });

    it('un establecimiento repetido se traduce a ConflictError', async () => {
      const { tenant, empresa } = await sembrar('establecimiento-repetido');
      await en(tenant.id, () => repos.sucursales.guardar(Sucursal.crear(uuidV7(), empresa, datosSucursal(), SIN_TOPE)));
      const otra = Sucursal.crear(uuidV7(), empresa, datosSucursal({ codigo: 'YANAHUARA', nombre: 'Yanahuara' }), SIN_TOPE);
      await expect(en(tenant.id, () => repos.sucursales.guardar(otra))).rejects.toThrow(
        new ConflictError('Ya existe una sucursal con ese establecimiento SUNAT en la empresa'),
      );
    });
  });

  describe('unidad operativa', () => {
    it('guarda atributos y padre, y lee el almacén de empresa sin sucursal', async () => {
      const { tenant, empresa, principal } = await sembrar('unidades');
      const almacen = UnidadOperativa.crear(uuidV7(), empresa, null, 'ALMACEN', { codigo: 'ALM-CENTRAL', nombre: 'Almacén central', atributos: {} }, null);
      const caja = UnidadOperativa.crear(uuidV7(), empresa, principal, 'CAJA', { codigo: 'CAJA-01', nombre: 'Caja 1', atributos: { impresora: 'EPSON-01', piso: 1 } }, almacen);

      await en(tenant.id, async () => {
        await repos.unidades.guardar(almacen);
        await repos.unidades.guardar(caja);
      });

      await en(tenant.id, async () => {
        const leida = hallado(await repos.unidades.buscar(caja.id));
        expect(leida).toMatchObject({ sucursalId: principal.id, padreId: almacen.id, tipo: 'CAJA', version: 1 });
        expect(leida.datos.atributos).toEqual({ impresora: 'EPSON-01', piso: 1 });
        expect(hallado(await repos.unidades.buscar(almacen.id)).sucursalId).toBeNull();

        leida.inactivar();
        await repos.unidades.guardar(leida);
      });

      const [{ activo }] = await dataSource.query('SELECT activo FROM org.unidad_operativa WHERE id = $1', [caja.id]);
      expect(activo).toBe(false);
    });
  });
});
