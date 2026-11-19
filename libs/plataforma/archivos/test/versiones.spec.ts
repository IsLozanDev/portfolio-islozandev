import { createHash } from 'node:crypto';
import { AnalizarArchivo } from '../src/application/analizar-archivo.js';
import { ConfirmarCarga } from '../src/application/confirmar-carga.js';
import { ConfirmarVersion } from '../src/application/confirmar-version.js';
import { ConsultarEstadoArchivo } from '../src/application/consultar-estado.js';
import { EmitirUrlDescarga } from '../src/application/emitir-url-descarga.js';
import { ListarVersiones } from '../src/application/listar-versiones.js';
import { MarcarVersionVigente } from '../src/application/marcar-version-vigente.js';
import type { TrabajoAnalisis } from '../src/application/ports/cola-analisis.js';
import { SolicitarCarga } from '../src/application/solicitar-carga.js';
import { SolicitarVersion } from '../src/application/solicitar-version.js';
import type { Archivo } from '../src/domain/archivo.js';
import {
  AccesoEntidadDenegadoError,
  ArchivoNoDisponibleError,
  ArchivoNoEncontradoError,
  MimeNoPermitidoError,
  TamanoExcedidoError,
  VersionEnCursoError,
  VersionNoDisponibleError,
  VersionNoEncontradaError,
} from '../src/domain/errores.js';
import { MIME_DOCX, VEINTICINCO_MEGABYTES } from './support/categorias.js';
import { docx, ejecutable, pdf, texto } from './support/contenidos.js';
import { AutorizadorFijo, crearDobles, ENTIDAD_CON_AUTORIZADOR, TENANT_A, TENANT_B, USUARIO, type Dobles } from './support/dobles.js';

// Partida en dos para que el antivirus de la máquina no ponga este archivo en cuarentena.
const CADENA_EICAR = ['X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD', '-ANTIVIRUS-TEST-FILE!$H+H*'].join('');
const sha256 = (contenido: Uint8Array): string => createHash('sha256').update(contenido).digest('hex');
/** Un PDF distinto por marca: cada versión con su propio hash. */
const pdfCon = (marca: string): Uint8Array => Uint8Array.from([...pdf(), ...texto(`% ${marca}\n`)]);
const pdfInfectado = (): Uint8Array => Uint8Array.from([...pdf(), ...texto(CADENA_EICAR)]);

describe('Versiones de un archivo (spec 35, TR-RF-081)', () => {
  let dobles: Dobles;

  beforeEach(() => {
    dobles = crearDobles();
  });

  const archivoGuardado = (archivoId: string) => dobles.archivos.guardados.find((archivo) => archivo.id === archivoId) as Archivo;

  /** El único trabajo encolado, que el worker toma. */
  function tomarUnTrabajo(): TrabajoAnalisis {
    const [trabajo] = dobles.cola.tomarTodos();
    if (!trabajo) throw new Error('debía haber un trabajo en la cola');
    return trabajo;
  }

  /** El worker toma los trabajos de la cola. */
  async function procesarCola(): Promise<void> {
    for (const trabajo of dobles.cola.tomarTodos()) await new AnalizarArchivo(dobles).ejecutar(trabajo);
  }

  /** Un archivo DISPONIBLE en versión 1 con ese contenido. */
  async function disponible(contenido: Uint8Array = pdfCon('v1')): Promise<Archivo> {
    const solicitada = await new SolicitarCarga(dobles).ejecutar({
      categoria: 'DOCUMENTO',
      nombreOriginal: 'contrato.pdf',
      tamano: contenido.byteLength,
      mime: 'application/pdf',
      entidadTipo: ENTIDAD_CON_AUTORIZADOR,
      entidadId: 'E-1',
    });
    dobles.almacen.subirConUrl(solicitada.carga.url, contenido);
    await new ConfirmarCarga(dobles).ejecutar(solicitada.archivoId);
    await procesarCola();
    return archivoGuardado(solicitada.archivoId);
  }

  /** Lo que hace el cliente con una versión nueva: la pide, la sube (si hay contenido) y la confirma. */
  async function pedirYConfirmar(archivo: Archivo, contenido: Uint8Array | null, cambios: { tamano?: number; mime?: string } = {}): Promise<number> {
    const { numero, carga } = await new SolicitarVersion(dobles).ejecutar({
      archivoId: archivo.id,
      tamano: contenido?.byteLength ?? pdf().byteLength,
      mime: 'application/pdf',
      ...cambios,
    });
    if (contenido) dobles.almacen.subirConUrl(carga.url, contenido);
    await new ConfirmarVersion(dobles).ejecutar(archivo.id, numero);
    return numero;
  }

  async function subirVersion(archivo: Archivo, contenido: Uint8Array, cambios: { tamano?: number; mime?: string } = {}): Promise<number> {
    const numero = await pedirYConfirmar(archivo, contenido, cambios);
    await procesarCola();
    return numero;
  }

  const descargar = (archivoId: string, version?: number) => new EmitirUrlDescarga(dobles).ejecutar({ archivoId, version });
  const bajar = async (archivoId: string, version?: number) => dobles.almacen.descargarConUrl((await descargar(archivoId, version)).url);
  const estado = (archivoId: string) => new ConsultarEstadoArchivo(dobles).ejecutar(archivoId);
  const rutaDe = (archivo: Archivo, numero: number) => `${archivo.tenantId}/${archivo.id}/${numero}`;

  it('TR-CA-202: un archivo en versión 2 recibe la corregida → versión 3 vigente, archivo.version_creada y las anteriores se descargan', async () => {
    const archivo = await disponible(pdfCon('v1'));
    await subirVersion(archivo, pdfCon('v2'));

    const numero = await subirVersion(archivo, pdfCon('v3'));

    expect(numero).toBe(3);
    expect(archivo).toMatchObject({ estado: 'DISPONIBLE', versionVigente: 3 });
    expect(dobles.publicador.tipos()).toEqual(['archivo.disponible', 'archivo.version_creada', 'archivo.version_creada']);
    expect(dobles.publicador.eventos.at(-1)?.payload).toMatchObject({ archivo_id: archivo.id, version: 3, hash_sha256: sha256(pdfCon('v3')) });
    expect(await bajar(archivo.id)).toEqual(pdfCon('v3'));
    expect(await bajar(archivo.id, 1)).toEqual(pdfCon('v1'));
    expect(await bajar(archivo.id, 2)).toEqual(pdfCon('v2'));
    expect(archivoGuardado(archivo.id).versionNumero(3)?.rutaStorage).toBe(rutaDe(archivo, 3));
  });

  it('TR-CA-203: el mismo hash que la vigente → sin versión nueva, fila y objeto borrados, rechazo IDENTICA; el siguiente intento recibe el mismo número', async () => {
    const archivo = await disponible(pdfCon('v1'));

    const numero = await subirVersion(archivo, pdfCon('v1'));

    expect(archivo.versiones.map((version) => version.numero)).toEqual([1]);
    expect(dobles.almacen.existe(rutaDe(archivo, numero))).toBe(false);
    expect(await estado(archivo.id)).toMatchObject({
      versionVigente: 1,
      rechazoVersion: { motivo: 'IDENTICA', versionCoincidente: 1, mensaje: 'El archivo es idéntico a la versión vigente' },
    });
    expect(dobles.publicador.tipos()).toEqual(['archivo.disponible']);
    expect(await subirVersion(archivo, pdfCon('v2'))).toBe(numero);
  });

  it('idéntico a una versión anterior no vigente → IDENTICA con su número', async () => {
    const archivo = await disponible(pdfCon('v1'));
    await subirVersion(archivo, pdfCon('v2'));

    await subirVersion(archivo, pdfCon('v1'));

    expect((await estado(archivo.id)).rechazoVersion).toEqual({
      motivo: 'IDENTICA',
      versionCoincidente: 1,
      mensaje: 'El archivo es idéntico a la versión 1',
    });
  });

  it.each([
    ['un .exe declarado application/pdf', () => ejecutable(), {}, 'TIPO_NO_PERMITIDO'],
    ['un tamaño distinto del declarado', () => pdfCon('v2'), { tamano: pdfCon('v2').byteLength + 10 }, 'TAMANO_NO_COINCIDE'],
  ] as const)('%s → rechazada con %s, sin consumir número, objeto borrado, sin evento', async (_caso, contenido, cambios, motivo) => {
    const archivo = await disponible();

    const numero = await subirVersion(archivo, contenido(), cambios);

    expect(archivo).toMatchObject({ estado: 'DISPONIBLE', versionVigente: 1, rechazoVersion: { motivo, versionCoincidente: null } });
    expect(archivo.versionNumero(numero)).toBeNull();
    expect(dobles.almacen.existe(rutaDe(archivo, numero))).toBe(false);
    expect(dobles.publicador.tipos()).toEqual(['archivo.disponible']);
  });

  it('EICAR → la versión queda en CUARENTENA y consume número; el objeto sigue; el archivo conserva su vigente; descargarla → VERSION_NO_DISPONIBLE', async () => {
    const archivo = await disponible();

    const numero = await subirVersion(archivo, pdfInfectado());

    expect(archivo.versionNumero(numero)?.estado).toBe('CUARENTENA');
    expect(archivo).toMatchObject({ estado: 'DISPONIBLE', versionVigente: 1 });
    expect(dobles.almacen.existe(rutaDe(archivo, numero))).toBe(true);
    expect(dobles.publicador.eventos.at(-1)).toMatchObject({ eventType: 'archivo.en_cuarentena', payload: { version: 2, firma: 'EICAR-Test-File' } });
    await expect(descargar(archivo.id, numero)).rejects.toThrow(new VersionNoDisponibleError('CUARENTENA'));
    expect(await subirVersion(archivo, pdfCon('v3'))).toBe(3);
  });

  it('una segunda subida de EICAR → IDENTICA contra la versión en cuarentena, sin violar uq_version_hash', async () => {
    const archivo = await disponible();
    const enCuarentena = await subirVersion(archivo, pdfInfectado());

    await subirVersion(archivo, pdfInfectado());

    expect((await estado(archivo.id)).rechazoVersion).toMatchObject({ motivo: 'IDENTICA', versionCoincidente: enCuarentena });
    expect(archivo.versiones.map((version) => version.numero)).toEqual([1, 2]);
  });

  it('con otra versión PENDIENTE_CARGA o EN_ANALISIS → VERSION_EN_CURSO con su número; mientras, la descarga entrega la vigente', async () => {
    const archivo = await disponible(pdfCon('v1'));
    const solicitar = () => new SolicitarVersion(dobles).ejecutar({ archivoId: archivo.id, tamano: 10, mime: 'application/pdf' });
    await solicitar();

    await expect(solicitar()).rejects.toThrow(expect.objectContaining({ code: 'VERSION_EN_CURSO', numero: 2 }));
    expect(await estado(archivo.id)).toMatchObject({ versionEnCurso: { numero: 2, estado: 'PENDIENTE_CARGA' } });
    expect(await bajar(archivo.id)).toEqual(pdfCon('v1'));
    dobles.almacen.subirConUrl((await dobles.almacen.firmarCarga(rutaDe(archivo, 2))).url, pdfCon('v2'));
    await new ConfirmarVersion(dobles).ejecutar(archivo.id, 2);
    await expect(solicitar()).rejects.toThrow(VersionEnCursoError);
    expect((await estado(archivo.id)).versionEnCurso).toEqual({ numero: 2, estado: 'EN_ANALISIS' });
  });

  it.each(['PENDIENTE_CARGA', 'EN_ANALISIS', 'RECHAZADO', 'CUARENTENA'] as const)(
    'versionar o marcar vigente un archivo %s → ARCHIVO_NO_DISPONIBLE con su estado',
    async (estadoArchivo) => {
      const contenidos = { PENDIENTE_CARGA: null, EN_ANALISIS: null, RECHAZADO: ejecutable(), CUARENTENA: pdfInfectado() };
      const solicitada = await new SolicitarCarga(dobles).ejecutar({
        categoria: 'DOCUMENTO',
        nombreOriginal: 'contrato.pdf',
        tamano: contenidos[estadoArchivo]?.byteLength ?? 10,
        mime: 'application/pdf',
        entidadTipo: ENTIDAD_CON_AUTORIZADOR,
        entidadId: 'E-1',
      });
      const contenido = contenidos[estadoArchivo];
      if (contenido) dobles.almacen.subirConUrl(solicitada.carga.url, contenido);
      if (estadoArchivo !== 'PENDIENTE_CARGA') await new ConfirmarCarga(dobles).ejecutar(solicitada.archivoId);
      if (contenido) await procesarCola();

      await expect(new SolicitarVersion(dobles).ejecutar({ archivoId: solicitada.archivoId, tamano: 10, mime: 'application/pdf' })).rejects.toThrow(
        new ArchivoNoDisponibleError(estadoArchivo),
      );
      await expect(new MarcarVersionVigente(dobles).ejecutar(solicitada.archivoId, 1)).rejects.toThrow(new ArchivoNoDisponibleError(estadoArchivo));
    },
  );

  it('MIME fuera de la categoría → MIME_NO_PERMITIDO; tamaño sobre el máximo → TAMANO_EXCEDIDO; otro MIME de la categoría se acepta', async () => {
    const archivo = await disponible();
    const solicitar = (tamano: number, mime: string) => new SolicitarVersion(dobles).ejecutar({ archivoId: archivo.id, tamano, mime });

    await expect(solicitar(10, 'image/png')).rejects.toThrow(MimeNoPermitidoError);
    await expect(solicitar(VEINTICINCO_MEGABYTES + 1, 'application/pdf')).rejects.toThrow(TamanoExcedidoError);
    await subirVersion(archivo, docx(), { mime: MIME_DOCX });

    expect(archivo.versionNumero(2)).toMatchObject({ estado: 'DISPONIBLE', mimeReal: MIME_DOCX });
  });

  it('pedir una versión limpia el rechazo anterior', async () => {
    const archivo = await disponible(pdfCon('v1'));
    await subirVersion(archivo, pdfCon('v1'));

    await new SolicitarVersion(dobles).ejecutar({ archivoId: archivo.id, tamano: 10, mime: 'application/pdf' });

    expect((await estado(archivo.id)).rechazoVersion).toBeUndefined();
  });

  it('SolicitarVersion borra lo que quedó en la ruta antes de firmar, fuera de la transacción', async () => {
    const archivo = await disponible();
    const ruta = rutaDe(archivo, 2);
    dobles.almacen.subirConUrl((await dobles.almacen.firmarCarga(ruta)).url, ejecutable());

    const { carga } = await new SolicitarVersion(dobles).ejecutar({ archivoId: archivo.id, tamano: 10, mime: 'application/pdf' });

    expect(dobles.almacen.existe(ruta)).toBe(false);
    expect(() => dobles.almacen.subirConUrl(carga.url, pdfCon('v2'))).not.toThrow();
    expect(dobles.almacen.firmasEnTransaccion.at(-1)).toBe(false);
  });

  it('confirmar sin haber subido el objeto vuelve a PENDIENTE_CARGA; dos veces → un solo trabajo; inexistente → VERSION_NO_ENCONTRADA', async () => {
    const archivo = await disponible();
    const { numero } = await new SolicitarVersion(dobles).ejecutar({ archivoId: archivo.id, tamano: 10, mime: 'application/pdf' });
    const confirmar = () => new ConfirmarVersion(dobles).ejecutar(archivo.id, numero);

    const primera = await confirmar();
    const segunda = await confirmar();
    expect([primera.estado, segunda.estado, dobles.cola.vivos.size]).toEqual(['EN_ANALISIS', 'EN_ANALISIS', 1]);
    expect([...dobles.cola.vivos.values()]).toEqual([{ tenantId: TENANT_A, archivoId: archivo.id, numero }]);
    await procesarCola();

    expect(archivo.versionNumero(numero)?.estado).toBe('PENDIENTE_CARGA');
    await expect(new ConfirmarVersion(dobles).ejecutar(archivo.id, 9)).rejects.toThrow(VersionNoEncontradaError);
  });

  it('confirmar devuelve la versión con su estado, vigente y quién la subió', async () => {
    const archivo = await disponible();
    const { numero } = await new SolicitarVersion(dobles).ejecutar({ archivoId: archivo.id, tamano: 10, mime: 'application/pdf' });

    const confirmada = await new ConfirmarVersion(dobles).ejecutar(archivo.id, numero);

    expect(confirmada).toEqual({ numero: 2, estado: 'EN_ANALISIS', vigente: false, subidoPor: USUARIO, subidoEn: expect.any(Date) });
  });

  it('con la cola caída confirmar → ALMACEN_NO_DISPONIBLE; la versión queda EN_ANALISIS y confirmar otra vez la encola', async () => {
    const archivo = await disponible();
    const { numero } = await new SolicitarVersion(dobles).ejecutar({ archivoId: archivo.id, tamano: 10, mime: 'application/pdf' });
    dobles.cola.caida = true;

    await expect(new ConfirmarVersion(dobles).ejecutar(archivo.id, numero)).rejects.toThrow(expect.objectContaining({ code: 'ALMACEN_NO_DISPONIBLE' }));
    dobles.cola.caida = false;
    await new ConfirmarVersion(dobles).ejecutar(archivo.id, numero);

    expect(dobles.cola.vivos.size).toBe(1);
  });

  it('marcar vigente una anterior DISPONIBLE → la descarga por defecto la entrega y se publica archivo.version_vigente_cambiada', async () => {
    const archivo = await disponible(pdfCon('v1'));
    await subirVersion(archivo, pdfCon('v2'));

    const resultado = await new MarcarVersionVigente(dobles).ejecutar(archivo.id, 1);

    expect(resultado).toMatchObject({ versionVigente: 1, hashSha256: sha256(pdfCon('v1')) });
    expect(await bajar(archivo.id)).toEqual(pdfCon('v1'));
    expect(dobles.publicador.eventos.at(-1)).toMatchObject({
      eventType: 'archivo.version_vigente_cambiada',
      payload: { archivo_id: archivo.id, version_anterior: 2, version_vigente: 1 },
    });
    expect(dobles.publicador.publicadosEnTransaccion.at(-1)).toBe(true);
  });

  it('marcar la que ya es vigente → sin evento ni escritura', async () => {
    const archivo = await disponible();
    const { eventos } = dobles.publicador;
    const escrituras = dobles.archivos.escrituras;
    const versionAntes = archivo.version;

    expect(await new MarcarVersionVigente(dobles).ejecutar(archivo.id, 1)).toMatchObject({ versionVigente: 1 });
    expect([eventos.length, dobles.archivos.escrituras, archivo.version]).toEqual([1, escrituras, versionAntes]);
  });

  it('marcar vigente una en CUARENTENA o en curso → VERSION_NO_DISPONIBLE; inexistente → VERSION_NO_ENCONTRADA', async () => {
    const archivo = await disponible();
    const enCuarentena = await subirVersion(archivo, pdfInfectado());
    const enCurso = await pedirYConfirmar(archivo, pdfCon('v3'));
    const marcar = (numero: number) => new MarcarVersionVigente(dobles).ejecutar(archivo.id, numero);

    await expect(marcar(enCuarentena)).rejects.toThrow(new VersionNoDisponibleError('CUARENTENA'));
    await expect(marcar(enCurso)).rejects.toThrow(new VersionNoDisponibleError('EN_ANALISIS'));
    await expect(marcar(9)).rejects.toThrow(VersionNoEncontradaError);
  });

  it('la lista trae cada versión con su número, estado, datos del análisis, quién y cuándo, y cuál es la vigente', async () => {
    const archivo = await disponible(pdfCon('v1'));
    await subirVersion(archivo, pdfInfectado());
    await subirVersion(archivo, pdfCon('v3'));
    await subirVersion(archivo, pdfCon('v1'));

    const lista = await new ListarVersiones(dobles).ejecutar(archivo.id);

    expect(lista.archivoId).toBe(archivo.id);
    expect(lista.versionVigente).toBe(3);
    expect(lista.versiones.map((version) => [version.numero, version.estado, version.vigente])).toEqual([
      [1, 'DISPONIBLE', false],
      [2, 'CUARENTENA', false],
      [3, 'DISPONIBLE', true],
    ]);
    expect(lista.versiones[2]).toEqual({
      numero: 3,
      estado: 'DISPONIBLE',
      vigente: true,
      hashSha256: sha256(pdfCon('v3')),
      bytes: pdfCon('v3').byteLength,
      mimeReal: 'application/pdf',
      subidoPor: USUARIO,
      subidoEn: expect.any(Date),
    });
  });

  it('descarga con una versión inexistente → VERSION_NO_ENCONTRADA; una categoría sensible deja en la auditoría el número', async () => {
    const archivo = await disponible(pdfCon('v1'));
    await subirVersion(archivo, pdfCon('v2'));

    await expect(descargar(archivo.id, 7)).rejects.toThrow(VersionNoEncontradaError);
    await descargar(archivo.id, 1);
    await descargar(archivo.id);

    expect(dobles.auditoria.entradas.map((entrada) => (entrada.despues as { version: number }).version)).toEqual([1, 2]);
  });

  it('reprocesar el mismo trabajo no duplica eventos ni versiones', async () => {
    const archivo = await disponible();
    const numero = await pedirYConfirmar(archivo, pdfCon('v2'));
    const trabajo = tomarUnTrabajo();

    await new AnalizarArchivo(dobles).ejecutar(trabajo);
    await new AnalizarArchivo(dobles).ejecutar(trabajo);

    expect(archivo.versiones.map((version) => version.numero)).toEqual([1, numero]);
    expect(dobles.publicador.tipos()).toEqual(['archivo.disponible', 'archivo.version_creada']);
  });

  it('un trabajo viejo de un intento rechazado no toca el intento nuevo con el mismo número', async () => {
    const archivo = await disponible(pdfCon('v1'));
    const rechazado = await pedirYConfirmar(archivo, pdfCon('v1'));
    const trabajoViejo = tomarUnTrabajo();
    await new AnalizarArchivo(dobles).ejecutar(trabajoViejo);
    const { numero, carga } = await new SolicitarVersion(dobles).ejecutar({ archivoId: archivo.id, tamano: pdfCon('v2').byteLength, mime: 'application/pdf' });
    dobles.almacen.subirConUrl(carga.url, pdfCon('v2'));

    await new AnalizarArchivo(dobles).ejecutar(trabajoViejo);

    expect(numero).toBe(rechazado);
    expect(archivo.versionNumero(numero)?.estado).toBe('PENDIENTE_CARGA');
    expect(dobles.almacen.existe(rutaDe(archivo, numero))).toBe(true);
  });

  it('un trabajo sin número (encolado antes del spec 35) analiza la versión 1', async () => {
    const solicitada = await new SolicitarCarga(dobles).ejecutar({
      categoria: 'DOCUMENTO',
      nombreOriginal: 'contrato.pdf',
      tamano: pdf().byteLength,
      mime: 'application/pdf',
      entidadTipo: ENTIDAD_CON_AUTORIZADOR,
      entidadId: 'E-1',
    });
    dobles.almacen.subirConUrl(solicitada.carga.url, pdf());
    await new ConfirmarCarga(dobles).ejecutar(solicitada.archivoId);
    dobles.cola.tomarTodos();

    await new AnalizarArchivo(dobles).ejecutar({ tenantId: TENANT_A, archivoId: solicitada.archivoId });

    expect(archivoGuardado(solicitada.archivoId).estado).toBe('DISPONIBLE');
  });

  it('aislamiento: un archivo de A pedido desde B → NO_ENCONTRADO en pedir, confirmar, listar, marcar vigente y descargar una versión', async () => {
    const archivo = await disponible();
    dobles.contexto.alcance = { tenantId: TENANT_B, actorId: USUARIO };

    const intentos = [
      new SolicitarVersion(dobles).ejecutar({ archivoId: archivo.id, tamano: 10, mime: 'application/pdf' }),
      new ConfirmarVersion(dobles).ejecutar(archivo.id, 2),
      new ListarVersiones(dobles).ejecutar(archivo.id),
      new MarcarVersionVigente(dobles).ejecutar(archivo.id, 1),
      descargar(archivo.id, 1),
    ];

    for (const intento of intentos) await expect(intento).rejects.toThrow(ArchivoNoEncontradoError);
  });

  it('autorizador que niega editar → ACCESO_ENTIDAD_DENEGADO al pedir, confirmar y marcar vigente; que niega leer → al listar', async () => {
    const archivo = await disponible();
    const { numero } = await new SolicitarVersion(dobles).ejecutar({ archivoId: archivo.id, tamano: 10, mime: 'application/pdf' });
    const autorizador = new AutorizadorFijo();
    autorizador.permiteEditar = false;
    autorizador.permiteLeer = false;
    dobles.autorizadores.push(autorizador);

    for (const intento of [
      new SolicitarVersion(dobles).ejecutar({ archivoId: archivo.id, tamano: 10, mime: 'application/pdf' }),
      new ConfirmarVersion(dobles).ejecutar(archivo.id, numero),
      new MarcarVersionVigente(dobles).ejecutar(archivo.id, 1),
      new ListarVersiones(dobles).ejecutar(archivo.id),
    ]) {
      await expect(intento).rejects.toThrow(AccesoEntidadDenegadoError);
    }
    expect(autorizador.consultas.map(([acceso]) => acceso)).toEqual(['editar', 'editar', 'editar', 'leer']);
  });

  it('ningún payload de versión lleva el nombre original', async () => {
    const archivo = await disponible();
    await subirVersion(archivo, pdfCon('v2'));
    await subirVersion(archivo, pdfInfectado());
    await new MarcarVersionVigente(dobles).ejecutar(archivo.id, 1);

    expect(JSON.stringify(dobles.publicador.eventos.map((evento) => evento.payload))).not.toContain('contrato');
  });
});
