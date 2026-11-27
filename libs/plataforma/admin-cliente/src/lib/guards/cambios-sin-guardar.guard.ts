import { inject } from '@angular/core';
import type { CanDeactivateFn } from '@angular/router';
import { AvisosService } from '@vitrina/shared/ui';
import type { ConCambiosSinGuardar } from '../models/con-cambios-sin-guardar';
import { MENSAJES_CAMBIOS_SIN_GUARDAR } from '../models/mensajes-admin';

/** Sin cambios sale directo; con cambios pide confirmación y, si se confirma, los descarta al salir. */
export const cambiosSinGuardarGuard: CanDeactivateFn<ConCambiosSinGuardar> = (pagina) => {
  if (!pagina.tieneCambiosSinGuardar()) return true;
  return inject(AvisosService).confirmar({
    titulo: MENSAJES_CAMBIOS_SIN_GUARDAR.titulo,
    texto: MENSAJES_CAMBIOS_SIN_GUARDAR.texto,
    textoConfirmar: MENSAJES_CAMBIOS_SIN_GUARDAR.salir,
    textoCancelar: MENSAJES_CAMBIOS_SIN_GUARDAR.seguir,
  });
};
