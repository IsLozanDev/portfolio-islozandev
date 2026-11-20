import { ConflictError } from '@vitrina/plataforma/kernel';
import { Archivo, type ContenidoAnalizado, type DatosSolicitudVersion } from '../src/domain/archivo.js';
import {
  ArchivoNoDisponibleError,
  MimeNoPermitidoError,
  TamanoExcedidoError,
  VersionEnCursoError,
  VersionNoDisponibleError,
  VersionNoEncontradaError,
} from '../src/domain/errores.js';
import { EVENTOS_ARC } from '../src/domain/eventos-arc.js';
import { mensajeRechazoVersion } from '../src/domain/mensaje-rechazo-version.js';
import { categoriaDocumento, MIME_DOCX, VEINTICINCO_MEGABYTES } from './support/categorias.js';

const ARCHIVO_ID = '35000000-0000-4000-8000-0000000000a1';
const TENANT_ID = '35000000-0000-4000-8000-00000000000a';
const USUARIO_ID = '35000000-0000-4000-8000-0000000000f1';
const BYTES = 2048;
const FIRMA_EICAR = 'EICAR-Test-File';
const contenido = (marca: string): ContenidoAnalizado => ({ hash: marca.repeat(64), bytes: BYTES, mimeReal: 'application/pdf' });
const pedido = (cambios: Partial<DatosSolicitudVersion> = {}): DatosSolicitudVersion => ({
  mimeDeclarado: 'application/pdf',
  bytesDeclarados: BYTES,
  solicitadoPor: USUARIO_ID,
  ...cambios,
});

function archivoSolicitado(): Archivo {
  return Archivo.solicitar(
    {
      id: ARCHIVO_ID,
      tenantId: TENANT_ID,
      nombreOriginal: 'contrato.pdf',
      mimeDeclarado: 'application/pdf',
      bytesDeclarados: BYTES,
      entidadTipo: 'PRUEBA',
      entidadId: 'E-1',
      solicitadoPor: USUARIO_ID,
    },
    categoriaDocumento(),
  );
}

/** Disponible con la versión 1 vigente y sin eventos pendientes. */
function archivoDisponible(): Archivo {
  const archivo = archivoSolicitado();
  archivo.confirmarCarga();
  archivo.aprobar(contenido('1'));
  archivo.pullEvents();
  return archivo;
}

/** Disponible con la versión `numero` aprobada y vigente (cada una con su propio hash). */
function archivoEnVersion(numero: number): Archivo {
  const archivo = archivoDisponible();
  for (let siguiente = 2; siguiente <= numero; siguiente += 1) {
    archivo.solicitarVersion(pedido(), categoriaDocumento());
    archivo.confirmarVersion(siguiente);
    archivo.aprobarVersion(siguiente, contenido(String(siguiente)));
  }
  archivo.pullEvents();
  return archivo;
}

function versionEnAnalisis(archivo: Archivo): number {
  const { numero } = archivo.solicitarVersion(pedido(), categoriaDocumento());
  archivo.confirmarVersion(numero);
  return numero;
}

describe('Archivo: primera carga con estado de versión', () => {
  it('cada transición de la primera carga mueve también la versión 1', () => {
    const archivo = archivoSolicitado();
    const estados = [archivo.primeraVersion.estado];
    archivo.confirmarCarga();
    estados.push(archivo.primeraVersion.estado);
    archivo.devolverAPendiente();
    estados.push(archivo.primeraVersion.estado);
    archivo.confirmarCarga();
    archivo.ponerEnCuarentena({ ...contenido('1'), firma: FIRMA_EICAR });
    estados.push(archivo.primeraVersion.estado);

    expect(estados).toEqual(['PENDIENTE_CARGA', 'EN_ANALISIS', 'PENDIENTE_CARGA', 'CUARENTENA']);
    expect(archivo.pullEvents()[0]?.payload).toMatchObject({ version: 1, firma: FIRMA_EICAR });
  });

  it('el rechazo de la primera carga deja la versión 1 RECHAZADO', () => {
    const archivo = archivoSolicitado();
    archivo.confirmarCarga();
    archivo.rechazar('TIPO_NO_PERMITIDO');

    expect(archivo.primeraVersion.estado).toBe('RECHAZADO');
    expect(archivo.versionEnCurso).toBeNull();
  });
});

describe('Archivo.solicitarVersion', () => {
  it('numera con el mayor más uno, en su ruta, pendiente de carga y sin evento; el archivo sigue DISPONIBLE', () => {
    const archivo = archivoEnVersion(2);

    const nueva = archivo.solicitarVersion(pedido({ mimeDeclarado: MIME_DOCX }), categoriaDocumento());

    expect(nueva).toEqual({
      numero: 3,
      rutaStorage: `${TENANT_ID}/${ARCHIVO_ID}/3`,
      estado: 'PENDIENTE_CARGA',
      mimeDeclarado: MIME_DOCX,
      bytesDeclarados: BYTES,
      hashSha256: null,
      bytes: null,
      mimeReal: null,
      subidoPor: USUARIO_ID,
    });
    expect(archivo).toMatchObject({ estado: 'DISPONIBLE', versionVigente: 2 });
    expect(archivo.versionEnCurso?.numero).toBe(3);
    expect(archivo.pullEvents()).toEqual([]);
  });

  it.each(['PENDIENTE_CARGA', 'EN_ANALISIS', 'RECHAZADO', 'CUARENTENA'] as const)('un archivo %s → ARCHIVO_NO_DISPONIBLE', (estado) => {
    const archivo = archivoSolicitado();
    if (estado !== 'PENDIENTE_CARGA') archivo.confirmarCarga();
    if (estado === 'RECHAZADO') archivo.rechazar('TIPO_NO_PERMITIDO');
    if (estado === 'CUARENTENA') archivo.ponerEnCuarentena({ ...contenido('1'), firma: FIRMA_EICAR });

    expect(() => archivo.solicitarVersion(pedido(), categoriaDocumento())).toThrow(new ArchivoNoDisponibleError(estado));
  });

  it('con otra versión pendiente o en análisis → VERSION_EN_CURSO con su número', () => {
    const archivo = archivoDisponible();
    archivo.solicitarVersion(pedido(), categoriaDocumento());

    expect(() => archivo.solicitarVersion(pedido(), categoriaDocumento())).toThrow(expect.objectContaining({ code: 'VERSION_EN_CURSO', numero: 2 }));
    archivo.confirmarVersion(2);
    expect(() => archivo.solicitarVersion(pedido(), categoriaDocumento())).toThrow(VersionEnCursoError);
  });

  it('valida MIME y tamaño con las reglas de la categoría', () => {
    const archivo = archivoDisponible();

    expect(() => archivo.solicitarVersion(pedido({ mimeDeclarado: 'image/png' }), categoriaDocumento())).toThrow(MimeNoPermitidoError);
    expect(() => archivo.solicitarVersion(pedido({ bytesDeclarados: VEINTICINCO_MEGABYTES + 1 }), categoriaDocumento())).toThrow(
      TamanoExcedidoError,
    );
    expect(archivo.versiones).toHaveLength(1);
  });

  it('limpia el rechazo del intento anterior y reutiliza su número', () => {
    const archivo = archivoDisponible();
    archivo.rechazarVersion(versionEnAnalisis(archivo), { motivo: 'IDENTICA', versionCoincidente: 1 });
    expect(archivo.rechazoVersion).toEqual({ motivo: 'IDENTICA', versionCoincidente: 1 });

    const reintento = archivo.solicitarVersion(pedido(), categoriaDocumento());

    expect(reintento.numero).toBe(2);
    expect(archivo.rechazoVersion).toBeNull();
  });
});

describe('Archivo: análisis de una versión nueva', () => {
  it('confirmar pasa a EN_ANALISIS una vez; inexistente o la 1 → VERSION_NO_ENCONTRADA', () => {
    const archivo = archivoDisponible();
    archivo.solicitarVersion(pedido(), categoriaDocumento());

    expect([archivo.confirmarVersion(2), archivo.confirmarVersion(2)]).toEqual([true, false]);
    expect(archivo.versionNumero(2)?.estado).toBe('EN_ANALISIS');
    expect(() => archivo.confirmarVersion(9)).toThrow(VersionNoEncontradaError);
    expect(() => archivo.confirmarVersion(1)).toThrow(VersionNoEncontradaError);
  });

  it('aprobar la deja DISPONIBLE y vigente, y publica archivo.version_creada', () => {
    const archivo = archivoDisponible();
    const numero = versionEnAnalisis(archivo);

    archivo.aprobarVersion(numero, contenido('2'));

    expect(archivo).toMatchObject({ estado: 'DISPONIBLE', versionVigente: 2 });
    expect(archivo.versionNumero(2)).toMatchObject({ estado: 'DISPONIBLE', hashSha256: '2'.repeat(64), bytes: BYTES });
    const eventos = archivo.pullEvents();
    expect(eventos.map((evento) => evento.eventType)).toEqual([EVENTOS_ARC.versionCreada]);
    expect(eventos[0]?.payload).toEqual({
      archivo_id: ARCHIVO_ID,
      categoria: 'DOCUMENTO',
      entidad_tipo: 'PRUEBA',
      entidad_id: 'E-1',
      version: 2,
      hash_sha256: '2'.repeat(64),
      bytes: BYTES,
      mime_real: 'application/pdf',
    });
  });

  it('rechazar la quita sin evento y guarda el motivo; el archivo sigue con su vigente', () => {
    const archivo = archivoDisponible();
    const numero = versionEnAnalisis(archivo);

    archivo.rechazarVersion(numero, { motivo: 'TIPO_NO_PERMITIDO', versionCoincidente: null });

    expect(archivo.versiones.map((version) => version.numero)).toEqual([1]);
    expect(archivo).toMatchObject({ estado: 'DISPONIBLE', versionVigente: 1, rechazoVersion: { motivo: 'TIPO_NO_PERMITIDO', versionCoincidente: null } });
    expect(archivo.pullEvents()).toEqual([]);
  });

  it('la cuarentena consume número, conserva la vigente y publica archivo.en_cuarentena con la versión', () => {
    const archivo = archivoDisponible();
    const numero = versionEnAnalisis(archivo);

    archivo.ponerVersionEnCuarentena(numero, { ...contenido('e'), firma: FIRMA_EICAR });

    expect(archivo.versionNumero(2)).toMatchObject({ estado: 'CUARENTENA', hashSha256: 'e'.repeat(64) });
    expect(archivo).toMatchObject({ estado: 'DISPONIBLE', versionVigente: 1 });
    expect(archivo.pullEvents()[0]).toMatchObject({ eventType: EVENTOS_ARC.enCuarentena, payload: { version: 2, firma: FIRMA_EICAR } });
    expect(archivo.solicitarVersion(pedido(), categoriaDocumento()).numero).toBe(3);
  });

  it('devolver a pendiente permite confirmar otra vez', () => {
    const archivo = archivoDisponible();
    const numero = versionEnAnalisis(archivo);

    archivo.devolverVersionAPendiente(numero);

    expect(archivo.versionNumero(numero)?.estado).toBe('PENDIENTE_CARGA');
    expect(archivo.confirmarVersion(numero)).toBe(true);
  });

  it.each([
    ['aprobarVersion', (archivo: Archivo) => archivo.aprobarVersion(2, contenido('2'))],
    ['rechazarVersion', (archivo: Archivo) => archivo.rechazarVersion(2, { motivo: 'TAMANO_NO_COINCIDE', versionCoincidente: null })],
    ['ponerVersionEnCuarentena', (archivo: Archivo) => archivo.ponerVersionEnCuarentena(2, { ...contenido('2'), firma: FIRMA_EICAR })],
    ['devolverVersionAPendiente', (archivo: Archivo) => archivo.devolverVersionAPendiente(2)],
  ])('%s solo vale desde EN_ANALISIS', (_transicion, aplicar) => {
    const archivo = archivoDisponible();
    archivo.solicitarVersion(pedido(), categoriaDocumento());

    expect(() => aplicar(archivo)).toThrow(ConflictError);
    expect(archivo.versionNumero(2)?.estado).toBe('PENDIENTE_CARGA');
    expect(archivo.pullEvents()).toEqual([]);
  });

  it('versionConHash encuentra la versión con ese contenido, también en cuarentena', () => {
    const archivo = archivoEnVersion(2);
    archivo.ponerVersionEnCuarentena(versionEnAnalisis(archivo), { ...contenido('e'), firma: FIRMA_EICAR });

    expect(archivo.versionConHash('1'.repeat(64))?.numero).toBe(1);
    expect(archivo.versionConHash('e'.repeat(64))?.numero).toBe(3);
    expect(archivo.versionConHash('f'.repeat(64))).toBeNull();
  });
});

describe('Archivo.descartarVersionPendiente', () => {
  it('quita una versión pendiente; en análisis, inexistente o la 1 devuelve false', () => {
    const archivo = archivoDisponible();
    archivo.solicitarVersion(pedido(), categoriaDocumento());

    expect(archivo.descartarVersionPendiente(1)).toBe(false);
    expect(archivo.descartarVersionPendiente(5)).toBe(false);
    expect(archivo.descartarVersionPendiente(2)).toBe(true);
    expect(archivo.versiones.map((version) => version.numero)).toEqual([1]);
    expect(archivo.descartarVersionPendiente(versionEnAnalisis(archivo))).toBe(false);
  });
});

describe('Archivo.marcarVigente', () => {
  it('cambia la vigente a una anterior DISPONIBLE y publica archivo.version_vigente_cambiada', () => {
    const archivo = archivoEnVersion(3);
    const versionAntes = archivo.version;

    expect(archivo.marcarVigente(1)).toBe(true);

    expect(archivo.versionVigente).toBe(1);
    expect(archivo.version).toBe(versionAntes + 1);
    expect(archivo.pullEvents()[0]).toMatchObject({
      eventType: EVENTOS_ARC.versionVigenteCambiada,
      payload: { archivo_id: ARCHIVO_ID, categoria: 'DOCUMENTO', entidad_tipo: 'PRUEBA', entidad_id: 'E-1', version_anterior: 3, version_vigente: 1 },
    });
  });

  it('marcar la que ya es vigente devuelve false sin evento ni cambio de versión', () => {
    const archivo = archivoEnVersion(2);
    const versionAntes = archivo.version;

    expect(archivo.marcarVigente(2)).toBe(false);
    expect([archivo.version, archivo.pullEvents()]).toEqual([versionAntes, []]);
  });

  it('una en cuarentena o en curso → VERSION_NO_DISPONIBLE; inexistente → VERSION_NO_ENCONTRADA', () => {
    const archivo = archivoDisponible();
    archivo.ponerVersionEnCuarentena(versionEnAnalisis(archivo), { ...contenido('e'), firma: FIRMA_EICAR });
    const enCurso = versionEnAnalisis(archivo);

    expect(() => archivo.marcarVigente(2)).toThrow(new VersionNoDisponibleError('CUARENTENA'));
    expect(() => archivo.marcarVigente(enCurso)).toThrow(new VersionNoDisponibleError('EN_ANALISIS'));
    expect(() => archivo.marcarVigente(9)).toThrow(VersionNoEncontradaError);
  });

  it('un archivo que no está DISPONIBLE → ARCHIVO_NO_DISPONIBLE', () => {
    const archivo = archivoSolicitado();

    expect(() => archivo.marcarVigente(1)).toThrow(new ArchivoNoDisponibleError('PENDIENTE_CARGA'));
  });

  it('se puede marcar con una versión en curso; si esa se aprueba después, pasa a vigente', () => {
    const archivo = archivoEnVersion(2);
    const enCurso = versionEnAnalisis(archivo);

    archivo.marcarVigente(1);
    archivo.aprobarVersion(enCurso, contenido('3'));

    expect(archivo.versionVigente).toBe(3);
  });
});

describe('mensajeRechazoVersion', () => {
  it('idéntica a la vigente, a otra versión, y los motivos de tipo y tamaño', () => {
    expect(mensajeRechazoVersion({ motivo: 'IDENTICA', versionCoincidente: 2 }, 2)).toBe('El archivo es idéntico a la versión vigente');
    expect(mensajeRechazoVersion({ motivo: 'IDENTICA', versionCoincidente: 1 }, 2)).toBe('El archivo es idéntico a la versión 1');
    expect(mensajeRechazoVersion({ motivo: 'TIPO_NO_PERMITIDO', versionCoincidente: null }, 2)).toMatch(/tipo real/);
    expect(mensajeRechazoVersion({ motivo: 'TAMANO_NO_COINCIDE', versionCoincidente: null }, 2)).toMatch(/tamaño/);
  });
});
