import { AggregateRoot } from '@vitrina/plataforma/kernel';
import { textoOpcional, textoRequerido } from './texto.js';
import { Ruc, Ubigeo } from './valores.js';

export interface DatosEmpresa {
  razonSocial: string;
  nombreComercial: string | null;
  direccionFiscal: string | null;
  ubigeo: string | null;
}

export interface EmpresaProps extends DatosEmpresa {
  tenantId: string;
  ruc: string;
  activo: boolean;
}

export class Empresa extends AggregateRoot {
  private constructor(
    id: string,
    version: number,
    private props: EmpresaProps,
  ) {
    super(id, version);
  }

  static crear(id: string, tenantId: string, ruc: string, datos: DatosEmpresa): Empresa {
    const empresa = new Empresa(id, 0, { tenantId, ruc: Ruc.de(ruc).valor, activo: true, ...validarDatos(datos) });
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

  get datos(): DatosEmpresa {
    const { razonSocial, nombreComercial, direccionFiscal, ubigeo } = this.props;
    return { razonSocial, nombreComercial, direccionFiscal, ubigeo };
  }

  /** El RUC no se edita: identifica a la empresa ante SUNAT. */
  editar(datos: DatosEmpresa): void {
    this.props = { ...this.props, ...validarDatos(datos) };
    this.publicar('empresa.actualizada');
  }

  private publicar(eventType: string): void {
    this.raise({
      eventType,
      aggregateType: 'empresa',
      schemaVersion: 1,
      payload: { ruc: this.props.ruc, razon_social: this.props.razonSocial, nombre_comercial: this.props.nombreComercial },
    });
  }
}

function validarDatos(datos: DatosEmpresa): DatosEmpresa {
  return {
    razonSocial: textoRequerido(datos.razonSocial, 1, 200, 'La razón social'),
    nombreComercial: textoOpcional(datos.nombreComercial, 150, 'El nombre comercial'),
    direccionFiscal: textoOpcional(datos.direccionFiscal, 250, 'La dirección fiscal'),
    ubigeo: Ubigeo.opcional(datos.ubigeo),
  };
}
