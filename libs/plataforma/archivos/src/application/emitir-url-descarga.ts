import type { AuditoriaPort } from '@vitrina/plataforma/auditoria';
import type { Clock, UnitOfWork } from '@vitrina/plataforma/kernel';
import type { Archivo, VersionArchivo } from '../domain/archivo.js';
import type { CategoriaArchivo } from '../domain/categoria.js';
import {
  ArchivoNoDisponibleError,
  ArchivoNoEncontradoError,
  CategoriaDesconocidaError,
  VersionNoDisponibleError,
  VersionNoEncontradaError,
} from '../domain/errores.js';
import { PERMISOS_ARC } from '../domain/permisos-arc.js';
import { DISPOSICION_POR_DEFECTO, resolverVigenciaDescarga, type Disposicion } from '../domain/vigencia-descarga.js';
import { exigirAccesoEntidad } from './dependencias-archivos.js';
import type { AlmacenArchivos } from './ports/almacen-archivos.js';
import type { UrlDescarga, UrlDescargaConsulta } from './ports/archivo.port.js';
import type { AutorizadorEntidad } from './ports/autorizador-entidad.js';
import type { RepositorioArchivos } from './ports/repositorio-archivos.js';

export interface DependenciasDescarga {
  unidadDeTrabajo: UnitOfWork;
  reloj: Clock;
  archivos: RepositorioArchivos;
  almacen: AlmacenArchivos;
  autorizadores: readonly AutorizadorEntidad[];
  auditoria: Pick<AuditoriaPort, 'registrar'>;
}

const ENTIDAD_AUDITADA = 'ARCHIVO';
const MILISEGUNDOS_POR_SEGUNDO = 1000;

interface VersionDescargable {
  archivo: Archivo;
  version: Readonly<VersionArchivo>;
  categoria: CategoriaArchivo;
}

/**
 * TR-RF-082: URL firmada para descargar una versión `DISPONIBLE` de un archivo `DISPONIBLE` (por defecto la
 * vigente), de 15 minutos como máximo. Todas las versiones se descargan con el nombre original del archivo.
 * La descarga de una categoría sensible se audita al final, en una transacción corta (la auditoría bloquea
 * por tenant): si el registro falla, la URL no se entrega (TR-RNF-013).
 */
export class EmitirUrlDescarga {
  constructor(private readonly dependencias: DependenciasDescarga) {}

  async ejecutar(consulta: UrlDescargaConsulta): Promise<UrlDescarga> {
    const { unidadDeTrabajo, reloj, almacen } = this.dependencias;
    const { archivo, version, categoria } = await unidadDeTrabajo.run(() => this.cargarDescargable(consulta));
    const vigenciaSegundos = resolverVigenciaDescarga(consulta.vigenciaSegundos);
    const disposicion = consulta.disposicion ?? DISPOSICION_POR_DEFECTO;

    const descargarComo = disposicion === 'attachment' ? archivo.nombreOriginal : undefined;
    const url = await almacen.firmarDescarga(version.rutaStorage, vigenciaSegundos, descargarComo);
    const expiraEn = new Date(reloj.now().getTime() + vigenciaSegundos * MILISEGUNDOS_POR_SEGUNDO);

    if (categoria.sensible) await unidadDeTrabajo.run(() => this.auditarDescarga(archivo, version.numero, disposicion));
    return { url, expiraEn };
  }

  private async cargarDescargable(consulta: UrlDescargaConsulta): Promise<VersionDescargable> {
    const { archivos, autorizadores } = this.dependencias;
    const archivo = await archivos.obtener(consulta.archivoId);
    if (!archivo) throw new ArchivoNoEncontradoError();
    await exigirAccesoEntidad(autorizadores, archivo, 'puedeLeer');
    if (archivo.estado !== 'DISPONIBLE' || archivo.versionVigente === null) throw new ArchivoNoDisponibleError(archivo.estado);
    const version = exigirVersionDescargable(archivo, consulta.version ?? archivo.versionVigente);
    const categoria = await archivos.buscarCategoria(archivo.categoria);
    if (!categoria) throw new CategoriaDesconocidaError();
    return { archivo, version, categoria };
  }

  /** Sin el nombre original ni la URL: el registro de auditoría es inmutable. */
  private auditarDescarga(archivo: Archivo, numero: number, disposicion: Disposicion): Promise<void> {
    return this.dependencias.auditoria.registrar({
      accion: PERMISOS_ARC.descargar,
      entidadTipo: ENTIDAD_AUDITADA,
      entidadId: archivo.id,
      despues: {
        categoria: archivo.categoria,
        entidad_tipo: archivo.entidadTipo,
        entidad_id: archivo.entidadId,
        version: numero,
        disposicion,
      },
    });
  }
}

function exigirVersionDescargable(archivo: Archivo, numero: number): Readonly<VersionArchivo> {
  const version = archivo.versionNumero(numero);
  if (!version) throw new VersionNoEncontradaError();
  if (version.estado !== 'DISPONIBLE') throw new VersionNoDisponibleError(version.estado);
  return version;
}
