import { ConflictError } from '@vitrina/plataforma/kernel';
import { AccesoSoporte, type DatosSolicitudSoporte } from '../src/domain/acceso-soporte.js';
import { SoporteAbiertoExistenteError } from '../src/domain/errores.js';
import { AccesoSoporteRepositorioTypeOrm } from '../src/infrastructure/typeorm/acceso-soporte.repositorio.js';
import { LecturaBitacoraTypeOrm } from '../src/infrastructure/typeorm/lectura-bitacora.typeorm.js';
import { LecturaSoporteTypeOrm } from '../src/infrastructure/typeorm/lectura-soporte.typeorm.js';
import { crearEntorno, type Entorno } from './support/entorno.js';
import { describeConDb } from './support/temp-db.js';

const HORA = 3_600_000;

describeConDb('Persistencia de soporte y bitácora (spec 18, PostgreSQL 16)', () => {
  let e: Entorno;
  let repositorio: AccesoSoporteRepositorioTypeOrm;
  let lecturaSoporte: LecturaSoporteTypeOrm;
  let bitacora: LecturaBitacoraTypeOrm;
  let operador: string;
  let clienteA: string;
  let clienteB: string;
  let agente: string;
  let administradorA: string;

  const enTenant = <T>(tenantId: string, trabajo: () => Promise<T>) => e.en(tenantId, () => e.uow.run(trabajo));
  const solicitud = (tenantId: string, cambios: Partial<DatosSolicitudSoporte> = {}): DatosSolicitudSoporte => ({
    tenantId,
    agenteId: agente,
    ticket: 'SOP-000245',
    motivo: 'Revisar series de boletas',
    modo: 'LECTURA',
    horas: 2,
    ...cambios,
  });
  const evento = (tenantId: string, tipo: string, usuarioId: string | null, detalle: object, ocurridoEn: string, ip: string | null = null) =>
    e.dataSource.query(
      'INSERT INTO seg.evento_seguridad (tenant_id, usuario_id, tipo, detalle, ip, ocurrido_en) VALUES ($1, $2, $3, $4::jsonb, $5::inet, $6)',
      [tenantId, usuarioId, tipo, JSON.stringify(detalle), ip, ocurridoEn],
    );

  beforeAll(async () => {
    e = await crearEntorno();
    repositorio = new AccesoSoporteRepositorioTypeOrm(e.uow, e.contexto);
    lecturaSoporte = new LecturaSoporteTypeOrm(e.uow, e.contexto, e.dataSource);
    bitacora = new LecturaBitacoraTypeOrm(e.uow, e.contexto);
    operador = await e.sembrar.tenant();
    clienteA = await e.sembrar.tenant();
    clienteB = await e.sembrar.tenant();
    agente = (await e.sembrar.membresia(operador)).usuarioId;
    administradorA = (await e.sembrar.membresia(clienteA, 'ACTIVO', true)).usuarioId;
    await e.dataSource.query(`UPDATE seg.usuario SET nombre = 'Javier Paredes', email = 'javier.paredes@vitrina.pe' WHERE id = $1`, [agente]);
  });

  afterAll(() => e?.cerrar());

  describe('AccesoSoporteRepositorio', () => {
    it('guarda, lee y actualiza con bloqueo optimista', async () => {
      const ahora = new Date();
      const acceso = AccesoSoporte.solicitar(e.ids.next(), solicitud(clienteA), ahora);
      await enTenant(clienteA, () => repositorio.guardar(acceso));

      const membresiaId = await enTenant(clienteA, async () => {
        const [{ id }] = await e.uow.manager.query(
          `INSERT INTO seg.membresia (id, usuario_id, tenant_id, estado, desde, hasta) VALUES ($1, $2, $3, 'ACTIVO', $4, $5) RETURNING id`,
          [e.ids.next(), agente, clienteA, ahora, new Date(ahora.getTime() + 2 * HORA)],
        );
        return id as string;
      });

      await enTenant(clienteA, async () => {
        const leido = await repositorio.buscar(acceso.id);
        expect(leido?.estado).toBe('PENDIENTE');
        leido!.aprobar({ aprobadoPor: administradorA, horas: 2, membresiaId, asignacionId: e.ids.next() }, ahora);
        await repositorio.guardar(leido!);
      });

      const fila = await enTenant(clienteA, () => repositorio.buscar(acceso.id));
      expect(fila).toMatchObject({ estado: 'APROBADO', aprobadoPor: administradorA, horasAprobadas: 2, membresiaId, version: 2 });
      expect(fila!.hasta!.getTime() - fila!.desde!.getTime()).toBe(2 * HORA);
    });

    it('una segunda escritura con la versión vieja falla', async () => {
      const acceso = AccesoSoporte.solicitar(e.ids.next(), solicitud(clienteB, { ticket: 'SOP-000300' }), new Date());
      await enTenant(clienteB, () => repositorio.guardar(acceso));

      const vieja = await enTenant(clienteB, () => repositorio.buscar(acceso.id));
      await enTenant(clienteB, async () => {
        const vigente = await repositorio.buscar(acceso.id);
        vigente!.rechazar('No autorizado', administradorA, new Date());
        await repositorio.guardar(vigente!);
      });

      vieja!.rechazar('Duplicado', administradorA, new Date());
      await expect(enTenant(clienteB, () => repositorio.guardar(vieja!))).rejects.toThrow(ConflictError);
      expect((await enTenant(clienteB, () => repositorio.buscar(acceso.id)))?.motivoCierre).toBe('No autorizado');
    });

    it('una segunda solicitud abierta del agente en el tenant da SoporteAbiertoExistenteError', async () => {
      const otra = AccesoSoporte.solicitar(e.ids.next(), solicitud(clienteA, { ticket: 'SOP-000246' }), new Date());
      await expect(enTenant(clienteA, () => repositorio.guardar(otra))).rejects.toThrow(SoporteAbiertoExistenteError);
    });

    it('abiertoDe y abiertosPorTicket solo ven el tenant del contexto', async () => {
      expect((await enTenant(clienteA, () => repositorio.abiertoDe(agente)))?.ticket).toBe('SOP-000245');
      expect(await enTenant(clienteB, () => repositorio.abiertoDe(agente))).toBeNull();
      expect(await enTenant(clienteA, () => repositorio.abiertosPorTicket('SOP-000245'))).toHaveLength(1);
      expect(await enTenant(clienteB, () => repositorio.abiertosPorTicket('SOP-000245'))).toHaveLength(0);
    });
  });

  describe('LecturaSoporte', () => {
    it('delTenant trae agente y aprobador, filtra por estado y no cruza tenants', async () => {
      const todas = await enTenant(clienteA, () => lecturaSoporte.delTenant({ pagina: 1, tamano: 20 }));
      expect(todas.total).toBe(1);
      expect(todas.items[0]).toMatchObject({
        ticket: 'SOP-000245',
        estado: 'APROBADO',
        agente: { id: agente, nombre: 'Javier Paredes', correo: 'javier.paredes@vitrina.pe' },
        aprobadoPor: { id: administradorA },
        cerradoPor: null,
      });
      expect((await enTenant(clienteA, () => lecturaSoporte.delTenant({ pagina: 1, tamano: 20, estados: ['PENDIENTE'] }))).total).toBe(0);
      const deB = await enTenant(clienteB, () => lecturaSoporte.delTenant({ pagina: 1, tamano: 20 }));
      expect(deB.items.map((item) => item.ticket)).toEqual(['SOP-000300']);
    });

    it('vigenteDe da la sesión mientras no llega hasta', async () => {
      const ahora = new Date();
      const sesion = await enTenant(clienteA, () => lecturaSoporte.vigenteDe(agente, ahora));
      expect(sesion).toMatchObject({ ticket: 'SOP-000245', modo: 'LECTURA' });
      expect(await enTenant(clienteA, () => lecturaSoporte.vigenteDe(agente, new Date(ahora.getTime() + 3 * HORA)))).toBeNull();
      expect(await enTenant(clienteB, () => lecturaSoporte.vigenteDe(agente, ahora))).toBeNull();
    });

    it('pendientes cuenta los PENDIENTE sin caducar', async () => {
      const ahora = new Date();
      const pendiente = AccesoSoporte.solicitar(e.ids.next(), solicitud(clienteB, { ticket: 'SOP-000301' }), ahora);
      await enTenant(clienteB, () => repositorio.guardar(pendiente));
      expect(await enTenant(clienteB, () => lecturaSoporte.pendientes(ahora))).toBe(1);
      expect(await enTenant(clienteB, () => lecturaSoporte.pendientes(new Date(ahora.getTime() + 25 * HORA)))).toBe(0);
      expect(await enTenant(clienteA, () => lecturaSoporte.pendientes(ahora))).toBe(0);
    });

    it('deAgente y porVencer cruzan tenants sin transacción', async () => {
      const accesos = await lecturaSoporte.deAgente(agente);
      expect(accesos.map((acceso) => acceso.tenantId).sort()).toEqual([clienteA, clienteB, clienteB].sort());
      expect(accesos[0].tenantNombre).toBe('Tenant de prueba');

      const enTresHoras = await lecturaSoporte.porVencer(new Date(Date.now() + 3 * HORA));
      expect(enTresHoras.map((acceso) => acceso.tenantId)).toContain(clienteA);
      const enDosDias = await lecturaSoporte.porVencer(new Date(Date.now() + 48 * HORA));
      expect(enDosDias.filter((acceso) => acceso.tenantId === clienteB)).toHaveLength(1);
    });
  });

  describe('LecturaBitacora', () => {
    beforeAll(async () => {
      for (let indice = 0; indice < 15; indice += 1) {
        await evento(clienteA, 'ACCESO_DENEGADO', administradorA, { permiso: 'plat.rol.gestionar' }, `2026-10-2${indice % 6}T15:00:00Z`);
      }
      await evento(clienteA, 'ACCESO_SOPORTE', agente, { accion: 'SOLICITADO', ticket: 'SOP-000245' }, '2026-10-26T04:59:00Z', '10.0.0.7');
      await evento(clienteA, 'ACCESO_DENEGADO', administradorA, { permiso: 'plat.rol.gestionar' }, '2026-10-19T04:59:00Z');
      await evento(clienteB, 'ACCESO_DENEGADO', agente, { permiso: 'plat.usuario.invitar' }, '2026-10-22T15:00:00Z');
    });

    const filtro = { desde: '2026-10-19', hasta: '2026-10-25', pagina: 1, tamano: 20 };

    it('15 ACCESO_DENEGADO de la semana con usuario, permiso faltante y fecha (TR-CA-051)', async () => {
      const lista = await enTenant(clienteA, () => bitacora.listar({ ...filtro, tipo: 'ACCESO_DENEGADO' }));
      expect(lista.total).toBe(15);
      expect(lista.items[0]).toMatchObject({ tipo: 'ACCESO_DENEGADO', resumen: 'plat.rol.gestionar', usuario: { id: administradorA } });
      const fechas = lista.items.map((item) => item.ocurridoEn.getTime());
      expect(fechas).toEqual([...fechas].sort((a, b) => b - a));
    });

    it('el rango usa días de Lima: 04:59 UTC del 26 todavía es el 25', async () => {
      const lista = await enTenant(clienteA, () => bitacora.listar(filtro));
      expect(lista.total).toBe(16);
      expect(lista.items[0]).toMatchObject({ tipo: 'ACCESO_SOPORTE', resumen: 'SOP-000245' });
    });

    it('un mes sin accesos de soporte da lista vacía (TR-CA-052)', async () => {
      const lista = await enTenant(clienteA, () => bitacora.listar({ ...filtro, desde: '2026-09-01', hasta: '2026-09-30', tipo: 'ACCESO_SOPORTE' }));
      expect(lista).toEqual({ items: [], total: 0 });
    });

    it('filtra por parte del correo o del nombre, sin mayúsculas, y trata % como literal', async () => {
      expect((await enTenant(clienteA, () => bitacora.listar({ ...filtro, usuario: 'PAREDES' }))).total).toBe(1);
      expect((await enTenant(clienteA, () => bitacora.listar({ ...filtro, usuario: 'vitrina.pe' }))).total).toBe(1);
      expect((await enTenant(clienteA, () => bitacora.listar({ ...filtro, usuario: '%' }))).total).toBe(0);
    });

    it('pagina con tamano y no cruza tenants', async () => {
      const pagina2 = await enTenant(clienteA, () => bitacora.listar({ ...filtro, pagina: 2, tamano: 10 }));
      expect(pagina2.items).toHaveLength(6);
      expect(pagina2.total).toBe(16);
      const deB = await enTenant(clienteB, () => bitacora.listar(filtro));
      expect(deB.items.map((item) => item.resumen)).toEqual(['plat.usuario.invitar']);
    });

    it('el detalle trae IP y datos; un id de otro tenant no existe', async () => {
      const [primero] = (await enTenant(clienteA, () => bitacora.listar(filtro))).items;
      const detalle = await enTenant(clienteA, () => bitacora.detalle(primero.id));
      expect(detalle).toMatchObject({ ip: '10.0.0.7', detalle: { accion: 'SOLICITADO', ticket: 'SOP-000245' } });
      expect(await enTenant(clienteB, () => bitacora.detalle(primero.id))).toBeNull();
    });
  });

  it('BitacoraSeguridad registra sin actor y con IP', async () => {
    await enTenant(clienteB, () => e.repos.bitacora.registrar('ACCESO_SOPORTE', null, { accion: 'EXPIRADO' }, '192.168.1.20'));
    const [fila] = await e.dataSource.query(
      `SELECT usuario_id, host(ip) AS ip FROM seg.evento_seguridad WHERE tenant_id = $1 AND detalle ->> 'accion' = 'EXPIRADO'`,
      [clienteB],
    );
    expect(fila).toEqual({ usuario_id: null, ip: '192.168.1.20' });
  });
});
