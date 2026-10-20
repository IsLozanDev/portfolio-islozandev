import { AggregateRoot, ConflictError, ValidationError } from '@vitrina/plataforma/kernel';
import { exigirCupo, type CupoSucursales } from './cupo-sucursales.js';
import type { Empresa } from './empresa.js';
import { textoOpcional, textoRequerido } from './texto.js';
import { CodigoEstablecimiento, Ubigeo } from './valores.js';

const { DOMICILIO_FISCAL } = CodigoEstablecimiento;

export interface DatosSucursal {
  codigo: string;
  nombre: string;
  codigoEstablecimientoSunat: string | null;
  direccion: string | null;
  ubigeo: string | null;
  telefono: string | null;
  zonaHoraria: string;
}

export interface SucursalProps extends DatosSucursal {
  tenantId: string;
  empresaId: string;
  esPrincipal: boolean;
  activo: boolean;
}

export class Sucursal extends AggregateRoot {
  private constructor(
    id: string,
    version: number,
    private props: SucursalProps,
  ) {
    super(id, version);
  }

  static crear(id: string, empresa: Empresa, datos: DatosSucursal, cupo: CupoSucursales): Sucursal {
    exigirEmpresaActiva(empresa);
    exigirCupo(cupo);
    const limpios = validarDatos(datos);
    exigirSinDomicilioFiscal(limpios.codigoEstablecimientoSunat);
    return Sucursal.nueva(id, empresa, limpios, false);
  }

  /** La que se crea con la empresa: domicilio fiscal 0000 (RF-002, TR-RN-003). */
  static crearPrincipal(id: string, empresa: Empresa, cupo: CupoSucursales): Sucursal {
    exigirEmpresaActiva(empresa);
    exigirCupo(cupo);
    const datos: DatosSucursal = {
      codigo: 'PRINCIPAL',
      nombre: 'Principal',
      codigoEstablecimientoSunat: DOMICILIO_FISCAL,
      direccion: empresa.datos.direccionFiscal,
      ubigeo: empresa.datos.ubigeo,
      telefono: null,
      zonaHoraria: 'America/Lima',
    };
    return Sucursal.nueva(id, empresa, datos, true);
  }

  static reconstituir(id: string, version: number, props: SucursalProps): Sucursal {
    return new Sucursal(id, version, { ...props });
  }

  /**
   * TR-CA-009: la marca y el 0000 pasan de `desde` a `hacia` en la misma operación.
   * `desde` queda sin establecimiento: el 0000 no puede quedarle y otro código lo asigna el usuario.
   */
  static trasladarPrincipal(desde: Sucursal, hacia: Sucursal): void {
    if (!desde.props.esPrincipal) throw new ConflictError('La sucursal de origen no es la principal');
    if (desde.id === hacia.id) return;
    if (desde.props.empresaId !== hacia.props.empresaId) {
      throw new ConflictError('La sucursal principal solo se traslada dentro de la misma empresa');
    }
    if (!hacia.props.activo) throw new ConflictError('Una sucursal inactiva no puede ser la principal');

    desde.props = { ...desde.props, esPrincipal: false, codigoEstablecimientoSunat: null };
    hacia.props = { ...hacia.props, esPrincipal: true, codigoEstablecimientoSunat: DOMICILIO_FISCAL };
    desde.publicar('sucursal.actualizada');
    hacia.publicar('sucursal.actualizada');
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get empresaId(): string {
    return this.props.empresaId;
  }

  get esPrincipal(): boolean {
    return this.props.esPrincipal;
  }

  get activo(): boolean {
    return this.props.activo;
  }

  get datos(): DatosSucursal {
    const { codigo, nombre, codigoEstablecimientoSunat, direccion, ubigeo, telefono, zonaHoraria } = this.props;
    return { codigo, nombre, codigoEstablecimientoSunat, direccion, ubigeo, telefono, zonaHoraria };
  }

  /** La marca de principal no se edita aquí: se traslada con `trasladarPrincipal`. */
  editar(datos: DatosSucursal): void {
    const limpios = validarDatos(datos);
    if (this.props.esPrincipal && limpios.codigoEstablecimientoSunat !== DOMICILIO_FISCAL) {
      throw new ValidationError('La sucursal principal conserva el establecimiento 0000');
    }
    if (!this.props.esPrincipal) exigirSinDomicilioFiscal(limpios.codigoEstablecimientoSunat);
    this.props = { ...this.props, ...limpios };
    this.publicar('sucursal.actualizada');
  }

  inactivar(): void {
    if (!this.props.activo) return;
    if (this.props.esPrincipal) {
      throw new ConflictError('Marque otra sucursal como principal antes de inactivar esta');
    }
    this.props = { ...this.props, activo: false };
    this.publicar('sucursal.inactivada');
  }

  /** Vuelve a ocupar cupo del plan. */
  reactivar(cupo: CupoSucursales): void {
    if (this.props.activo) return;
    exigirCupo(cupo);
    this.props = { ...this.props, activo: true };
    this.publicar('sucursal.actualizada');
  }

  private static nueva(id: string, empresa: Empresa, datos: DatosSucursal, esPrincipal: boolean): Sucursal {
    const sucursal = new Sucursal(id, 0, { tenantId: empresa.tenantId, empresaId: empresa.id, esPrincipal, activo: true, ...datos });
    sucursal.publicar('sucursal.creada');
    return sucursal;
  }

  private publicar(eventType: string): void {
    const p = this.props;
    this.raise({
      eventType,
      aggregateType: 'sucursal',
      schemaVersion: 1,
      payload: {
        empresa_id: p.empresaId,
        codigo: p.codigo,
        nombre: p.nombre,
        es_principal: p.esPrincipal,
        codigo_establecimiento_sunat: p.codigoEstablecimientoSunat,
      },
    });
  }
}

function exigirEmpresaActiva(empresa: Empresa): void {
  if (!empresa.activo) throw new ConflictError('La empresa está inactiva');
}

function exigirSinDomicilioFiscal(codigo: string | null): void {
  if (codigo === DOMICILIO_FISCAL) {
    throw new ValidationError('El establecimiento 0000 es el domicilio fiscal y corresponde a la sucursal principal');
  }
}

function validarDatos(datos: DatosSucursal): DatosSucursal {
  return {
    codigo: textoRequerido(datos.codigo, 1, 20, 'El código de sucursal'),
    nombre: textoRequerido(datos.nombre, 3, 150, 'El nombre de la sucursal'),
    codigoEstablecimientoSunat: CodigoEstablecimiento.opcional(datos.codigoEstablecimientoSunat),
    direccion: textoOpcional(datos.direccion, 250, 'La dirección'),
    ubigeo: Ubigeo.opcional(datos.ubigeo),
    telefono: textoOpcional(datos.telefono, 30, 'El teléfono'),
    zonaHoraria: validarZonaHoraria(datos.zonaHoraria),
  };
}

function validarZonaHoraria(zona: string): string {
  try {
    new Intl.DateTimeFormat('es-PE', { timeZone: zona });
  } catch {
    throw new ValidationError(`Zona horaria IANA desconocida: ${zona}`);
  }
  if (zona.length > 40) throw new ValidationError('La zona horaria admite hasta 40 caracteres');
  return zona;
}
