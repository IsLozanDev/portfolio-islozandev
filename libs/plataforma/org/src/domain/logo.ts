export const CATEGORIA_LOGO = 'LOGO';
export const ENTIDAD_ARCHIVO_EMPRESA = 'EMPRESA';

export const MOTIVOS_LOGO_INVALIDO = ['NO_ENCONTRADO', 'NO_DISPONIBLE', 'CATEGORIA', 'OTRA_ENTIDAD'] as const;
export type MotivoLogoInvalido = (typeof MOTIVOS_LOGO_INVALIDO)[number];

/**
 * Archivo que la aplicación ya validó con ValidadorLogoPort. Empresa solo acepta un logo nuevo con esta marca;
 * la crea el caso de uso después de validar.
 */
export class LogoValidado {
  private constructor(readonly archivoId: string) {}

  static confirmado(archivoId: string): LogoValidado {
    return new LogoValidado(archivoId);
  }
}
