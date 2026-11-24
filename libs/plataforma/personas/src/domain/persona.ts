import { AggregateRoot } from '@vitrina/plataforma/kernel';
import type { ProductoCodigo } from '@vitrina/plataforma/org';
import { TIPOS_CONTACTO, type Contacto } from './contacto.js';
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
  CampoElegidoInvalidoError,
  CelularPrincipalObligatorioError,
  ContactoDuplicadoError,
  ContactoInvalidoError,
  ContactoNoEncontradoError,
  DireccionNoEncontradaError,
  PersonaYaFusionadaError,
} from './errores.js';
import {
  AGREGADO_PERSONA,
  EVENTOS_PER,
  VERSION_ESQUEMA_PER,
  type CambioPersona,
  type PersonaActualizada,
  type PersonaFusionada,
  type PersonaRegistrada,
  type PersonaRolAsignado,
} from './eventos-per.js';
import {
  CAMPOS_DATOS_BASICOS,
  CAMPOS_POR_TIPO_PERSONA,
  exigirFusionable,
  PRINCIPAL_DIRECCION,
  type AliasFusion,
  type CamposElegidos,
  type ClavePrincipal,
  type ResultadoAbsorcion,
} from './fusion.js';
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
  /** Nulo salvo en una absorbida, que queda inactiva como alias de su conservada. */
  fusion: AliasFusion | null;
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

type PayloadPersona = PersonaRegistrada | PersonaRolAsignado | PersonaActualizada | PersonaFusionada;

/** Principal que queda por cada tipo de contacto y para las direcciones; nulo si ninguna ficha tenía. */
type PrincipalesElegidos = Map<ClavePrincipal, string | null>;

const CLAVES_PRINCIPAL: readonly ClavePrincipal[] = [...TIPOS_CONTACTO, PRINCIPAL_DIRECCION];

/**
 * Persona maestra del tenant, única por tipo y número de documento (TR-RF-039 y 040), con sus contactos y
 * direcciones (TR-RF-041): un principal por tipo de contacto, una dirección principal y siempre un celular
 * principal. Cada cambio publica un solo `persona.actualizada`; si no cambió nada devuelve `false` y no publica.
 * Una absorbida por fusión (TR-RF-042) ya no admite cambios.
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
      fusion: null,
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
      fusion: props.fusion ? { ...props.fusion } : null,
    });
  }

  /** Devuelve `false` y no registra evento si la persona ya tiene vigente ese rol en el producto. */
  asignarRol(productoCodigo: ProductoCodigo, rol: RolPersona, desde: FechaRol): boolean {
    this.exigirSinFusionar();
    if (this.tieneRolVigente(productoCodigo, rol)) return false;
    this.props.roles.push({ productoCodigo, rol, desde, hasta: null });
    const payload: PersonaRolAsignado = { persona_id: this.id, producto_codigo: productoCodigo, rol, desde };
    this.publicar(EVENTOS_PER.rolAsignado, payload);
    return true;
  }

  /** Mismas reglas que el registro, sobre la denominación actual. Documento y tipo de persona no cambian. */
  cambiarDatosBasicos(cambios: CambiosDatosBasicos): boolean {
    this.exigirSinFusionar();
    const denominacion = denominar(this.props.tipoPersona, { ...this.props, ...sinAusentes(cambios) });
    if (esMismaDenominacion(denominacion, this.props)) return false;
    Object.assign(this.props, denominacion);
    this.publicarActualizada('DATOS_BASICOS');
    return true;
  }

  /** Si llega principal, desmarca el principal anterior de su tipo. */
  agregarContacto(contacto: Contacto): boolean {
    this.exigirSinFusionar();
    this.exigirContactoSinRepetir(contacto);
    this.ponerContacto(contacto);
    this.publicarActualizada('CONTACTO');
    return true;
  }

  editarContacto(contactoId: string, cambios: CambiosContacto): boolean {
    this.exigirSinFusionar();
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
    this.exigirSinFusionar();
    const contacto = this.contactoDe(contactoId);
    if (esCelularPrincipal(contacto)) throw new CelularPrincipalObligatorioError();
    this.props.contactos = this.props.contactos.filter((otro) => otro !== contacto);
    this.publicarActualizada('CONTACTO');
    return true;
  }

  /** Si llega principal, desmarca la dirección principal anterior. */
  agregarDireccion(direccion: Direccion): boolean {
    this.exigirSinFusionar();
    this.ponerDireccion(direccion);
    this.publicarActualizada('DIRECCION');
    return true;
  }

  editarDireccion(direccionId: string, cambios: CambiosDireccion): boolean {
    this.exigirSinFusionar();
    const actual = this.direccionDe(direccionId);
    const editada = actual.con(cambios);
    if (editada.esIgualA(actual)) return false;
    this.ponerDireccion(editada);
    this.publicarActualizada('DIRECCION');
    return true;
  }

  /** La principal también se puede borrar: una persona puede quedar sin dirección principal. */
  eliminarDireccion(direccionId: string): boolean {
    this.exigirSinFusionar();
    const direccion = this.direccionDe(direccionId);
    this.props.direcciones = this.props.direcciones.filter((otra) => otra !== direccion);
    this.publicarActualizada('DIRECCION');
    return true;
  }

  /**
   * TR-RF-042: esta ficha absorbe a la otra. Toma los datos básicos elegidos y los roles, contactos y
   * direcciones que no tiene; lo repetido se queda en la absorbida. Deja un principal por tipo según lo
   * elegido: el celular principal no se pierde porque, sin elección, queda el de la conservada. Publica un
   * solo `persona.fusionada`. La absorbida se marca aparte con `marcarFusionada`.
   */
  absorber(absorbida: Persona, campos: CamposElegidos, fusionId: string): ResultadoAbsorcion {
    exigirFusionable(this, absorbida);
    const denominacion = this.denominacionElegida(absorbida, campos.datosBasicos);
    const principales = this.principalesElegidos(absorbida, campos.principales);
    const roles = this.tomarRoles(absorbida);
    const contactosMovidos = this.tomarContactos(absorbida);
    const direccionesMovidas = this.tomarDirecciones(absorbida);
    Object.assign(this.props, denominacion);
    this.aplicarPrincipales(absorbida, principales);
    const payload: PersonaFusionada = { persona_conservada_id: this.id, persona_absorbida_id: absorbida.id, fusion_id: fusionId };
    this.publicar(EVENTOS_PER.fusionada, payload);
    return { ...roles, contactosMovidos, direccionesMovidas };
  }

  /** Inactiva y alias de la conservada. Sube la versión sin evento: `persona.fusionada` es de la conservada. */
  marcarFusionada(conservadaId: string, ahora: Date): void {
    this.exigirSinFusionar();
    this.props.activo = false;
    this.props.fusion = { conservadaId, fusionadaEn: ahora };
    this.bumpVersion();
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

  get fusion(): AliasFusion | null {
    return this.props.fusion;
  }

  private exigirSinFusionar(): void {
    if (this.props.fusion) throw new PersonaYaFusionadaError(this.props.fusion.conservadaId);
  }

  private denominacionElegida(absorbida: Persona, elegidos: CamposElegidos['datosBasicos']): DenominacionPersona {
    const aplicables = CAMPOS_POR_TIPO_PERSONA[this.props.tipoPersona];
    const noAplica = Object.keys(elegidos).find((campo) => !aplicables.some((aplicable) => aplicable === campo));
    if (noAplica) throw new CampoElegidoInvalidoError(`El campo ${noAplica} no aplica a este tipo de persona`);
    const propuesta = Object.fromEntries(
      CAMPOS_DATOS_BASICOS.map((campo) => [campo, (elegidos[campo] === 'ABSORBIDA' ? absorbida : this).props[campo]]),
    );
    return denominar(this.props.tipoPersona, { documento: this.props.documento, ...propuesta });
  }

  /** Se resuelve antes de mover nada: lo elegido debe ser de una de las dos fichas y del mismo tipo. */
  private principalesElegidos(absorbida: Persona, elegidos: CamposElegidos['principales']): PrincipalesElegidos {
    const principales: PrincipalesElegidos = new Map();
    for (const clave of CLAVES_PRINCIPAL) {
      const elegido = elegidos[clave];
      if (elegido !== undefined && !this.tieneCandidato(clave, elegido) && !absorbida.tieneCandidato(clave, elegido)) {
        throw new CampoElegidoInvalidoError(`El principal elegido para ${clave} no es de ninguna de las dos fichas`);
      }
      principales.set(clave, elegido ?? this.principalDe(clave) ?? absorbida.principalDe(clave));
    }
    return principales;
  }

  private tieneCandidato(clave: ClavePrincipal, id: string): boolean {
    return this.candidatosDe(clave).some((candidato) => candidato.id === id);
  }

  private principalDe(clave: ClavePrincipal): string | null {
    return this.candidatosDe(clave).find((candidato) => candidato.principal)?.id ?? null;
  }

  private candidatosDe(clave: ClavePrincipal): readonly (Contacto | Direccion)[] {
    if (clave === PRINCIPAL_DIRECCION) return this.props.direcciones;
    return this.props.contactos.filter((contacto) => contacto.tipo === clave);
  }

  /** El mismo producto y rol no se duplica: la conservada se queda con el `desde` más antiguo. */
  private tomarRoles(absorbida: Persona): Pick<ResultadoAbsorcion, 'rolesMovidos' | 'rolesAdelantados'> {
    const rolesMovidos: RolAsignado[] = [];
    const rolesAdelantados: RolAsignado[] = [];
    for (const rolAjeno of absorbida.props.roles) {
      const propio = this.props.roles.find((rol) => rol.productoCodigo === rolAjeno.productoCodigo && rol.rol === rolAjeno.rol);
      if (!propio) {
        rolesMovidos.push(rolAjeno);
        continue;
      }
      if (rolAjeno.desde >= propio.desde) continue;
      const adelantado = { ...propio, desde: rolAjeno.desde };
      this.props.roles = this.props.roles.map((rol) => (rol === propio ? adelantado : rol));
      rolesAdelantados.push(adelantado);
    }
    this.props.roles.push(...rolesMovidos);
    absorbida.props.roles = absorbida.props.roles.filter((rol) => !rolesMovidos.includes(rol));
    return { rolesMovidos, rolesAdelantados };
  }

  private tomarContactos(absorbida: Persona): string[] {
    const movidos = absorbida.props.contactos.filter((ajeno) => !this.props.contactos.some((propio) => propio.esMismoContacto(ajeno)));
    this.props.contactos.push(...movidos);
    absorbida.props.contactos = absorbida.props.contactos.filter((ajeno) => !movidos.includes(ajeno));
    return movidos.map((contacto) => contacto.id);
  }

  private tomarDirecciones(absorbida: Persona): string[] {
    const movidas = absorbida.props.direcciones.filter((ajena) => !this.props.direcciones.some((propia) => propia.esMismoLugar(ajena)));
    this.props.direcciones.push(...movidas);
    absorbida.props.direcciones = absorbida.props.direcciones.filter((ajena) => !movidas.includes(ajena));
    return movidas.map((direccion) => direccion.id);
  }

  /** Un principal elegido que se quedó en la absorbida por repetido pasa a su igual de la conservada. */
  private aplicarPrincipales(absorbida: Persona, principales: PrincipalesElegidos): void {
    const principalDe = (clave: ClavePrincipal) => this.equivalenteDe(absorbida, clave, principales.get(clave) ?? null);
    const principalDireccion = principalDe(PRINCIPAL_DIRECCION);
    const principalesContacto = new Map(TIPOS_CONTACTO.map((tipo) => [tipo, principalDe(tipo)]));
    this.props.contactos = this.props.contactos.map((contacto) => contacto.conPrincipal(principalesContacto.get(contacto.tipo) === contacto.id));
    this.props.direcciones = this.props.direcciones.map((direccion) => direccion.conPrincipal(direccion.id === principalDireccion));
  }

  private equivalenteDe(absorbida: Persona, clave: ClavePrincipal, id: string | null): string | null {
    if (id === null || this.tieneCandidato(clave, id)) return id;
    if (clave === PRINCIPAL_DIRECCION) {
      const repetida = absorbida.props.direcciones.find((direccion) => direccion.id === id);
      return this.props.direcciones.find((propia) => repetida && propia.esMismoLugar(repetida))?.id ?? null;
    }
    const repetido = absorbida.props.contactos.find((contacto) => contacto.id === id);
    return this.props.contactos.find((propio) => repetido && propio.esMismoContacto(repetido))?.id ?? null;
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
