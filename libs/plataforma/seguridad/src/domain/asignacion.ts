import { AggregateRoot, ValidationError } from '@vitrina/plataforma/kernel';
import { ALCANCES, alcanceAlMenos, type Alcance, type Ambito } from './alcance.js';
import { AlcanceIncoherenteError, AlcanceInsuficienteError, RolOPerfilError, VigenciaInvalidaError } from './errores.js';

/** Fecha calendario `YYYY-MM-DD`, como la columna `date` de la base. */
export type Fecha = string;

export interface DatosAsignacion {
  membresiaId: string;
  rolId: string | null;
  perfilId: string | null;
  alcance: Alcance;
  empresaId: string | null;
  sucursalId: string | null;
  unidadId: string | null;
  /** Por defecto, `hoy`. */
  vigenteDesde?: Fecha | null;
  vigenteHasta: Fecha | null;
}

/** Permiso del rol o de los roles del perfil, con su alcance mínimo del catálogo. */
export interface PermisoConAlcance {
  codigo: string;
  alcanceMinimo: Alcance;
}

export interface ContextoOtorgamiento {
  hoy: Fecha;
  otorgadoPor: string;
  permisos: readonly PermisoConAlcance[];
}

export interface AsignacionProps extends Required<DatosAsignacion> {
  tenantId: string;
  vigenteDesde: Fecha;
  otorgadoPor: string | null;
}

// Qué id lleva cada alcance; los demás van nulos (TR-RN-008, ck_asig_alcance).
const ID_DEL_ALCANCE: Record<Alcance, 'empresaId' | 'sucursalId' | 'unidadId' | null> = {
  TENANT: null,
  EMPRESA: 'empresaId',
  SUCURSAL: 'sucursalId',
  UNIDAD: 'unidadId',
};

export class Asignacion extends AggregateRoot {
  private constructor(
    id: string,
    version: number,
    private readonly props: AsignacionProps,
  ) {
    super(id, version);
  }

  /** TR-RF-013: valida TR-RN-008 y el alcance mínimo de cada permiso. Otorgante y MFA los valida el caso de uso. */
  static otorgar(id: string, tenantId: string, datos: DatosAsignacion, contexto: ContextoOtorgamiento): Asignacion {
    if ((datos.rolId === null) === (datos.perfilId === null)) throw new RolOPerfilError();
    validarAlcance(datos);

    const vigenteDesde = validarFecha(datos.vigenteDesde ?? contexto.hoy, 'vigente desde');
    const vigenteHasta = datos.vigenteHasta === null ? null : validarFecha(datos.vigenteHasta, 'vigente hasta');
    if (vigenteHasta !== null && vigenteHasta < vigenteDesde) throw new VigenciaInvalidaError();

    const insuficientes = contexto.permisos.filter((p) => !alcanceAlMenos(datos.alcance, p.alcanceMinimo)).map((p) => p.codigo);
    if (insuficientes.length > 0) throw new AlcanceInsuficienteError([...new Set(insuficientes)].sort());

    const asignacion = new Asignacion(id, 0, {
      tenantId,
      membresiaId: datos.membresiaId,
      rolId: datos.rolId,
      perfilId: datos.perfilId,
      alcance: datos.alcance,
      empresaId: datos.empresaId,
      sucursalId: datos.sucursalId,
      unidadId: datos.unidadId,
      vigenteDesde,
      vigenteHasta,
      otorgadoPor: contexto.otorgadoPor,
    });
    asignacion.publicarOtorgada();
    return asignacion;
  }

  static reconstituir(id: string, version: number, props: AsignacionProps): Asignacion {
    return new Asignacion(id, version, { ...props });
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get membresiaId(): string {
    return this.props.membresiaId;
  }

  get rolId(): string | null {
    return this.props.rolId;
  }

  get perfilId(): string | null {
    return this.props.perfilId;
  }

  get alcance(): Alcance {
    return this.props.alcance;
  }

  /** Ids tal como se guardan; para comparar contra otro ámbito, el caso de uso los completa con org. */
  get ubicacion(): Ambito {
    const { alcance, empresaId, sucursalId, unidadId } = this.props;
    return { alcance, empresaId, sucursalId, unidadId };
  }

  get vigenteDesde(): Fecha {
    return this.props.vigenteDesde;
  }

  get vigenteHasta(): Fecha | null {
    return this.props.vigenteHasta;
  }

  get otorgadoPor(): string | null {
    return this.props.otorgadoPor;
  }

  /** Vigencia inclusiva en ambos extremos (TR-CA-043). */
  vigenteEn(fecha: Fecha): boolean {
    return this.props.vigenteDesde <= fecha && (this.props.vigenteHasta === null || fecha <= this.props.vigenteHasta);
  }

  private publicarOtorgada(): void {
    const p = this.props;
    this.raise({
      eventType: 'asignacion.otorgada',
      aggregateType: 'asignacion',
      schemaVersion: 1,
      payload: {
        membresia_id: p.membresiaId,
        rol_id: p.rolId,
        perfil_id: p.perfilId,
        alcance: p.alcance,
        empresa_id: p.empresaId,
        sucursal_id: p.sucursalId,
        unidad_id: p.unidadId,
        vigente_desde: p.vigenteDesde,
        vigente_hasta: p.vigenteHasta,
        otorgado_por: p.otorgadoPor,
      },
    });
  }
}

function validarAlcance(datos: DatosAsignacion): void {
  if (!ALCANCES.includes(datos.alcance)) throw new ValidationError(`Alcance desconocido: ${datos.alcance}`);
  const requerido = ID_DEL_ALCANCE[datos.alcance];
  const coherente = (['empresaId', 'sucursalId', 'unidadId'] as const).every((campo) =>
    campo === requerido ? datos[campo] !== null : datos[campo] === null,
  );
  if (!coherente) throw new AlcanceIncoherenteError(datos.alcance);
}

function validarFecha(valor: Fecha, campo: string): Fecha {
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(valor) ? new Date(`${valor}T00:00:00Z`) : null;
  if (fecha === null || Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== valor) {
    throw new ValidationError(`La fecha ${campo} no es válida: ${valor}`);
  }
  return valor;
}
