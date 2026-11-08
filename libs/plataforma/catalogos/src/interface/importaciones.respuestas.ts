import type { DetalleImportacion, ImportacionActiva, Previsualizacion } from '../application/importacion/resultados-importacion.js';
import type { ImportacionListada, Listado } from '../application/ports/importacion.js';
import type { ItemGlobalActual } from '../domain/importacion/calcular-diferencias.js';
import type { FilaImportada } from '../domain/importacion/fila-importada.js';
import type { ResumenImportacion } from '../domain/importacion/importacion.js';
import type {
  DetalleImportacionDto,
  FilaImportadaDto,
  HistorialImportacionesDto,
  ImportacionActivaDto,
  ImportacionListadaDto,
  ItemAntesDto,
  PrevisualizacionDto,
  ResumenImportacionDto,
} from './importaciones.dto.js';

// Resultados de los casos de uso a snake_case, campo por campo.

export function previsualizacionDto(previsualizacion: Previsualizacion): PrevisualizacionDto {
  const { resumen, muestra } = previsualizacion;
  return {
    id: previsualizacion.id,
    estado: previsualizacion.estado,
    version_oficial: previsualizacion.versionOficial,
    fecha_vigencia: previsualizacion.fechaVigencia,
    archivo_sha256: previsualizacion.archivoSha256,
    resumen: { ...resumenDto(resumen), total_filas: resumen.totalFilas },
    muestra: {
      altas: muestra.altas.map(filaDto),
      cambios: muestra.cambios.map((cambio) => ({ antes: itemAntesDto(cambio.antes), despues: filaDto(cambio.despues) })),
      bajas: muestra.bajas.map((baja) => ({ item_id: baja.itemId, codigo: baja.codigo, nombre: baja.nombre, vigente_hasta: baja.vigenteHasta })),
    },
    vence_en: previsualizacion.venceEn.toISOString(),
  };
}

export function historialDto(listado: Listado<ImportacionListada>): HistorialImportacionesDto {
  return { items: listado.items.map(listadaDto), total: listado.total };
}

export function activaDto(activa: ImportacionActiva): ImportacionActivaDto {
  return { ...listadaDto(activa), estado: activa.estado, avance: activa.avance };
}

export function detalleDto(detalle: DetalleImportacion): DetalleImportacionDto {
  return {
    id: detalle.id,
    codigo: detalle.codigo,
    estado: detalle.estado,
    avance: detalle.avance,
    version_oficial: detalle.versionOficial,
    fecha_vigencia: detalle.fechaVigencia,
    archivo_nombre: detalle.archivoNombre,
    archivo_sha256: detalle.archivoSha256,
    resumen: resumenDto(detalle.resumen),
    total_errores: detalle.totalErrores,
    motivo_fallo: detalle.motivoFallo,
    lanzado_por: detalle.lanzadoPor,
    creado_en: detalle.creadoEn.toISOString(),
    aplicado_por: detalle.aplicadoPor,
    terminado_en: detalle.terminadoEn?.toISOString() ?? null,
    vence_en: detalle.venceEn.toISOString(),
  };
}

function listadaDto(listada: Omit<ImportacionListada, 'estado'> & { estado: string }): ImportacionListadaDto {
  return {
    id: listada.id,
    estado: listada.estado,
    version_oficial: listada.versionOficial,
    fecha_vigencia: listada.fechaVigencia,
    archivo_nombre: listada.archivoNombre,
    archivo_sha256: listada.archivoSha256,
    resumen: resumenDto(listada.resumen),
    total_errores: listada.totalErrores,
    motivo_fallo: listada.motivoFallo,
    lanzado_por: listada.lanzadoPor,
    creado_en: listada.creadoEn.toISOString(),
    aplicado_por: listada.aplicadoPor,
    terminado_en: listada.terminadoEn?.toISOString() ?? null,
  };
}

function resumenDto(resumen: ResumenImportacion): ResumenImportacionDto {
  return { altas: resumen.altas, cambios: resumen.cambios, bajas: resumen.bajas, sin_cambios: resumen.sinCambios };
}

function filaDto(fila: FilaImportada): FilaImportadaDto {
  return {
    fila: fila.numero,
    codigo: fila.codigo,
    codigo_externo: fila.codigoExterno,
    nombre: fila.nombre,
    abreviatura: fila.abreviatura,
    orden: fila.orden,
    atributos: fila.atributos,
  };
}

function itemAntesDto(item: ItemGlobalActual): ItemAntesDto {
  return {
    id: item.id,
    codigo: item.codigo,
    codigo_externo: item.codigoExterno,
    nombre: item.nombre,
    abreviatura: item.abreviatura,
    orden: item.orden,
    atributos: { ...item.atributos },
    vigente_desde: item.vigenteDesde,
    vigente_hasta: item.vigenteHasta,
    activo: item.activo,
  };
}
