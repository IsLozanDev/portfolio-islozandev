import type { ImportacionListada } from '../../application/ports/importacion.js';
import type { FilaImportada } from '../../domain/importacion/fila-importada.js';
import { Importacion, type OperacionesImportacion } from '../../domain/importacion/importacion.js';
import type { FilaImportacion, FilaOperacionJson, OperacionesJson } from './entidades.js';

// La importación guarda sus operaciones en el jsonb que leen las funciones de aplicación de la base.

export function importacionDesdeFila(fila: FilaImportacion): Importacion {
  return Importacion.reconstituir(fila.id, Number(fila.version), {
    tenantId: fila.tenantId,
    catalogoId: fila.catalogoId,
    versionOficial: fila.versionOficial,
    fechaVigencia: fila.fechaVigencia,
    archivoNombre: fila.archivoNombre,
    archivoSha256: fila.archivoSha256,
    versionCatalogo: Number(fila.versionCatalogo),
    estado: fila.estado,
    resumen: { altas: fila.altas, cambios: fila.cambios, bajas: fila.bajas, sinCambios: fila.sinCambios },
    operaciones: fila.operaciones ? operacionesDesdeJson(fila.operaciones) : null,
    totalErrores: fila.totalErrores,
    errores: fila.errores,
    motivoFallo: fila.motivoFallo,
    lanzadoPor: fila.lanzadoPor,
    creadoEn: fila.creadoEn,
    encoladoEn: fila.encoladoEn,
    aplicadoPor: fila.aplicadoPor,
    terminadoEn: fila.terminadoEn,
  });
}

export function filaDesdeImportacion(importacion: Importacion, version: number): FilaImportacion {
  const { resumen, operaciones } = importacion;
  return {
    id: importacion.id,
    tenantId: importacion.tenantId,
    catalogoId: importacion.catalogoId,
    versionOficial: importacion.versionOficial,
    fechaVigencia: importacion.fechaVigencia,
    archivoNombre: importacion.archivoNombre,
    archivoSha256: importacion.archivoSha256,
    versionCatalogo: String(importacion.versionCatalogo),
    estado: importacion.estado,
    altas: resumen.altas,
    cambios: resumen.cambios,
    bajas: resumen.bajas,
    sinCambios: resumen.sinCambios,
    operaciones: operaciones ? operacionesAJson(operaciones) : null,
    totalErrores: importacion.totalErrores,
    errores: importacion.errores ? [...importacion.errores] : null,
    motivoFallo: importacion.motivoFallo,
    lanzadoPor: importacion.lanzadoPor,
    creadoEn: importacion.creadoEn,
    encoladoEn: importacion.encoladoEn,
    aplicadoPor: importacion.aplicadoPor,
    terminadoEn: importacion.terminadoEn,
    version: String(version),
  };
}

export function listadaDesdeFila(fila: Omit<FilaImportacion, 'operaciones' | 'errores'>): ImportacionListada {
  return {
    id: fila.id,
    catalogoId: fila.catalogoId,
    estado: fila.estado,
    versionOficial: fila.versionOficial,
    fechaVigencia: fila.fechaVigencia,
    archivoNombre: fila.archivoNombre,
    archivoSha256: fila.archivoSha256,
    resumen: { altas: fila.altas, cambios: fila.cambios, bajas: fila.bajas, sinCambios: fila.sinCambios },
    totalErrores: fila.totalErrores,
    motivoFallo: fila.motivoFallo,
    lanzadoPor: fila.lanzadoPor,
    creadoEn: fila.creadoEn,
    aplicadoPor: fila.aplicadoPor,
    terminadoEn: fila.terminadoEn,
  };
}

function operacionesAJson(operaciones: OperacionesImportacion): OperacionesJson {
  return {
    altas: operaciones.altas.map(filaAJson),
    cambios: operaciones.cambios.map((cambio) => ({ ...filaAJson(cambio.fila), item_id: cambio.itemId })),
    bajas: operaciones.bajas,
  };
}

function operacionesDesdeJson(operaciones: OperacionesJson): OperacionesImportacion {
  return {
    altas: operaciones.altas.map(filaDesdeJson),
    cambios: operaciones.cambios.map((cambio) => ({ itemId: cambio.item_id, fila: filaDesdeJson(cambio) })),
    bajas: operaciones.bajas,
  };
}

function filaAJson(fila: FilaImportada): FilaOperacionJson {
  return {
    numero: fila.numero,
    codigo: fila.codigo,
    codigo_externo: fila.codigoExterno,
    nombre: fila.nombre,
    abreviatura: fila.abreviatura,
    orden: fila.orden,
    atributos: fila.atributos,
  };
}

function filaDesdeJson(fila: FilaOperacionJson): FilaImportada {
  return {
    numero: fila.numero,
    codigo: fila.codigo,
    codigoExterno: fila.codigo_externo,
    nombre: fila.nombre,
    abreviatura: fila.abreviatura,
    orden: fila.orden,
    atributos: fila.atributos,
  };
}
