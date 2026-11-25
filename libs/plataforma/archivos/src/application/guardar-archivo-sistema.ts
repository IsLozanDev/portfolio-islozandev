import { createHash } from 'node:crypto';
import type { EventPublisher, IdGenerator, TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import { Archivo, type ContenidoAnalizado } from '../domain/archivo.js';
import { CategoriaDesconocidaError } from '../domain/errores.js';
import { publicarEventosDe } from './dependencias-archivos.js';
import type { AlmacenArchivos } from './ports/almacen-archivos.js';
import type { ArchivoGuardado, ArchivoSistemaPort, GuardarArchivoComando } from './ports/archivo-sistema.port.js';
import type { RepositorioArchivos } from './ports/repositorio-archivos.js';

export interface DependenciasArchivoSistema {
  unidadDeTrabajo: UnitOfWork;
  contexto: TenantContext;
  ids: IdGenerator;
  publicador: EventPublisher;
  archivos: RepositorioArchivos;
  almacen: AlmacenArchivos;
}

/**
 * Carga desde el servidor (spec 52): valida la categoría, mide los bytes, los sube y registra el archivo
 * `DISPONIBLE` con su evento en una transacción. Si la transacción falla, borra el objeto subido.
 */
export class GuardarArchivoSistema implements ArchivoSistemaPort {
  constructor(private readonly dependencias: DependenciasArchivoSistema) {}

  async guardar(comando: GuardarArchivoComando): Promise<ArchivoGuardado> {
    const contenido: ContenidoAnalizado = { hash: hashDe(comando.bytes), bytes: comando.bytes.byteLength, mimeReal: comando.mime };
    const archivo = await this.dependencias.unidadDeTrabajo.run(() => this.armar(comando, contenido));
    const ruta = archivo.primeraVersion.rutaStorage;
    await this.dependencias.almacen.subir(ruta, comando.bytes, comando.mime);
    try {
      await this.registrar(archivo);
    } catch (error) {
      await this.dependencias.almacen.borrar(ruta);
      throw error;
    }
    return { archivoId: archivo.id, hashSha256: contenido.hash, bytes: contenido.bytes };
  }

  private async armar(comando: GuardarArchivoComando, contenido: ContenidoAnalizado): Promise<Archivo> {
    const { archivos, contexto, ids } = this.dependencias;
    const categoria = await archivos.buscarCategoria(comando.categoria);
    if (!categoria) throw new CategoriaDesconocidaError();
    return Archivo.delSistema(
      {
        id: ids.next(),
        tenantId: contexto.current().tenantId,
        nombreOriginal: comando.nombreOriginal,
        mime: comando.mime,
        entidadTipo: comando.entidadTipo,
        entidadId: comando.entidadId,
        contenido,
      },
      categoria,
    );
  }

  private registrar(archivo: Archivo): Promise<void> {
    const { unidadDeTrabajo, archivos, publicador } = this.dependencias;
    return unidadDeTrabajo.run(async () => {
      await archivos.guardar(archivo);
      await publicarEventosDe(publicador, archivo);
    });
  }
}

function hashDe(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
