import { ConfirmarCarga } from '../src/application/confirmar-carga.js';
import { ConsultarEstadoArchivo } from '../src/application/consultar-estado.js';
import type { SolicitarCargaComando } from '../src/application/ports/archivo.port.js';
import { SolicitarCarga } from '../src/application/solicitar-carga.js';
import {
  AccesoEntidadDenegadoError,
  AlmacenNoDisponibleError,
  ArchivoNoEncontradoError,
  CategoriaDesconocidaError,
  DatosArchivoInvalidosError,
  MimeNoPermitidoError,
  TamanoExcedidoError,
} from '../src/domain/errores.js';
import { DIEZ_MEGABYTES, VEINTICINCO_MEGABYTES } from './support/categorias.js';
import { pdf } from './support/contenidos.js';
import { AutorizadorFijo, crearDobles, ENTIDAD_CON_AUTORIZADOR, TENANT_A, TENANT_B, USUARIO, type Dobles } from './support/dobles.js';

const BYTES_PDF = pdf().byteLength;
const ARCHIVO_INEXISTENTE = '99999999-0000-4000-8000-000000000009';

function comando(cambios: Partial<SolicitarCargaComando> = {}): SolicitarCargaComando {
  return {
    categoria: 'DOCUMENTO',
    nombreOriginal: 'contrato.pdf',
    tamano: BYTES_PDF,
    mime: 'application/pdf',
    entidadTipo: ENTIDAD_CON_AUTORIZADOR,
    entidadId: 'E-1',
    ...cambios,
  };
}

describe('SolicitarCarga', () => {
  let dobles: Dobles;
  let solicitar: SolicitarCarga;

  beforeEach(() => {
    dobles = crearDobles();
    solicitar = new SolicitarCarga(dobles);
  });

  it('registra el archivo pendiente del tenant y entrega una URL de carga de 2 horas', async () => {
    const solicitada = await solicitar.ejecutar(comando());

    const [archivo] = dobles.archivos.guardados;
    expect(dobles.archivos.guardados).toHaveLength(1);
    expect(archivo).toMatchObject({
      id: solicitada.archivoId,
      tenantId: TENANT_A,
      estado: 'PENDIENTE_CARGA',
      categoria: 'DOCUMENTO',
      nombreOriginal: 'contrato.pdf',
      creadoPor: USUARIO,
    });
    expect(solicitada.carga.expiraEn).toEqual(new Date('2026-11-18T17:00:00.000Z'));
    expect(solicitada.carga.url).toContain(solicitada.carga.token);
  });

  it('la URL sirve para subir a la ruta {tenant}/{archivo}/1, sin el nombre original', async () => {
    const solicitada = await solicitar.ejecutar(comando());

    dobles.almacen.subirConUrl(solicitada.carga.url, pdf());

    const ruta = `${TENANT_A}/${solicitada.archivoId}/1`;
    expect(dobles.almacen.existe(ruta)).toBe(true);
    expect(solicitada.carga.url).not.toContain('contrato');
  });

  it('guarda dentro de la transacción y firma después de confirmarla', async () => {
    await solicitar.ejecutar(comando());

    expect(dobles.unidadDeTrabajo.transacciones).toBe(1);
    expect(dobles.almacen.firmasEnTransaccion).toEqual([false]);
  });

  it.each([
    ['IMAGEN de 10 MB + 1 byte', { categoria: 'IMAGEN', mime: 'image/png', tamano: DIEZ_MEGABYTES + 1 }, DIEZ_MEGABYTES],
    ['DOCUMENTO de 25 MB + 1 byte', { tamano: VEINTICINCO_MEGABYTES + 1 }, VEINTICINCO_MEGABYTES],
  ])('%s → TAMANO_EXCEDIDO con el máximo, sin fila ni URL', async (_caso, cambios, maximo) => {
    await expect(solicitar.ejecutar(comando(cambios))).rejects.toMatchObject({ code: 'TAMANO_EXCEDIDO', tamanoMaxBytes: maximo });
    await expect(solicitar.ejecutar(comando(cambios))).rejects.toThrow(TamanoExcedidoError);

    expect(dobles.archivos.guardados).toEqual([]);
    expect(dobles.almacen.firmasEnTransaccion).toEqual([]);
  });

  it('MIME declarado fuera de la categoría → MIME_NO_PERMITIDO, sin fila ni URL', async () => {
    await expect(solicitar.ejecutar(comando({ mime: 'image/png' }))).rejects.toThrow(MimeNoPermitidoError);

    expect(dobles.archivos.guardados).toEqual([]);
    expect(dobles.almacen.firmasEnTransaccion).toEqual([]);
  });

  it('categoría inexistente → CATEGORIA_DESCONOCIDA', async () => {
    await expect(solicitar.ejecutar(comando({ categoria: 'VIDEO' }))).rejects.toThrow(CategoriaDesconocidaError);

    expect(dobles.archivos.guardados).toEqual([]);
  });

  it('sin usuario en el contexto no hay a quién atribuir la carga', async () => {
    dobles.contexto.alcance = { tenantId: TENANT_A };

    await expect(solicitar.ejecutar(comando())).rejects.toThrow(DatosArchivoInvalidosError);
  });

  it('entidad_tipo sin autorizador registrado pasa con el permiso y el tenant', async () => {
    dobles.autorizadores.push(new AutorizadorFijo('OTRA_ENTIDAD'));

    await expect(solicitar.ejecutar(comando())).resolves.toBeDefined();
    expect(dobles.autorizadores[0]?.consultas).toEqual([]);
  });

  it('con autorizador que permite editar, pasa y se le pregunta por la entidad', async () => {
    const autorizador = new AutorizadorFijo();
    dobles.autorizadores.push(autorizador);

    await solicitar.ejecutar(comando());

    expect(autorizador.consultas).toEqual([['editar', 'E-1']]);
    expect(dobles.archivos.guardados).toHaveLength(1);
  });

  it('con autorizador que niega editar → ACCESO_ENTIDAD_DENEGADO, sin fila ni URL', async () => {
    const autorizador = new AutorizadorFijo();
    autorizador.permiteEditar = false;
    dobles.autorizadores.push(autorizador);

    await expect(solicitar.ejecutar(comando())).rejects.toThrow(AccesoEntidadDenegadoError);

    expect(dobles.archivos.guardados).toEqual([]);
    expect(dobles.almacen.firmasEnTransaccion).toEqual([]);
  });

  it('si Storage no firma → ALMACEN_NO_DISPONIBLE y la fila queda pendiente para la limpieza', async () => {
    dobles.almacen.caido = true;

    await expect(solicitar.ejecutar(comando())).rejects.toThrow(AlmacenNoDisponibleError);

    expect(dobles.archivos.guardados.map((archivo) => archivo.estado)).toEqual(['PENDIENTE_CARGA']);
  });
});

describe('ConfirmarCarga', () => {
  let dobles: Dobles;
  let confirmar: ConfirmarCarga;
  let archivoId: string;

  beforeEach(async () => {
    dobles = crearDobles();
    confirmar = new ConfirmarCarga(dobles);
    archivoId = (await new SolicitarCarga(dobles).ejecutar(comando())).archivoId;
  });

  it('pasa el archivo a EN_ANALISIS y encola su análisis después de la transacción', async () => {
    const estado = await confirmar.ejecutar(archivoId);

    expect(estado).toEqual({ archivoId, estado: 'EN_ANALISIS', categoria: 'DOCUMENTO', nombreOriginal: 'contrato.pdf' });
    expect([...dobles.cola.vivos.values()]).toEqual([{ tenantId: TENANT_A, archivoId, numero: 1 }]);
    expect(dobles.unidadDeTrabajo.enCurso).toBe(0);
  });

  it('confirmar dos veces devuelve el estado actual y deja un solo trabajo en la cola', async () => {
    await confirmar.ejecutar(archivoId);
    const escriturasTrasLaPrimera = dobles.archivos.escrituras;

    const segunda = await confirmar.ejecutar(archivoId);

    expect(segunda.estado).toBe('EN_ANALISIS');
    expect(dobles.cola.vivos.size).toBe(1);
    expect(dobles.archivos.escrituras).toBe(escriturasTrasLaPrimera);
  });

  it('si la cola falla → ALMACEN_NO_DISPONIBLE, el archivo queda EN_ANALISIS y confirmar otra vez lo encola', async () => {
    dobles.cola.caida = true;
    await expect(confirmar.ejecutar(archivoId)).rejects.toMatchObject({ code: 'ALMACEN_NO_DISPONIBLE', codigoOrigen: 'cola_analisis' });
    expect(dobles.archivos.guardados[0]?.estado).toBe('EN_ANALISIS');
    expect(dobles.cola.vivos.size).toBe(0);

    dobles.cola.caida = false;
    await confirmar.ejecutar(archivoId);

    expect([...dobles.cola.vivos.keys()]).toEqual([`${archivoId}-1`]);
  });

  it.each(['DISPONIBLE', 'RECHAZADO', 'CUARENTENA'] as const)('un archivo %s se devuelve tal cual, sin encolar', async (estadoFinal) => {
    const archivo = dobles.archivos.guardados[0];
    archivo?.confirmarCarga();
    const contenido = { hash: 'a'.repeat(64), bytes: BYTES_PDF, mimeReal: 'application/pdf' };
    if (estadoFinal === 'DISPONIBLE') archivo?.aprobar(contenido);
    if (estadoFinal === 'RECHAZADO') archivo?.rechazar('TIPO_NO_PERMITIDO');
    if (estadoFinal === 'CUARENTENA') archivo?.ponerEnCuarentena({ ...contenido, firma: 'EICAR-Test-File' });

    const estado = await confirmar.ejecutar(archivoId);

    expect(estado.estado).toBe(estadoFinal);
    expect(dobles.cola.intentos).toBe(0);
  });

  it('un archivo que no existe o es de otro tenant → NO_ENCONTRADO (TR-CA-205)', async () => {
    await expect(confirmar.ejecutar(ARCHIVO_INEXISTENTE)).rejects.toThrow(ArchivoNoEncontradoError);

    dobles.contexto.alcance = { tenantId: TENANT_B, actorId: USUARIO };
    await expect(confirmar.ejecutar(archivoId)).rejects.toThrow(ArchivoNoEncontradoError);

    expect(dobles.archivos.guardados[0]?.estado).toBe('PENDIENTE_CARGA');
    expect(dobles.cola.intentos).toBe(0);
  });
});

describe('ConsultarEstadoArchivo', () => {
  let dobles: Dobles;
  let consultar: ConsultarEstadoArchivo;
  let archivoId: string;

  beforeEach(async () => {
    dobles = crearDobles();
    consultar = new ConsultarEstadoArchivo(dobles);
    archivoId = (await new SolicitarCarga(dobles).ejecutar(comando())).archivoId;
  });

  it('un archivo pendiente no trae bytes, hash ni motivo', async () => {
    expect(await consultar.ejecutar(archivoId)).toEqual({
      archivoId,
      estado: 'PENDIENTE_CARGA',
      categoria: 'DOCUMENTO',
      nombreOriginal: 'contrato.pdf',
    });
  });

  it('un archivo disponible trae sus bytes y su hash', async () => {
    const archivo = dobles.archivos.guardados[0];
    archivo?.confirmarCarga();
    archivo?.aprobar({ hash: 'b'.repeat(64), bytes: BYTES_PDF, mimeReal: 'application/pdf' });

    expect(await consultar.ejecutar(archivoId)).toMatchObject({ estado: 'DISPONIBLE', bytes: BYTES_PDF, hashSha256: 'b'.repeat(64) });
  });

  it('un archivo rechazado trae su motivo', async () => {
    const archivo = dobles.archivos.guardados[0];
    archivo?.confirmarCarga();
    archivo?.rechazar('TAMANO_NO_COINCIDE');

    expect(await consultar.ejecutar(archivoId)).toMatchObject({ estado: 'RECHAZADO', motivoRechazo: 'TAMANO_NO_COINCIDE' });
  });

  it('un archivo de otro tenant → NO_ENCONTRADO (TR-CA-205)', async () => {
    dobles.contexto.alcance = { tenantId: TENANT_B, actorId: USUARIO };

    await expect(consultar.ejecutar(archivoId)).rejects.toThrow(ArchivoNoEncontradoError);
  });
});
