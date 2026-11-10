import type { DomainEvent } from '@vitrina/plataforma/kernel';
import { AlsTenantContext } from '@vitrina/plataforma/kernel-infra';
import { ObtenerUltimaVerificacion } from '../src/application/obtener-ultima-verificacion.js';
import type { RegistroVerificaciones } from '../src/application/ports/registro-verificaciones.port.js';
import { VerificarIntegridad } from '../src/application/verificar-integridad.js';
import { VerificarTodosLosTenants } from '../src/application/verificar-todos-los-tenants.js';
import { SinVerificacionesError, SucursalFueraDeAlcanceError } from '../src/domain/errores.js';
import { HASH_INICIAL, LOTE_VERIFICACION, type PuntoDeControl, type TramoVerificado, type Verificacion } from '../src/domain/verificacion.js';
import { AlcanceActorDePrueba, directorioVacio } from './support/seguridad-de-prueba.js';

const TENANT = '0193f3a0-0000-7000-8000-000000000001';
const OTRO_TENANT = '0193f3a0-0000-7000-8000-000000000002';
const PROPIETARIA = '0193f3a0-0000-7000-8000-000000000901';
const SUPERVISOR = '0193f3a0-0000-7000-8000-000000000902';
const SURCO = '0193f3a0-0000-7000-8000-000000000102';
const HASH = (letra: string) => letra.repeat(64);

/** Cadena simulada de `maximo` filas; `falla` corta el recorrido en ese número con ese motivo. */
class RegistroEnMemoria implements RegistroVerificaciones {
  guardadas: Verificacion[] = [];
  tramosPedidos: PuntoDeControl[] = [];
  maximo = '0';
  falla: { numero: string; motivo: TramoVerificado['motivo'] } | null = null;
  correcta: PuntoDeControl | null = null;

  async ultimaCorrecta() {
    return this.correcta;
  }

  async ultima() {
    return this.guardadas.at(-1) ?? null;
  }

  async guardar(verificacion: Verificacion) {
    this.guardadas.push(verificacion);
  }

  async maximoNumero() {
    return this.maximo;
  }

  async verificarTramo(desde: PuntoDeControl, limite: number): Promise<TramoVerificado> {
    this.tramosPedidos.push(desde);
    const tope = Math.min(Number(this.maximo), Number(desde.numero) + limite);
    const hastaFalla = this.falla ? Math.min(tope, Number(this.falla.numero) - 1) : tope;
    const fallaEnTramo = this.falla !== null && Number(this.falla.numero) <= tope ? this.falla : null;
    return {
      ultimoNumero: String(hastaFalla),
      ultimoHash: HASH('b'),
      filas: hastaFalla - Number(desde.numero),
      numeroRoto: fallaEnTramo?.numero ?? null,
      motivo: fallaEnTramo?.motivo ?? null,
    };
  }
}

function escenario() {
  const registro = new RegistroEnMemoria();
  const publicados: DomainEvent[] = [];
  const roturas: Record<string, unknown>[] = [];
  const contexto = new AlsTenantContext();
  let siguienteId = 0;
  const verificar = new VerificarIntegridad({
    unidadDeTrabajo: { run: (trabajo) => trabajo() },
    contexto,
    ids: { next: () => `0193f3a0-0000-7000-8000-00000000b${String(++siguienteId).padStart(3, '0')}` },
    reloj: { now: () => new Date('2026-11-10T08:30:00Z') },
    eventos: { publish: async (evento) => void publicados.push(evento) },
    registro,
    avisarRotura: (datos) => roturas.push(datos),
  });
  return { registro, publicados, roturas, verificar, contexto };
}

describe('VerificarIntegridad (spec 20b, TR-RN-028)', () => {
  it('INCREMENTAL parte de la última OK y solo recorre las filas nuevas; sin rotura no publica', async () => {
    const { registro, publicados, verificar } = escenario();
    registro.maximo = '130';
    registro.correcta = { numero: '120', hash: HASH('a') };

    const verificacion = await verificar.ejecutar(TENANT, 'INCREMENTAL');

    expect(registro.tramosPedidos).toEqual([{ numero: '120', hash: HASH('a') }]);
    expect(verificacion).toMatchObject({ tenantId: TENANT, modo: 'INCREMENTAL', desdeNumero: '120', hastaNumero: '130', filas: 10, estado: 'OK' });
    expect(registro.guardadas).toEqual([verificacion]);
    expect(publicados).toEqual([]);
  });

  it('COMPLETA recorre desde 0 con 64 ceros en tramos de 10 000 hasta el final', async () => {
    const { registro, verificar } = escenario();
    registro.maximo = String(LOTE_VERIFICACION * 2 + 5);
    registro.correcta = { numero: '120', hash: HASH('a') };

    const verificacion = await verificar.ejecutar(TENANT, 'COMPLETA');

    expect(registro.tramosPedidos.map((punto) => punto.numero)).toEqual(['0', String(LOTE_VERIFICACION), String(LOTE_VERIFICACION * 2)]);
    expect(registro.tramosPedidos[0].hash).toBe(HASH_INICIAL);
    expect(verificacion).toMatchObject({ desdeNumero: '0', hastaNumero: registro.maximo, filas: LOTE_VERIFICACION * 2 + 5, estado: 'OK' });
  });

  it('con una falla guarda ROTA, loguea y publica aud.integridad.rota con número y motivo', async () => {
    const { registro, publicados, roturas, verificar } = escenario();
    registro.maximo = '50';
    registro.falla = { numero: '37', motivo: 'HASH' };

    const verificacion = await verificar.ejecutar(TENANT, 'INCREMENTAL');

    expect(verificacion).toMatchObject({ estado: 'ROTA', numeroRoto: '37', motivo: 'HASH', hastaNumero: '36' });
    expect(roturas).toEqual([{ evento: 'aud.integridad.rota', tenant_id: TENANT, numero_roto: '37', motivo: 'HASH' }]);
    expect(publicados).toEqual([
      expect.objectContaining({
        eventType: 'aud.integridad.rota',
        aggregateType: 'verificacion_integridad',
        aggregateId: verificacion?.id,
        payload: { numero_roto: '37', motivo: 'HASH', modo: 'INCREMENTAL', desde_numero: '0' },
      }),
    ]);
  });

  it('si el máximo número quedó por debajo de lo verificado es TRUNCADA, sin recorrer', async () => {
    const { registro, publicados, verificar } = escenario();
    registro.maximo = '118';
    registro.correcta = { numero: '120', hash: HASH('a') };

    const verificacion = await verificar.ejecutar(TENANT, 'INCREMENTAL');

    expect(verificacion).toMatchObject({ estado: 'ROTA', motivo: 'TRUNCADA', numeroRoto: '120' });
    expect(registro.tramosPedidos).toEqual([]);
    expect(publicados).toHaveLength(1);
  });

  it('un tenant sin filas no guarda nada', async () => {
    const { registro, verificar } = escenario();
    expect(await verificar.ejecutar(TENANT, 'INCREMENTAL')).toBeNull();
    expect(registro.guardadas).toEqual([]);
  });
});

describe('VerificarTodosLosTenants (spec 20b)', () => {
  it('verifica cada tenant; el error técnico de uno se loguea con su nombre y no detiene a los demás', async () => {
    const verificados: string[] = [];
    const avisos: [string, Record<string, unknown>][] = [];
    const informes: [string, Record<string, unknown>][] = [];
    const tercero = '0193f3a0-0000-7000-8000-000000000003';
    const todos = new VerificarTodosLosTenants({
      tenants: { listar: async () => [TENANT, OTRO_TENANT, tercero] },
      verificar: {
        ejecutar: async (tenantId, modo) => {
          verificados.push(`${tenantId}:${modo}`);
          if (tenantId === OTRO_TENANT) throw new TypeError('conexión caída con datos sensibles');
          return { estado: tenantId === tercero ? 'ROTA' : 'OK' } as Verificacion;
        },
      },
      reloj: { now: () => new Date('2026-11-10T08:30:00Z') },
      informar: (mensaje, datos) => informes.push([mensaje, datos]),
      avisar: (mensaje, datos) => avisos.push([mensaje, datos]),
    });

    const resultado = await todos.ejecutar();

    expect(verificados).toEqual([`${TENANT}:INCREMENTAL`, `${OTRO_TENANT}:INCREMENTAL`, `${tercero}:INCREMENTAL`]);
    expect(resultado).toEqual({ tenants: 3, ok: 1, rotas: 1, fallidos: 1, duracionMs: 0 });
    expect(avisos).toEqual([['aud.verificacion.error', { tenant_id: OTRO_TENANT, error: 'TypeError' }]]);
    expect(informes).toEqual([['aud.verificacion.terminada', resultado]]);
  });
});

describe('ObtenerUltimaVerificacion (spec 20b)', () => {
  function obtener(registro: RegistroEnMemoria, contexto: AlsTenantContext) {
    const alcanceActor = new AlcanceActorDePrueba();
    alcanceActor.tenant.add(PROPIETARIA);
    return new ObtenerUltimaVerificacion({
      unidadDeTrabajo: { run: (trabajo) => trabajo() },
      contexto,
      reloj: { now: () => new Date() },
      alcanceActor,
      directorio: directorioVacio,
      registro,
    });
  }

  it('devuelve la última con alcance TENANT; sin él es 403 y sin verificaciones 404', async () => {
    const { registro, verificar, contexto } = escenario();
    const caso = obtener(registro, contexto);
    const como = (actorId: string) => contexto.run({ tenantId: TENANT, actorId, branchId: SURCO }, () => caso.ejecutar());

    await expect(como(PROPIETARIA)).rejects.toThrow(SinVerificacionesError);
    registro.maximo = '3';
    const verificacion = await verificar.ejecutar(TENANT, 'COMPLETA');
    await expect(como(PROPIETARIA)).resolves.toEqual(verificacion);
    await expect(como(SUPERVISOR)).rejects.toThrow(SucursalFueraDeAlcanceError);
  });
});
