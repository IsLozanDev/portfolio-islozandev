import { evaluarAnalisis, type HallazgosAnalisis } from '../src/domain/resultado-analisis.js';
import { categoriaDocumento } from './support/categorias.js';

const BYTES_DECLARADOS = 1_258_291;
const VERSION = { bytesDeclarados: BYTES_DECLARADOS };
const MIME_EJECUTABLE = 'application/x-msdownload';

function hallazgos(cambios: Partial<HallazgosAnalisis> = {}): HallazgosAnalisis {
  return { bytes: BYTES_DECLARADOS, mimeReal: 'application/pdf', limpio: true, versionCoincidente: null, ...cambios };
}

describe('evaluarAnalisis', () => {
  it('aprueba cuando coinciden el tamaño y el tipo, y el antivirus no encuentra nada (TR-CA-199)', () => {
    expect(evaluarAnalisis(categoriaDocumento(), VERSION, hallazgos())).toBe('APROBADO');
  });

  it('rechaza por tamaño cuando los bytes reales difieren de los declarados', () => {
    expect(evaluarAnalisis(categoriaDocumento(), VERSION, hallazgos({ bytes: BYTES_DECLARADOS - 1 }))).toBe('TAMANO_NO_COINCIDE');
  });

  it('rechaza por tipo un ejecutable declarado como PDF (TR-CA-200)', () => {
    expect(evaluarAnalisis(categoriaDocumento(), VERSION, hallazgos({ mimeReal: MIME_EJECUTABLE }))).toBe('TIPO_NO_PERMITIDO');
  });

  it('rechaza por tipo cuando el detector no reconoce el contenido', () => {
    expect(evaluarAnalisis(categoriaDocumento(), VERSION, hallazgos({ mimeReal: null }))).toBe('TIPO_NO_PERMITIDO');
  });

  it('aprueba un tipo real distinto del declarado si la categoría lo admite', () => {
    expect(evaluarAnalisis(categoriaDocumento(), VERSION, hallazgos({ mimeReal: 'image/jpeg' }))).toBe('APROBADO');
  });

  it('marca infectado un archivo del tipo y el tamaño correctos (TR-CA-201)', () => {
    expect(evaluarAnalisis(categoriaDocumento(), VERSION, hallazgos({ limpio: false }))).toBe('INFECTADO');
  });

  it('rechaza como idéntica un contenido con el hash de otra versión (TR-CA-203)', () => {
    expect(evaluarAnalisis(categoriaDocumento(), VERSION, hallazgos({ versionCoincidente: 2 }))).toBe('IDENTICA');
  });

  it('evalúa en orden: tamaño, tipo, idéntica, antivirus', () => {
    const todoMal = hallazgos({ bytes: 1, mimeReal: MIME_EJECUTABLE, limpio: false, versionCoincidente: 1 });
    const tipoIdenticaYVirus = hallazgos({ mimeReal: MIME_EJECUTABLE, limpio: false, versionCoincidente: 1 });
    // El contenido de una versión en cuarentena está infectado: se rechaza antes como idéntico (uq_version_hash).
    const identicaYVirus = hallazgos({ limpio: false, versionCoincidente: 2 });

    expect(evaluarAnalisis(categoriaDocumento(), VERSION, todoMal)).toBe('TAMANO_NO_COINCIDE');
    expect(evaluarAnalisis(categoriaDocumento(), VERSION, tipoIdenticaYVirus)).toBe('TIPO_NO_PERMITIDO');
    expect(evaluarAnalisis(categoriaDocumento(), VERSION, identicaYVirus)).toBe('IDENTICA');
  });
});
