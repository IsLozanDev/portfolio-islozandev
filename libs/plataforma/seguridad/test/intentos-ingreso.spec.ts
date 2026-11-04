import {
  CodigoMfaInvalidoError,
  CredencialesInvalidasError,
  ExportacionDemasiadoGrandeError,
  IngresoBloqueadoError,
  ProveedorIngresoNoDisponibleError,
} from '../src/domain/errores.js';
import {
  cuentaParaBloqueo,
  DURACION_BLOQUEO_SEG,
  enmascararCorreo,
  MOTIVOS_FALLO_INGRESO,
  normalizarCorreo,
  UMBRAL_FALLOS_CORREO_IP,
  UMBRAL_FALLOS_IP,
  UMBRAL_FALLOS_MFA,
  VENTANA_INTENTOS_SEG,
} from '../src/domain/intentos-ingreso.js';
import { PERMISOS_SEG, PERMISOS_VETADOS_SOPORTE } from '../src/domain/permisos-seg.js';

describe('enmascararCorreo', () => {
  it('deja las dos primeras letras del local y el dominio completo', () => {
    expect(enmascararCorreo('daniel.lozano@gmail.com')).toBe('da****@gmail.com');
  });

  it('normaliza antes de enmascarar', () => {
    expect(enmascararCorreo('  Daniel@Vitrina.PE ')).toBe('da****@vitrina.pe');
  });

  it('no revela el largo de un local corto', () => {
    expect(enmascararCorreo('a@x.pe')).toBe('a****@x.pe');
  });

  it('enmascara un texto sin arroba sin fallar', () => {
    expect(enmascararCorreo('danielito')).toBe('da****');
  });
});

describe('normalizarCorreo', () => {
  it('recorta y pasa a minúsculas, como seg.usuario.email', () => {
    expect(normalizarCorreo('  Ana@Gmail.COM\t')).toBe('ana@gmail.com');
  });
});

describe('cuentaParaBloqueo', () => {
  it('solo cuentan la clave y el código MFA incorrectos', () => {
    expect(MOTIVOS_FALLO_INGRESO.filter(cuentaParaBloqueo)).toEqual(['CREDENCIALES', 'CODIGO_MFA']);
  });
});

describe('umbrales', () => {
  it('son los del spec 18b', () => {
    expect({ UMBRAL_FALLOS_CORREO_IP, UMBRAL_FALLOS_IP, UMBRAL_FALLOS_MFA, VENTANA_INTENTOS_SEG, DURACION_BLOQUEO_SEG }).toEqual({
      UMBRAL_FALLOS_CORREO_IP: 5,
      UMBRAL_FALLOS_IP: 20,
      UMBRAL_FALLOS_MFA: 5,
      VENTANA_INTENTOS_SEG: 900,
      DURACION_BLOQUEO_SEG: 900,
    });
  });
});

describe('errores de ingreso y exportación', () => {
  it('el bloqueo redondea los minutos hacia arriba y guarda los segundos', () => {
    const error = new IngresoBloqueadoError(61);
    expect(error.code).toBe('INGRESO_BLOQUEADO');
    expect(error.reintentarEnSeg).toBe(61);
    expect(error).toMatchObject({ message: 'Demasiados intentos. Vuelva a intentarlo en 2 minutos' });
  });

  it('el bloqueo nunca dice 0 minutos y usa el singular', () => {
    expect(new IngresoBloqueadoError(0)).toMatchObject({ message: 'Demasiados intentos. Vuelva a intentarlo en 1 minuto' });
  });

  it('la exportación grande dice cuántas filas y el máximo con separador de miles', () => {
    const error = new ExportacionDemasiadoGrandeError(10_001, 10_000);
    expect(error.code).toBe('EXPORTACION_DEMASIADO_GRANDE');
    expect(error).toMatchObject({ message: 'La exportación tiene 10 001 filas; el máximo es 10 000. Acote el rango o los filtros' });
  });

  it('los mensajes no revelan si la cuenta existe', () => {
    expect(new CredencialesInvalidasError()).toMatchObject({ message: 'Correo o contraseña incorrectos' });
    expect(new CodigoMfaInvalidoError().code).toBe('CODIGO_MFA_INVALIDO');
    expect(new ProveedorIngresoNoDisponibleError().code).toBe('INGRESO_NO_DISPONIBLE');
  });
});

describe('PERMISOS_VETADOS_SOPORTE (spec 18b)', () => {
  it('veta exportar la bitácora y deja consultarla', () => {
    expect(PERMISOS_VETADOS_SOPORTE).toContain(PERMISOS_SEG.seguridadBitacoraExportar);
    expect(PERMISOS_VETADOS_SOPORTE).not.toContain(PERMISOS_SEG.seguridadBitacora);
  });
});
