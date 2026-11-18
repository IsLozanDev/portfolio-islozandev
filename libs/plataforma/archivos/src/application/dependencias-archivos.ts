import type { EventPublisher, IdGenerator, TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import type { Archivo } from '../domain/archivo.js';
import { AccesoEntidadDenegadoError } from '../domain/errores.js';
import type { AlmacenArchivos } from './ports/almacen-archivos.js';
import type { AnalizadorAntivirus } from './ports/analizador-antivirus.js';
import type { AutorizadorEntidad } from './ports/autorizador-entidad.js';
import type { ColaAnalisis } from './ports/cola-analisis.js';
import type { DetectorTipo } from './ports/detector-tipo.js';
import type { RepositorioArchivos } from './ports/repositorio-archivos.js';

/** Lo que usan los casos de uso que corren en la API. */
export interface DependenciasArchivos {
  unidadDeTrabajo: UnitOfWork;
  contexto: TenantContext;
  ids: IdGenerator;
  archivos: RepositorioArchivos;
  almacen: AlmacenArchivos;
  cola: ColaAnalisis;
  autorizadores: readonly AutorizadorEntidad[];
}

/** Lo que usa el análisis, que corre en el worker. */
export interface DependenciasAnalisis {
  unidadDeTrabajo: UnitOfWork;
  contexto: TenantContext;
  publicador: EventPublisher;
  archivos: RepositorioArchivos;
  almacen: AlmacenArchivos;
  detector: DetectorTipo;
  antivirus: AnalizadorAntivirus;
}

/** Los eventos van al outbox en la misma transacción que guardó el archivo (regla 4). */
export async function publicarEventosDe(publicador: EventPublisher, archivo: Archivo): Promise<void> {
  for (const evento of archivo.pullEvents()) await publicador.publish(evento);
}

type AccesoEntidad = 'puedeLeer' | 'puedeEditar';

/** Sin autorizador registrado para el tipo de entidad, pasa: bastan el permiso y el tenant. */
export async function exigirAccesoEntidad(
  autorizadores: readonly AutorizadorEntidad[],
  entidad: { entidadTipo: string; entidadId: string },
  acceso: AccesoEntidad,
): Promise<void> {
  const autorizador = autorizadores.find((candidato) => candidato.entidadTipo === entidad.entidadTipo);
  if (!autorizador) return;
  if (!(await autorizador[acceso](entidad.entidadId))) throw new AccesoEntidadDenegadoError();
}
