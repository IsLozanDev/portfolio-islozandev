import {
  CuotaAgotadaError,
  DocumentoNoEncontradoError,
  ProveedorNoDisponibleError,
  type RespuestaConsulta,
  type TipoConsultable,
} from '@vitrina/plataforma/identidad';
import { DocumentoIdentidad } from '../domain/documento-identidad.js';
import type { DenominacionPersona } from '../domain/denominacion.js';
import type { DependenciasPersonas } from './dependencias-personas.js';
import type { PersonaResumen } from './ports/persona.port.js';
import { resumenDe } from './vista-persona.js';

export type AvisoPrellenado = 'IDENTIDAD_NO_DISPONIBLE' | 'CUOTA_AGOTADA' | 'NO_ENCONTRADO_EN_IDENTIDAD';

/** Sugerencia editable para el formulario de registro; nunca se guarda tal cual. */
export type Prellenado = DenominacionPersona;

export interface BusquedaPorDocumento {
  tipo: string;
  numero: string;
  /** Solo quien puede registrar consume cuota de TR-IDN: el prellenado sirve para registrar. */
  puedePrellenar: boolean;
}

export type ResultadoBusqueda =
  | { encontrada: true; persona: PersonaResumen }
  | { encontrada: false; prellenado: Prellenado | null; aviso?: AvisoPrellenado };

const MOTIVO_CONSULTA = 'REGISTRO_CLIENTE';

/**
 * Devuelve la persona del tenant (TR-CA-101) o, si no existe y el documento es DNI o RUC, los datos de
 * TR-IDN para prellenar (TR-CA-100). La consulta al proveedor va fuera de la transacción y su fallo nunca
 * falla la búsqueda (TR-RNF-007): vuelve como aviso y el registro sigue a mano.
 */
export class BuscarPersonaPorDocumento {
  constructor(private readonly dependencias: Pick<DependenciasPersonas, 'unidadDeTrabajo' | 'personas' | 'identidad'>) {}

  async ejecutar(busqueda: BusquedaPorDocumento): Promise<ResultadoBusqueda> {
    const { unidadDeTrabajo, personas } = this.dependencias;
    const documento = DocumentoIdentidad.crear(busqueda.tipo, busqueda.numero);

    const persona = await unidadDeTrabajo.run(() => personas.buscarPorDocumento(documento.tipo, documento.numero));
    if (persona) return { encontrada: true, persona: resumenDe(persona) };
    if (!documento.esConsultable() || !busqueda.puedePrellenar) return { encontrada: false, prellenado: null };
    return this.prellenarDesdeIdentidad(documento);
  }

  private async prellenarDesdeIdentidad(documento: DocumentoIdentidad): Promise<ResultadoBusqueda> {
    try {
      const respuesta = await this.dependencias.identidad.consultar({
        tipo: documento.tipo as TipoConsultable,
        numero: documento.numero,
        motivo: MOTIVO_CONSULTA,
      });
      return { encontrada: false, prellenado: prellenadoDesde(respuesta) };
    } catch (error) {
      const aviso = avisoDe(error);
      if (aviso === null) throw error;
      return { encontrada: false, prellenado: null, aviso };
    }
  }
}

function avisoDe(error: unknown): AvisoPrellenado | null {
  if (error instanceof ProveedorNoDisponibleError) return 'IDENTIDAD_NO_DISPONIBLE';
  if (error instanceof CuotaAgotadaError) return 'CUOTA_AGOTADA';
  if (error instanceof DocumentoNoEncontradoError) return 'NO_ENCONTRADO_EN_IDENTIDAD';
  return null;
}

/** Un RUC 10, 15 o 17 trae la razón social como referencia: sus nombres no se separan. */
function prellenadoDesde(respuesta: RespuestaConsulta): Prellenado {
  if (respuesta.tipo === 'RUC') {
    return { nombres: null, apellidoPaterno: null, apellidoMaterno: null, razonSocial: respuesta.datos.razonSocial };
  }
  return { nombres: respuesta.datos.nombres, ...separarApellidos(respuesta.datos.apellidos), razonSocial: null };
}

/** Por el primer espacio. Un apellido compuesto («De la Cruz») sale mal partido y se corrige en el formulario. */
function separarApellidos(apellidos: string): Pick<Prellenado, 'apellidoPaterno' | 'apellidoMaterno'> {
  const [paterno, ...resto] = apellidos.trim().split(/\s+/);
  return { apellidoPaterno: paterno || null, apellidoMaterno: resto.join(' ') || null };
}
