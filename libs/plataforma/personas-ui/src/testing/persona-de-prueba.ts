import type { PersonaDetalleRespuesta } from '../lib/models/persona';

export const PERSONA_DE_PRUEBA = 'per-1';

/** Juana Quispe Mamani como la devuelve `GET /v1/personas/{id}`. */
export const DETALLE_DE_PRUEBA: PersonaDetalleRespuesta = {
  id: PERSONA_DE_PRUEBA,
  tipo_persona: 'NATURAL',
  tipo_documento: 'DNI',
  numero_documento: '45781236',
  nombres: 'Juana',
  apellido_paterno: 'Quispe',
  apellido_materno: 'Mamani',
  razon_social: null,
  activo: true,
  version: 5,
  roles: [{ producto_codigo: 'CLI', rol: 'PACIENTE', desde: '2026-03-02', hasta: null }],
  contactos: [{ id: 'c1', tipo: 'CELULAR', valor: '987654321', principal: true }],
  direcciones: [],
};
