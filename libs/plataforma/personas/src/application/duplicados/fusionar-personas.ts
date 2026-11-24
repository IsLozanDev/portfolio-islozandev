import { PersonaNoEncontradaError, VersionObsoletaPersonaError } from '../../domain/errores.js';
import { validarMotivoFusion, type CamposElegidos } from '../../domain/fusion.js';
import type { Persona } from '../../domain/persona.js';
import { exigirUsuario } from '../consentimientos/exigencias.js';
import { publicarEventosDe, type DependenciasPersonas } from '../dependencias-personas.js';
import type { PersonaDetalle } from '../ports/persona.port.js';
import { detalleDe } from '../vista-persona.js';
import { ENTIDAD_AUDITADA } from './par-del-tenant.js';

export const ACCION_FUSIONAR = 'plat.persona.fusionar';
const DIGITOS_VISIBLES_DOCUMENTO = 4;

export interface FusionarPersonasComando {
  conservadaId: string;
  absorbidaId: string;
  versionConservada: number;
  versionAbsorbida: number;
  camposElegidos: CamposElegidos;
  motivo: string;
}

/**
 * TR-RF-042, pasos 3 y 4: en una transacción, la conservada absorbe a la otra, que queda como alias; los
 * alias de la absorbida pasan a la conservada; se registra la fusión, se audita con antes y después
 * (TR-RNF-013) y se publica `persona.fusionada` (TR-RN-034). Todo o nada.
 */
export class FusionarPersonas {
  constructor(private readonly dependencias: DependenciasPersonas) {}

  async ejecutar(comando: FusionarPersonasComando): Promise<PersonaDetalle> {
    const motivo = validarMotivoFusion(comando.motivo);
    const { unidadDeTrabajo, personas, fusiones, contexto, reloj, ids, publicador } = this.dependencias;

    return unidadDeTrabajo.run(async () => {
      const conservada = await this.exigir(comando.conservadaId, comando.versionConservada);
      const absorbida = await this.exigir(comando.absorbidaId, comando.versionAbsorbida);
      const antes = { conservada: fotoDe(conservada), absorbida: fotoDe(absorbida) };
      const fusionadoPor = exigirUsuario(contexto);
      const ahora = reloj.now();
      const fusionId = ids.next();

      const movimientos = conservada.absorber(absorbida, comando.camposElegidos, fusionId);
      absorbida.marcarFusionada(conservada.id, ahora);
      await personas.guardarFusion(conservada, absorbida, movimientos);
      await fusiones.reapuntarAlias(absorbida.id, conservada.id);
      await fusiones.registrar({
        id: fusionId,
        conservadaId: conservada.id,
        absorbidaId: absorbida.id,
        camposElegidos: comando.camposElegidos,
        motivo,
        fusionadoPor,
        fusionadoEn: ahora,
      });
      await this.auditar(conservada, absorbida, antes, motivo);
      await publicarEventosDe(publicador, conservada);
      return detalleDe(conservada, { resueltaDesde: null, alias: await personas.aliasDe(conservada.id) });
    });
  }

  private async exigir(personaId: string, versionLeida: number): Promise<Persona> {
    const persona = await this.dependencias.personas.obtener(personaId);
    if (!persona) throw new PersonaNoEncontradaError();
    if (persona.version !== versionLeida) throw new VersionObsoletaPersonaError();
    return persona;
  }

  private auditar(conservada: Persona, absorbida: Persona, antes: object, motivo: string): Promise<void> {
    return this.dependencias.auditoria.registrar({
      accion: ACCION_FUSIONAR,
      entidadTipo: ENTIDAD_AUDITADA,
      entidadId: conservada.id,
      antes,
      despues: { conservada: fotoDe(conservada), absorbida_id: absorbida.id, fusionada_en_id: conservada.id },
      motivo,
    });
  }
}

/** Lo que la auditoría guarda de una ficha: sin valores de contactos ni direcciones, y el documento enmascarado. */
function fotoDe(persona: Persona) {
  return {
    id: persona.id,
    version: persona.version,
    tipo_documento: persona.documento.tipo,
    numero_documento: enmascarar(persona.documento.numero),
    nombres: persona.nombres,
    apellido_paterno: persona.apellidoPaterno,
    apellido_materno: persona.apellidoMaterno,
    razon_social: persona.razonSocial,
    roles: persona.roles.map(({ productoCodigo, rol }) => `${productoCodigo}:${rol}`),
    contactos: persona.contactos.map((contacto) => contacto.id),
    direcciones: persona.direcciones.map((direccion) => direccion.id),
  };
}

function enmascarar(numero: string): string {
  return `****${numero.slice(-DIGITOS_VISIBLES_DOCUMENTO)}`;
}
