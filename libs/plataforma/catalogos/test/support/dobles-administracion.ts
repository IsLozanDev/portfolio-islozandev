import type { DependenciasListarItemsAdministracion } from '../../src/application/listar-items-administracion.js';
import type {
  FilaAdministracion,
  FiltroItemsAdministracion,
  LecturaItemsAdministracion,
} from '../../src/application/ports/items-administracion.js';
import type { FilaItemLeido } from '../../src/application/ports/repositorios.js';
import type { Escenario } from './dobles.js';

/** Como cat.items_administracion sobre los dobles de cat.items: mismo orden, filtros y total antes de paginar. */
export class LecturaItemsAdministracionEnMemoria implements LecturaItemsAdministracion {
  readonly filtros: FiltroItemsAdministracion[] = [];

  constructor(private readonly escenario: Escenario) {}

  async listar(filtro: FiltroItemsAdministracion) {
    this.filtros.push(filtro);
    const leidos = await this.escenario.lectura.items(filtro.codigo, filtro.tenantId, filtro.fecha);
    const filtradas = leidos.map((leido) => this.filaDe(leido, filtro.tenantId)).filter((fila) => cumple(fila, filtro));
    const pagina = filtradas.slice(filtro.desplazamiento, filtro.desplazamiento + filtro.limite);
    return { filas: pagina, total: pagina.length > 0 ? filtradas.length : 0 };
  }

  private filaDe(leido: FilaItemLeido, tenantId: string): FilaAdministracion {
    const item = this.escenario.items.filas.get(leido.itemId);
    if (!item) throw new Error(`el ítem ${leido.itemId} no está en el doble`);
    const guardado = this.escenario.ajustes.de(item.id, tenantId);
    return {
      itemId: item.id,
      codigo: item.codigo,
      codigoExterno: item.codigoExterno,
      nombre: item.nombre,
      abreviatura: item.abreviatura,
      orden: item.orden,
      atributos: item.atributos,
      vigenteDesde: item.vigencia.desde,
      vigenteHasta: item.vigencia.hasta,
      activo: item.activo,
      propio: leido.propio,
      estado: leido.estado,
      ajuste: guardado && { visible: guardado.ajuste.visible, orden: guardado.ajuste.orden, alias: guardado.ajuste.alias, version: guardado.version },
      version: item.version,
    };
  }
}

/** El texto busca en el nombre del ítem, no en el alias del tenant. */
function cumple(fila: FilaAdministracion, filtro: FiltroItemsAdministracion): boolean {
  if (filtro.estado !== null && fila.estado !== filtro.estado) return false;
  if (filtro.origen !== null && fila.propio !== (filtro.origen === 'PROPIO')) return false;
  if (filtro.texto === null) return true;
  const texto = filtro.texto.toLowerCase();
  return fila.codigo.toLowerCase().includes(texto) || fila.nombre.toLowerCase().includes(texto);
}

export function dependenciasAdministracion(escenario: Escenario, lectura: LecturaItemsAdministracion): DependenciasListarItemsAdministracion {
  const { unidadDeTrabajo, contexto, reloj, catalogos } = escenario.dependencias;
  return { unidadDeTrabajo, contexto, reloj, catalogos, lectura };
}
