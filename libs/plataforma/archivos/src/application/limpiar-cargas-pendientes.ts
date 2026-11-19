import type { Clock, TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import type { AlmacenArchivos } from './ports/almacen-archivos.js';
import type { CargaPendiente, CargasPendientes, VersionPendiente } from './ports/cargas-pendientes.js';
import type { RepositorioArchivos } from './ports/repositorio-archivos.js';

export interface DependenciasLimpieza {
  unidadDeTrabajo: UnitOfWork;
  contexto: TenantContext;
  reloj: Clock;
  archivos: RepositorioArchivos;
  almacen: AlmacenArchivos;
  cargasPendientes: CargasPendientes;
}

export interface ResultadoLimpieza {
  /** Archivos pendientes borrados con su versión 1. */
  borradas: number;
  /** Versiones nuevas pendientes borradas; su archivo sigue. */
  versionesBorradas: number;
  /** Cargas o versiones que no se pudieron borrar: quedan para la siguiente corrida. */
  fallidas: number;
}

interface ResultadoRecorrido {
  borradas: number;
  fallidas: number;
}

/** Una URL de carga vale 2 horas: a las 24 nadie va a confirmar ya esa carga. */
const HORAS_HASTA_VENCER = 24;
const MILISEGUNDOS_POR_HORA = 60 * 60 * 1000;
const TAMANO_LOTE = 200;

/**
 * Tarea diaria del worker: borra las cargas que llevan más de 24 horas en `PENDIENTE_CARGA` (el cliente
 * nunca subió o nunca confirmó) y, después, las versiones nuevas en la misma situación. Primero el objeto y
 * después la fila, con el contexto del tenant de cada una. No toca nada en otro estado: de una versión
 * pendiente, el archivo, su vigente y sus otras versiones siguen igual.
 */
export class LimpiarCargasPendientes {
  constructor(private readonly dependencias: DependenciasLimpieza) {}

  async ejecutar(): Promise<ResultadoLimpieza> {
    const { reloj, cargasPendientes } = this.dependencias;
    const antes = new Date(reloj.now().getTime() - HORAS_HASTA_VENCER * MILISEGUNDOS_POR_HORA);
    const cargas = await recorrerEnLotes(
      () => cargasPendientes.listarVencidas(antes, TAMANO_LOTE),
      (carga) => this.borrarCarga(carga),
    );
    const versiones = await recorrerEnLotes(
      () => cargasPendientes.listarVersionesVencidas(antes, TAMANO_LOTE),
      (version) => this.borrarVersion(version),
    );
    return { borradas: cargas.borradas, versionesBorradas: versiones.borradas, fallidas: cargas.fallidas + versiones.fallidas };
  }

  /** `false` si la carga dejó de estar pendiente entre la lista y el borrado: el cliente confirmó a tiempo. */
  private borrarCarga(carga: CargaPendiente): Promise<boolean> {
    const { unidadDeTrabajo, contexto, archivos, almacen } = this.dependencias;
    return contexto.run({ tenantId: carga.tenantId }, () =>
      unidadDeTrabajo.run(async () => {
        const archivo = await archivos.obtener(carga.archivoId);
        if (!archivo || archivo.estado !== 'PENDIENTE_CARGA') return false;
        await almacen.borrar(archivo.primeraVersion.rutaStorage);
        await archivos.eliminar(archivo.id);
        return true;
      }),
    );
  }

  /** `false` si la versión ya no está pendiente: el cliente la confirmó a tiempo o ya se borró. */
  private borrarVersion(pendiente: VersionPendiente): Promise<boolean> {
    const { unidadDeTrabajo, contexto, archivos, almacen } = this.dependencias;
    return contexto.run({ tenantId: pendiente.tenantId }, () =>
      unidadDeTrabajo.run(async () => {
        const archivo = await archivos.obtener(pendiente.archivoId);
        const ruta = archivo?.versionNumero(pendiente.numero)?.rutaStorage;
        if (!archivo || ruta === undefined || !archivo.descartarVersionPendiente(pendiente.numero)) return false;
        await almacen.borrar(ruta);
        await archivos.guardar(archivo);
        return true;
      }),
    );
  }
}

/** Lote a lote hasta vaciar la lista. Un lote sin ningún borrado volvería a salir igual: se corta para no girar sobre los que fallan. */
async function recorrerEnLotes<Pendiente>(
  listar: () => Promise<Pendiente[]>,
  borrar: (pendiente: Pendiente) => Promise<boolean>,
): Promise<ResultadoRecorrido> {
  const resultado: ResultadoRecorrido = { borradas: 0, fallidas: 0 };
  for (;;) {
    const lote = await listar();
    const borradasAntes = resultado.borradas;
    for (const pendiente of lote) {
      try {
        if (await borrar(pendiente)) resultado.borradas += 1;
      } catch {
        resultado.fallidas += 1;
      }
    }
    if (lote.length < TAMANO_LOTE || resultado.borradas === borradasAntes) return resultado;
  }
}
