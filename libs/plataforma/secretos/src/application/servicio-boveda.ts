import type { DependenciasBoveda } from './dependencias-boveda.js';
import { EliminarSecreto } from './eliminar-secreto.js';
import { GuardarSecreto } from './guardar-secreto.js';
import { LeerSecreto } from './leer-secreto.js';
import type { BovedaSecretos } from './ports/boveda-secretos.js';
import { RotarSecreto } from './rotar-secreto.js';

/** El puerto en proceso: cada operación es su caso de uso. */
export class ServicioBoveda implements BovedaSecretos {
  private readonly guardarSecreto: GuardarSecreto;
  private readonly leerSecreto: LeerSecreto;
  private readonly rotarSecreto: RotarSecreto;
  private readonly eliminarSecreto: EliminarSecreto;

  constructor(dependencias: DependenciasBoveda) {
    this.guardarSecreto = new GuardarSecreto(dependencias);
    this.leerSecreto = new LeerSecreto(dependencias);
    this.rotarSecreto = new RotarSecreto(dependencias);
    this.eliminarSecreto = new EliminarSecreto(dependencias);
  }

  guardar(tipo: string, valor: Uint8Array): Promise<string> {
    return this.guardarSecreto.ejecutar(tipo, valor);
  }

  leer(secretoId: string): Promise<Uint8Array> {
    return this.leerSecreto.ejecutar(secretoId);
  }

  rotar(secretoId: string, valor: Uint8Array): Promise<void> {
    return this.rotarSecreto.ejecutar(secretoId, valor);
  }

  eliminar(secretoId: string): Promise<void> {
    return this.eliminarSecreto.ejecutar(secretoId);
  }
}
