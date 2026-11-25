import { ConflictError } from '@vitrina/plataforma/kernel';
import { Archivo, type ContenidoAnalizado, type DatosArchivoSistema, type DatosSolicitudCarga } from '../src/domain/archivo.js';
import { DatosArchivoInvalidosError, MimeNoPermitidoError, TamanoExcedidoError } from '../src/domain/errores.js';
import { EVENTOS_ARC } from '../src/domain/eventos-arc.js';
import { categoriaCpeXml, categoriaDocumento, categoriaImagen, DIEZ_MEGABYTES, VEINTICINCO_MEGABYTES } from './support/categorias.js';

const ARCHIVO_ID = '33000000-0000-4000-8000-0000000000a1';
const TENANT_ID = '33000000-0000-4000-8000-00000000000a';
const USUARIO_ID = '33000000-0000-4000-8000-0000000000f1';
const BYTES_PDF = 1_258_291;
const NOMBRE_MAXIMO = 255;
const ENTIDAD_ID_MAXIMO = 80;
const CONTENIDO_PDF: ContenidoAnalizado = { hash: 'a'.repeat(64), bytes: BYTES_PDF, mimeReal: 'application/pdf' };
const FIRMA_EICAR = 'EICAR-Test-File';

function datosSolicitud(cambios: Partial<DatosSolicitudCarga> = {}): DatosSolicitudCarga {
  return {
    id: ARCHIVO_ID,
    tenantId: TENANT_ID,
    nombreOriginal: 'contrato.pdf',
    mimeDeclarado: 'application/pdf',
    bytesDeclarados: BYTES_PDF,
    entidadTipo: 'PRUEBA_SENSIBLE',
    entidadId: 'E-1',
    solicitadoPor: USUARIO_ID,
    ...cambios,
  };
}

function archivoEnAnalisis(): Archivo {
  const archivo = Archivo.solicitar(datosSolicitud(), categoriaDocumento());
  archivo.confirmarCarga();
  return archivo;
}

describe('Archivo.solicitar', () => {
  it('nace pendiente de carga, en versión 1 y sin eventos', () => {
    const archivo = Archivo.solicitar(datosSolicitud(), categoriaDocumento());

    expect(archivo).toMatchObject({
      id: ARCHIVO_ID,
      tenantId: TENANT_ID,
      categoria: 'DOCUMENTO',
      entidadTipo: 'PRUEBA_SENSIBLE',
      entidadId: 'E-1',
      nombreOriginal: 'contrato.pdf',
      estado: 'PENDIENTE_CARGA',
      motivoRechazo: null,
      versionVigente: null,
      creadoPor: USUARIO_ID,
      version: 1,
    });
    expect(archivo.pullEvents()).toEqual([]);
  });

  it('crea la versión 1 con lo declarado y sin datos del análisis', () => {
    const archivo = Archivo.solicitar(datosSolicitud(), categoriaDocumento());

    expect(archivo.primeraVersion).toEqual({
      numero: 1,
      rutaStorage: `${TENANT_ID}/${ARCHIVO_ID}/1`,
      estado: 'PENDIENTE_CARGA',
      mimeDeclarado: 'application/pdf',
      bytesDeclarados: BYTES_PDF,
      hashSha256: null,
      bytes: null,
      mimeReal: null,
      subidoPor: USUARIO_ID,
    });
  });

  it('la ruta de Storage no lleva el nombre original', () => {
    const archivo = Archivo.solicitar(datosSolicitud({ nombreOriginal: 'dni-juana-quispe.pdf' }), categoriaDocumento());

    expect(archivo.primeraVersion.rutaStorage).not.toContain('juana');
  });

  it('recorta el nombre y el identificador de la entidad', () => {
    const archivo = Archivo.solicitar(datosSolicitud({ nombreOriginal: '  contrato.pdf ', entidadId: ' E-1 ' }), categoriaDocumento());

    expect(archivo.nombreOriginal).toBe('contrato.pdf');
    expect(archivo.entidadId).toBe('E-1');
  });

  it('admite el nombre y el identificador en su largo máximo', () => {
    const datos = datosSolicitud({ nombreOriginal: 'n'.repeat(NOMBRE_MAXIMO), entidadId: 'e'.repeat(ENTIDAD_ID_MAXIMO) });

    expect(() => Archivo.solicitar(datos, categoriaDocumento())).not.toThrow();
  });

  it.each([
    ['nombre vacío', { nombreOriginal: '   ' }],
    ['nombre de 256 caracteres', { nombreOriginal: 'n'.repeat(NOMBRE_MAXIMO + 1) }],
    ['identificador de entidad vacío', { entidadId: '' }],
    ['identificador de entidad de 81 caracteres', { entidadId: 'e'.repeat(ENTIDAD_ID_MAXIMO + 1) }],
    ['tipo de entidad en minúsculas', { entidadTipo: 'producto' }],
    ['tipo de entidad de un carácter', { entidadTipo: 'P' }],
    ['tipo de entidad que empieza con dígito', { entidadTipo: '9PRODUCTO' }],
    ['tamaño en cero', { bytesDeclarados: 0 }],
    ['tamaño negativo', { bytesDeclarados: -1 }],
    ['tamaño con decimales', { bytesDeclarados: 10.5 }],
  ])('rechaza %s con DATOS_INVALIDOS', (_caso, cambios) => {
    expect(() => Archivo.solicitar(datosSolicitud(cambios), categoriaDocumento())).toThrow(DatosArchivoInvalidosError);
  });

  it('rechaza un MIME declarado fuera de la categoría', () => {
    expect(() => Archivo.solicitar(datosSolicitud({ mimeDeclarado: 'image/png' }), categoriaDocumento())).toThrow(
      MimeNoPermitidoError,
    );
  });

  it.each([
    ['IMAGEN de 10 MB + 1 byte', categoriaImagen(), 'image/png', DIEZ_MEGABYTES],
    ['DOCUMENTO de 25 MB + 1 byte', categoriaDocumento(), 'application/pdf', VEINTICINCO_MEGABYTES],
  ])('rechaza %s con el máximo de la categoría', (_caso, categoria, mimeDeclarado, maximo) => {
    const solicitar = () => Archivo.solicitar(datosSolicitud({ mimeDeclarado, bytesDeclarados: maximo + 1 }), categoria);

    expect(solicitar).toThrow(TamanoExcedidoError);
    expect(solicitar).toThrow(expect.objectContaining({ code: 'TAMANO_EXCEDIDO', tamanoMaxBytes: maximo }));
  });

  it('admite el tamaño máximo exacto', () => {
    const datos = datosSolicitud({ mimeDeclarado: 'image/png', bytesDeclarados: DIEZ_MEGABYTES });

    expect(() => Archivo.solicitar(datos, categoriaImagen())).not.toThrow();
  });
});

describe('Archivo.confirmarCarga', () => {
  it('pasa de pendiente a en análisis', () => {
    const archivo = Archivo.solicitar(datosSolicitud(), categoriaDocumento());

    expect(archivo.confirmarCarga()).toBe(true);
    expect(archivo.estado).toBe('EN_ANALISIS');
  });

  it('confirmar dos veces no cambia nada', () => {
    const archivo = archivoEnAnalisis();

    expect(archivo.confirmarCarga()).toBe(false);
    expect(archivo.estado).toBe('EN_ANALISIS');
  });

  it('un archivo disponible no vuelve a análisis', () => {
    const archivo = archivoEnAnalisis();
    archivo.aprobar(CONTENIDO_PDF);

    expect(archivo.confirmarCarga()).toBe(false);
    expect(archivo.estado).toBe('DISPONIBLE');
  });
});

describe('resultado del análisis', () => {
  it('aprobar deja el archivo disponible con su versión vigente y publica archivo.disponible', () => {
    const archivo = archivoEnAnalisis();

    archivo.aprobar(CONTENIDO_PDF);

    expect(archivo).toMatchObject({ estado: 'DISPONIBLE', versionVigente: 1, motivoRechazo: null, version: 2 });
    expect(archivo.primeraVersion).toMatchObject({ hashSha256: CONTENIDO_PDF.hash, bytes: BYTES_PDF, mimeReal: 'application/pdf' });
    const eventos = archivo.pullEvents();
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({ eventType: EVENTOS_ARC.disponible, aggregateType: 'archivo', aggregateId: ARCHIVO_ID });
    expect(eventos[0]?.payload).toEqual({
      archivo_id: ARCHIVO_ID,
      categoria: 'DOCUMENTO',
      entidad_tipo: 'PRUEBA_SENSIBLE',
      entidad_id: 'E-1',
      version: 1,
      hash_sha256: CONTENIDO_PDF.hash,
      bytes: BYTES_PDF,
      mime_real: 'application/pdf',
    });
  });

  it.each(['TIPO_NO_PERMITIDO', 'TAMANO_NO_COINCIDE'] as const)('rechazar por %s no publica evento', (motivo) => {
    const archivo = archivoEnAnalisis();

    archivo.rechazar(motivo);

    expect(archivo).toMatchObject({ estado: 'RECHAZADO', motivoRechazo: motivo, versionVigente: null });
    expect(archivo.pullEvents()).toEqual([]);
  });

  it('poner en cuarentena guarda lo analizado y publica archivo.en_cuarentena con la firma', () => {
    const archivo = archivoEnAnalisis();

    archivo.ponerEnCuarentena({ ...CONTENIDO_PDF, firma: FIRMA_EICAR });

    expect(archivo).toMatchObject({ estado: 'CUARENTENA', versionVigente: null, motivoRechazo: null });
    expect(archivo.primeraVersion.hashSha256).toBe(CONTENIDO_PDF.hash);
    const eventos = archivo.pullEvents();
    expect(eventos.map((evento) => evento.eventType)).toEqual([EVENTOS_ARC.enCuarentena]);
    expect(eventos[0]?.payload).toEqual({
      archivo_id: ARCHIVO_ID,
      categoria: 'DOCUMENTO',
      entidad_tipo: 'PRUEBA_SENSIBLE',
      entidad_id: 'E-1',
      version: 1,
      firma: FIRMA_EICAR,
    });
  });

  it('ningún evento lleva el nombre original', () => {
    const disponible = archivoEnAnalisis();
    disponible.aprobar(CONTENIDO_PDF);
    const enCuarentena = archivoEnAnalisis();
    enCuarentena.ponerEnCuarentena({ ...CONTENIDO_PDF, firma: FIRMA_EICAR });

    const eventos = [...disponible.pullEvents(), ...enCuarentena.pullEvents()];

    expect(JSON.stringify(eventos)).not.toContain('contrato.pdf');
  });

  it('devolver a pendiente permite confirmar otra vez', () => {
    const archivo = archivoEnAnalisis();

    archivo.devolverAPendiente();

    expect(archivo.estado).toBe('PENDIENTE_CARGA');
    expect(archivo.confirmarCarga()).toBe(true);
  });

  it.each([
    ['aprobar', (archivo: Archivo) => archivo.aprobar(CONTENIDO_PDF)],
    ['rechazar', (archivo: Archivo) => archivo.rechazar('TIPO_NO_PERMITIDO')],
    ['ponerEnCuarentena', (archivo: Archivo) => archivo.ponerEnCuarentena({ ...CONTENIDO_PDF, firma: FIRMA_EICAR })],
    ['devolverAPendiente', (archivo: Archivo) => archivo.devolverAPendiente()],
  ])('%s solo vale desde EN_ANALISIS', (_transicion, aplicar) => {
    const pendiente = Archivo.solicitar(datosSolicitud(), categoriaDocumento());
    const disponible = archivoEnAnalisis();
    disponible.aprobar(CONTENIDO_PDF);
    disponible.pullEvents();

    expect(() => aplicar(pendiente)).toThrow(ConflictError);
    expect(() => aplicar(disponible)).toThrow(ConflictError);
    expect(pendiente.estado).toBe('PENDIENTE_CARGA');
    expect(disponible.estado).toBe('DISPONIBLE');
    expect(disponible.pullEvents()).toEqual([]);
  });
});

describe('Archivo.reconstituir', () => {
  it('conserva la versión y no comparte la versión del archivo con quien lo reconstituye', () => {
    const original = archivoEnAnalisis();
    const props = {
      tenantId: original.tenantId,
      categoria: original.categoria,
      entidadTipo: original.entidadTipo,
      entidadId: original.entidadId,
      nombreOriginal: original.nombreOriginal,
      estado: original.estado,
      motivoRechazo: original.motivoRechazo,
      versionVigente: original.versionVigente,
      origen: original.origen,
      creadoPor: original.creadoPor,
      versiones: original.versiones.map((version) => ({ ...version })),
      rechazoVersion: null,
    };

    const reconstituido = Archivo.reconstituir(ARCHIVO_ID, 4, props);
    reconstituido.aprobar(CONTENIDO_PDF);

    expect(reconstituido.version).toBe(5);
    expect(props.versiones[0]?.hashSha256).toBeNull();
  });
});

describe('Archivo.delSistema', () => {
  const CONTENIDO_XML: ContenidoAnalizado = { hash: 'b'.repeat(64), bytes: 1_200, mimeReal: 'application/xml' };
  const datosSistema = (cambios: Partial<DatosArchivoSistema> = {}): DatosArchivoSistema => ({
    id: ARCHIVO_ID,
    tenantId: TENANT_ID,
    nombreOriginal: '20601234561-01-F001-00000001.xml',
    mime: 'application/xml',
    entidadTipo: 'FE_COMPROBANTE',
    entidadId: 'C-1',
    contenido: CONTENIDO_XML,
    ...cambios,
  });

  it('nace DISPONIBLE con la versión 1 vigente, origen SISTEMA y sin actor', () => {
    const archivo = Archivo.delSistema(datosSistema(), categoriaCpeXml());

    expect(archivo).toMatchObject({ estado: 'DISPONIBLE', versionVigente: 1, origen: 'SISTEMA', creadoPor: null, categoria: 'CPE_XML' });
    expect(archivo.primeraVersion).toMatchObject({
      numero: 1,
      estado: 'DISPONIBLE',
      mimeDeclarado: 'application/xml',
      bytesDeclarados: 1_200,
      hashSha256: CONTENIDO_XML.hash,
      bytes: 1_200,
      mimeReal: 'application/xml',
      subidoPor: null,
    });
  });

  it('publica archivo.disponible con el hash, como una carga aprobada', () => {
    const [evento] = Archivo.delSistema(datosSistema(), categoriaCpeXml()).pullEvents();

    expect(evento?.eventType).toBe(EVENTOS_ARC.disponible);
    expect(evento?.payload).toMatchObject({ archivo_id: ARCHIVO_ID, entidad_tipo: 'FE_COMPROBANTE', version: 1, hash_sha256: CONTENIDO_XML.hash });
  });

  it('aplica las reglas de MIME, tamaño y entidad de la categoría', () => {
    expect(() => Archivo.delSistema(datosSistema({ mime: 'application/pdf' }), categoriaCpeXml())).toThrow(MimeNoPermitidoError);
    expect(() =>
      Archivo.delSistema(datosSistema({ contenido: { ...CONTENIDO_XML, bytes: VEINTICINCO_MEGABYTES + 1 } }), categoriaCpeXml()),
    ).toThrow(TamanoExcedidoError);
    expect(() => Archivo.delSistema(datosSistema({ entidadTipo: 'fe' }), categoriaCpeXml())).toThrow(DatosArchivoInvalidosError);
  });

  it('una carga del navegador sigue siendo CARGA con su actor', () => {
    expect(Archivo.solicitar(datosSolicitud(), categoriaDocumento())).toMatchObject({ origen: 'CARGA', creadoPor: USUARIO_ID });
  });
});
