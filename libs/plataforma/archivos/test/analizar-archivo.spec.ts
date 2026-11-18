import { createHash } from 'node:crypto';
import { AnalizarArchivo } from '../src/application/analizar-archivo.js';
import { ConfirmarCarga } from '../src/application/confirmar-carga.js';
import type { SolicitarCargaComando } from '../src/application/ports/archivo.port.js';
import { SolicitarCarga } from '../src/application/solicitar-carga.js';
import type { Archivo } from '../src/domain/archivo.js';
import { AlmacenNoDisponibleError } from '../src/domain/errores.js';
import { ejecutable, pdf, texto } from './support/contenidos.js';
import { crearDobles, TENANT_A, TENANT_B, type Dobles } from './support/dobles.js';

/** 1,2 MB, como el PDF de TR-CA-199. */
const BYTES_PDF_GRANDE = 1_258_291;
// Partida en dos para que el antivirus de la máquina no ponga este archivo en cuarentena.
const CADENA_EICAR = ['X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD', '-ANTIVIRUS-TEST-FILE!$H+H*'].join('');

function pdfDe(bytes: number): Uint8Array {
  const contenido = new Uint8Array(bytes).fill(0x20);
  contenido.set(pdf());
  return contenido;
}

const pdfInfectado = (): Uint8Array => Uint8Array.from([...pdf(), ...texto(CADENA_EICAR)]);
const sha256 = (contenido: Uint8Array): string => createHash('sha256').update(contenido).digest('hex');

describe('AnalizarArchivo', () => {
  let dobles: Dobles;
  let analizar: AnalizarArchivo;

  beforeEach(() => {
    dobles = crearDobles();
    analizar = new AnalizarArchivo(dobles);
  });

  /** Lo que hace el cliente: pide la URL, sube (si hay contenido) y confirma. Devuelve el archivo guardado. */
  async function cargar(contenido: Uint8Array | null, cambios: Partial<SolicitarCargaComando> = {}): Promise<Archivo> {
    const solicitada = await new SolicitarCarga(dobles).ejecutar({
      categoria: 'DOCUMENTO',
      nombreOriginal: 'contrato.pdf',
      tamano: contenido?.byteLength ?? pdf().byteLength,
      mime: 'application/pdf',
      entidadTipo: 'PRUEBA_SENSIBLE',
      entidadId: 'E-1',
      ...cambios,
    });
    if (contenido) dobles.almacen.subirConUrl(solicitada.carga.url, contenido);
    await new ConfirmarCarga(dobles).ejecutar(solicitada.archivoId);
    return dobles.archivos.guardados.find((archivo) => archivo.id === solicitada.archivoId) as Archivo;
  }

  /** El worker toma los trabajos de la cola, sin tenant en el contexto: lo pone el caso de uso. */
  async function procesarCola(): Promise<void> {
    dobles.contexto.alcance = { tenantId: TENANT_B };
    for (const trabajo of dobles.cola.tomarTodos()) await analizar.ejecutar(trabajo);
  }

  it('TR-CA-199: un PDF de 1,2 MB queda DISPONIBLE con hash, bytes y tipo real, y publica archivo.disponible', async () => {
    const contenido = pdfDe(BYTES_PDF_GRANDE);
    const archivo = await cargar(contenido);

    await procesarCola();

    expect(archivo).toMatchObject({ estado: 'DISPONIBLE', versionVigente: 1 });
    expect(archivo.primeraVersion).toMatchObject({ hashSha256: sha256(contenido), bytes: BYTES_PDF_GRANDE, mimeReal: 'application/pdf' });
    expect(dobles.publicador.tipos()).toEqual(['archivo.disponible']);
    expect(dobles.publicador.eventos[0]?.payload).toEqual({
      archivo_id: archivo.id,
      categoria: 'DOCUMENTO',
      entidad_tipo: 'PRUEBA_SENSIBLE',
      entidad_id: 'E-1',
      version: 1,
      hash_sha256: sha256(contenido),
      bytes: BYTES_PDF_GRANDE,
      mime_real: 'application/pdf',
    });
    expect(dobles.almacen.existe(archivo.primeraVersion.rutaStorage)).toBe(true);
  });

  it('el evento se publica en la misma transacción que guarda el archivo', async () => {
    await cargar(pdf());

    await procesarCola();

    expect(dobles.publicador.publicadosEnTransaccion).toEqual([true]);
    expect(dobles.unidadDeTrabajo.enCurso).toBe(0);
  });

  it('TR-CA-200: un .exe declarado application/pdf queda RECHAZADO, se borra de Storage y no hay evento', async () => {
    const archivo = await cargar(ejecutable(), { nombreOriginal: 'factura.pdf' });

    await procesarCola();

    expect(archivo).toMatchObject({ estado: 'RECHAZADO', motivoRechazo: 'TIPO_NO_PERMITIDO', versionVigente: null });
    expect(dobles.almacen.existe(archivo.primeraVersion.rutaStorage)).toBe(false);
    expect(dobles.publicador.eventos).toEqual([]);
  });

  it('TR-CA-201: un archivo con la firma EICAR queda en CUARENTENA, publica el evento y el objeto sigue en Storage', async () => {
    const contenido = pdfInfectado();
    const archivo = await cargar(contenido);

    await procesarCola();

    expect(archivo).toMatchObject({ estado: 'CUARENTENA', versionVigente: null });
    expect(archivo.primeraVersion.hashSha256).toBe(sha256(contenido));
    expect(dobles.publicador.tipos()).toEqual(['archivo.en_cuarentena']);
    expect(dobles.publicador.eventos[0]?.payload).toMatchObject({ archivo_id: archivo.id, firma: 'EICAR-Test-File' });
    expect(dobles.almacen.existe(archivo.primeraVersion.rutaStorage)).toBe(true);
  });

  it('el tamaño real distinto del declarado → RECHAZADO por TAMANO_NO_COINCIDE y objeto borrado', async () => {
    const archivo = await cargar(pdf(), { tamano: pdf().byteLength + 10 });

    await procesarCola();

    expect(archivo).toMatchObject({ estado: 'RECHAZADO', motivoRechazo: 'TAMANO_NO_COINCIDE' });
    expect(dobles.almacen.existe(archivo.primeraVersion.rutaStorage)).toBe(false);
    expect(dobles.publicador.eventos).toEqual([]);
  });

  it('confirmar sin haber subido el objeto devuelve el archivo a PENDIENTE_CARGA y el cliente puede reintentar', async () => {
    const archivo = await cargar(null);

    await procesarCola();
    expect(archivo.estado).toBe('PENDIENTE_CARGA');
    expect(dobles.publicador.eventos).toEqual([]);

    dobles.contexto.alcance = { tenantId: TENANT_A };
    const { url } = await dobles.almacen.firmarCarga(archivo.primeraVersion.rutaStorage);
    dobles.almacen.subirConUrl(url, pdf());
    await new ConfirmarCarga(dobles).ejecutar(archivo.id);
    await procesarCola();

    expect(archivo.estado).toBe('DISPONIBLE');
  });

  it('reprocesar el mismo trabajo no cambia el estado ni duplica eventos', async () => {
    const archivo = await cargar(pdf());
    const trabajo = { tenantId: TENANT_A, archivoId: archivo.id };
    await procesarCola();
    const escrituras = dobles.archivos.escrituras;

    await analizar.ejecutar(trabajo);
    await analizar.ejecutar(trabajo);

    expect(archivo.estado).toBe('DISPONIBLE');
    expect(dobles.publicador.tipos()).toEqual(['archivo.disponible']);
    expect(dobles.archivos.escrituras).toBe(escrituras);
  });

  it('reprocesar un rechazado vuelve a borrar el objeto que un intento anterior no llegó a borrar', async () => {
    const archivo = await cargar(ejecutable());
    await procesarCola();
    const { url } = await dobles.almacen.firmarCarga(archivo.primeraVersion.rutaStorage);
    dobles.almacen.subirConUrl(url, ejecutable());

    await analizar.ejecutar({ tenantId: TENANT_A, archivoId: archivo.id });

    expect(dobles.almacen.existe(archivo.primeraVersion.rutaStorage)).toBe(false);
    expect(archivo.estado).toBe('RECHAZADO');
  });

  it('un trabajo de un archivo que ya no existe termina sin error', async () => {
    await expect(analizar.ejecutar({ tenantId: TENANT_A, archivoId: '99999999-0000-4000-8000-000000000009' })).resolves.toBeUndefined();
  });

  it('un trabajo con el tenant equivocado no toca el archivo', async () => {
    const archivo = await cargar(pdf());
    dobles.cola.tomarTodos();

    await analizar.ejecutar({ tenantId: TENANT_B, archivoId: archivo.id });

    expect(archivo.estado).toBe('EN_ANALISIS');
  });

  it('si Storage falla al leer, relanza para que la cola reintente y el archivo sigue EN_ANALISIS', async () => {
    const archivo = await cargar(pdf());
    dobles.almacen.caido = true;

    await expect(procesarCola()).rejects.toThrow(AlmacenNoDisponibleError);

    expect(archivo.estado).toBe('EN_ANALISIS');
    expect(dobles.publicador.eventos).toEqual([]);
  });

  it('si el antivirus falla, relanza y el archivo sigue EN_ANALISIS; el reintento lo deja disponible', async () => {
    const archivo = await cargar(pdf());
    const trabajo = { tenantId: TENANT_A, archivoId: archivo.id };
    dobles.antivirus.caido = true;

    await expect(analizar.ejecutar(trabajo)).rejects.toThrow('el antivirus no responde');
    expect(archivo.estado).toBe('EN_ANALISIS');

    dobles.antivirus.caido = false;
    await analizar.ejecutar(trabajo);

    expect(archivo.estado).toBe('DISPONIBLE');
  });

  it('un texto con la firma EICAR en ADJUNTO_SOPORTE también queda en cuarentena', async () => {
    const contenido = texto(CADENA_EICAR);
    const archivo = await cargar(contenido, { categoria: 'ADJUNTO_SOPORTE', mime: 'text/plain', nombreOriginal: 'nota.txt' });

    await procesarCola();

    expect(archivo.estado).toBe('CUARENTENA');
  });
});
