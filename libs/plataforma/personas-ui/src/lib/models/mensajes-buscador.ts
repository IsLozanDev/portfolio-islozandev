import type { TipoElegido } from '../utils/clasificar-entrada';

export const MENSAJES_BUSCADOR = {
  etiqueta: 'Buscar persona',
  placeholder: 'Ej. Quispe Mamani, 45781236 o 987654321',
  borrar: 'Borrar la búsqueda',
  tipoDeBusqueda: (tipo: string) => `Tipo de búsqueda: ${tipo}`,
  buscando: 'Buscando…',
  usar: 'Usar',
  yaRegistrada: 'Ya está registrada en tu organización',
  datosDe: (fuente: string) => `Datos de ${fuente}`,
  noRegistradaEnOrganizacion: 'no está registrado en tu organización',
  documentoNoRegistrado: (documento: string) => `${documento} no está registrado`,
  registrarA: (nombre: string) => `Registrar a ${nombre}`,
  registrarAMano: 'Registrar a mano',
  sinResultados: (texto: string) => `No hay personas que coincidan con «${texto}».`,
  sugerenciaSinResultados: 'Prueba con el DNI, el RUC o el celular.',
  ayudaTeclado: '↑↓ para moverte · Enter para elegir',
  cantidad: (cantidad: number) => (cantidad === 1 ? '1 persona' : `${cantidad} personas`),
  anuncioResultados: (cantidad: number) => (cantidad === 1 ? '1 persona encontrada' : `${cantidad} personas encontradas`),
  ayuda: {
    vacia: 'Nombre, apellidos, DNI, RUC, celular o correo',
    esperaEnter: 'Pulsa Enter para buscar el documento',
    documento: (tipo: string) => `Buscando por ${tipo}`,
    numero: 'Por documento o celular que empieza así',
    correo: 'Por correo',
    texto: 'Sin tildes y en cualquier orden; también encuentra nombres que suenan igual',
  },
} as const;

export const TIPOS_BUSQUEDA: { codigo: TipoElegido; texto: string; ayuda: string }[] = [
  { codigo: 'AUTO', texto: 'Auto', ayuda: 'detecta DNI y RUC' },
  { codigo: 'DNI', texto: 'DNI', ayuda: '8 dígitos' },
  { codigo: 'RUC', texto: 'RUC', ayuda: '11 dígitos' },
  { codigo: 'CE', texto: 'CE', ayuda: 'carné de extranjería' },
  { codigo: 'PASAPORTE', texto: 'Pasaporte', ayuda: '' },
];

export const MENSAJES_ALTA = {
  titulo: 'Registrar persona',
  datosDe: (fuente: string) => `Datos de ${fuente}`,
  tituloNuevaPersona: 'Nueva persona',
  volver: 'Volver a la búsqueda',
  registrar: 'Registrar',
  cancelar: 'Cancelar',
  notaBusqueda: 'Busca primero. Si ya está registrada, ábrela; si no, regístrala con los datos de RENIEC o SUNAT cuando estén disponibles.',
  notaSugerencia: (fuente: string) => `Los datos de ${fuente} son una sugerencia: puedes corregirlos (por ejemplo, apellidos compuestos).`,
  notaPrincipales: 'El celular y el correo quedan como principales. Contactos y direcciones se agregan después en la ficha.',
  duplicada: 'Ya existe una persona con ese documento en tu organización.',
  abrirFicha: 'Abrir su ficha',
  campos: {
    nombres: 'Nombres',
    apellidoPaterno: 'Apellido paterno',
    apellidoMaterno: 'Apellido materno',
    razonSocial: 'Razón social',
    celular: 'Celular',
    correo: 'Correo',
  },
} as const;
