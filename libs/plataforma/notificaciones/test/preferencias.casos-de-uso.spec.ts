import { uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { EnviarNotificacion } from '../src/application/enviar-notificacion.js';
import { ConsultarPreferencias } from '../src/application/preferencias/consultar-preferencias.js';
import { RegistrarBaja } from '../src/application/preferencias/registrar-baja.js';
import { vencimientoEnlace, type CargaEnlace } from '../src/domain/enlace-preferencias.js';
import { EnlaceInvalidoError } from '../src/domain/errores.js';
import { FirmadorEnlaceHmac } from '../src/infrastructure/crypto/firmador-enlace.hmac.js';
import { AHORA, escenario, TENANT_A, TENANT_B } from './support/dobles.js';

const PERSONA = '46000000-0000-7000-8000-0000000000f1';
const HASH_ANA = 'sha256:ana@ejemplo.pe';
const UN_DIA_MS = 86_400_000;

describe('preferencias del destinatario (spec 46, TR-RF-077)', () => {
  let piezas: ReturnType<typeof escenario>;
  let consultar: ConsultarPreferencias;
  let registrar: RegistrarBaja;

  beforeEach(async () => {
    piezas = escenario();
    consultar = new ConsultarPreferencias(piezas.preferencias);
    registrar = new RegistrarBaja(piezas.preferencias);
    piezas.personas.correos.set(PERSONA, [{ valor: 'ana@ejemplo.pe', principal: true }]);
    await piezas.enTenant(TENANT_A, () =>
      new EnviarNotificacion(piezas.envio).enviar({
        plantilla: 'PRUEBA_CORREO',
        destinatario: { personaId: PERSONA },
        variables: { nombre: 'Ana', producto: 'SazónPOS' },
        finalidad: 'TRANSACCIONAL',
        claveIdempotencia: uuidV7(),
      }),
    );
  });

  const token = (cambios: Partial<CargaEnlace> = {}) =>
    piezas.firmador.firmar({ tenantId: TENANT_A, canal: 'CORREO', destinoHash: HASH_ANA, personaId: PERSONA, venceEn: vencimientoEnlace(AHORA), ...cambios });
  const sinPersona = () => {
    const carga: CargaEnlace = { tenantId: TENANT_A, canal: 'CORREO', destinoHash: HASH_ANA, venceEn: vencimientoEnlace(AHORA) };
    return piezas.firmador.firmar(carga);
  };

  describe('ConsultarPreferencias', () => {
    it('devuelve el destino enmascarado del último mensaje del hash, el canal y las bajas vigentes', async () => {
      await registrar.ejecutar(token(), 'PROMOCIONAL');

      expect(await consultar.ejecutar(token())).toEqual({ destinoEnmascarado: 'a***@ejemplo.pe', canal: 'CORREO', bajas: ['PROMOCIONAL'] });
    });

    it('TR-CA-194: token alterado, de otra clave o vencido → EnlaceInvalidoError, el mismo para los tres', async () => {
      const [cuerpo, firma] = token().split('.') as [string, string];
      const alterado = `${cuerpo}.${firma.startsWith('A') ? 'B' : 'A'}${firma.slice(1)}`;
      const deOtraClave = new FirmadorEnlaceHmac('otra-clave-de-prueba-de-al-menos-32-caracteres').firmar({
        tenantId: TENANT_A,
        canal: 'CORREO',
        destinoHash: HASH_ANA,
        venceEn: vencimientoEnlace(AHORA),
      });
      const vencido = token();
      piezas.reloj.avanzar(30 * UN_DIA_MS);

      for (const invalido of [alterado, deOtraClave, vencido, 'basura']) {
        await expect(consultar.ejecutar(invalido)).rejects.toThrow(new EnlaceInvalidoError());
      }
    });

    it('sin la clave del enlace configurada todo token es inválido', async () => {
      const sinClave = new ConsultarPreferencias({ ...piezas.preferencias, firmador: null });

      await expect(sinClave.ejecutar(token())).rejects.toThrow(EnlaceInvalidoError);
    });

    it('TR-RNF-010: un token de B no ve el destino ni las bajas de A', async () => {
      await registrar.ejecutar(token(), 'CANAL');

      expect(await consultar.ejecutar(token({ tenantId: TENANT_B }))).toEqual({ destinoEnmascarado: '***', canal: 'CORREO', bajas: [] });
    });
  });

  describe('RegistrarBaja', () => {
    it('TR-CA-193: con persona y PROMOCIONES vigente revoca en PER con canal WEB y el titular como actor', async () => {
      piezas.consentimientos.conPromociones.add(PERSONA);

      const resultado = await registrar.ejecutar(token(), 'PROMOCIONAL');

      expect(resultado).toEqual({ bajas: ['PROMOCIONAL'] });
      expect(piezas.consentimientos.revocaciones).toEqual([{ personaId: PERSONA, finalidad: 'PROMOCIONES', canal: 'WEB', actorId: PERSONA }]);
      expect(piezas.bajas.bajas[0]?.instantanea()).toMatchObject({ tenantId: TENANT_A, alcance: 'PROMOCIONAL', destinoHash: HASH_ANA, personaId: PERSONA });
    });

    it('la baja CANAL con persona también revoca PROMOCIONES', async () => {
      piezas.consentimientos.conPromociones.add(PERSONA);

      await registrar.ejecutar(token(), 'CANAL');

      expect(piezas.consentimientos.revocaciones).toHaveLength(1);
    });

    it('sin PROMOCIONES vigente no revoca', async () => {
      await registrar.ejecutar(token(), 'PROMOCIONAL');

      expect(piezas.consentimientos.revocaciones).toEqual([]);
    });

    it('destino sin persona (correo suelto) → guarda la baja por hash y no llama a PER', async () => {
      await registrar.ejecutar(sinPersona(), 'CANAL');

      expect(piezas.consentimientos.consultas).toEqual([]);
      expect(piezas.consentimientos.revocaciones).toEqual([]);
      expect(piezas.bajas.bajas[0]?.instantanea()).toMatchObject({ destinoHash: HASH_ANA, personaId: null });
    });

    it('la misma baja dos veces deja una sola y devuelve las vigentes', async () => {
      await registrar.ejecutar(token(), 'PROMOCIONAL');
      const repetida = await registrar.ejecutar(token(), 'PROMOCIONAL');
      const otra = await registrar.ejecutar(token(), 'CANAL');

      expect(repetida).toEqual({ bajas: ['PROMOCIONAL'] });
      expect(otra).toEqual({ bajas: ['PROMOCIONAL', 'CANAL'] });
      expect(piezas.bajas.bajas).toHaveLength(2);
    });

    it('TR-CA-194: token inválido no registra nada', async () => {
      await expect(registrar.ejecutar('basura', 'CANAL')).rejects.toThrow(EnlaceInvalidoError);

      expect(piezas.bajas.bajas).toEqual([]);
    });

    it('TR-RNF-026: el log lleva el hash y el alcance, nunca el correo ni el token', async () => {
      const enlace = token();
      await registrar.ejecutar(enlace, 'PROMOCIONAL');
      await registrar.ejecutar(enlace, 'PROMOCIONAL');

      expect(piezas.informes.llamadas).toEqual([
        { mensaje: 'not.baja.registrada', datos: { destino_hash: HASH_ANA, alcance: 'PROMOCIONAL', repetida: false } },
        { mensaje: 'not.baja.registrada', datos: { destino_hash: HASH_ANA, alcance: 'PROMOCIONAL', repetida: true } },
      ]);
      expect(JSON.stringify(piezas.informes.llamadas)).not.toContain(enlace);
    });
  });
});
