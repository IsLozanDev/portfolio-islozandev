import { uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { EnviarNotificacion } from '../src/application/enviar-notificacion.js';
import type { EnviarNotificacionComando } from '../src/application/ports/notificacion.port.js';
import { Baja, type AlcanceBaja } from '../src/domain/baja.js';
import { escenario, PLANTILLA_PRUEBA, TENANT_A, TENANT_B, URL_PREFERENCIAS_PRUEBA } from './support/dobles.js';
import { plantillasDeLaSemilla } from './support/plantillas-avisos.js';

const PERSONA = '46000000-0000-7000-8000-0000000000f1';
const HASH_ANA = 'sha256:ana@ejemplo.pe';
const VARIABLES = { nombre: 'Ana', producto: 'SazónPOS' };
const ENLACE = /<a href="https:\/\/admin\.vitrina\.test\/preferencias#t=([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)">Gestiona tus preferencias<\/a>/;

function comando(cambios: Partial<EnviarNotificacionComando> = {}): EnviarNotificacionComando {
  return {
    plantilla: 'PRUEBA_CORREO',
    destinatario: { personaId: PERSONA },
    variables: VARIABLES,
    finalidad: 'TRANSACCIONAL',
    claveIdempotencia: uuidV7(),
    ...cambios,
  };
}

describe('EnviarNotificacion con bajas y pie de preferencias (spec 46)', () => {
  let piezas: ReturnType<typeof escenario>;
  let enviar: EnviarNotificacion;

  beforeEach(() => {
    piezas = escenario();
    enviar = new EnviarNotificacion(piezas.envio);
    piezas.personas.correos.set(PERSONA, [{ valor: 'ana@ejemplo.pe', principal: true }]);
    piezas.consentimientos.conPromociones.add(PERSONA);
  });

  const enA = (datos: EnviarNotificacionComando) => piezas.enTenant(TENANT_A, () => enviar.enviar(datos));
  const darseDeBaja = (alcance: AlcanceBaja, tenantId = TENANT_A) =>
    piezas.enTenant(tenantId, () =>
      piezas.bajas.registrar(Baja.registrar({ id: uuidV7(), tenantId, canal: 'CORREO', alcance, destinoHash: HASH_ANA, personaId: PERSONA })),
    );
  const guardado = (mensajeId: string) => piezas.mensajes.guardado(mensajeId).instantanea();

  describe('efecto de las bajas en el envío', () => {
    it('TR-CA-193: promocional con baja PROMOCIONAL → OMITIDO_SIN_CONSENTIMIENTO, sin evento', async () => {
      await darseDeBaja('PROMOCIONAL');

      const registrada = await enA(comando({ finalidad: 'PROMOCIONAL' }));

      expect(registrada.estado).toBe('OMITIDO_SIN_CONSENTIMIENTO');
      expect(guardado(registrada.mensajeId).motivoFallo).toBe('BAJA_PROMOCIONAL');
      expect(piezas.publicador.eventos).toHaveLength(0);
    });

    it('TR-CA-193: transaccional con baja PROMOCIONAL → ENCOLADO', async () => {
      await darseDeBaja('PROMOCIONAL');

      const registrada = await enA(comando());

      expect(registrada.estado).toBe('ENCOLADO');
      expect(piezas.publicador.eventos).toHaveLength(1);
    });

    it.each(['TRANSACCIONAL', 'PROMOCIONAL'] as const)('%s con baja CANAL → DESCARTADO con BAJA_CANAL', async (finalidad) => {
      await darseDeBaja('CANAL');

      const registrada = await enA(comando({ finalidad }));

      expect(registrada.estado).toBe('DESCARTADO');
      expect(guardado(registrada.mensajeId).motivoFallo).toBe('BAJA_CANAL');
      expect(piezas.publicador.eventos).toHaveLength(0);
    });

    it('una baja vale por destino: el correo suelto con el mismo hash también queda DESCARTADO', async () => {
      await darseDeBaja('CANAL');

      const registrada = await enA(comando({ destinatario: { correo: 'Ana@Ejemplo.pe' } }));

      expect(registrada.estado).toBe('DESCARTADO');
    });

    it('TR-RNF-010: la baja de otro tenant no afecta', async () => {
      await darseDeBaja('CANAL', TENANT_B);

      await expect(enA(comando())).resolves.toMatchObject({ estado: 'ENCOLADO' });
    });

    it('sin consentimiento vigente sigue mandando el consentimiento (motivo nulo), antes de mirar las bajas', async () => {
      piezas.consentimientos.conPromociones.delete(PERSONA);
      await darseDeBaja('CANAL');

      const registrada = await enA(comando({ finalidad: 'PROMOCIONAL' }));

      expect(registrada.estado).toBe('OMITIDO_SIN_CONSENTIMIENTO');
      expect(guardado(registrada.mensajeId).motivoFallo).toBeNull();
    });
  });

  describe('pie con el enlace firmado', () => {
    it('la plantilla base lleva el pie, con el token en el fragmento y la carga del destino', async () => {
      const registrada = await enA(comando());

      const cuerpo = guardado(registrada.mensajeId).cuerpo;
      const token = ENLACE.exec(cuerpo)?.[1] ?? '';
      expect(cuerpo.startsWith('<p>Hola Ana:</p><p>Prueba de SazónPOS.</p><hr>')).toBe(true);
      expect(piezas.firmador.verificar(token, piezas.reloj.now())).toEqual({
        tenantId: TENANT_A,
        canal: 'CORREO',
        destinoHash: HASH_ANA,
        personaId: PERSONA,
        venceEn: new Date(piezas.reloj.now().getTime() + 30 * 86_400_000),
      });
    });

    it('a un correo suelto el token no lleva persona', async () => {
      const registrada = await enA(comando({ destinatario: { correo: 'ana@ejemplo.pe' } }));

      const token = ENLACE.exec(guardado(registrada.mensajeId).cuerpo)?.[1] ?? '';
      expect(piezas.firmador.verificar(token, piezas.reloj.now())).not.toHaveProperty('personaId');
    });

    it('la plantilla personalizada del tenant también lleva el pie, después de su cuerpo', async () => {
      piezas.plantillas.plantillas.push({
        ...PLANTILLA_PRUEBA,
        id: uuidV7(),
        tenantId: TENANT_A,
        version: 2,
        cuerpo: '<p>Mía, {{nombre}}</p>',
        plantillaBaseId: PLANTILLA_PRUEBA.id,
      });

      const registrada = await enA(comando());

      const cuerpo = guardado(registrada.mensajeId).cuerpo;
      expect(cuerpo.startsWith('<p>Mía, Ana</p><hr>')).toBe(true);
      expect(cuerpo).toMatch(ENLACE);
    });

    it('los avisos de plataforma (CODIGOS_AVISO) salen sin pie', async () => {
      piezas.plantillas.plantillas.push(...(await plantillasDeLaSemilla()));

      const registrada = await enA(
        comando({
          plantilla: 'TENANT_SUSPENDIDO',
          destinatario: { correo: 'duena@ejemplo.pe' },
          variables: { tenant: 'El Buen Sabor', motivo: 'Fin del periodo de gracia', fecha_efectiva: '24/11/2026' },
        }),
      );

      expect(guardado(registrada.mensajeId).cuerpo).not.toContain('/preferencias');
    });

    it('sin la clave o la URL del enlace sale sin pie y avisa en el log sin correo ni token', async () => {
      enviar = new EnviarNotificacion({ ...piezas.envio, enlacePreferencias: null });

      const registrada = await enA(comando());

      expect(guardado(registrada.mensajeId).cuerpo).not.toContain(URL_PREFERENCIAS_PRUEBA);
      expect(piezas.avisos.llamadas).toEqual([
        { mensaje: 'not.pie_preferencias_sin_configurar', datos: { plantilla: 'PRUEBA_CORREO', destino_hash: HASH_ANA } },
      ]);
    });
  });
});
