import { exigirCanalHabilitado } from '../../domain/canal.js';
import { nuevaVersionPersonalizada, type ContenidoPersonalizado } from '../../domain/personalizacion-plantilla.js';
import { IDIOMA_POR_DEFECTO } from '../../domain/plantilla.js';
import type { DependenciasPlantillas } from '../dependencias.js';
import { ACCIONES_PLANTILLA, detalleDe, ENTIDAD_PLANTILLA, entidadIdDe, exigirBase, huellaDe, type DetallePlantilla } from './vista-plantilla.js';

/**
 * TR-RF-074: guarda una versión nueva del tenant con el cuerpo saneado, en una transacción con su auditoría.
 * La respuesta lleva el cuerpo saneado: el cliente ve qué quitó el saneador.
 */
export class PersonalizarPlantilla {
  constructor(private readonly dependencias: DependenciasPlantillas) {}

  async ejecutar(codigo: string, canalSolicitado: string, contenido: ContenidoPersonalizado): Promise<DetallePlantilla> {
    const canal = exigirCanalHabilitado(canalSolicitado);
    const { unidadDeTrabajo, contexto, reloj, ids, plantillas, saneador, auditoria } = this.dependencias;

    return unidadDeTrabajo.run(async () => {
      const base = await exigirBase(plantillas, codigo, canal);
      const vigenteDelTenant = await plantillas.vigenteDelTenant(codigo, canal, IDIOMA_POR_DEFECTO);
      const mayorVersionDelTenant = await plantillas.mayorVersionDelTenant(codigo, canal, IDIOMA_POR_DEFECTO);
      const { tenantId, actorId } = contexto.current();
      const nueva = nuevaVersionPersonalizada(
        base,
        vigenteDelTenant,
        { ...contenido, cuerpo: saneador.sanear(contenido.cuerpo) },
        {
          id: ids.next(),
          tenantId,
          creadoPor: actorId ?? null,
          ahora: reloj.now(),
          mayorVersionDelTenant,
        },
      );
      await plantillas.guardarVersion(nueva, contenido.version);
      await auditoria.registrar({
        accion: ACCIONES_PLANTILLA.personalizar,
        entidadTipo: ENTIDAD_PLANTILLA,
        entidadId: entidadIdDe(codigo, canal),
        antes: huellaDe(vigenteDelTenant ?? base),
        despues: huellaDe(nueva),
      });
      return detalleDe(nueva, base);
    });
  }
}
