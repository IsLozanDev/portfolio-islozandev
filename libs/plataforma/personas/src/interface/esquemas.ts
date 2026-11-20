import { z } from 'zod';

/** Cotas de entrada: el formato y las longitudes reales los valida el dominio, con su código de error. */
export const LONGITUD_MAXIMA_TIPO = 20;
export const LONGITUD_MAXIMA_NUMERO = 20;
export const LONGITUD_MAXIMA_TEXTO = 300;
/** Versión de un texto de consentimiento: el formato real lo valida el dominio. */
export const LONGITUD_MAXIMA_VERSION = 40;

export const texto = (maximo: number) => z.string().max(maximo);
export const textoOpcional = texto(LONGITUD_MAXIMA_TEXTO).nullish();

/** Versión de la persona que leyó el cliente: en el cuerpo del PATCH y en `?version=` del DELETE. */
export const versionLeida = z.number().int().min(0);
export const EsquemaVersionEnConsulta = z.object({ version: z.string().regex(/^\d+$/) });

export const EsquemaPersonaId = z.object({ id: z.uuid() });
