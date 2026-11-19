import type { ConfirmarCarga } from './confirmar-carga.js';
import type { ConfirmarVersion } from './confirmar-version.js';
import type { ConsultarEstadoArchivo } from './consultar-estado.js';
import type { EmitirUrlDescarga } from './emitir-url-descarga.js';
import type { ListarVersiones } from './listar-versiones.js';
import type { MarcarVersionVigente } from './marcar-version-vigente.js';
import type {
  ArchivoPort,
  CargaSolicitada,
  EstadoArchivo,
  NuevaVersionComando,
  SolicitarCargaComando,
  UrlDescarga,
  UrlDescargaConsulta,
  VersionesArchivo,
  VersionListada,
  VersionSolicitada,
} from './ports/archivo.port.js';
import type { SolicitarCarga } from './solicitar-carga.js';
import type { SolicitarVersion } from './solicitar-version.js';

export interface CasosDeUsoArchivos {
  solicitarCarga: SolicitarCarga;
  confirmarCarga: ConfirmarCarga;
  solicitarVersion: SolicitarVersion;
  confirmarVersion: ConfirmarVersion;
  listarVersiones: ListarVersiones;
  marcarVersionVigente: MarcarVersionVigente;
  emitirUrlDescarga: EmitirUrlDescarga;
  consultarEstado: ConsultarEstadoArchivo;
}

export class ServicioArchivos implements ArchivoPort {
  constructor(private readonly casosDeUso: CasosDeUsoArchivos) {}

  solicitarCarga(comando: SolicitarCargaComando): Promise<CargaSolicitada> {
    return this.casosDeUso.solicitarCarga.ejecutar(comando);
  }

  confirmarCarga(archivoId: string): Promise<EstadoArchivo> {
    return this.casosDeUso.confirmarCarga.ejecutar(archivoId);
  }

  nuevaVersion(comando: NuevaVersionComando): Promise<VersionSolicitada> {
    return this.casosDeUso.solicitarVersion.ejecutar(comando);
  }

  confirmarVersion(archivoId: string, numero: number): Promise<VersionListada> {
    return this.casosDeUso.confirmarVersion.ejecutar(archivoId, numero);
  }

  versiones(archivoId: string): Promise<VersionesArchivo> {
    return this.casosDeUso.listarVersiones.ejecutar(archivoId);
  }

  marcarVigente(archivoId: string, numero: number): Promise<EstadoArchivo> {
    return this.casosDeUso.marcarVersionVigente.ejecutar(archivoId, numero);
  }

  urlDescarga(consulta: UrlDescargaConsulta): Promise<UrlDescarga> {
    return this.casosDeUso.emitirUrlDescarga.ejecutar(consulta);
  }

  estado(archivoId: string): Promise<EstadoArchivo> {
    return this.casosDeUso.consultarEstado.ejecutar(archivoId);
  }
}
