import { MENSAJES_DUPLICADOS } from '@vitrina/plataforma/personas-ui';
import type { OpcionesConfirmacion } from '@vitrina/shared/ui';
import { MENSAJES_DUPLICADOS_ADMIN } from './mensajes-duplicados-admin';

/** Clave del `history.state` con el par que la comparación acaba de descartar: la lista lo muestra con «Deshacer». */
export const ESTADO_DESCARTE = 'descarteDuplicado';

export interface DescarteHecho {
  idA: string;
  idB: string;
  texto: string;
}

export function esDescarteHecho(valor: unknown): valor is DescarteHecho {
  if (typeof valor !== 'object' || valor === null) return false;
  const { idA, idB, texto } = valor as Record<string, unknown>;
  return typeof idA === 'string' && typeof idB === 'string' && typeof texto === 'string';
}

export function confirmacionDeDescarte(personaA: string, personaB: string): OpcionesConfirmacion {
  return {
    titulo: MENSAJES_DUPLICADOS_ADMIN.confirmarDescarte,
    texto: MENSAJES_DUPLICADOS_ADMIN.textoDescarte(personaA, personaB),
    textoConfirmar: MENSAJES_DUPLICADOS_ADMIN.confirmarDescarteBoton,
  };
}

export function descarteHecho(idA: string, idB: string, personaA: string, personaB: string): DescarteHecho {
  return { idA, idB, texto: MENSAJES_DUPLICADOS.descartado(personaA, personaB) };
}
