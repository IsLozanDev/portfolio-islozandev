import type { Emisor } from '../domain/emisor.js';
import type { AmbienteEmisor, EstadoEmisor, EstadoPrueba } from '../domain/estado-emisor.js';
import type { DependenciasEmisor } from './dependencias-fe.js';
import type { EmpresaEmisora } from './ports/empresa-emisora.port.js';

/** Lo que la lista muestra del emisor: sin usuario del proveedor, huella, URL ni secretos. */
export interface ResumenEmisor {
  estado: EstadoEmisor;
  proveedor: string;
  ambiente: AmbienteEmisor;
  certificadoVenceEn: Date | null;
  pruebaEstado: EstadoPrueba | null;
}

export interface EmpresaConEmisor {
  empresaId: string;
  ruc: string;
  razonSocial: string;
  /** null: la empresa aún no configura su emisor. */
  emisor: ResumenEmisor | null;
}

/** Las empresas activas del tenant con el resumen de su emisor, en una lectura. */
export class ListarEmisores {
  constructor(private readonly dependencias: Pick<DependenciasEmisor, 'unidadDeTrabajo' | 'emisores' | 'empresas'>) {}

  ejecutar(): Promise<EmpresaConEmisor[]> {
    const { unidadDeTrabajo, emisores, empresas } = this.dependencias;
    return unidadDeTrabajo.run(async () => {
      const activas = await empresas.listarActivas();
      const emisoresPorEmpresa = new Map((await emisores.porEmpresas(activas.map((empresa) => empresa.id))).map((emisor) => [emisor.empresaId, emisor]));
      return activas.map((empresa) => empresaConEmisor(empresa, emisoresPorEmpresa.get(empresa.id)));
    });
  }
}

function empresaConEmisor(empresa: EmpresaEmisora, emisor: Emisor | undefined): EmpresaConEmisor {
  return { empresaId: empresa.id, ruc: empresa.ruc, razonSocial: empresa.razonSocial, emisor: emisor ? resumenDe(emisor) : null };
}

function resumenDe(emisor: Emisor): ResumenEmisor {
  const datos = emisor.datos;
  return {
    estado: datos.estado,
    proveedor: datos.proveedor,
    ambiente: datos.ambiente,
    certificadoVenceEn: datos.certificado?.venceEn ?? null,
    pruebaEstado: datos.prueba?.estado ?? null,
  };
}
