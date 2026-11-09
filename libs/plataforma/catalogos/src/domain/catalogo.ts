import { AggregateRoot } from '@vitrina/plataforma/kernel';
import { CodigoCatalogo } from './codigo-catalogo.js';
import { CatalogoInvalidoError } from './errores.js';
import { esTablaImportable } from './importacion/tipos.js';
import type { AlcanceCatalogo } from './tipos.js';

const NOMBRE_MINIMO = 3;
const NOMBRE_MAXIMO = 150;
/** Igual que el DEFAULT de `cat.catalogo.version`: un catálogo nuevo nace en versión 1 (TR-CA-058). */
export const VERSION_INICIAL_CATALOGO = 1;

export interface CatalogoProps {
  codigo: string;
  nombre: string;
  alcance: AlcanceCatalogo;
  fuente: string | null;
  editablePorTenant: boolean;
  /** null en los catálogos de la semilla. */
  creadoPor: string | null;
  creadoEn: Date;
  modificadoPor: string | null;
  modificadoEn: Date;
}

export interface DatosNuevoCatalogo {
  id: string;
  codigo: string;
  nombre: string;
  alcance: AlcanceCatalogo;
  fuente: string | null;
  editablePorTenant: boolean;
  por: string;
  ahora: Date;
}

export interface CambiosCatalogo {
  nombre: string;
  fuente: string | null;
  editablePorTenant: boolean;
  /** Solo para rechazar un cambio: el alcance no se cambia después de crear. */
  alcance?: AlcanceCatalogo;
  por: string;
  ahora: Date;
}

/**
 * Definición de un catálogo (TR-RF-022, TR-RN-012). La versión es a la vez la de contenido global y
 * el bloqueo optimista; la suben la base y sus triggers, no el agregado.
 */
export class Catalogo extends AggregateRoot {
  private constructor(
    id: string,
    version: number,
    private props: CatalogoProps,
  ) {
    super(id, version);
  }

  static crear(datos: DatosNuevoCatalogo): Catalogo {
    const codigo = CodigoCatalogo.de(datos.codigo).valor;
    validarNombre(datos.nombre);
    validarEditable(datos.alcance, datos.editablePorTenant);
    return new Catalogo(datos.id, VERSION_INICIAL_CATALOGO, {
      codigo,
      nombre: datos.nombre,
      alcance: datos.alcance,
      fuente: datos.fuente,
      editablePorTenant: datos.editablePorTenant,
      creadoPor: datos.por,
      creadoEn: datos.ahora,
      modificadoPor: datos.por,
      modificadoEn: datos.ahora,
    });
  }

  static reconstituir(id: string, version: number, props: CatalogoProps): Catalogo {
    return new Catalogo(id, version, { ...props });
  }

  get codigo(): string {
    return this.props.codigo;
  }

  get nombre(): string {
    return this.props.nombre;
  }

  get alcance(): AlcanceCatalogo {
    return this.props.alcance;
  }

  get fuente(): string | null {
    return this.props.fuente;
  }

  get editablePorTenant(): boolean {
    return this.props.editablePorTenant;
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

  /** false si no cambia nada: no se escribe ni se publica (TR-RNF-008). */
  actualizar(cambios: CambiosCatalogo): boolean {
    if (cambios.alcance !== undefined && cambios.alcance !== this.props.alcance) {
      throw new CatalogoInvalidoError('El alcance de un catálogo no se cambia');
    }
    validarNombre(cambios.nombre);
    validarEditable(this.props.alcance, cambios.editablePorTenant);
    if (!this.cambia(cambios)) return false;
    this.props = {
      ...this.props,
      nombre: cambios.nombre,
      fuente: cambios.fuente,
      editablePorTenant: cambios.editablePorTenant,
      modificadoPor: cambios.por,
      modificadoEn: cambios.ahora,
    };
    return true;
  }

  admiteItemsGlobales(): boolean {
    return this.props.alcance !== 'TENANT';
  }

  admiteItemsPropios(): boolean {
    return this.props.alcance !== 'GLOBAL';
  }

  admiteAjustes(): boolean {
    return this.props.alcance === 'MIXTO';
  }

  /** Las tablas oficiales cambian solo por importación, para que coincidan con su fuente (TR-RNF-017). */
  admiteEdicionManualDeGlobales(): boolean {
    return !esTablaImportable(this.props.codigo);
  }

  private cambia(cambios: CambiosCatalogo): boolean {
    return (
      cambios.nombre !== this.props.nombre ||
      cambios.fuente !== this.props.fuente ||
      cambios.editablePorTenant !== this.props.editablePorTenant
    );
  }
}

function validarNombre(nombre: string): void {
  if (nombre.length < NOMBRE_MINIMO || nombre.length > NOMBRE_MAXIMO) {
    throw new CatalogoInvalidoError('El nombre debe tener de 3 a 150 caracteres');
  }
}

/** Coherencia de `ck_catalogo_editable`: GLOBAL nunca editable; MIXTO y TENANT siempre (TR-CA-059). */
function validarEditable(alcance: AlcanceCatalogo, editablePorTenant: boolean): void {
  if (alcance === 'GLOBAL' && editablePorTenant) {
    throw new CatalogoInvalidoError('Un catálogo normativo global no puede ser editable por el tenant');
  }
  if (alcance !== 'GLOBAL' && !editablePorTenant) {
    throw new CatalogoInvalidoError('Un catálogo mixto o del tenant debe ser editable por el tenant');
  }
}
