import { ContenidoPlantillaInvalidoError, VersionObsoletaPlantillaError } from './errores.js';
import { exigirMarcadoresDeclarados } from './marcadores-plantilla.js';
import type { Plantilla, VariableDeclarada } from './plantilla.js';
import { LARGO_MAXIMO_ASUNTO } from './renderizador-plantilla.js';

/** Largo de `ntf.plantilla.cuerpo`. */
export const LARGO_MAXIMO_CUERPO = 100_000;
const INCREMENTO_DE_VERSION = 1;
const SALTO_DE_LINEA = /[\r\n]/;

/** Asunto y cuerpo que escribe el tenant; el cuerpo llega ya saneado. */
export interface ContenidoPlantilla {
  asunto: string;
  cuerpo: string;
}

export interface ContenidoPersonalizado extends ContenidoPlantilla {
  /** Versión de la personalizada vigente que leyó el cliente; `null` si regía la base. */
  version: number | null;
}

export interface ContextoPersonalizacion {
  id: string;
  tenantId: string;
  creadoPor: string | null;
  ahora: Date;
  /** Mayor versión del tenant para el código, activa o no; 0 si nunca lo personalizó. */
  mayorVersionDelTenant: number;
}

/**
 * TR-RF-074: la versión nueva del tenant. Copia código, canal, idioma y variables de la base (el tenant no
 * declara variables) y numera después de la mayor versión del tenant, aunque se haya restaurado la base.
 */
export function nuevaVersionPersonalizada(
  base: Plantilla,
  vigenteDelTenant: Plantilla | null,
  contenido: ContenidoPersonalizado,
  contexto: ContextoPersonalizacion,
): Plantilla {
  exigirVersionVigente(vigenteDelTenant, contenido.version);
  validarContenido(contenido, base.variables);
  return {
    id: contexto.id,
    tenantId: contexto.tenantId,
    codigo: base.codigo,
    canal: base.canal,
    idioma: base.idioma,
    version: contexto.mayorVersionDelTenant + INCREMENTO_DE_VERSION,
    asunto: contenido.asunto,
    cuerpo: contenido.cuerpo,
    variables: base.variables,
    plantillaBaseId: base.id,
    activa: true,
    creadoPor: contexto.creadoPor,
    creadoEn: contexto.ahora,
  };
}

/** Asunto de 1 a 150 caracteres en una línea, cuerpo de 1 a 100 000 y solo marcadores declarados (TR-CA-185). */
export function validarContenido(contenido: ContenidoPlantilla, declaradas: readonly VariableDeclarada[]): void {
  exigirAsunto(contenido.asunto);
  exigirCuerpo(contenido.cuerpo);
  exigirMarcadoresDeclarados([contenido.asunto, contenido.cuerpo], declaradas);
}

function exigirVersionVigente(vigenteDelTenant: Plantilla | null, versionLeida: number | null): void {
  const versionVigente = vigenteDelTenant?.version ?? null;
  if (versionLeida !== versionVigente) throw new VersionObsoletaPlantillaError();
}

function exigirAsunto(asunto: string): void {
  if (asunto.trim().length === 0) throw new ContenidoPlantillaInvalidoError('El asunto es obligatorio');
  if (asunto.length > LARGO_MAXIMO_ASUNTO) throw new ContenidoPlantillaInvalidoError(`El asunto pasa de ${LARGO_MAXIMO_ASUNTO} caracteres`);
  if (SALTO_DE_LINEA.test(asunto)) throw new ContenidoPlantillaInvalidoError('El asunto debe ir en una sola línea');
}

function exigirCuerpo(cuerpo: string): void {
  if (cuerpo.trim().length === 0) throw new ContenidoPlantillaInvalidoError('El cuerpo es obligatorio');
  if (cuerpo.length > LARGO_MAXIMO_CUERPO) throw new ContenidoPlantillaInvalidoError(`El cuerpo pasa de ${LARGO_MAXIMO_CUERPO} caracteres`);
}
