/** Marca `seg.usuario.ultimo_acceso`. El guard no espera el resultado. */
export interface RegistroAcceso {
  marcar(usuarioId: string): Promise<void>;
}

export const REGISTRO_ACCESO = Symbol('REGISTRO_ACCESO');
