import { AnalizarArchivo } from '../src/application/analizar-archivo.js';
import { ConfirmarCarga } from '../src/application/confirmar-carga.js';
import type { ArchivosAtascados } from '../src/application/ports/archivos-atascados.js';
import type { TrabajoAnalisis } from '../src/application/ports/cola-analisis.js';
import { ReencolarAnalisisAtascados } from '../src/application/reencolar-analisis-atascados.js';
import { SolicitarCarga } from '../src/application/solicitar-carga.js';
import type { Archivo } from '../src/domain/archivo.js';
import { pdf } from './support/contenidos.js';
import { crearDobles, TENANT_A, TENANT_B, USUARIO, type Dobles } from './support/dobles.js';

const TAMANO_LOTE = 200;

/** Como `arc.archivos_en_analisis_atascados`: los EN_ANALISIS de todos los tenants, del más antiguo al más reciente. */
class ArchivosAtascadosMemoria implements ArchivosAtascados {
  readonly enAnalisisDesde = new Map<string, Date>();
  consultas = 0;

  constructor(private readonly guardados: readonly Archivo[]) {}

  listarEnAnalisisAntesDe(antes: Date, limite: number): Promise<TrabajoAnalisis[]> {
    this.consultas += 1;
    const atascados = this.guardados
      .filter((archivo) => archivo.estado === 'EN_ANALISIS' && (this.enAnalisisDesde.get(archivo.id) as Date) < antes)
      .slice(0, limite)
      .map((archivo) => ({ tenantId: archivo.tenantId, archivoId: archivo.id }));
    return Promise.resolve(atascados);
  }
}

describe('ReencolarAnalisisAtascados (spec 34)', () => {
  let dobles: Dobles;
  let atascados: ArchivosAtascadosMemoria;
  let reencolar: ReencolarAnalisisAtascados;

  beforeEach(() => {
    dobles = crearDobles();
    atascados = new ArchivosAtascadosMemoria(dobles.archivos.guardados);
    reencolar = new ReencolarAnalisisAtascados({ reloj: dobles.reloj, atascados, cola: dobles.cola });
  });

  /** Una carga del tenant dado, aún sin confirmar. */
  async function solicitar(tenantId: string): Promise<Archivo> {
    dobles.contexto.alcance = { tenantId, actorId: USUARIO };
    const solicitada = await new SolicitarCarga(dobles).ejecutar({
      categoria: 'DOCUMENTO',
      nombreOriginal: 'contrato.pdf',
      tamano: pdf().byteLength,
      mime: 'application/pdf',
      entidadTipo: 'PRUEBA_SENSIBLE',
      entidadId: 'E-1',
    });
    dobles.almacen.subirConUrl(solicitada.carga.url, pdf());
    return dobles.archivos.guardados.find((archivo) => archivo.id === solicitada.archivoId) as Archivo;
  }

  /** Un archivo EN_ANALISIS desde ahora (según el reloj de la prueba) cuyo trabajo ya agotó sus intentos. */
  async function dejarEnAnalisis(tenantId: string): Promise<Archivo> {
    const archivo = await solicitar(tenantId);
    await new ConfirmarCarga(dobles).ejecutar(archivo.id);
    atascados.enAnalisisDesde.set(archivo.id, dobles.reloj.now());
    dobles.cola.tomarTodos();
    return archivo;
  }

  const trabajoDe = (archivo: Archivo): TrabajoAnalisis => ({ tenantId: archivo.tenantId, archivoId: archivo.id });
  const encolados = () => [...dobles.cola.vivos.values()];

  it('reencola un archivo que lleva más de 15 minutos EN_ANALISIS', async () => {
    const atascado = await dejarEnAnalisis(TENANT_A);
    dobles.reloj.adelantarMinutos(16);

    expect(await reencolar.ejecutar()).toEqual({ reencolados: 1, fallidos: 0 });
    expect(encolados()).toEqual([trabajoDe(atascado)]);
  });

  it('un archivo de 14 minutos EN_ANALISIS no se toca', async () => {
    await dejarEnAnalisis(TENANT_A);
    dobles.reloj.adelantarMinutos(14);

    expect(await reencolar.ejecutar()).toEqual({ reencolados: 0, fallidos: 0 });
    expect(encolados()).toEqual([]);
  });

  it('no toca archivos en otro estado, por viejos que sean', async () => {
    const pendiente = await solicitar(TENANT_A);
    const disponible = await solicitar(TENANT_A);
    disponible.confirmarCarga();
    disponible.aprobar({ hash: 'a'.repeat(64), bytes: pdf().byteLength, mimeReal: 'application/pdf' });
    const enCuarentena = await solicitar(TENANT_A);
    enCuarentena.confirmarCarga();
    enCuarentena.ponerEnCuarentena({ hash: 'b'.repeat(64), bytes: pdf().byteLength, mimeReal: 'application/pdf', firma: 'Eicar-Signature' });
    const rechazado = await solicitar(TENANT_A);
    rechazado.confirmarCarga();
    rechazado.rechazar('TIPO_NO_PERMITIDO');
    for (const archivo of [pendiente, disponible, enCuarentena, rechazado]) atascados.enAnalisisDesde.set(archivo.id, dobles.reloj.now());
    dobles.reloj.adelantarMinutos(60);

    expect(await reencolar.ejecutar()).toEqual({ reencolados: 0, fallidos: 0 });
    expect(dobles.cola.intentos).toBe(0);
  });

  it('reencola los de varios tenants, cada trabajo con su tenant', async () => {
    const deA = await dejarEnAnalisis(TENANT_A);
    const deB = await dejarEnAnalisis(TENANT_B);
    dobles.reloj.adelantarMinutos(16);

    expect(await reencolar.ejecutar()).toEqual({ reencolados: 2, fallidos: 0 });
    expect(encolados()).toEqual([trabajoDe(deA), trabajoDe(deB)]);
  });

  it('dos corridas seguidas con el trabajo aún vivo dejan un solo trabajo', async () => {
    const atascado = await dejarEnAnalisis(TENANT_A);
    dobles.reloj.adelantarMinutos(16);

    await reencolar.ejecutar();
    await reencolar.ejecutar();

    expect(encolados()).toEqual([trabajoDe(atascado)]);
  });

  it('no cambia el archivo ni abre transacción: reencolado con el antivirus caído sigue EN_ANALISIS y vuelve a salir', async () => {
    const atascado = await dejarEnAnalisis(TENANT_A);
    dobles.reloj.adelantarMinutos(16);
    const escriturasAntes = dobles.archivos.escrituras;
    const transaccionesAntes = dobles.unidadDeTrabajo.transacciones;

    await reencolar.ejecutar();

    expect([dobles.archivos.escrituras, dobles.unidadDeTrabajo.transacciones]).toEqual([escriturasAntes, transaccionesAntes]);
    dobles.antivirus.caido = true;
    for (const trabajo of dobles.cola.tomarTodos()) await expect(new AnalizarArchivo(dobles).ejecutar(trabajo)).rejects.toThrow();
    expect(atascado.estado).toBe('EN_ANALISIS');
    expect(await reencolar.ejecutar()).toEqual({ reencolados: 1, fallidos: 0 });
  });

  it('un archivo reencolado se analiza y queda DISPONIBLE: deja de salir en el barrido', async () => {
    const atascado = await dejarEnAnalisis(TENANT_A);
    dobles.reloj.adelantarMinutos(16);
    await reencolar.ejecutar();

    for (const trabajo of dobles.cola.tomarTodos()) await new AnalizarArchivo(dobles).ejecutar(trabajo);

    expect(atascado.estado).toBe('DISPONIBLE');
    expect(await reencolar.ejecutar()).toEqual({ reencolados: 0, fallidos: 0 });
  });

  it('si la cola falla cuenta los fallidos y sigue con los demás', async () => {
    await dejarEnAnalisis(TENANT_A);
    await dejarEnAnalisis(TENANT_B);
    dobles.reloj.adelantarMinutos(16);
    dobles.cola.caida = true;
    const intentosAntes = dobles.cola.intentos;

    expect(await reencolar.ejecutar()).toEqual({ reencolados: 0, fallidos: 2 });
    expect(dobles.cola.intentos - intentosAntes).toBe(2);
  });

  it('un lote de 200 por corrida, en una sola consulta', async () => {
    for (let numero = 0; numero < TAMANO_LOTE + 5; numero += 1) await dejarEnAnalisis(TENANT_A);
    dobles.reloj.adelantarMinutos(16);
    dobles.cola.intentos = 0;

    expect(await reencolar.ejecutar()).toEqual({ reencolados: TAMANO_LOTE, fallidos: 0 });
    expect([atascados.consultas, dobles.cola.intentos]).toEqual([1, TAMANO_LOTE]);
  });
});
