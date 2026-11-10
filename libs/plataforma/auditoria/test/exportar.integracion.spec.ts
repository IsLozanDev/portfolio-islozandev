import { PassThrough } from 'node:stream';
import ExcelJS from 'exceljs';
import { SystemClock } from '@vitrina/plataforma/kernel-infra';
import { DirectorioSegTypeOrm } from '@vitrina/plataforma/seguridad';
import { ConsultarAuditoria, type DependenciasConsultaAuditoria } from '../src/application/consultar-auditoria.js';
import { ExportarAuditoria } from '../src/application/exportar-auditoria.js';
import type { AuditoriaPort } from '../src/application/ports/auditoria.port.js';
import { AuditoriaNoDisponibleError, ExportacionDemasiadoGrandeError } from '../src/domain/errores.js';
import type { FiltroAuditoria } from '../src/domain/filtro-auditoria.js';
import { LecturaAuditoriaTypeOrm } from '../src/infrastructure/typeorm/lectura-auditoria.typeorm.js';
import { EscritorAuditoriaXlsx } from '../src/infrastructure/xlsx/escritor-auditoria.xlsx.js';
import { crearEntornoAuditoria, type EntornoAuditoria } from './support/entorno.js';
import { AlcanceActorDePrueba } from './support/seguridad-de-prueba.js';
import { crearSemilla } from './support/semilla-consulta.js';
import { describeConDb } from './support/temp-db.js';

const OCTUBRE: FiltroAuditoria = { desde: '2026-10-01', hasta: '2026-10-31' };
const COLUMNA_NUMERO = 14;
const MAXIMO_FILAS = 10_000;
const ACCION_EXPORTAR = 'plat.auditoria.exportar';

/** Escribe el XLSX en memoria y devuelve los N.º de sus filas (sin el encabezado). */
async function exportarANumeros(exportar: ExportarAuditoria, filtro: FiltroAuditoria): Promise<string[]> {
  const destino = new PassThrough();
  const partes: Buffer[] = [];
  destino.on('data', (parte: Buffer) => partes.push(parte));
  const terminado = new Promise((resolver) => destino.on('end', resolver));
  await exportar.ejecutar(filtro, new EscritorAuditoriaXlsx(destino));
  await terminado;
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(Buffer.concat(partes) as unknown as ArrayBuffer);
  const numeros: string[] = [];
  libro.getWorksheet('Auditoría')?.eachRow((fila, posicion) => {
    if (posicion > 1) numeros.push(String(fila.getCell(COLUMNA_NUMERO).value));
  });
  return numeros;
}

describeConDb('Exportación de la auditoría (spec 20b, PostgreSQL 16)', () => {
  let entorno: EntornoAuditoria;
  let dependencias: DependenciasConsultaAuditoria;
  let consultar: ConsultarAuditoria;
  let exportar: ExportarAuditoria;
  let datos: Awaited<ReturnType<typeof sembrar>>;

  const auditoriaReal = (): AuditoriaPort => ({
    registrar: (entrada) => entorno.registrarEvento.ejecutar(entrada),
    registrarAccesoSensible: (entrada) => entorno.registrarAccesoSensible.ejecutar(entrada),
  });
  const como = <T>(tenantId: string, actorId: string, sucursalId: string, trabajo: () => Promise<T>) =>
    entorno.contexto.run({ tenantId, actorId, branchId: sucursalId }, trabajo);
  const exportaciones = async (tenantId: string) => (await entorno.filas(tenantId)).filter((fila) => fila.accion === ACCION_EXPORTAR);

  async function sembrar() {
    const semilla = crearSemilla(entorno.dataSource);
    const { tenantId, empresaId } = await semilla.tenant();
    const surco = await semilla.sucursal(tenantId, empresaId, 'SURCO', 'Surco');
    const miraflores = await semilla.sucursal(tenantId, empresaId, 'MIRAFLORES', 'Miraflores');
    const rosa = await semilla.persona(tenantId, 'Rosa Huamán', `rosa.${tenantId}@gmail.com`);
    const propietaria = await semilla.persona(tenantId, 'Ana Torres', `ana.${tenantId}@prueba.pe`);
    const supervisor = await semilla.persona(tenantId, 'Pedro Salazar', `pedro.${tenantId}@prueba.pe`);
    for (let dia = 1; dia <= 5; dia += 1) {
      await semilla.evento(tenantId, { usuarioId: rosa, sucursalId: surco, antes: { total: dia }, despues: { total: 0 }, ocurridoEn: `2026-10-0${dia}T15:00:00Z` });
      await semilla.evento(tenantId, { usuarioId: rosa, sucursalId: miraflores, ocurridoEn: `2026-10-1${dia}T15:00:00Z` });
    }
    await semilla.evento(tenantId, { accion: 'empresa.creada', entidadTipo: 'empresa', entidadId: empresaId, ocurridoEn: '2026-10-20T15:00:00Z' });

    // Un tenant con 10 001 filas en octubre: pasa el tope.
    const grande = await semilla.tenant();
    const actorGrande = await semilla.persona(grande.tenantId, 'Luis Paredes', `luis.${grande.tenantId}@prueba.pe`);
    await entorno.dataSource.query(
      `INSERT INTO aud.evento_auditoria (id, tenant_id, tipo, origen, accion, entidad_tipo, entidad_id, ocurrido_en)
       SELECT gen_random_uuid(), $1, 'OPERACION', 'DIRECTO', 'rest.venta.anular', 'venta', 'V-' || serie, timestamptz '2026-10-01 15:00:00+00' + serie * interval '1 minute'
         FROM generate_series(1, ${MAXIMO_FILAS + 1}) AS serie`,
      [grande.tenantId],
    );
    return { tenantId, surco, miraflores, propietaria, supervisor, grande: { tenantId: grande.tenantId, actor: actorGrande, sucursal: surco } };
  }

  beforeAll(async () => {
    entorno = await crearEntornoAuditoria();
    const alcanceActor = new AlcanceActorDePrueba();
    dependencias = {
      unidadDeTrabajo: entorno.unidadDeTrabajo,
      contexto: entorno.contexto,
      reloj: new SystemClock(),
      alcanceActor,
      directorio: new DirectorioSegTypeOrm(entorno.unidadDeTrabajo, entorno.contexto),
      lectura: new LecturaAuditoriaTypeOrm(entorno.unidadDeTrabajo, entorno.contexto),
    };
    consultar = new ConsultarAuditoria(dependencias);
    exportar = new ExportarAuditoria({ ...dependencias, auditoria: auditoriaReal(), avisar: () => undefined });
    datos = await sembrar();
    alcanceActor.tenant.add(datos.propietaria);
    alcanceActor.tenant.add(datos.grande.actor);
  });

  afterAll(() => entorno?.cerrar());

  it('el XLSX tiene las mismas filas que la lista y deja una fila plat.auditoria.exportar con filtros y filas', async () => {
    const filtro = { ...OCTUBRE, usuario: 'rosa' };
    const lista = await como(datos.tenantId, datos.propietaria, datos.surco, () => consultar.ejecutar(filtro, { tamano: 100 }));
    const numeros = await como(datos.tenantId, datos.propietaria, datos.surco, () => exportarANumeros(exportar, filtro));

    expect(numeros.sort()).toEqual(lista.items.map((item) => item.numero).sort());
    expect(numeros).toHaveLength(10);
    const [registro] = await exportaciones(datos.tenantId);
    expect(registro).toMatchObject({
      entidad_tipo: 'auditoria',
      entidad_id: 'exportacion',
      usuario_id: datos.propietaria,
      sucursal_id: datos.surco,
      despues: { filtros: filtro, filas: 10 },
    });
  });

  it('un supervisor sin alcance TENANT exporta solo su sucursal, sin las filas sin sucursal', async () => {
    const numeros = await como(datos.tenantId, datos.supervisor, datos.surco, () => exportarANumeros(exportar, OCTUBRE));
    const deSurco = await como(datos.tenantId, datos.supervisor, datos.surco, () => consultar.ejecutar(OCTUBRE, { tamano: 100 }));
    expect(numeros.sort()).toEqual(deSurco.items.map((item) => item.numero).sort());
    expect(new Set(deSurco.items.map((item) => item.sucursalId))).toEqual(new Set([datos.surco]));
  });

  it('más de 10 000 filas responde 422 sin fila de auditoría', async () => {
    const escritor = new EscritorAuditoriaXlsx(new PassThrough());
    await expect(como(datos.grande.tenantId, datos.grande.actor, datos.grande.sucursal, () => exportar.ejecutar(OCTUBRE, escritor))).rejects.toThrow(
      ExportacionDemasiadoGrandeError,
    );
    expect(await exportaciones(datos.grande.tenantId)).toEqual([]);
  });

  it('si la auditoría falla responde 503 sin abrir el archivo', async () => {
    const auditoriaCaida: AuditoriaPort = { ...auditoriaReal(), registrar: async () => Promise.reject(new AuditoriaNoDisponibleError()) };
    const sinAuditoria = new ExportarAuditoria({ ...dependencias, auditoria: auditoriaCaida, avisar: () => undefined });
    const destino = new PassThrough();
    const bytes: Buffer[] = [];
    destino.on('data', (parte: Buffer) => bytes.push(parte));
    const antes = (await exportaciones(datos.tenantId)).length;

    await expect(
      como(datos.tenantId, datos.propietaria, datos.surco, () => sinAuditoria.ejecutar(OCTUBRE, new EscritorAuditoriaXlsx(destino))),
    ).rejects.toThrow(AuditoriaNoDisponibleError);
    expect(bytes).toEqual([]);
    expect(await exportaciones(datos.tenantId)).toHaveLength(antes);
  });
});
