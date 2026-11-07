import { AggregateRoot } from '@vitrina/plataforma/kernel';
import { mismosAtributos, validarAtributos, type AtributosItem } from './atributos-item.js';
import type { Catalogo } from './catalogo.js';
import { AlcanceNoPermiteError, ItemInvalidoError } from './errores.js';
import type { Vigencia } from './vigencia.js';

const CODIGO_MAXIMO = 40;
const NOMBRE_MAXIMO = 200;
const ABREVIATURA_MAXIMA = 30;
const CODIGO_EXTERNO_MAXIMO = 40;
/** Igual que el DEFAULT de `cat.catalogo_item.version`. */
export const VERSION_INICIAL_ITEM = 0;

export interface ItemCatalogoProps {
  catalogoId: string;
  /** null: ítem global. */
  tenantId: string | null;
  codigo: string;
  codigoExterno: string | null;
  nombre: string;
  abreviatura: string | null;
  orden: number;
  atributos: AtributosItem;
  vigencia: Vigencia;
  activo: boolean;
  creadoPor: string | null;
  creadoEn: Date;
  modificadoPor: string | null;
  modificadoEn: Date;
}

/** Campos que se pueden cambiar después de crear. El código y el dueño no cambian. */
export interface ContenidoItem {
  codigoExterno: string | null;
  nombre: string;
  abreviatura: string | null;
  orden: number;
  atributos: unknown;
  vigencia: Vigencia;
  activo: boolean;
}

export interface DatosNuevoItem extends ContenidoItem {
  id: string;
  catalogo: Catalogo;
  tenantId: string | null;
  codigo: string;
  por: string;
  ahora: Date;
}

export interface CambiosItem extends ContenidoItem {
  por: string;
  ahora: Date;
}

/** Ítem de un catálogo, global o propio de un tenant (TR-RF-023, TR-RF-026, TR-RN-012). */
export class ItemCatalogo extends AggregateRoot {
  private constructor(
    id: string,
    version: number,
    private props: ItemCatalogoProps,
  ) {
    super(id, version);
  }

  static crear(datos: DatosNuevoItem): ItemCatalogo {
    validarDueno(datos.catalogo, datos.tenantId);
    validarCodigo(datos.codigo);
    const contenido = validarContenido(datos);
    return new ItemCatalogo(datos.id, VERSION_INICIAL_ITEM, {
      catalogoId: datos.catalogo.id,
      tenantId: datos.tenantId,
      codigo: datos.codigo,
      ...contenido,
      creadoPor: datos.por,
      creadoEn: datos.ahora,
      modificadoPor: datos.por,
      modificadoEn: datos.ahora,
    });
  }

  static reconstituir(id: string, version: number, props: ItemCatalogoProps): ItemCatalogo {
    return new ItemCatalogo(id, version, { ...props });
  }

  get catalogoId(): string {
    return this.props.catalogoId;
  }

  get tenantId(): string | null {
    return this.props.tenantId;
  }

  get esGlobal(): boolean {
    return this.props.tenantId === null;
  }

  get codigo(): string {
    return this.props.codigo;
  }

  get codigoExterno(): string | null {
    return this.props.codigoExterno;
  }

  get nombre(): string {
    return this.props.nombre;
  }

  get abreviatura(): string | null {
    return this.props.abreviatura;
  }

  get orden(): number {
    return this.props.orden;
  }

  get atributos(): AtributosItem {
    return this.props.atributos;
  }

  get vigencia(): Vigencia {
    return this.props.vigencia;
  }

  get activo(): boolean {
    return this.props.activo;
  }

  get creadoPor(): string | null {
    return this.props.creadoPor;
  }

  get creadoEn(): Date {
    return this.props.creadoEn;
  }

  get modificadoPor(): string | null {
    return this.props.modificadoPor;
  }

  get modificadoEn(): Date {
    return this.props.modificadoEn;
  }

  /** false si no cambia nada: no se escribe ni se publica (TR-RNF-008). Cerrar vigencia o inactivar van aquí. */
  actualizar(cambios: CambiosItem): boolean {
    const contenido = validarContenido(cambios);
    if (!this.cambia(contenido)) return false;
    this.props = { ...this.props, ...contenido, modificadoPor: cambios.por, modificadoEn: cambios.ahora };
    return true;
  }

  private cambia(contenido: ContenidoValidado): boolean {
    return (
      contenido.codigoExterno !== this.props.codigoExterno ||
      contenido.nombre !== this.props.nombre ||
      contenido.abreviatura !== this.props.abreviatura ||
      contenido.orden !== this.props.orden ||
      contenido.activo !== this.props.activo ||
      !contenido.vigencia.igualA(this.props.vigencia) ||
      !mismosAtributos(contenido.atributos, this.props.atributos)
    );
  }
}

type ContenidoValidado = Omit<ContenidoItem, 'atributos'> & { atributos: AtributosItem };

/** GLOBAL no admite propios; TENANT no admite globales. */
function validarDueno(catalogo: Catalogo, tenantId: string | null): void {
  const admite = tenantId === null ? catalogo.admiteItemsGlobales() : catalogo.admiteItemsPropios();
  if (!admite) throw new AlcanceNoPermiteError();
}

function validarCodigo(codigo: string): void {
  if (codigo.length === 0 || codigo.length > CODIGO_MAXIMO) {
    throw new ItemInvalidoError('El código debe tener de 1 a 40 caracteres');
  }
}

function validarContenido(contenido: ContenidoItem): ContenidoValidado {
  if (contenido.nombre.length === 0 || contenido.nombre.length > NOMBRE_MAXIMO) {
    throw new ItemInvalidoError('El nombre debe tener de 1 a 200 caracteres');
  }
  if (contenido.abreviatura !== null && contenido.abreviatura.length > ABREVIATURA_MAXIMA) {
    throw new ItemInvalidoError('La abreviatura debe tener como máximo 30 caracteres');
  }
  if (contenido.codigoExterno !== null && contenido.codigoExterno.length > CODIGO_EXTERNO_MAXIMO) {
    throw new ItemInvalidoError('El código externo debe tener como máximo 40 caracteres');
  }
  return {
    codigoExterno: contenido.codigoExterno,
    nombre: contenido.nombre,
    abreviatura: contenido.abreviatura,
    orden: contenido.orden,
    atributos: validarAtributos(contenido.atributos),
    vigencia: contenido.vigencia,
    activo: contenido.activo,
  };
}
