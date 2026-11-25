import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { ProductoCodigo } from '@vitrina/plataforma/org';
import { Brackets, type EntityManager, type SelectQueryBuilder } from 'typeorm';
import type {
  Coincidencia,
  ConsultaPersonas,
  CriteriosConsultaPersonas,
  PaginaPersonas,
} from '../../application/ports/consulta-personas.js';
import type { ConsultaClasificada } from '../../domain/consulta-personas.js';
import type { RolPersona } from '../../domain/rol-persona.js';
import { PersonaEntidad, type FilaPersona } from './entidades.js';
import { leerDetallesDeLista, personaDeLista } from './listado-personas.js';

/** Umbral de `word_similarity` para el operador `<%`: se ajusta con la medición de 50 000 personas. */
export const UMBRAL_SIMILITUD = 0.35;

const PUNTAJE_DOCUMENTO_EXACTO = 3;
const PUNTAJE_DOCUMENTO_PREFIJO = 2;
const PUNTAJE_CONTACTO = 1;
const PUNTAJE_FONETICO = 0.9;
const TIPOS_TELEFONO = ['CELULAR', 'FIJO', 'WHATSAPP'];

interface FilaPuntaje {
  persona_id: string;
  puntaje: string;
}

/** Ordena primero por relevancia y, a igual relevancia, por apellidos o razón social. */
const ORDEN_DENOMINACION = ['coalesce(persona.apellido_paterno, persona.razon_social)', 'persona.apellido_materno', 'persona.nombres', 'persona.id'];

// SQL crudo (regla 11): fragmentos de QueryBuilder con funciones de base de datos (pg_trgm, per.*) y
// subconsultas EXISTS sobre contactos y roles. El texto buscado va siempre como parámetro.
const CONTACTO_DE_LA_PERSONA = `SELECT 1 FROM per.contacto contacto
  WHERE contacto.persona_id = persona.id AND contacto.tenant_id = persona.tenant_id`;
const TELEFONO_CON_PREFIJO = `EXISTS (${CONTACTO_DE_LA_PERSONA}
  AND contacto.tipo_contacto IN (:...tiposTelefono)
  AND (lower(contacto.valor) LIKE :prefijo OR lower(contacto.valor) LIKE :prefijoInternacional))`;
const CORREO_CON_PREFIJO = `EXISTS (${CONTACTO_DE_LA_PERSONA}
  AND contacto.tipo_contacto = 'CORREO' AND lower(contacto.valor) LIKE :prefijo ESCAPE '\\')`;
const ROL_VIGENTE = `EXISTS (SELECT 1 FROM per.persona_rol rol
  WHERE rol.persona_id = persona.id AND rol.tenant_id = persona.tenant_id AND rol.hasta IS NULL`;

function escaparComodines(texto: string): string {
  return texto.replace(/[\\%_]/g, (comodin) => `\\${comodin}`);
}

function contienePalabra(indice: number): string {
  return `persona.busqueda_texto LIKE :contiene${indice}`;
}

function suenaParecido(indice: number): string {
  return `persona.busqueda_fonetica LIKE '%' || per.clave_fonetica(:palabra${indice}) || '%'`;
}

function seParece(indice: number): string {
  return `:palabra${indice} OPERATOR(extensions.<%) persona.busqueda_texto`;
}

function puntajeDePalabra(indice: number): string {
  return `GREATEST(
    CASE WHEN ${contienePalabra(indice)} THEN 1 ELSE 0 END,
    CASE WHEN ${suenaParecido(indice)} THEN ${PUNTAJE_FONETICO} ELSE 0 END,
    extensions.word_similarity(:palabra${indice}, persona.busqueda_texto))`;
}

const PUNTAJE_NUMERO = `CASE WHEN persona.numero_documento = :numero THEN ${PUNTAJE_DOCUMENTO_EXACTO}
  WHEN persona.numero_documento LIKE :prefijo THEN ${PUNTAJE_DOCUMENTO_PREFIJO} ELSE ${PUNTAJE_CONTACTO} END`;

/**
 * Listado de per.persona del tenant del contexto, además de la RLS (regla 3), sobre el EntityManager de
 * la transacción activa. Una página en dos lecturas: las personas y, por sus ids, contactos principales
 * y roles vigentes (sin N+1).
 */
export class ConsultaPersonasTypeOrm implements ConsultaPersonas {
  constructor(
    private readonly unidadDeTrabajo: TypeOrmUnitOfWork,
    private readonly contexto: TenantContext,
  ) {}

  async buscar(criterios: CriteriosConsultaPersonas): Promise<PaginaPersonas> {
    if (criterios.consulta?.clase === 'TEXTO') await this.fijarUmbralDeSimilitud();
    const consulta = this.filtrar(criterios);
    const total = await consulta.clone().getCount();
    if (total === 0) return { items: [], total };

    consulta.addSelect(this.puntaje(criterios.consulta), 'puntaje').orderBy('puntaje', 'DESC');
    for (const columna of ORDEN_DENOMINACION) consulta.addOrderBy(columna, 'ASC');
    const { entities: filas, raw } = await consulta
      .offset((criterios.pagina - 1) * criterios.tamano)
      .limit(criterios.tamano)
      .getRawAndEntities();

    const puntajes = new Map<string, number>(raw.map((fila: FilaPuntaje) => [fila.persona_id, Number(fila.puntaje)]));
    const detalles = await leerDetallesDeLista(this.manager, this.tenantId, filas.map((fila) => fila.id));
    const items = filas.map((fila) => ({
      ...personaDeLista(fila, detalles),
      coincidencia: coincidenciaDe(criterios.consulta, puntajes.get(fila.id) ?? 0),
    }));
    return { items, total };
  }

  private filtrar(criterios: CriteriosConsultaPersonas): SelectQueryBuilder<FilaPersona> {
    const consulta = this.manager
      .getRepository(PersonaEntidad)
      .createQueryBuilder('persona')
      .where('persona.tenant_id = :tenantId', { tenantId: this.tenantId })
      // Una absorbida (spec 39) no se lista: sus lecturas resuelven a la conservada.
      .andWhere('persona.fusionada_en_id IS NULL');
    if (criterios.tipoPersona) consulta.andWhere('persona.tipo_persona = :tipoPersona', { tipoPersona: criterios.tipoPersona });
    if (criterios.producto || criterios.rol) this.filtrarPorRol(consulta, criterios.producto, criterios.rol);
    if (criterios.consulta) this.filtrarPorTexto(consulta, criterios.consulta);
    return consulta;
  }

  private filtrarPorRol(consulta: SelectQueryBuilder<FilaPersona>, producto?: ProductoCodigo, rol?: RolPersona): void {
    const condiciones = [ROL_VIGENTE];
    if (producto) condiciones.push('AND rol.producto_codigo = :producto');
    if (rol) condiciones.push('AND rol.rol = :rol');
    consulta.andWhere(`${condiciones.join(' ')})`, { producto, rol });
  }

  private filtrarPorTexto(consulta: SelectQueryBuilder<FilaPersona>, clasificada: ConsultaClasificada): void {
    if (clasificada.clase === 'NUMERO') {
      consulta.andWhere(
        new Brackets((alternativas) =>
          alternativas.where('persona.numero_documento LIKE :prefijo').orWhere(TELEFONO_CON_PREFIJO),
        ),
        {
          numero: clasificada.valor,
          prefijo: `${clasificada.valor}%`,
          prefijoInternacional: `+${clasificada.valor}%`,
          tiposTelefono: TIPOS_TELEFONO,
        },
      );
      return;
    }
    if (clasificada.clase === 'CORREO') {
      consulta.andWhere(CORREO_CON_PREFIJO, { prefijo: `${escaparComodines(clasificada.valor)}%` });
      return;
    }
    clasificada.palabras.forEach((palabra, indice) => {
      consulta.andWhere(`(${contienePalabra(indice)} OR ${seParece(indice)} OR ${suenaParecido(indice)})`, {
        [`palabra${indice}`]: palabra,
        [`contiene${indice}`]: `%${escaparComodines(palabra)}%`,
      });
    });
  }

  private puntaje(clasificada: ConsultaClasificada | null): string {
    if (clasificada === null) return '0';
    if (clasificada.clase === 'NUMERO') return PUNTAJE_NUMERO;
    if (clasificada.clase === 'CORREO') return String(PUNTAJE_CONTACTO);
    return clasificada.palabras.map((_, indice) => puntajeDePalabra(indice)).join(' + ');
  }

  /** `<%` filtra con el umbral de la sesión: SET LOCAL lo deja solo para esta transacción. */
  private async fijarUmbralDeSimilitud(): Promise<void> {
    await this.manager.query(`SELECT set_config('pg_trgm.word_similarity_threshold', $1, true)`, [String(UMBRAL_SIMILITUD)]);
  }

  private get manager(): EntityManager {
    return this.unidadDeTrabajo.manager;
  }

  private get tenantId(): string {
    return this.contexto.current().tenantId;
  }
}

function coincidenciaDe(clasificada: ConsultaClasificada | null, puntaje: number): Coincidencia | null {
  if (clasificada === null) return null;
  if (clasificada.clase === 'TEXTO') return 'NOMBRE';
  if (clasificada.clase === 'NUMERO' && puntaje >= PUNTAJE_DOCUMENTO_PREFIJO) return 'DOCUMENTO';
  return 'CONTACTO';
}
