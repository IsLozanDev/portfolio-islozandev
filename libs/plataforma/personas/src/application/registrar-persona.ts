import type { IdGenerator } from '@vitrina/plataforma/kernel';
import { Contacto } from '../domain/contacto.js';
import { CATALOGO_TIPO_DOCUMENTO, DocumentoIdentidad } from '../domain/documento-identidad.js';
import { PersonaDuplicadaError, TipoDocumentoNoAdmitidoError } from '../domain/errores.js';
import { Persona } from '../domain/persona.js';
import { resolverAlias } from './alias-personas.js';
import { publicarEventosDe, type DependenciasPersonas } from './dependencias-personas.js';
import type { PersonaDetalle, RegistrarPersonaComando } from './ports/persona.port.js';
import { detalleDe } from './vista-persona.js';

/**
 * TR-RF-039: registra una persona única por documento en el tenant, con su celular principal y su correo
 * principal opcional. No consulta TR-IDN: el prellenado lo entrega la búsqueda. El documento de una absorbida
 * ya es de su conservada.
 */
export class RegistrarPersona {
  constructor(private readonly dependencias: DependenciasPersonas) {}

  async ejecutar(comando: RegistrarPersonaComando): Promise<PersonaDetalle> {
    const { unidadDeTrabajo, contexto, ids, publicador, personas } = this.dependencias;
    const documento = DocumentoIdentidad.crear(comando.tipoDocumento, comando.numeroDocumento);

    return unidadDeTrabajo.run(async () => {
      await this.exigirTipoVigente(documento);
      const persona = Persona.registrar({
        id: ids.next(),
        tenantId: contexto.current().tenantId,
        tipoPersona: comando.tipoPersona,
        documento,
        nombres: comando.nombres,
        apellidoPaterno: comando.apellidoPaterno,
        apellidoMaterno: comando.apellidoMaterno,
        razonSocial: comando.razonSocial,
        contactos: contactosPrincipales(ids, comando),
      });
      const existente = await personas.buscarPorDocumento(documento.tipo, documento.numero);
      if (existente) throw new PersonaDuplicadaError((await resolverAlias(personas, existente)).persona.id);

      await personas.guardar(persona);
      await publicarEventosDe(publicador, persona);
      return detalleDe(persona);
    });
  }

  private async exigirTipoVigente(documento: DocumentoIdentidad): Promise<void> {
    const { valido } = await this.dependencias.catalogo.validarItem(CATALOGO_TIPO_DOCUMENTO, documento.tipo);
    if (!valido) throw new TipoDocumentoNoAdmitidoError();
  }
}

function contactosPrincipales(ids: IdGenerator, comando: RegistrarPersonaComando): Contacto[] {
  const celular = Contacto.crear({ id: ids.next(), tipo: 'CELULAR', valor: comando.celular, principal: true });
  const correo = comando.correo?.trim() ?? '';
  if (correo === '') return [celular];
  return [celular, Contacto.crear({ id: ids.next(), tipo: 'CORREO', valor: correo, principal: true })];
}
