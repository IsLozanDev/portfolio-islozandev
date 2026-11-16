import type { DatosDni, DatosRuc } from '../../domain/datos-identidad.js';

/** Documentos de los criterios GWT del spec 28. */
export const DNIS_FALSOS: Readonly<Record<string, DatosDni>> = {
  '45781236': { nombres: 'Juana', apellidos: 'Quispe Mamani' },
  '10293847': { nombres: 'Luis Alberto', apellidos: 'Huamán Torres' },
};

export const RUCS_FALSOS: Readonly<Record<string, DatosRuc>> = {
  '20512345671': {
    razonSocial: 'Comercial Andina S.A.C.',
    estado: 'ACTIVO',
    condicion: 'HABIDO',
    direccionFiscal: 'Av. Larco 123, Miraflores',
    ubigeo: '150122',
  },
  '20498765433': {
    razonSocial: 'Distribuidora del Sur E.I.R.L.',
    estado: 'BAJA DE OFICIO',
    condicion: 'HABIDO',
    direccionFiscal: 'Calle Mercaderes 410, Arequipa',
    ubigeo: '040101',
  },
  '20100070970': {
    razonSocial: 'Supermercados Peruanos S.A.',
    estado: 'ACTIVO',
    condicion: 'HABIDO',
    direccionFiscal: 'Calle Morelli 181, San Borja',
    ubigeo: '150130',
  },
};
