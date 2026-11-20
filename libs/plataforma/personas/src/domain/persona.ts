import { AggregateRoot } from '@vitrina/plataforma/kernel';
import type { ProductoCodigo } from '@vitrina/plataforma/org';
import type { Contacto } from './contacto.js';
import {
  denominarJuridica,
  denominarNatural,
  esMismaDenominacion,
  type DenominacionPersona,
  type DenominacionPropuesta,
  type TextoOpcional,
} from './denominacion.js';
import type { CambiosDireccion, Direccion } from './direccion.js';
import type { DocumentoIdentidad } from './documento-identidad.js';
import {
  CelularPrincipalObligatorioError,
  ContactoDuplicadoError,
  ContactoInvalidoError,
  ContactoNoEncontradoError,
  DireccionNoEncontradaError,
} from './errores.js';
import {
  AGREGADO_PERSONA,
  EVENTOS_PER,
  VERSION_ESQUEMA_PER,
  type CambioPersona,
  type PersonaActualizada,
  type PersonaRegistrada,
  type PersonaRolAsignado,
} from './eventos-per.js';
import { estaVigente, type FechaRol, type RolAsignado, type RolPersona } from './rol-persona.js';

export const TIPOS_PERSONA = ['NATURAL', 'JURIDICA'] as const;
export type TipoPersona = (typeof TIPOS_PERSONA)[number];

/** La persona nace en versión 1, como el DEFAULT de `per.persona.version`: la sube `persona.registrada`. */
const VERSION_SIN_REGISTRAR = 0;

export interface PersonaProps extends DenominacionPersona {
  tenantId: string;
  tipoPersona: TipoPersona;
  documento: DocumentoIdentidad;
  activo: boolean;
  roles: RolAsignado[];
  contactos: Contacto[];
  direcciones: Direccion[];
}

export interface DatosRegistroPersona extends DenominacionPropuesta {
  id: string;
  tenantId: string;
  tipoPersona: TipoPersona;
  contactos: readonly Contacto[];
}

/** Un campo ausente no cambia; `apellidoMaterno: null` lo borra. */
export interface CambiosDatosBasicos {
  nombres?: TextoOpcional;
  apellidoPaterno?: TextoOpcional;
  apellidoMaterno?: TextoOpcional;
  razonSocial?: TextoOpcional;
}

/** El tipo de un contacto no se edita: cambiarlo es borrar y agregar. */
export interface CambiosContacto {
  valor?: string;
  principal?: boolean;
}

type PayloadPersona = PersonaRegistrada | PersonaRolAsignado | PersonaActualizada;

/**
 * Persona maestra del tenant, única por tipo y número de documento (TR-RF-039 y 040), con sus contactos y
 * direcciones (TR-RF-041): un principal por tipo de contacto, una dirección principal y siempre un celular
 * principal. Cada cambio publica un solo `persona.actualizada`; si no cambió nada devuelve `false` y no publica.
 */
export class Persona extends AggregateRoot {
  private constructor(
    id: string,
    version: number,
    private readonly props: PersonaProps,
  ) {
    super(id, version);
  }

  static registrar(datos: DatosRegistroPersona): Persona {
    const denominacion = denominar(datos.tipoPersona, datos);
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
      direcciones: [],
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
    return new Persona(id, version, {
      ...props,
      roles: [...props.roles],
      contactos: [...props.contactos],
      direcciones: [...props.direcciones],
    });
  }

  /** Devuelve `false` y no registra evento si la persona ya tiene vigente ese rol en el producto. */
  asignarRol(productoCodigo: ProductoCodigo, rol: RolPersona, desde: FechaRol): boolean {
    if (this.tieneRolVigente(productoCodigo, rol)) return false;
    this.props.roles.push({ productoCodigo, rol, desde, hasta: null });
    const payload: PersonaRolAsignado = { persona_id: this.id, producto_codigo: productoCodigo, rol, desde };
    this.publicar(EVENTOS_PER.rolAsignado, payload);
    return true;
  }

  /** Mismas reglas que el registro, sobre la denominación actual. Documento y tipo de persona no cambian. */
  cambiarDatosBasicos(cambios: CambiosDatosBasicos): boolean {
    const denominacion = denominar(this.props.tipoPersona, { ...this.props, ...sinAusentes(cambios) });
    if (esMismaDenominacion(denominacion, this.props)) return false;
    Object.assign(this.props, denominacion);
    this.publicarActualizada('DATOS_BASICOS');
    return true;
  }

  /** Si llega principal, desmarca el principal anterior de su tipo. */
  agregarContacto(contacto: Contacto): boolean {
    this.exigirContactoSinRepetir(contacto);
    this.ponerContacto(contacto);
    this.publicarActualizada('CONTACTO');
    return true;
  }

  editarContacto(contactoId: string, cambios: CambiosContacto): boolean {
    const actual = this.contactoDe(contactoId);
    const conValor = cambios.valor === undefined ? actual : actual.conValor(cambios.valor);
    const editado = conValor.conPrincipal(cambios.principal ?? actual.principal);
    if (editado.esMismoContacto(actual) && editado.principal === actual.principal) return false;
    this.exigirContactoSinRepetir(editado);
    if (esCelularPrincipal(actual) && !editado.principal) throw new CelularPrincipalObligatorioError();
    this.ponerContacto(editado);
    this.publicarActualizada('CONTACTO');
    return true;
  }

  eliminarContacto(contactoId: string): boolean {
    const contacto = this.contactoDe(contactoId);
    if (esCelularPrincipal(contacto)) throw new CelularPrincipalObligatorioError();
    this.props.contactos = this.props.contactos.filter((otro) => otro !== contacto);
    this.publicarActualizada('CONTACTO');
    return true;
  }

  /** Si llega principal, desmarca la dirección principal anterior. */
  agregarDireccion(direccion: Direccion): boolean {
    this.ponerDireccion(direccion);
    this.publicarActualizada('DIRECCION');
    return true;
  }

  editarDireccion(direccionId: string, cambios: CambiosDireccion): boolean {
    const actual = this.direccionDe(direccionId);
    const editada = actual.con(cambios);
    if (editada.esIgualA(actual)) return false;
    this.ponerDireccion(editada);
    this.publicarActualizada('DIRECCION');
    return true;
  }

  /** La principal también se puede borrar: una persona puede quedar sin dirección principal. */
  eliminarDireccion(direccionId: string): boolean {
    const direccion = this.direccionDe(direccionId);
    this.props.direcciones = this.props.direcciones.filter((otra) => otra !== direccion);
    this.publicarActualizada('DIRECCION');
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

  get direcciones(): readonly Direccion[] {
    return this.props.direcciones;
  }

  private tieneRolVigente(productoCodigo: ProductoCodigo, rol: RolPersona): boolean {
    return this.props.roles.some(
      (asignado) => asignado.productoCodigo === productoCodigo && asignado.rol === rol && estaVigente(asignado),
    );
  }

  private contactoDe(contactoId: string): Contacto {
    const contacto = this.props.contactos.find((otro) => otro.id === contactoId);
    if (!contacto) throw new ContactoNoEncontradoError();
    return contacto;
  }

  private direccionDe(direccionId: string): Direccion {
    const direccion = this.props.direcciones.find((otra) => otra.id === direccionId);
    if (!direccion) throw new DireccionNoEncontradaError();
    return direccion;
  }

  private exigirContactoSinRepetir(contacto: Contacto): void {
    const repetido = this.props.contactos.some((otro) => otro.id !== contacto.id && otro.esMismoContacto(contacto));
    if (repetido) throw new ContactoDuplicadoError();
  }

  private ponerContacto(contacto: Contacto): void {
    this.props.contactos = ponerEnLista(this.props.contactos, contacto, (otro) => otro.tipo === contacto.tipo);
  }

  private ponerDireccion(direccion: Direccion): void {
    this.props.direcciones = ponerEnLista(this.props.direcciones, direccion, () => true);
  }

  private publicarActualizada(cambio: CambioPersona): void {
    const payload: PersonaActualizada = { persona_id: this.id, cambio };
    this.publicar(EVENTOS_PER.actualizada, payload);
  }

  private publicar(eventType: string, payload: PayloadPersona): void {
    this.raise({ eventType, aggregateType: AGREGADO_PERSONA, schemaVersion: VERSION_ESQUEMA_PER, payload });
  }
}

interface ConPrincipal<Elemento> {
  readonly id: string;
  readonly principal: boolean;
  conPrincipal(principal: boolean): Elemento;
}

/**
 * Agrega el elemento o reemplaza al de su mismo id. Si llega principal, desmarca a los principales con
 * los que compite: queda uno solo.
 */
function ponerEnLista<Elemento extends ConPrincipal<Elemento>>(
  lista: readonly Elemento[],
  elemento: Elemento,
  compiteConElemento: (otro: Elemento) => boolean,
): Elemento[] {
  const yaEstaba = lista.some((otro) => otro.id === elemento.id);
  const actualizada = lista.map((otro) => {
    if (otro.id === elemento.id) return elemento;
    const cedeElPrincipal = elemento.principal && otro.principal && compiteConElemento(otro);
    return cedeElPrincipal ? otro.conPrincipal(false) : otro;
  });
  return yaEstaba ? actualizada : [...actualizada, elemento];
}

function denominar(tipoPersona: TipoPersona, propuesta: DenominacionPropuesta): DenominacionPersona {
  return tipoPersona === 'NATURAL' ? denominarNatural(propuesta) : denominarJuridica(propuesta);
}

function sinAusentes(cambios: CambiosDatosBasicos): CambiosDatosBasicos {
  return Object.fromEntries(Object.entries(cambios).filter(([, valor]) => valor !== undefined));
}

function esCelularPrincipal(contacto: Contacto): boolean {
  return contacto.tipo === 'CELULAR' && contacto.principal;
}

function exigirCelularPrincipal(contactos: readonly Contacto[]): void {
  if (!contactos.some(esCelularPrincipal)) throw new ContactoInvalidoError('El celular principal es obligatorio');
}

function exigirUnPrincipalPorTipo(contactos: readonly Contacto[]): void {
  const tiposPrincipales = contactos.filter((contacto) => contacto.principal).map((contacto) => contacto.tipo);
  if (new Set(tiposPrincipales).size !== tiposPrincipales.length) {
    throw new ContactoInvalidoError('Solo puede haber un contacto principal por tipo');
  }
}
