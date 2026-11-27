import { ArchivoNoEncontradoError, type ArchivoPort, type EstadoArchivo } from '@vitrina/plataforma/archivos';
import { CATEGORIA_LOGO, ENTIDAD_ARCHIVO_EMPRESA, type ResultadoValidacionLogo, type ValidadorLogoPort } from '@vitrina/plataforma/org';

const ESTADO_DISPONIBLE = 'DISPONIBLE';

/**
 * Spec 17d: ORG valida el logo sobre ARC. Vive aquí porque org solo depende de kernel (PL-10). ARC solo ve
 * archivos del tenant del contexto, así que uno de otro tenant llega como NO_ENCONTRADO (TR-RNF-010).
 */
export class ValidadorLogoArchivos implements ValidadorLogoPort {
  constructor(private readonly archivos: ArchivoPort) {}

  async validar(archivoId: string, empresaId: string): Promise<ResultadoValidacionLogo> {
    const archivo = await this.estadoDe(archivoId);
    if (!archivo) return { valido: false, motivo: 'NO_ENCONTRADO' };
    if (archivo.categoria !== CATEGORIA_LOGO) return { valido: false, motivo: 'CATEGORIA' };
    if (archivo.entidadTipo !== ENTIDAD_ARCHIVO_EMPRESA || archivo.entidadId !== empresaId) return { valido: false, motivo: 'OTRA_ENTIDAD' };
    if (archivo.estado !== ESTADO_DISPONIBLE) return { valido: false, motivo: 'NO_DISPONIBLE' };
    return { valido: true };
  }

  private async estadoDe(archivoId: string): Promise<EstadoArchivo | null> {
    try {
      return await this.archivos.estado(archivoId);
    } catch (error) {
      if (error instanceof ArchivoNoEncontradoError) return null;
      throw error;
    }
  }
}
