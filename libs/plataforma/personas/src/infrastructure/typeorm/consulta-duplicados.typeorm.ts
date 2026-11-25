import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { EntityManager } from 'typeorm';
import type {
  ConsultaDuplicados,
  CriteriosDuplicados,
  EvaluacionPar,
  PaginaDuplicados,
  ParCandidato,
} from '../../application/ports/consulta-duplicados.js';
import { PUNTAJES_DUPLICADO, SIMILITUD_NOMBRE_MINIMA, type MotivoDuplicado, type ParPersonas } from '../../domain/duplicados.js';
import { leerPersonasDeLista } from './listado-personas.js';

interface FilaPar {
  persona_a_id: string;
  persona_b_id: string;
  mismo_numero: boolean;
  celular_y_nombre_igual: boolean;
  celular_y_nombre_parecido: boolean;
  puntaje: number;
  total: string;
}

// SQL crudo (regla 11): autounión de per.persona con per.contacto, extensions.similarity y comparación de
// conjuntos de palabras, que el QueryBuilder no expresa bien. Valores siempre como parámetros:
// $1 tenant, $2 similitud mínima, $3-$5 puntajes de cada motivo. La lista suma $6 puntaje mínimo, $7-$8 página
// y $9 persona (nula para todas), que filtra desde los pares para no evaluar los ajenos.
const PERSONAS_ACTIVAS = `SELECT * FROM per.persona
  WHERE tenant_id = $1 AND activo AND fusionada_en_id IS NULL`;
const PERSONAS_DEL_TENANT = `SELECT * FROM per.persona WHERE tenant_id = $1`;

const DE_LA_PERSONA = (menor: string, mayor: string) => `($9::uuid IS NULL OR ${menor} = $9 OR ${mayor} = $9)`;

/** Solo comparten candidatos quienes comparten número de documento o un celular: la similitud va después. */
const PARES_POR_DOCUMENTO_O_CELULAR = `
  SELECT una.id AS menor, otra.id AS mayor
    FROM personas una JOIN personas otra ON una.id < otra.id AND una.numero_documento = otra.numero_documento
   WHERE ${DE_LA_PERSONA('una.id', 'otra.id')}
  UNION
  SELECT una.persona_id, otra.persona_id
    FROM celulares una JOIN celulares otra ON una.valor = otra.valor AND una.persona_id < otra.persona_id
   WHERE ${DE_LA_PERSONA('una.persona_id', 'otra.persona_id')}`;

const UN_PAR = `SELECT $6::uuid AS menor, $7::uuid AS mayor`;

function palabras(columna: string): string {
  return `string_to_array(${columna}, ' ')`;
}

/** Motivos y puntaje de cada par; `pares` aporta (menor, mayor). */
function evaluacion(personas: string, pares: string): string {
  return `
  WITH personas AS (${personas}),
  celulares AS (
    SELECT DISTINCT contacto.persona_id, contacto.valor FROM per.contacto contacto
      JOIN personas ON personas.id = contacto.persona_id
     WHERE contacto.tenant_id = $1 AND contacto.tipo_contacto = 'CELULAR'),
  pares AS (${pares}),
  evaluados AS (
    SELECT una.id AS persona_a_id, otra.id AS persona_b_id,
           una.tipo_persona = otra.tipo_persona AS mismo_tipo_persona,
           una.tipo_documento = otra.tipo_documento AND una.numero_documento <> otra.numero_documento AS bloqueado,
           greatest(una.creado_en, otra.creado_en) AS mas_reciente,
           una.numero_documento = otra.numero_documento AND una.tipo_documento <> otra.tipo_documento AS mismo_numero,
           EXISTS (SELECT 1 FROM celulares celular_una JOIN celulares celular_otra ON celular_una.valor = celular_otra.valor
                    WHERE celular_una.persona_id = una.id AND celular_otra.persona_id = otra.id) AS mismo_celular,
           una.busqueda_texto <> '' AND una.busqueda_texto = otra.busqueda_texto AS nombre_igual,
           una.busqueda_texto <> '' AND otra.busqueda_texto <> '' AND (
             extensions.similarity(una.busqueda_texto, otra.busqueda_texto) >= $2
             OR una.busqueda_fonetica = otra.busqueda_fonetica
             OR ${palabras('una.busqueda_texto')} <@ ${palabras('otra.busqueda_texto')}
             OR ${palabras('otra.busqueda_texto')} <@ ${palabras('una.busqueda_texto')}) AS nombre_parecido
      FROM pares
      JOIN personas una ON una.id = pares.menor
      JOIN personas otra ON otra.id = pares.mayor),
  con_motivos AS (
    SELECT evaluados.*,
           mismo_celular AND nombre_igual AS celular_y_nombre_igual,
           mismo_celular AND nombre_parecido AS celular_y_nombre_parecido
      FROM evaluados),
  puntuados AS (
    SELECT con_motivos.*,
           greatest(CASE WHEN mismo_numero THEN $3 ELSE 0 END,
                    CASE WHEN celular_y_nombre_igual THEN $4 ELSE 0 END,
                    CASE WHEN celular_y_nombre_parecido THEN $5 ELSE 0 END) AS puntaje
      FROM con_motivos)`;
}

const LISTA = `${evaluacion(PERSONAS_ACTIVAS, PARES_POR_DOCUMENTO_O_CELULAR)}
  SELECT persona_a_id, persona_b_id, mismo_numero, celular_y_nombre_igual, celular_y_nombre_parecido, puntaje,
         count(*) OVER () AS total
    FROM puntuados
   WHERE puntaje >= $6 AND mismo_tipo_persona AND NOT bloqueado
     AND NOT EXISTS (SELECT 1 FROM per.par_descartado descartado
                      WHERE descartado.tenant_id = $1
                        AND descartado.persona_menor_id = persona_a_id AND descartado.persona_mayor_id = persona_b_id)
   ORDER BY puntaje DESC, mas_reciente DESC, persona_a_id, persona_b_id
   LIMIT $7 OFFSET $8`;

const PAR = `${evaluacion(PERSONAS_DEL_TENANT, UN_PAR)}
  SELECT persona_a_id, persona_b_id, mismo_numero, celular_y_nombre_igual, celular_y_nombre_parecido, puntaje, 1 AS total
    FROM puntuados`;

const PUNTAJES = [
  PUNTAJES_DUPLICADO.MISMO_NUMERO_OTRO_TIPO,
  PUNTAJES_DUPLICADO.CELULAR_Y_NOMBRE_IGUAL,
  PUNTAJES_DUPLICADO.CELULAR_Y_NOMBRE_PARECIDO,
];

/** Candidatos de per.persona del tenant del contexto, además de la RLS (regla 3), en la transacción activa. */
export class ConsultaDuplicadosTypeOrm implements ConsultaDuplicados {
  constructor(
    private readonly unidadDeTrabajo: TypeOrmUnitOfWork,
    private readonly contexto: TenantContext,
  ) {}

  async buscar(criterios: CriteriosDuplicados): Promise<PaginaDuplicados> {
    const { pagina, tamano } = criterios;
    const filas = await this.pagina(criterios, tamano, (pagina - 1) * tamano);
    if (filas.length === 0) return { items: [], total: await this.contar(criterios) };

    const ids = filas.flatMap((fila) => [fila.persona_a_id, fila.persona_b_id]);
    const personas = await leerPersonasDeLista(this.manager, this.tenantId, [...new Set(ids)]);
    const items = filas.map((fila): ParCandidato => {
      const personaA = personas.get(fila.persona_a_id);
      const personaB = personas.get(fila.persona_b_id);
      if (!personaA || !personaB) throw new Error('Par candidato sin sus personas en la misma transacción');
      return { personaA, personaB, ...evaluacionDe(fila) };
    });
    return { items, total: Number(filas[0]?.total ?? 0) };
  }

  async evaluar(par: ParPersonas): Promise<EvaluacionPar | null> {
    const [fila]: FilaPar[] = await this.manager.query(PAR, [...this.parametrosBase(), par.menor, par.mayor]);
    if (!fila) return null;
    const evaluacionDelPar = evaluacionDe(fila);
    return evaluacionDelPar.motivos.length === 0 ? null : evaluacionDelPar;
  }

  private pagina({ puntajeMinimo, personaId }: CriteriosDuplicados, tamano: number, desplazamiento: number): Promise<FilaPar[]> {
    return this.manager.query(LISTA, [...this.parametrosBase(), puntajeMinimo, tamano, desplazamiento, personaId]);
  }

  /** Una página vacía más allá de la última no trae el total de la ventana: se cuenta desde la primera. */
  private async contar(criterios: CriteriosDuplicados): Promise<number> {
    if (criterios.pagina === 1) return 0;
    const [primera] = await this.pagina(criterios, 1, 0);
    return Number(primera?.total ?? 0);
  }

  private parametrosBase(): unknown[] {
    return [this.tenantId, SIMILITUD_NOMBRE_MINIMA, ...PUNTAJES];
  }

  private get manager(): EntityManager {
    return this.unidadDeTrabajo.manager;
  }

  private get tenantId(): string {
    return this.contexto.current().tenantId;
  }
}

function evaluacionDe(fila: FilaPar): EvaluacionPar {
  const motivos: MotivoDuplicado[] = [];
  if (fila.mismo_numero) motivos.push('MISMO_NUMERO_OTRO_TIPO');
  if (fila.celular_y_nombre_igual) motivos.push('CELULAR_Y_NOMBRE_IGUAL');
  if (fila.celular_y_nombre_parecido) motivos.push('CELULAR_Y_NOMBRE_PARECIDO');
  return { puntaje: Number(fila.puntaje), motivos };
}
