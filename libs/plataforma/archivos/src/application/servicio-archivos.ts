import type { ConfirmarCarga } from './confirmar-carga.js';
import type { ConsultarEstadoArchivo } from './consultar-estado.js';
import type { EmitirUrlDescarga } from './emitir-url-descarga.js';
import type {
  ArchivoPort,
  CargaSolicitada,
  EstadoArchivo,
  SolicitarCargaComando,
  UrlDescarga,
  UrlDescargaConsulta,
} from './ports/archivo.port.js';
import type { SolicitarCarga } from './solicitar-carga.js';

export interface CasosDeUsoArchivos {
  solicitarCarga: SolicitarCarga;
  confirmarCarga: ConfirmarCarga;
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

  urlDescarga(consulta: UrlDescargaConsulta): Promise<UrlDescarga> {
    return this.casosDeUso.emitirUrlDescarga.ejecutar(consulta);
  }

  estado(archivoId: string): Promise<EstadoArchivo> {
    return this.casosDeUso.consultarEstado.ejecutar(archivoId);
  }
}
