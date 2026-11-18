import { AggregateRoot, ValidationError } from '@vitrina/plataforma/kernel';
import type { ProductoCodigo } from '@vitrina/plataforma/org';
import type { Contacto } from './contacto.js';
import type { DocumentoIdentidad } from './documento-identidad.js';
import { ContactoInvalidoError, TipoPersonaIncoherenteError } from './errores.js';
import {
  AGREGADO_PERSONA,
  EVENTOS_PER,
  VERSION_ESQUEMA_PER,
  type PersonaRegistrada,
  type PersonaRolAsignado,
} from './eventos-per.js';
import { estaVigente, type FechaRol, type RolAsignado, type RolPersona } from './rol-persona.js';

export const TIPOS_PERSONA = ['NATURAL', 'JURIDICA'] as const;
export type TipoPersona = (typeof TIPOS_PERSONA)[number];

const NOMBRES_MAXIMO = 100;
const APELLIDO_MAXIMO = 60;
const RAZON_SOCIAL_MAXIMA = 200;
const PREFIJOS_RUC_NATURAL = ['10', '15', '17'];
const PREFIJOS_RUC_JURIDICA = ['20'];
/** La persona nace en versión 1, como el DEFAULT de `per.persona.version`: la sube `persona.registrada`. */
const VERSION_SIN_REGISTRAR = 0;

type TextoOpcional = string | null | undefined;

/** Nombres de una natural o razón social de una jurídica; lo que no aplica queda nulo. */
export interface DenominacionPersona {
  nombres: string | null;
  apellidoPaterno: string | null;
  apellidoMaterno: string | null;
  razonSocial: string | null;
}

export interface PersonaProps extends DenominacionPersona {
  tenantId: string;
  tipoPersona: TipoPersona;
  documento: DocumentoIdentidad;
  activo: boolean;
  roles: RolAsignado[];
  contactos: Contacto[];
}

export interface DatosRegistroPersona {
  id: string;
  tenantId: string;
  tipoPersona: TipoPersona;
  documento: DocumentoIdentidad;
  nombres?: TextoOpcional;
  apellidoPaterno?: TextoOpcional;
  apellidoMaterno?: TextoOpcional;
  razonSocial?: TextoOpcional;
  contactos: readonly Contacto[];
}

/** Persona maestra del tenant, única por tipo y número de documento (TR-RF-039 y 040). */
export class Persona extends AggregateRoot {
  private constructor(
    id: string,
    version: number,
    private readonly props: PersonaProps,
  ) {
    super(id, version);
  }

  static registrar(datos: DatosRegistroPersona): Persona {
    const denominacion = datos.tipoPersona === 'NATURAL' ? denominarNatural(datos) : denominarJuridica(datos);
    exigirCelularPrincipal(datos.contactos);
    exigirUnPrincipalPorTipo(datos.contactos);
    const persona = new Persona(datos.id, VERSION_SIN_REGISTRAR, {
      tenantId: datos.tenantId,
      tipoPersona: datos.tipoPersona,
      documento: datos.documento,
      ...denominacion,
      activo: true,
      roles: [],
      contactos: [...datos.contactos],
    });
    const payload: PersonaRegistrada = {
      persona_id: datos.id,
      tipo_persona: datos.tipoPersona,
      tipo_documento: datos.documento.tipo,
    };
    persona.publicar(EVENTOS_PER.registrada, payload);
    return persona;
  }

  static reconstituir(id: string, version: number, props: PersonaProps): Persona {
    return new Persona(id, version, { ...props, roles: [...props.roles], contactos: [...props.contactos] });
  }

  /** Devuelve `false` y no registra evento si la persona ya tiene vigente ese rol en el producto. */
  asignarRol(productoCodigo: ProductoCodigo, rol: RolPersona, desde: FechaRol): boolean {
    if (this.tieneRolVigente(productoCodigo, rol)) return false;
    this.props.roles.push({ productoCodigo, rol, desde, hasta: null });
    const payload: PersonaRolAsignado = { persona_id: this.id, producto_codigo: productoCodigo, rol, desde };
    this.publicar(EVENTOS_PER.rolAsignado, payload);
    return true;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get tipoPersona(): TipoPersona {
    return this.props.tipoPersona;
  }

  get documento(): DocumentoIdentidad {
    return this.props.documento;
  }

  get nombres(): string | null {
    return this.props.nombres;
  }

  get apellidoPaterno(): string | null {
    return this.props.apellidoPaterno;
  }

  get apellidoMaterno(): string | null {
    return this.props.apellidoMaterno;
  }

  get razonSocial(): string | null {
    return this.props.razonSocial;
  }

  get activo(): boolean {
    return this.props.activo;
  }

  get roles(): readonly RolAsignado[] {
    return this.props.roles;
  }

  get contactos(): readonly Contacto[] {
    return this.props.contactos;
  }

  private tieneRolVigente(productoCodigo: ProductoCodigo, rol: RolPersona): boolean {
    return this.props.roles.some(
      (asignado) => asignado.productoCodigo === productoCodigo && asignado.rol === rol && estaVigente(asignado),
    );
  }

  private publicar(eventType: string, payload: PersonaRegistrada | PersonaRolAsignado): void {
    this.raise({ eventType, aggregateType: AGREGADO_PERSONA, schemaVersion: VERSION_ESQUEMA_PER, payload });
  }
}

function denominarNatural(datos: DatosRegistroPersona): DenominacionPersona {
  const admiteNatural = datos.documento.tipo !== 'RUC' || datos.documento.esRucConPrefijo(PREFIJOS_RUC_NATURAL);
  if (!admiteNatural || recortar(datos.razonSocial) !== null) throw new TipoPersonaIncoherenteError();
  return {
    nombres: exigirTexto(datos.nombres, NOMBRES_MAXIMO, 'nombres'),
    apellidoPaterno: exigirTexto(datos.apellidoPaterno, APELLIDO_MAXIMO, 'apellido paterno'),
    apellidoMaterno: limitarTexto(recortar(datos.apellidoMaterno), APELLIDO_MAXIMO, 'apellido materno'),
    razonSocial: null,
  };
}

function denominarJuridica(datos: DatosRegistroPersona): DenominacionPersona {
  const traeNombres = [datos.nombres, datos.apellidoPaterno, datos.apellidoMaterno].some((texto) => recortar(texto) !== null);
  if (!datos.documento.esRucConPrefijo(PREFIJOS_RUC_JURIDICA) || traeNombres) throw new TipoPersonaIncoherenteError();
  return {
    nombres: null,
    apellidoPaterno: null,
    apellidoMaterno: null,
    razonSocial: exigirTexto(datos.razonSocial, RAZON_SOCIAL_MAXIMA, 'razón social'),
  };
}

/** Vacío tras recortar cuenta como ausente. */
function recortar(texto: TextoOpcional): string | null {
  const recortado = texto?.trim() ?? '';
  return recortado === '' ? null : recortado;
}

function exigirTexto(texto: TextoOpcional, maximo: number, campo: string): string {
  const recortado = recortar(texto);
  if (recortado === null) throw new ValidationError(`El campo ${campo} es obligatorio`);
  return limitarTexto(recortado, maximo, campo);
}

function limitarTexto<Texto extends string | null>(texto: Texto, maximo: number, campo: string): Texto {
  if (texto !== null && texto.length > maximo) {
    throw new ValidationError(`El campo ${campo} admite hasta ${maximo} caracteres`);
  }
  return texto;
}

function exigirCelularPrincipal(contactos: readonly Contacto[]): void {
  const tieneCelularPrincipal = contactos.some((contacto) => contacto.tipo === 'CELULAR' && contacto.principal);
  if (!tieneCelularPrincipal) throw new ContactoInvalidoError('El celular principal es obligatorio');
}

function exigirUnPrincipalPorTipo(contactos: readonly Contacto[]): void {
  const tiposPrincipales = contactos.filter((contacto) => contacto.principal).map((contacto) => contacto.tipo);
  if (new Set(tiposPrincipales).size !== tiposPrincipales.length) {
    throw new ContactoInvalidoError('Solo puede haber un contacto principal por tipo');
  }
}
