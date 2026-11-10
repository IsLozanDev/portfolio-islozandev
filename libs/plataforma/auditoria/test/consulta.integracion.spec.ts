import { SystemClock } from '@vitrina/plataforma/kernel-infra';
import { DirectorioSegTypeOrm } from '@vitrina/plataforma/seguridad';
import { ConsultarAuditoria, type DependenciasConsultaAuditoria } from '../src/application/consultar-auditoria.js';
import { ObtenerEventoAuditoria } from '../src/application/obtener-evento-auditoria.js';
import { EventoAuditoriaNoEncontradoError, SucursalFueraDeAlcanceError } from '../src/domain/errores.js';
import type { FiltroAuditoria } from '../src/domain/filtro-auditoria.js';
import { LecturaAuditoriaTypeOrm } from '../src/infrastructure/typeorm/lectura-auditoria.typeorm.js';
import { crearEntornoAuditoria, type EntornoAuditoria } from './support/entorno.js';
import { AlcanceActorDePrueba } from './support/seguridad-de-prueba.js';
import { crearSemilla } from './support/semilla-consulta.js';
import { describeConDb } from './support/temp-db.js';

const OCTUBRE: FiltroAuditoria = { desde: '2026-10-01', hasta: '2026-10-31' };
const ANULACIONES_DE_ROSA = 7;

describeConDb('Consulta y detalle de la auditoría (spec 20b, PostgreSQL 16)', () => {
  let entorno: EntornoAuditoria;
  let consultar: ConsultarAuditoria;
  let obtener: ObtenerEventoAuditoria;
  let alcanceActor: AlcanceActorDePrueba;
  let datos: Awaited<ReturnType<typeof sembrar>>;

  const como = <T>(actorId: string, sucursalId: string, trabajo: () => Promise<T>) =>
    entorno.contexto.run({ tenantId: datos.tenantId, actorId, branchId: sucursalId }, trabajo);

  async function sembrar() {
    const semilla = crearSemilla(entorno.dataSource);
    const { tenantId, empresaId } = await semilla.tenant();
    const surco = await semilla.sucursal(tenantId, empresaId, 'SURCO', 'Surco');
    const miraflores = await semilla.sucursal(tenantId, empresaId, 'MIRAFLORES', 'Miraflores');
    const rosa = await semilla.persona(tenantId, 'Rosa Huamán', `rosa.huaman.${tenantId}@gmail.com`);
    const luis = await semilla.persona(tenantId, 'Luis Paredes', `luis.${tenantId}@prueba.pe`);
    const propietaria = await semilla.persona(tenantId, 'Ana Torres', `ana.${tenantId}@prueba.pe`);
    const supervisor = await semilla.persona(tenantId, 'Pedro Salazar', `pedro.${tenantId}@prueba.pe`);
    const titular = await semilla.persona(tenantId, 'Carla Ríos', `carla.${tenantId}@prueba.pe`);

    // TR-CA-213: 7 anulaciones de Rosa en octubre en Surco, entre otras de Luis, de otras acciones y de setiembre.
    const anulacionesDeRosa: string[] = [];
    for (let dia = 1; dia <= ANULACIONES_DE_ROSA; dia += 1) {
      anulacionesDeRosa.push(
        await semilla.evento(tenantId, {
          usuarioId: rosa,
          sucursalId: surco,
          antes: { estado: 'EMITIDA', total: dia * 10 },
          despues: { estado: 'ANULADA', total: 0 },
          motivo: `cliente desistió ${dia}`,
          ocurridoEn: `2026-10-${String(dia * 3).padStart(2, '0')}T15:00:00Z`,
        }),
      );
    }
    await semilla.evento(tenantId, { usuarioId: luis, sucursalId: surco, motivo: 'error de cobro', ocurridoEn: '2026-10-05T16:00:00Z' });
    await semilla.evento(tenantId, { accion: 'rest.caja.cerrar', entidadTipo: 'caja', usuarioId: rosa, sucursalId: surco, ocurridoEn: '2026-10-06T23:00:00Z' });
    await semilla.evento(tenantId, { usuarioId: rosa, sucursalId: surco, motivo: 'fuera de rango', ocurridoEn: '2026-09-30T15:00:00Z' });
    const deMiraflores = await semilla.evento(tenantId, { usuarioId: luis, sucursalId: miraflores, ocurridoEn: '2026-10-10T15:00:00Z' });
    // Operaciones de todo el tenant, sin sucursal.
    await semilla.evento(tenantId, { accion: 'empresa.creada', entidadTipo: 'empresa', entidadId: empresaId, ocurridoEn: '2026-10-01T13:00:00Z' });
    await semilla.evento(tenantId, {
      tipo: 'ACCESO_SENSIBLE',
      accion: 'aud.dato_sensible.acceder',
      entidadTipo: 'HISTORIA_CLINICA',
      entidadId: 'HC-1',
      usuarioId: luis,
      sucursalId: miraflores,
      personaTitularId: titular,
      finalidad: 'ATENCION',
      ocurridoEn: '2026-10-12T15:00:00Z',
    });

    // Otro tenant con una anulación de una Rosa: nunca se ve desde el primero.
    const otro = await semilla.tenant();
    const otraRosa = await semilla.persona(otro.tenantId, 'Rosa Quispe', `rosa.quispe.${otro.tenantId}@gmail.com`);
    await semilla.evento(otro.tenantId, { usuarioId: otraRosa, ocurridoEn: '2026-10-08T15:00:00Z' });

    return { tenantId, surco, miraflores, rosa, luis, propietaria, supervisor, titular, anulacionesDeRosa, deMiraflores, otroTenantId: otro.tenantId };
  }

  beforeAll(async () => {
    entorno = await crearEntornoAuditoria();
    alcanceActor = new AlcanceActorDePrueba();
    const dependencias: DependenciasConsultaAuditoria = {
      unidadDeTrabajo: entorno.unidadDeTrabajo,
      contexto: entorno.contexto,
      reloj: new SystemClock(),
      alcanceActor,
      directorio: new DirectorioSegTypeOrm(entorno.unidadDeTrabajo, entorno.contexto),
      lectura: new LecturaAuditoriaTypeOrm(entorno.unidadDeTrabajo, entorno.contexto),
    };
    consultar = new ConsultarAuditoria(dependencias);
    obtener = new ObtenerEventoAuditoria(dependencias);
    datos = await sembrar();
    alcanceActor.tenant.add(datos.propietaria);
  });

  afterAll(() => entorno?.cerrar());

  it('TR-CA-213: «rosa» y rest.venta.anular en octubre devuelven las 7 con su motivo, y el detalle trae los montos', async () => {
    const listado = await como(datos.propietaria, datos.surco, () => consultar.ejecutar({ ...OCTUBRE, usuario: 'rosa', accion: 'rest.venta.anular' }, {}));

    expect(listado.total).toBe(ANULACIONES_DE_ROSA);
    expect(listado.items.map((item) => item.id).sort()).toEqual([...datos.anulacionesDeRosa].sort());
    expect(listado.items.map((item) => item.motivo)).toEqual(Array.from({ length: ANULACIONES_DE_ROSA }, (_, indice) => `cliente desistió ${ANULACIONES_DE_ROSA - indice}`));
    for (const item of listado.items) {
      expect(item.usuario).toEqual({ id: datos.rosa, nombre: 'Rosa Huamán', correo: `rosa.huaman.${datos.tenantId}@gmail.com` });
      expect(item.sucursal).toEqual({ id: datos.surco, codigo: 'SURCO', nombre: 'Surco' });
      expect(item).not.toHaveProperty('antes');
      expect(item).not.toHaveProperty('despues');
    }

    const detalle = await como(datos.propietaria, datos.surco, () => obtener.ejecutar(datos.anulacionesDeRosa[2]));
    expect(detalle.despues).toEqual({ estado: 'ANULADA', total: 0 });
    expect(detalle.cambios).toEqual([
      { campo: 'estado', antes: 'EMITIDA', despues: 'ANULADA' },
      { campo: 'total', antes: 30, despues: 0 },
    ]);
    expect(detalle.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('TR-CA-214: un supervisor de Surco sin alcance TENANT ve solo Surco, sin las filas sin sucursal; otra sucursal es 403', async () => {
    const listado = await como(datos.supervisor, datos.surco, () => consultar.ejecutar(OCTUBRE, { tamano: 100 }));

    expect(listado.total).toBe(ANULACIONES_DE_ROSA + 2);
    expect(new Set(listado.items.map((item) => item.sucursalId))).toEqual(new Set([datos.surco]));
    await expect(como(datos.supervisor, datos.surco, () => consultar.ejecutar({ ...OCTUBRE, sucursalId: datos.miraflores }, {}))).rejects.toThrow(
      SucursalFueraDeAlcanceError,
    );
    await expect(como(datos.supervisor, datos.surco, () => obtener.ejecutar(datos.deMiraflores))).rejects.toThrow(EventoAuditoriaNoEncontradoError);
  });

  it('con alcance TENANT ve todas las filas del tenant, con y sin sucursal, y sucursal_id filtra', async () => {
    const todas = await como(datos.propietaria, datos.surco, () => consultar.ejecutar(OCTUBRE, { tamano: 100 }));
    const deMiraflores = await como(datos.propietaria, datos.surco, () => consultar.ejecutar({ ...OCTUBRE, sucursalId: datos.miraflores }, {}));

    expect(todas.total).toBe(ANULACIONES_DE_ROSA + 2 + 3);
    expect(todas.items.some((item) => item.sucursalId === null && item.sucursal === null && item.usuario === null)).toBe(true);
    expect(deMiraflores.total).toBe(2);
    expect(await como(datos.propietaria, datos.surco, () => obtener.ejecutar(datos.deMiraflores))).toMatchObject({ id: datos.deMiraflores });
  });

  it('tipo ACCESO_SENSIBLE y persona_titular_id devuelven los accesos sensibles del titular', async () => {
    const listado = await como(datos.propietaria, datos.surco, () =>
      consultar.ejecutar({ ...OCTUBRE, tipo: 'ACCESO_SENSIBLE', personaTitularId: datos.titular }, {}),
    );
    expect(listado.items.map((item) => [item.tipo, item.entidadTipo, item.personaTitularId, item.finalidad])).toEqual([
      ['ACCESO_SENSIBLE', 'HISTORIA_CLINICA', datos.titular, 'ATENCION'],
    ]);
  });

  it('un usuario sin coincidencias devuelve vacío; la página y el orden van del más reciente al más antiguo', async () => {
    expect(await como(datos.propietaria, datos.surco, () => consultar.ejecutar({ ...OCTUBRE, usuario: 'nadie' }, {}))).toEqual({ items: [], total: 0 });

    const primera = await como(datos.propietaria, datos.surco, () => consultar.ejecutar(OCTUBRE, { pagina: 1, tamano: 5 }));
    const segunda = await como(datos.propietaria, datos.surco, () => consultar.ejecutar(OCTUBRE, { pagina: 2, tamano: 5 }));
    const fechas = [...primera.items, ...segunda.items].map((item) => item.ocurridoEn.getTime());
    expect(fechas).toEqual([...fechas].sort((a, b) => b - a));
    expect(primera.items).toHaveLength(5);
  });

  it('desde el tenant A no se lee ninguna fila de B, ni por la lista ni por el detalle', async () => {
    const listado = await como(datos.propietaria, datos.surco, () => consultar.ejecutar({ ...OCTUBRE, usuario: 'rosa' }, { tamano: 100 }));
    expect(listado.items.every((item) => item.usuario?.nombre === 'Rosa Huamán')).toBe(true);

    const [{ id: deOtroTenant }] = await entorno.dataSource.query('SELECT id FROM aud.evento_auditoria WHERE tenant_id = $1', [datos.otroTenantId]);
    await expect(como(datos.propietaria, datos.surco, () => obtener.ejecutar(deOtroTenant))).rejects.toThrow(EventoAuditoriaNoEncontradoError);
  });
});
