import { AlsTenantContext } from '@vitrina/plataforma/kernel-infra';
import type { DirectorioSeg } from '@vitrina/plataforma/seguridad';
import { ExportarAuditoria } from '../src/application/exportar-auditoria.js';
import type { AuditoriaPort } from '../src/application/ports/auditoria.port.js';
import type { EscritorAuditoria, EventoAuditoriaExportado } from '../src/application/ports/escritor-auditoria.port.js';
import type { EventoAuditoriaCompleto, FiltroResuelto, LecturaAuditoria } from '../src/application/ports/lectura-auditoria.port.js';
import type { EntradaAuditoria } from '../src/domain/entradas.js';
import { AuditoriaNoDisponibleError, ExportacionDemasiadoGrandeError, SucursalFueraDeAlcanceError } from '../src/domain/errores.js';
import { AlcanceActorDePrueba } from './support/seguridad-de-prueba.js';

const TENANT = '0193f3a0-0000-7000-8000-000000000001';
const SURCO = '0193f3a0-0000-7000-8000-000000000102';
const MIRAFLORES = '0193f3a0-0000-7000-8000-000000000101';
const PROPIETARIA = '0193f3a0-0000-7000-8000-000000000901';
const SUPERVISOR = '0193f3a0-0000-7000-8000-000000000902';
const ROSA = '0193f3a0-0000-7000-8000-000000000903';
const OCTUBRE = { desde: '2026-10-01', hasta: '2026-10-31' };
const MAXIMO = 10_000;

const anulacion: EventoAuditoriaCompleto = {
  id: '0193f3a0-0000-7000-8000-00000000a001',
  numero: '7',
  tipo: 'OPERACION',
  origen: 'DIRECTO',
  accion: 'rest.venta.anular',
  entidadTipo: 'venta',
  entidadId: 'V-000981',
  usuarioId: ROSA,
  sucursalId: SURCO,
  motivo: 'cliente desistió',
  finalidad: null,
  ticket: null,
  personaTitularId: null,
  ip: null,
  ocurridoEn: new Date('2026-10-15T15:00:00Z'),
  antes: { estado: 'EMITIDA', items: [{ monto: 10 }] },
  despues: { estado: 'ANULADA', items: [{ monto: 0 }] },
  traceId: null,
  eventId: null,
  hashAnterior: '0'.repeat(64),
  hash: 'a'.repeat(64),
};

/** Guarda el orden de lo que pasa: la fila de auditoría tiene que quedar antes del primer byte. */
function escenario(opciones: { filas?: number; auditoriaCae?: boolean } = {}) {
  const pasos: string[] = [];
  const registrados: EntradaAuditoria[] = [];
  const avisos: { mensaje: string; datos: Record<string, unknown> }[] = [];
  const recorridos: FiltroResuelto[] = [];
  const escritas: EventoAuditoriaExportado[] = [];
  const contexto = new AlsTenantContext();
  const alcanceActor = new AlcanceActorDePrueba();
  alcanceActor.tenant.add(PROPIETARIA);

  const lectura: LecturaAuditoria = {
    listar: async () => ({ items: [], total: 0 }),
    buscar: async () => null,
    contar: async () => opciones.filas ?? 1,
    recorrer: async (filtro, alLote) => {
      recorridos.push(filtro);
      await alLote([anulacion]);
    },
  };
  const auditoria: AuditoriaPort = {
    registrar: async (entrada) => {
      if (opciones.auditoriaCae) throw new AuditoriaNoDisponibleError();
      pasos.push('auditar');
      registrados.push(entrada);
    },
    registrarAccesoSensible: async () => undefined,
  };
  const directorio: DirectorioSeg = {
    buscarUsuarios: async (texto) => (texto === 'rosa' ? [ROSA] : []),
    usuarios: async () => [{ id: ROSA, nombre: 'Rosa Huamán', correo: 'rosa@sabores.pe' }],
    sucursales: async () => [{ id: SURCO, codigo: 'SURCO', nombre: 'Surco' }],
  };
  const escritor: EscritorAuditoria = {
    abrir: () => {
      pasos.push('abrir');
    },
    escribir: async (eventos) => {
      escritas.push(...eventos);
    },
    terminar: async () => {
      pasos.push('terminar');
    },
  };
  const exportar = new ExportarAuditoria({
    unidadDeTrabajo: { run: (trabajo) => trabajo() },
    contexto,
    reloj: { now: () => new Date('2026-11-10T15:00:00Z') },
    alcanceActor,
    directorio,
    lectura,
    auditoria,
    avisar: (mensaje, datos) => avisos.push({ mensaje, datos }),
  });
  const como = (actorId: string, sucursalId: string, filtro: Parameters<ExportarAuditoria['ejecutar']>[0]) =>
    contexto.run({ tenantId: TENANT, actorId, branchId: sucursalId }, () => exportar.ejecutar(filtro, escritor));
  return { como, pasos, registrados, avisos, recorridos, escritas };
}

describe('ExportarAuditoria (spec 20b, TR-RN-047)', () => {
  it('audita la exportación con los filtros y el número de filas antes de abrir el archivo', async () => {
    const { como, pasos, registrados } = escenario({ filas: 7 });
    await como(PROPIETARIA, SURCO, { ...OCTUBRE, usuario: 'rosa', accion: 'rest.venta.anular' });

    expect(pasos).toEqual(['auditar', 'abrir', 'terminar']);
    expect(registrados).toEqual([
      {
        accion: 'plat.auditoria.exportar',
        entidadTipo: 'auditoria',
        entidadId: 'exportacion',
        despues: { filtros: { ...OCTUBRE, usuario: 'rosa', accion: 'rest.venta.anular' }, filas: 7 },
      },
    ]);
  });

  it('escribe las filas con nombres y las rutas que cambiaron, sin el JSON', async () => {
    const { como, escritas } = escenario();
    await como(PROPIETARIA, SURCO, OCTUBRE);
    expect(escritas).toHaveLength(1);
    expect(escritas[0]).toMatchObject({
      camposCambiados: 'estado, items[0].monto',
      usuario: { nombre: 'Rosa Huamán' },
      sucursal: { codigo: 'SURCO' },
    });
  });

  it('más de 10 000 filas responde 422 sin auditar ni abrir el archivo', async () => {
    const { como, pasos } = escenario({ filas: MAXIMO + 1 });
    await expect(como(PROPIETARIA, SURCO, OCTUBRE)).rejects.toThrow(ExportacionDemasiadoGrandeError);
    expect(pasos).toEqual([]);
  });

  it('si la auditoría falla responde 503 sin abrir el archivo y el log no lleva los filtros', async () => {
    const { como, pasos, avisos } = escenario({ auditoriaCae: true });
    await expect(como(PROPIETARIA, SURCO, { ...OCTUBRE, usuario: 'rosa' })).rejects.toThrow(AuditoriaNoDisponibleError);
    expect(pasos).toEqual([]);
    expect(avisos).toEqual([{ mensaje: 'aud.exportacion.auditoria_error', datos: { error: 'AuditoriaNoDisponibleError' } }]);
  });

  it('un supervisor sin alcance TENANT exporta solo su sucursal; otra sucursal es 403', async () => {
    const { como, recorridos } = escenario();
    await como(SUPERVISOR, SURCO, OCTUBRE);
    expect(recorridos.map((filtro) => filtro.sucursalForzada)).toEqual([SURCO]);
    await expect(como(SUPERVISOR, SURCO, { ...OCTUBRE, sucursalId: MIRAFLORES })).rejects.toThrow(SucursalFueraDeAlcanceError);
  });

  it('un texto de usuario sin coincidencias audita 0 filas y entrega el archivo vacío', async () => {
    const { como, pasos, registrados, recorridos } = escenario();
    await como(PROPIETARIA, SURCO, { ...OCTUBRE, usuario: 'nadie' });
    expect(pasos).toEqual(['auditar', 'abrir', 'terminar']);
    expect(registrados[0].despues).toMatchObject({ filas: 0 });
    expect(recorridos).toEqual([]);
  });
});
