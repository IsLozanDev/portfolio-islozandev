/** Token multi: `apps/api` compone los autorizadores de los productos. Nace vacío. */
export const AUTORIZADORES_ENTIDAD = Symbol('AutorizadoresEntidad');

/**
 * Decide si el usuario del contexto puede tocar la entidad a la que se asocia un archivo. Lo registra cada
 * producto para su `entidadTipo`; sin autorizador registrado bastan el permiso `plat.archivo.*` y el tenant.
 */
export interface AutorizadorEntidad {
  readonly entidadTipo: string;
  puedeLeer(entidadId: string): Promise<boolean>;
  puedeEditar(entidadId: string): Promise<boolean>;
}
