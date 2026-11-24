/** Permisos de personas declarados en el manifiesto PLAT (`libs/plataforma/seguridad/manifiesto`), para `@Permiso`. */
export const PERMISOS_PER = {
  leer: 'plat.persona.leer',
  registrar: 'plat.persona.registrar',
  rol: 'plat.persona.rol',
  editar: 'plat.persona.editar',
  consentimiento: 'plat.persona.consentimiento',
  textoFinalidad: 'plat.persona.texto_finalidad',
  fusionar: 'plat.persona.fusionar',
} as const;
