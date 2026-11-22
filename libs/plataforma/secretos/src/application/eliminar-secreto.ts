import { ACCIONES_SECRETO, ENTIDAD_SECRETO, type DependenciasBoveda } from './dependencias-boveda.js';

/** Borrado físico. Un id que no existe en el tenant termina sin error ni auditoría. No descifra: no exige claves maestras. */
export class EliminarSecreto {
  constructor(private readonly dependencias: DependenciasBoveda) {}

  async ejecutar(secretoId: string): Promise<void> {
    const { unidadDeTrabajo, secretos, auditoria } = this.dependencias;

    await unidadDeTrabajo.run(async () => {
      const secreto = await secretos.obtener(secretoId);
      if (!secreto || !(await secretos.borrar(secretoId))) return;
      await auditoria.registrar({
        accion: ACCIONES_SECRETO.eliminar,
        entidadTipo: ENTIDAD_SECRETO,
        entidadId: secretoId,
        antes: { tipo: secreto.tipo, version: secreto.version },
      });
    });
  }
}
