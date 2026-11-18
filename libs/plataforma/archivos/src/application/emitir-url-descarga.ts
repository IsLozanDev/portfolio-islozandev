import type { AuditoriaPort } from '@vitrina/plataforma/auditoria';
import type { Clock, UnitOfWork } from '@vitrina/plataforma/kernel';
import type { Archivo } from '../domain/archivo.js';
import type { CategoriaArchivo } from '../domain/categoria.js';
import { ArchivoNoDisponibleError, ArchivoNoEncontradoError, CategoriaDesconocidaError } from '../domain/errores.js';
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

interface ArchivoDescargable {
  archivo: Archivo;
  categoria: CategoriaArchivo;
}

/**
 * TR-RF-082: URL firmada para descargar un archivo `DISPONIBLE`, de 15 minutos como máximo. La descarga de
 * una categoría sensible se audita al final, en una transacción corta (la auditoría bloquea por tenant):
 * si el registro falla, la URL no se entrega (TR-RNF-013).
 */
export class EmitirUrlDescarga {
  constructor(private readonly dependencias: DependenciasDescarga) {}

  async ejecutar(consulta: UrlDescargaConsulta): Promise<UrlDescarga> {
    const { unidadDeTrabajo, reloj, almacen } = this.dependencias;
    const { archivo, categoria } = await unidadDeTrabajo.run(() => this.cargarDescargable(consulta.archivoId));
    const vigenciaSegundos = resolverVigenciaDescarga(consulta.vigenciaSegundos);
    const disposicion = consulta.disposicion ?? DISPOSICION_POR_DEFECTO;

    const descargarComo = disposicion === 'attachment' ? archivo.nombreOriginal : undefined;
    const url = await almacen.firmarDescarga(archivo.primeraVersion.rutaStorage, vigenciaSegundos, descargarComo);
    const expiraEn = new Date(reloj.now().getTime() + vigenciaSegundos * MILISEGUNDOS_POR_SEGUNDO);

    if (categoria.sensible) await unidadDeTrabajo.run(() => this.auditarDescarga(archivo, disposicion));
    return { url, expiraEn };
  }

  private async cargarDescargable(archivoId: string): Promise<ArchivoDescargable> {
    const { archivos, autorizadores } = this.dependencias;
    const archivo = await archivos.obtener(archivoId);
    if (!archivo) throw new ArchivoNoEncontradoError();
    await exigirAccesoEntidad(autorizadores, archivo, 'puedeLeer');
    if (archivo.estado !== 'DISPONIBLE') throw new ArchivoNoDisponibleError(archivo.estado);
    const categoria = await archivos.buscarCategoria(archivo.categoria);
    if (!categoria) throw new CategoriaDesconocidaError();
    return { archivo, categoria };
  }

  /** Sin el nombre original ni la URL: el registro de auditoría es inmutable. */
  private auditarDescarga(archivo: Archivo, disposicion: Disposicion): Promise<void> {
    return this.dependencias.auditoria.registrar({
      accion: PERMISOS_ARC.descargar,
      entidadTipo: ENTIDAD_AUDITADA,
      entidadId: archivo.id,
      despues: {
        categoria: archivo.categoria,
        entidad_tipo: archivo.entidadTipo,
        entidad_id: archivo.entidadId,
        disposicion,
      },
    });
  }
}
