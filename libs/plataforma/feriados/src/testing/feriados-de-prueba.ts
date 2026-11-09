import type { FeriadoDelAnioRespuesta } from '../lib/models/feriado';

export const CUSCO = '0193f3a0-0000-7000-8000-0000000a0001';
export const MIRAFLORES = '0193f3a0-0000-7000-8000-0000000a0002';
export const SUCURSALES = [
  { id: CUSCO, empresaId: 'e-1', codigo: 'CUS', nombre: 'Cusco' },
  { id: MIRAFLORES, empresaId: 'e-1', codigo: 'MIR', nombre: 'Miraflores' },
];

export const fiestasPatrias: FeriadoDelAnioRespuesta = {
  id: '0193f3a0-0000-7000-8000-00000000f001',
  alcance: 'GLOBAL',
  sucursal_id: null,
  fecha: '2026-07-28',
  fecha_en_anio: '2027-07-28',
  nombre: 'Fiestas Patrias',
  recurrente_anual: true,
  version: 0,
  editable: true,
};

export const intiRaymi: FeriadoDelAnioRespuesta = {
  id: '0193f3a0-0000-7000-8000-00000000f002',
  alcance: 'SUCURSAL',
  sucursal_id: CUSCO,
  fecha: '2026-06-24',
  fecha_en_anio: '2027-06-24',
  nombre: 'Inti Raymi',
  recurrente_anual: true,
  version: 2,
  editable: true,
};

export const aniversario: FeriadoDelAnioRespuesta = {
  id: '0193f3a0-0000-7000-8000-00000000f003',
  alcance: 'TENANT',
  sucursal_id: null,
  fecha: '2027-05-15',
  fecha_en_anio: '2027-05-15',
  nombre: 'Aniversario',
  recurrente_anual: false,
  version: 1,
  editable: true,
};

export function pagina(items: FeriadoDelAnioRespuesta[], total = items.length): object {
  return { items, total, pagina: 1, tamano: 20 };
}
