import type { TipoContacto } from './persona';

/** Ayuda y error de formato por tipo de contacto: los mismos textos de la API (spec 32). */
export const MENSAJES_CONTACTO: Record<TipoContacto, { ayuda: string; invalido: string; teclado: 'numeric' | 'email' | 'tel' }> = {
  CELULAR: { ayuda: '9 dígitos, empieza con 9', invalido: 'El celular debe tener 9 dígitos e iniciar con 9', teclado: 'numeric' },
  FIJO: { ayuda: 'De 6 a 9 dígitos, sin guiones', invalido: 'El teléfono fijo debe tener de 6 a 9 dígitos', teclado: 'numeric' },
  CORREO: { ayuda: 'nombre@dominio.pe', invalido: 'El correo no tiene un formato válido', teclado: 'email' },
  WHATSAPP: { ayuda: 'Formato internacional: +51987654321', invalido: 'El WhatsApp debe ir en formato internacional: + y de 8 a 15 dígitos', teclado: 'tel' },
};
