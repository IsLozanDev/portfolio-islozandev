import type { Canal, EstadoConsentimiento, Finalidad } from './consentimiento';
import type { RolPersona, TipoContacto, TipoDocumento, TipoPersona } from './persona';

export const ETIQUETAS_TIPO_PERSONA: Record<TipoPersona, string> = { NATURAL: 'Persona natural', JURIDICA: 'Persona jurídica' };

export const ETIQUETAS_TIPO_DOCUMENTO: Record<TipoDocumento, string> = { DNI: 'DNI', CE: 'CE', RUC: 'RUC', PASAPORTE: 'Pasaporte' };

export const ETIQUETAS_ROL: Record<RolPersona, string> = {
  CLIENTE: 'Cliente',
  PACIENTE: 'Paciente',
  SOCIO: 'Socio',
  ADMINISTRADO: 'Administrado',
  CONTRAPARTE: 'Contraparte',
  PROVEEDOR: 'Proveedor',
};

export const ETIQUETAS_TIPO_CONTACTO: Record<TipoContacto, string> = {
  CELULAR: 'Celular',
  FIJO: 'Teléfono fijo',
  CORREO: 'Correo',
  WHATSAPP: 'WhatsApp',
};

export const ETIQUETAS_FINALIDAD: Record<Finalidad, string> = {
  PRESTACION: 'Prestación del servicio',
  PROMOCIONES: 'Promociones',
  COMPARTIR_PRODUCTOS: 'Compartir entre productos',
  DATOS_SALUD: 'Datos de salud',
  IDENTIDAD_PORTABLE: 'Identidad portable',
};

export const ETIQUETAS_CANAL: Record<Canal, string> = { PRESENCIAL: 'Presencial', WEB: 'Web', WHATSAPP: 'WhatsApp', KIOSCO: 'Kiosco' };

export const ETIQUETAS_ESTADO_CONSENTIMIENTO: Record<EstadoConsentimiento, string> = {
  ACEPTA: 'Acepta',
  RECHAZA: 'Rechaza',
  REVOCADO: 'Revocado',
};
