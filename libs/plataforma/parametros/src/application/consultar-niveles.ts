import type { UnitOfWork } from '@vitrina/plataforma/kernel';
import type { DefinicionParametro } from '../domain/definicion-parametro.js';
import { exigirDefinicion } from './dependencias-valores.js';
import type { LecturaDefiniciones, LecturaNiveles, NivelValor } from './ports/repositorios.js';

export interface NivelConsultado extends NivelValor {
  /** Valor más específico que el alcance máximo actual: cfg.valor lo ignora y conviene restablecerlo. */
  fueraDeAlcance: boolean;
}

export interface NivelesParametro {
  definicion: DefinicionParametro;
  niveles: NivelConsultado[];
}

export interface DependenciasNiveles {
  unidadDeTrabajo: UnitOfWork;
  definiciones: LecturaDefiniciones;
  niveles: LecturaNiveles;
}

/** TR-RF-033 paso 1: la tabla de herencia (defecto y cada nivel configurado del tenant). */
export class ConsultarNiveles {
  constructor(private readonly dependencias: DependenciasNiveles) {}

  ejecutar(codigo: string): Promise<NivelesParametro> {
    const { unidadDeTrabajo, definiciones, niveles } = this.dependencias;
    return unidadDeTrabajo.run(async () => {
      const definicion = await exigirDefinicion(definiciones, codigo);
      const configurados = await niveles.deCodigo(codigo);
      return {
        definicion,
        niveles: configurados.map((nivel) => ({ ...nivel, fueraDeAlcance: !definicion.permiteAlcance(nivel.alcance) })),
      };
    });
  }
}
