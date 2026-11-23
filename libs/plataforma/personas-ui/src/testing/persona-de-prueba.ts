import { aPersonaDetalle, type PersonaDetalle, type PersonaDetalleRespuesta } from '../lib/models/persona';

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

/** La ficha completa de Juana, como modelo del front: dos celulares, correo, WhatsApp y dos direcciones. */
export const FICHA_DE_PRUEBA: PersonaDetalle = aPersonaDetalle({
  ...DETALLE_DE_PRUEBA,
  roles: [
    { producto_codigo: 'CLI', rol: 'PACIENTE', desde: '2026-03-02', hasta: null },
    { producto_codigo: 'GYM', rol: 'SOCIO', desde: '2026-11-18', hasta: null },
  ],
  contactos: [
    { id: 'c1', tipo: 'CELULAR', valor: '987654321', principal: true },
    { id: 'c2', tipo: 'CELULAR', valor: '956778120', principal: false },
    { id: 'c3', tipo: 'CORREO', valor: 'juana.quispe@correo.pe', principal: true },
    { id: 'c4', tipo: 'WHATSAPP', valor: '+51987654321', principal: false },
  ],
  direcciones: [
    { id: 'd1', direccion: 'Av. Ejército 710', referencia: 'Frente al parque', ubigeo: '040103', distrito: 'CAYMA', provincia: 'AREQUIPA', departamento: 'AREQUIPA', principal: true },
    { id: 'd2', direccion: 'Calle Mercaderes 214', referencia: null, ubigeo: '040101', distrito: 'AREQUIPA', provincia: 'AREQUIPA', departamento: 'AREQUIPA', principal: false },
  ],
});
