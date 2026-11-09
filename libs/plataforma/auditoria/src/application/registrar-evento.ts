import { prepararContenido } from '../domain/contenido.js';
import { validarEntradaAuditoria, type EntradaAuditoria } from '../domain/entradas.js';
import { datosDelContexto, type DependenciasRegistro } from './dependencias-registro.js';

/** TR-RF-084: registra una operación con antes, después y motivo en la transacción del caso de uso. */
export class RegistrarEvento {
  constructor(private readonly dependencias: DependenciasRegistro) {}

  async ejecutar(entrada: EntradaAuditoria): Promise<void> {
    validarEntradaAuditoria(entrada);
    const clavesExtra = entrada.enmascarar ?? [];
    await this.dependencias.registro.insertar({
      ...datosDelContexto(this.dependencias),
      tipo: 'OPERACION',
      accion: entrada.accion,
      entidadTipo: entrada.entidadTipo,
      entidadId: entrada.entidadId,
      antes: prepararContenido(entrada.antes, clavesExtra),
      despues: prepararContenido(entrada.despues, clavesExtra),
      motivo: entrada.motivo,
    });
  }
}
