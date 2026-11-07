import type { TipoEventoSeguridad } from '../../application/ports/repositorios.js';
import type { MotivoFalloIngreso } from '../../domain/intentos-ingreso.js';

/** Los mismos textos que la bitácora del front (`mensajes-bitacora.ts` de admin-cliente). */
export const ETIQUETAS_BITACORA = {
  tipos: {
    LOGIN: 'Ingreso',
    LOGIN_FALLIDO: 'Ingreso fallido',
    ACCESO_DENEGADO: 'Acceso denegado',
    ASIGNACION_OTORGADA: 'Asignación otorgada',
    ASIGNACION_REVOCADA: 'Asignación revocada',
    ACCESO_SOPORTE: 'Acceso de soporte',
    EXPORTACION: 'Exportación',
  } satisfies Record<TipoEventoSeguridad, string>,
  metodos: {
    password: 'Contraseña',
    oauth: 'Proveedor externo',
    otp: 'Enlace por correo',
    totp: 'Código de verificación',
  } as Readonly<Record<string, string>>,
  motivos: {
    CREDENCIALES: 'Contraseña incorrecta o correo inexistente',
    CORREO_NO_CONFIRMADO: 'Correo sin confirmar',
    USUARIO_SUSPENDIDO: 'Usuario suspendido',
    CODIGO_MFA: 'Código de verificación incorrecto',
    BLOQUEO_INGRESO: 'Bloqueo por intentos fallidos (correo e IP, o IP)',
    BLOQUEO_MFA: 'Bloqueo del código de verificación',
  } satisfies Record<MotivoFalloIngreso, string>,
  columnas: {
    fecha: 'Fecha',
    tipo: 'Tipo',
    usuario: 'Usuario',
    correo: 'Correo',
    resumen: 'Resumen',
    ip: 'IP',
  },
  hoja: 'Bitácora',
} as const;
