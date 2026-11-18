import { ConfirmarCarga } from '../src/application/confirmar-carga.js';
import { LimpiarCargasPendientes } from '../src/application/limpiar-cargas-pendientes.js';
import type { CargaPendiente, CargasPendientes } from '../src/application/ports/cargas-pendientes.js';
import { SolicitarCarga } from '../src/application/solicitar-carga.js';
import type { Archivo } from '../src/domain/archivo.js';
import { pdf } from './support/contenidos.js';
import { crearDobles, TENANT_A, TENANT_B, USUARIO, type Dobles } from './support/dobles.js';

const TAMANO_LOTE = 200;
const MINUTOS_POR_HORA = 60;

/** Como `arc.cargas_pendientes_vencidas`: pendientes de todos los tenants, del más antiguo al más reciente. */
class CargasPendientesMemoria implements CargasPendientes {
  readonly creadoEn = new Map<string, Date>();
  consultas = 0;

  constructor(private readonly guardados: readonly Archivo[]) {}

  listarVencidas(antes: Date, limite: number): Promise<CargaPendiente[]> {
    this.consultas += 1;
    const vencidas = this.guardados
      .filter((archivo) => archivo.estado === 'PENDIENTE_CARGA' && (this.creadoEn.get(archivo.id) as Date) < antes)
      .slice(0, limite)
      .map((archivo) => ({ tenantId: archivo.tenantId, archivoId: archivo.id }));
    return Promise.resolve(vencidas);
  }
}

describe('LimpiarCargasPendientes', () => {
  let dobles: Dobles;
  let cargasPendientes: CargasPendientesMemoria;
  let limpiar: LimpiarCargasPendientes;

  beforeEach(() => {
    dobles = crearDobles();
    cargasPendientes = new CargasPendientesMemoria(dobles.archivos.guardados);
    limpiar = new LimpiarCargasPendientes({ ...dobles, cargasPendientes });
  });

  /** Una carga del tenant dado, creada ahora según el reloj de la prueba; con `subir`, su objeto ya está en el almacén. */
  async function solicitar(tenantId: string, subir = true): Promise<Archivo> {
    dobles.contexto.alcance = { tenantId, actorId: USUARIO };
    const solicitada = await new SolicitarCarga(dobles).ejecutar({
      categoria: 'DOCUMENTO',
      nombreOriginal: 'contrato.pdf',
      tamano: pdf().byteLength,
      mime: 'application/pdf',
      entidadTipo: 'PRUEBA_SENSIBLE',
      entidadId: 'E-1',
    });
    if (subir) dobles.almacen.subirConUrl(solicitada.carga.url, pdf());
    cargasPendientes.creadoEn.set(solicitada.archivoId, dobles.reloj.now());
    return dobles.archivos.guardados.find((archivo) => archivo.id === solicitada.archivoId) as Archivo;
  }

  const pasanHoras = (horas: number) => dobles.reloj.adelantarMinutos(horas * MINUTOS_POR_HORA);
  const existe = (archivo: Archivo) => dobles.archivos.guardados.includes(archivo);
  const tieneObjeto = (archivo: Archivo) => dobles.almacen.existe(archivo.primeraVersion.rutaStorage);

  it('borra el objeto y la fila de una carga pendiente de más de 24 horas', async () => {
    const vieja = await solicitar(TENANT_A);
    pasanHoras(25);

    const resultado = await limpiar.ejecutar();

    expect(resultado).toEqual({ borradas: 1, fallidas: 0 });
    expect([existe(vieja), tieneObjeto(vieja)]).toEqual([false, false]);
  });

  it('una carga de 23 horas no se toca', async () => {
    const reciente = await solicitar(TENANT_A);
    pasanHoras(23);

    const resultado = await limpiar.ejecutar();

    expect(resultado).toEqual({ borradas: 0, fallidas: 0 });
    expect([existe(reciente), tieneObjeto(reciente)]).toEqual([true, true]);
  });

  it('una carga vieja que nunca se subió también se borra', async () => {
    const sinObjeto = await solicitar(TENANT_A, false);
    pasanHoras(25);

    expect(await limpiar.ejecutar()).toEqual({ borradas: 1, fallidas: 0 });
    expect(existe(sinObjeto)).toBe(false);
  });

  it('no toca archivos en otro estado, por viejos que sean', async () => {
    const enAnalisis = await solicitar(TENANT_A);
    await new ConfirmarCarga(dobles).ejecutar(enAnalisis.id);
    const disponible = await solicitar(TENANT_A);
    disponible.confirmarCarga();
    disponible.aprobar({ hash: 'a'.repeat(64), bytes: pdf().byteLength, mimeReal: 'application/pdf' });
    pasanHoras(48);

    expect(await limpiar.ejecutar()).toEqual({ borradas: 0, fallidas: 0 });
    expect([existe(enAnalisis), tieneObjeto(enAnalisis), existe(disponible), tieneObjeto(disponible)]).toEqual([true, true, true, true]);
  });

  it('borra cargas de varios tenants, cada una con el contexto de su tenant, y deja el contexto como estaba', async () => {
    const deA = await solicitar(TENANT_A);
    const deB = await solicitar(TENANT_B);
    pasanHoras(25);
    dobles.contexto.alcance = { tenantId: 'sin-tenant' };

    expect(await limpiar.ejecutar()).toEqual({ borradas: 2, fallidas: 0 });
    expect([existe(deA), existe(deB)]).toEqual([false, false]);
    expect(dobles.contexto.alcance).toEqual({ tenantId: 'sin-tenant' });
  });

  it('una carga confirmada entre la lista y el borrado no se borra', async () => {
    const carga = await solicitar(TENANT_A);
    pasanHoras(25);
    const listarReal = cargasPendientes.listarVencidas.bind(cargasPendientes);
    cargasPendientes.listarVencidas = async (antes, limite) => {
      const vencidas = await listarReal(antes, limite);
      carga.confirmarCarga();
      return vencidas;
    };

    expect(await limpiar.ejecutar()).toEqual({ borradas: 0, fallidas: 0 });
    expect([existe(carga), tieneObjeto(carga)]).toEqual([true, true]);
  });

  it('si Storage falla, cuenta las fallidas, conserva las filas y no gira sobre el mismo lote', async () => {
    const primera = await solicitar(TENANT_A);
    const segunda = await solicitar(TENANT_A);
    pasanHoras(25);
    dobles.almacen.borrar = () => Promise.reject(new Error('Storage no responde'));

    expect(await limpiar.ejecutar()).toEqual({ borradas: 0, fallidas: 2 });
    expect([existe(primera), existe(segunda)]).toEqual([true, true]);
    expect(cargasPendientes.consultas).toBe(1);
  });

  it('con más cargas que un lote sigue hasta vaciarlas', async () => {
    for (let numero = 0; numero < TAMANO_LOTE + 5; numero += 1) await solicitar(TENANT_A, false);
    pasanHoras(25);

    expect(await limpiar.ejecutar()).toEqual({ borradas: TAMANO_LOTE + 5, fallidas: 0 });
    expect(dobles.archivos.guardados).toEqual([]);
    expect(cargasPendientes.consultas).toBe(2);
  });
});
