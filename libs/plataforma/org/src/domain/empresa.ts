import { AggregateRoot } from '@vitrina/plataforma/kernel';
import { textoOpcional, textoRequerido } from './texto.js';
import { LogoValidado } from './logo.js';
import { CorreoEmpresa, Ruc, SitioWeb, Telefono, Ubigeo } from './valores.js';

export interface DatosEmpresa {
  razonSocial: string;
  nombreComercial: string | null;
  direccionFiscal: string | null;
  ubigeo: string | null;
  telefono: string | null;
  correo: string | null;
  sitioWeb: string | null;
}

export interface EmpresaProps extends DatosEmpresa {
  tenantId: string;
  ruc: string;
  activo: boolean;
  logoArchivoId: string | null;
}

/** Al editar: un logo nuevo validado, el id que ya tenía (sin cambio) o null para quitarlo. */
export type LogoEdicion = LogoValidado | string | null;

export class Empresa extends AggregateRoot {
  private constructor(
    id: string,
    version: number,
    private props: EmpresaProps,
  ) {
    super(id, version);
  }

  static crear(id: string, tenantId: string, ruc: string, datos: DatosEmpresa): Empresa {
    const empresa = new Empresa(id, 0, {
      tenantId,
      ruc: Ruc.de(ruc).valor,
      activo: true,
      logoArchivoId: null,
      ...validarDatos(datos),
    });
    empresa.publicar('empresa.creada');
    return empresa;
  }

  static reconstituir(id: string, version: number, props: EmpresaProps): Empresa {
    return new Empresa(id, version, { ...props });
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get ruc(): string {
    return this.props.ruc;
  }

  get activo(): boolean {
    return this.props.activo;
  }

  get logoArchivoId(): string | null {
    return this.props.logoArchivoId;
  }

  get datos(): DatosEmpresa {
    const { razonSocial, nombreComercial, direccionFiscal, ubigeo, telefono, correo, sitioWeb } = this.props;
    return { razonSocial, nombreComercial, direccionFiscal, ubigeo, telefono, correo, sitioWeb };
  }

  /** El RUC no se edita: identifica a la empresa ante SUNAT. */
  editar(datos: DatosEmpresa, logo: LogoEdicion): void {
    this.props = { ...this.props, ...validarDatos(datos), logoArchivoId: this.logoTrasEditar(logo) };
    this.publicar('empresa.actualizada');
  }

  private logoTrasEditar(logo: LogoEdicion): string | null {
    if (logo instanceof LogoValidado) return logo.archivoId;
    if (logo === null || logo === this.props.logoArchivoId) return logo;
    throw new Error('Un logo nuevo debe llegar validado por la aplicación');
  }

  private publicar(eventType: string): void {
    this.raise({
      eventType,
      aggregateType: 'empresa',
      schemaVersion: 1,
      payload: {
        ruc: this.props.ruc,
        razon_social: this.props.razonSocial,
        nombre_comercial: this.props.nombreComercial,
        logo_archivo_id: this.props.logoArchivoId,
      },
    });
  }
}

function validarDatos(datos: DatosEmpresa): DatosEmpresa {
  return {
    razonSocial: textoRequerido(datos.razonSocial, 1, 200, 'La razón social'),
    nombreComercial: textoOpcional(datos.nombreComercial, 150, 'El nombre comercial'),
    direccionFiscal: textoOpcional(datos.direccionFiscal, 250, 'La dirección fiscal'),
    ubigeo: Ubigeo.opcional(datos.ubigeo),
    telefono: Telefono.opcional(datos.telefono),
    correo: CorreoEmpresa.opcional(datos.correo),
    sitioWeb: SitioWeb.opcional(datos.sitioWeb),
  };
}
