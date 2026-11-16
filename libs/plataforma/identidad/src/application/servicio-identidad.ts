import { validarDocumento, type TipoDocumento, type ValidezDocumento } from '@vitrina/shared/util';
import type { ConsultarDocumento } from './consultar-documento.js';
import type { ConsultaDocumento, IdentidadPort, RespuestaConsulta } from './ports/identidad.port.js';

export class ServicioIdentidad implements IdentidadPort {
  constructor(private readonly consultarDocumento: ConsultarDocumento) {}

  validar(tipo: TipoDocumento, numero: string): ValidezDocumento {
    return validarDocumento(tipo, numero);
  }

  consultar(consulta: ConsultaDocumento): Promise<RespuestaConsulta> {
    return this.consultarDocumento.ejecutar(consulta);
  }
}
