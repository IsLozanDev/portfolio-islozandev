import { AlsTenantContext } from '@vitrina/plataforma/kernel-infra';
import type { DirectorioSeg } from '@vitrina/plataforma/seguridad';
import { ConsultarAuditoria, type DependenciasConsultaAuditoria } from '../src/application/consultar-auditoria.js';
import { ObtenerEventoAuditoria } from '../src/application/obtener-evento-auditoria.js';
import type { AlcanceLectura, EventoAuditoriaCompleto, FiltroResuelto, LecturaAuditoria } from '../src/application/ports/lectura-auditoria.port.js';
import { EventoAuditoriaNoEncontradoError, RangoInvalidoError, SucursalFueraDeAlcanceError } from '../src/domain/errores.js';
import { AlcanceActorDePrueba } from './support/seguridad-de-prueba.js';

const TENANT = '0193f3a0-0000-7000-8000-000000000001';
const SURCO = '0193f3a0-0000-7000-8000-000000000102';
const MIRAFLORES = '0193f3a0-0000-7000-8000-000000000101';
const PROPIETARIA = '0193f3a0-0000-7000-8000-000000000901';
const SUPERVISOR = '0193f3a0-0000-7000-8000-000000000902';
const ROSA = '0193f3a0-0000-7000-8000-000000000903';
const OCTUBRE = { desde: '2026-10-01', hasta: '2026-10-31' };

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
  ip: '190.42.10.8',
  ocurridoEn: new Date('2026-10-15T15:00:00Z'),
  antes: { estado: 'EMITIDA', total: 120 },
  despues: { estado: 'ANULADA', total: 0 },
  traceId: null,
  eventId: null,
  hashAnterior: '0'.repeat(64),
  hash: 'a'.repeat(64),
};

function escenario() {
  const contexto = new AlsTenantContext();
  const alcanceActor = new AlcanceActorDePrueba();
  alcanceActor.tenant.add(PROPIETARIA);
  const filtrosListados: FiltroResuelto[] = [];
  const lectura: LecturaAuditoria = {
    listar: async (filtro) => {
      filtrosListados.push(filtro);
      return { items: [anulacion], total: 1 };
    },
    buscar: async (id: string, alcance: AlcanceLectura) =>
      id === anulacion.id && (!alcance.sucursalForzada || alcance.sucursalForzada === anulacion.sucursalId) ? anulacion : null,
    contar: async () => 1,
    recorrer: async (_filtro, alLote) => alLote([anulacion]),
  };
  const busquedas: string[] = [];
  const directorio: DirectorioSeg = {
    buscarUsuarios: async (texto) => {
      busquedas.push(texto);
      return texto === 'rosa' ? [ROSA] : [];
    },
    usuarios: async (ids) => (ids.includes(ROSA) ? [{ id: ROSA, nombre: 'Rosa Huamán', correo: 'rosa@sabores.pe' }] : []),
    sucursales: async (ids) => (ids.includes(SURCO) ? [{ id: SURCO, codigo: 'SURCO', nombre: 'Surco' }] : []),
  };
  const dependencias: DependenciasConsultaAuditoria = {
    unidadDeTrabajo: { run: (trabajo) => trabajo() },
    contexto,
    reloj: { now: () => new Date('2026-11-10T15:00:00Z') },
    alcanceActor,
    directorio,
    lectura,
  };
  const como = <T>(actorId: string, sucursalId: string, trabajo: () => Promise<T>) => contexto.run({ tenantId: TENANT, actorId, branchId: sucursalId }, trabajo);
  return { consultar: new ConsultarAuditoria(dependencias), obtener: new ObtenerEventoAuditoria(dependencias), filtrosListados, busquedas, como };
}

describe('ConsultarAuditoria (spec 20b)', () => {
  it('con alcance TENANT no fuerza sucursal y respeta el sucursal_id del filtro', async () => {
    const { consultar, filtrosListados, como } = escenario();
    await como(PROPIETARIA, MIRAFLORES, () => consultar.ejecutar(OCTUBRE, {}));
    await como(PROPIETARIA, MIRAFLORES, () => consultar.ejecutar({ ...OCTUBRE, sucursalId: SURCO }, {}));
    expect(filtrosListados.map((filtro) => [filtro.sucursalForzada, filtro.sucursalId])).toEqual([
      [undefined, undefined],
      [undefined, SURCO],
    ]);
  });

  it('sin alcance TENANT fuerza la sucursal de X-Sucursal-Id; otra sucursal en el filtro es 403 (TR-CA-214)', async () => {
    const { consultar, filtrosListados, como } = escenario();
    await como(SUPERVISOR, SURCO, () => consultar.ejecutar(OCTUBRE, {}));
    await como(SUPERVISOR, SURCO, () => consultar.ejecutar({ ...OCTUBRE, sucursalId: SURCO }, {}));
    expect(filtrosListados.map((filtro) => filtro.sucursalForzada)).toEqual([SURCO, SURCO]);
    await expect(como(SUPERVISOR, SURCO, () => consultar.ejecutar({ ...OCTUBRE, sucursalId: MIRAFLORES }, {}))).rejects.toThrow(SucursalFueraDeAlcanceError);
  });

  it('busca a las personas por el texto y completa usuario y sucursal de cada fila', async () => {
    const { consultar, filtrosListados, busquedas, como } = escenario();
    const listado = await como(PROPIETARIA, SURCO, () => consultar.ejecutar({ ...OCTUBRE, usuario: ' rosa ', accion: 'rest.venta.anular' }, {}));
    expect(busquedas).toEqual(['rosa']);
    expect(filtrosListados[0]).toMatchObject({ usuarioIds: [ROSA], accion: 'rest.venta.anular' });
    expect(filtrosListados[0]).not.toHaveProperty('usuario');
    expect(listado.items[0]).toMatchObject({
      usuario: { id: ROSA, nombre: 'Rosa Huamán', correo: 'rosa@sabores.pe' },
      sucursal: { id: SURCO, codigo: 'SURCO', nombre: 'Surco' },
    });
  });

  it('un texto de usuario sin coincidencias responde vacío sin leer la tabla', async () => {
    const { consultar, filtrosListados, como } = escenario();
    expect(await como(PROPIETARIA, SURCO, () => consultar.ejecutar({ ...OCTUBRE, usuario: 'nadie' }, {}))).toEqual({ items: [], total: 0 });
    expect(filtrosListados).toEqual([]);
  });

  it('valida el rango antes de leer', async () => {
    const { consultar, filtrosListados, como } = escenario();
    await expect(como(PROPIETARIA, SURCO, () => consultar.ejecutar({ desde: '2026-08-01', hasta: '2026-11-01' }, {}))).rejects.toThrow(RangoInvalidoError);
    expect(filtrosListados).toEqual([]);
  });
});

describe('ObtenerEventoAuditoria (spec 20b)', () => {
  it('devuelve la fila con antes, despues, cambios y nombres', async () => {
    const { obtener, como } = escenario();
    const detalle = await como(PROPIETARIA, MIRAFLORES, () => obtener.ejecutar(anulacion.id));
    expect(detalle).toMatchObject({
      despues: { estado: 'ANULADA', total: 0 },
      cambios: [
        { campo: 'estado', antes: 'EMITIDA', despues: 'ANULADA' },
        { campo: 'total', antes: 120, despues: 0 },
      ],
      usuario: { nombre: 'Rosa Huamán' },
      sucursal: { codigo: 'SURCO' },
    });
  });

  it('fuera del alcance, inexistente o con un id que no es uuid responde que no existe', async () => {
    const { obtener, como } = escenario();
    await expect(como(SUPERVISOR, MIRAFLORES, () => obtener.ejecutar(anulacion.id))).rejects.toThrow(EventoAuditoriaNoEncontradoError);
    await expect(como(SUPERVISOR, SURCO, () => obtener.ejecutar(anulacion.id))).resolves.toMatchObject({ id: anulacion.id });
    await expect(como(PROPIETARIA, SURCO, () => obtener.ejecutar('0193f3a0-0000-7000-8000-00000000ffff'))).rejects.toThrow(EventoAuditoriaNoEncontradoError);
    await expect(como(PROPIETARIA, SURCO, () => obtener.ejecutar('exportar'))).rejects.toThrow(EventoAuditoriaNoEncontradoError);
  });
});
