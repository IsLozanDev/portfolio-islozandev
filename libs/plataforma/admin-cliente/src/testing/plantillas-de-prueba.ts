import type { DetallePlantillaRespuesta, ResumenPlantillaRespuesta } from '../lib/models/plantilla';
import { API_URL } from './http-de-prueba';

export const URL_PLANTILLAS = `${API_URL}/notificaciones/plantillas`;
export const URL_SUSCRIPCION = `${URL_PLANTILLAS}/SUSCRIPCION_POR_VENCER/CORREO`;

export const resumenSuscripcion = (cambios: Partial<ResumenPlantillaRespuesta> = {}): ResumenPlantillaRespuesta => ({
  codigo: 'SUSCRIPCION_POR_VENCER',
  nombre: 'Aviso de suscripción por vencer',
  canal: 'CORREO',
  idioma: 'es',
  origen: 'PERSONALIZADA',
  version: 3,
  asunto: 'Tu suscripción a {{producto}} vence en {{dias}} días',
  actualizado_en: '2026-11-24T15:00:00.000Z',
  ...cambios,
});

export const resumenSuspendido = (cambios: Partial<ResumenPlantillaRespuesta> = {}): ResumenPlantillaRespuesta => ({
  codigo: 'TENANT_SUSPENDIDO',
  nombre: 'Aviso de cuenta suspendida',
  canal: 'CORREO',
  idioma: 'es',
  origen: 'BASE',
  version: 1,
  asunto: 'La cuenta de {{tenant}} fue suspendida',
  actualizado_en: '2026-11-20T15:00:00.000Z',
  ...cambios,
});

export const paginaDe = (items: ResumenPlantillaRespuesta[]) => ({ items, total: items.length, pagina: 1, tamano: 25 });

export const CUERPO_BASE = '<p>Hola:</p><p>La suscripción de <strong>{{tenant}}</strong> vence en {{dias}} días.</p>';

export const detalleSuscripcion = (cambios: Partial<DetallePlantillaRespuesta> = {}): DetallePlantillaRespuesta => ({
  codigo: 'SUSCRIPCION_POR_VENCER',
  nombre: 'Aviso de suscripción por vencer',
  canal: 'CORREO',
  idioma: 'es',
  origen: 'BASE',
  asunto: 'Tu suscripción a {{producto}} vence en {{dias}} días',
  cuerpo: CUERPO_BASE,
  variables: [
    { nombre: 'tenant', tipo: 'texto', ejemplo: 'Restaurante El Buen Sabor' },
    { nombre: 'producto', tipo: 'texto', ejemplo: 'REST' },
    { nombre: 'dias', tipo: 'numero', ejemplo: '3' },
  ],
  version: null,
  actualizado_en: '2026-11-24T15:00:00.000Z',
  base: { asunto: 'Tu suscripción a {{producto}} vence en {{dias}} días', cuerpo: CUERPO_BASE },
  ...cambios,
});

export const USUARIO_ACTUAL = '47000000-0000-7000-8000-0000000000f1';
export const VERSIONES = [
  { version: 2, activa: true, creado_por: USUARIO_ACTUAL, creado_en: '2026-11-24T16:02:00.000Z' },
  { version: 1, activa: false, creado_por: '47000000-0000-7000-8000-0000000000f2', creado_en: '2026-11-21T21:45:00.000Z' },
];

export const VISTA_PREVIA = { asunto: 'Tu suscripción a REST vence en 3 días', cuerpo_html: '<p>Hola:</p><p>Vence en 3 días.</p>' };
