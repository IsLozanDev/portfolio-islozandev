import { randomBytes } from 'node:crypto';
import { inspect } from 'node:util';
import { uuidV7 } from '@vitrina/plataforma/kernel-infra';
import type { BovedaSecretos } from '../src/application/ports/boveda-secretos.js';
import { ServicioBoveda } from '../src/application/servicio-boveda.js';
import type { ClavesMaestras } from '../src/domain/claves-maestras.js';
import {
  BovedaNoConfiguradaError,
  ClaveMaestraDesconocidaError,
  SecretoCorruptoError,
  SecretoModificadoError,
  SecretoNoEncontradoError,
  SecretoSinActorError,
  TipoSecretoInvalidoError,
  ValorSecretoInvalidoError,
} from '../src/domain/errores.js';
import { AHORA, clavesMaestrasDePrueba, crearEscenario, type EscenarioBoveda } from './support/dobles.js';

const TIPO_CLAVE = 'fe.clave_certificado';
const TIPO_PFX = 'fe.certificado_pfx';
const BYTES_PFX = 50 * 1024;

describe('BovedaSecretos (casos de uso)', () => {
  const tenantA = uuidV7();
  const tenantB = uuidV7();
  const usuario = uuidV7();
  const valor = new TextEncoder().encode('clave-super-secreta');
  let escenario: EscenarioBoveda;
  let maestras: ClavesMaestras;
  let boveda: BovedaSecretos;

  const enTenant = <Resultado>(tenantId: string, trabajo: () => Promise<Resultado>, actorId = usuario) =>
    escenario.contexto.run({ tenantId, actorId }, trabajo);
  const sinUsuario = <Resultado>(tenantId: string, trabajo: () => Promise<Resultado>) => escenario.contexto.run({ tenantId }, trabajo);

  beforeEach(() => {
    escenario = crearEscenario();
    maestras = clavesMaestrasDePrueba([1], 1);
    boveda = new ServicioBoveda(escenario.dependencias(maestras));
  });

  describe('guardar y leer', () => {
    it('devuelve exactamente los bytes guardados, incluido un .pfx de 50 KB', async () => {
      const pfx = randomBytes(BYTES_PFX);

      const idClave = await enTenant(tenantA, () => boveda.guardar(TIPO_CLAVE, valor));
      const idPfx = await enTenant(tenantA, () => boveda.guardar(TIPO_PFX, pfx));

      expect(await enTenant(tenantA, () => boveda.leer(idClave))).toEqual(new Uint8Array(valor));
      expect(Buffer.from(await enTenant(tenantA, () => boveda.leer(idPfx))).equals(pfx)).toBe(true);
    });

    it('el primer guardar del tenant crea su clave de datos envuelta con la activa; el segundo la reutiliza', async () => {
      await enTenant(tenantA, () => boveda.guardar(TIPO_CLAVE, valor));
      const claveCreada = escenario.clavesTenant.filas.get(tenantA);
      await enTenant(tenantA, () => boveda.guardar(TIPO_PFX, valor));

      expect(escenario.clavesTenant.filas.size).toBe(1);
      expect(claveCreada).toMatchObject({ tenantId: tenantA, versionClaveMaestra: 1, reenvueltaEn: null });
      expect(claveCreada?.claveCifrada).toHaveLength(48);
      expect(escenario.clavesTenant.filas.get(tenantA)).toBe(claveCreada);
    });

    it('la fila no lleva el valor en claro y dos guardar del mismo valor dan cifrado e IV distintos', async () => {
      const primero = await enTenant(tenantA, () => boveda.guardar(TIPO_CLAVE, valor));
      const segundo = await enTenant(tenantA, () => boveda.guardar(TIPO_CLAVE, valor));
      const filaUno = escenario.secretos.filas.get(primero);
      const filaDos = escenario.secretos.filas.get(segundo);

      expect(Buffer.from(filaUno?.cifrado ?? []).includes(Buffer.from(valor))).toBe(false);
      expect(Buffer.from(filaUno?.cifrado ?? []).equals(Buffer.from(filaDos?.cifrado ?? []))).toBe(false);
      expect(Buffer.from(filaUno?.iv ?? []).equals(Buffer.from(filaDos?.iv ?? []))).toBe(false);
      expect(filaUno).toMatchObject({ tenantId: tenantA, tipo: TIPO_CLAVE, version: 1, creadoPor: usuario, rotadoPor: null, rotadoEn: null });
    });

    it('audita plat.secreto.guardar con el tipo y sin el valor', async () => {
      const id = await enTenant(tenantA, () => boveda.guardar(TIPO_CLAVE, valor));

      expect(escenario.auditoria.entradas).toEqual([
        { accion: 'plat.secreto.guardar', entidadTipo: 'secreto', entidadId: id, despues: { tipo: TIPO_CLAVE } },
      ]);
    });

    it('leer no audita y solo registra id y tipo', async () => {
      const id = await enTenant(tenantA, () => boveda.guardar(TIPO_CLAVE, valor));
      escenario.auditoria.entradas.length = 0;

      await enTenant(tenantA, () => boveda.leer(id));

      expect(escenario.auditoria.entradas).toEqual([]);
      expect(escenario.registros).toEqual([{ mensaje: 'sec.secreto.leido', datos: { secretoId: id, tipo: TIPO_CLAVE } }]);
    });

    it('valida tipo, valor y usuario antes de tocar nada', async () => {
      await expect(enTenant(tenantA, () => boveda.guardar('Clave', valor))).rejects.toThrow(TipoSecretoInvalidoError);
      await expect(enTenant(tenantA, () => boveda.guardar(TIPO_CLAVE, new Uint8Array(0)))).rejects.toThrow(ValorSecretoInvalidoError);
      await expect(enTenant(tenantA, () => boveda.guardar(TIPO_CLAVE, new Uint8Array(64 * 1024 + 1)))).rejects.toThrow(ValorSecretoInvalidoError);
      await expect(sinUsuario(tenantA, () => boveda.guardar(TIPO_CLAVE, valor))).rejects.toThrow(SecretoSinActorError);

      expect(escenario.secretos.filas.size).toBe(0);
      expect(escenario.clavesTenant.filas.size).toBe(0);
    });
  });

  describe('aislamiento y AAD', () => {
    it('un secreto de otro tenant o inexistente da SecretoNoEncontradoError', async () => {
      const id = await enTenant(tenantA, () => boveda.guardar(TIPO_CLAVE, valor));

      await expect(enTenant(tenantB, () => boveda.leer(id))).rejects.toThrow(SecretoNoEncontradoError);
      await expect(enTenant(tenantA, () => boveda.leer(uuidV7()))).rejects.toThrow(SecretoNoEncontradoError);
    });

    it('el cifrado copiado a otro id, otro tipo u otro tenant falla con SecretoCorruptoError', async () => {
      const original = await enTenant(tenantA, () => boveda.guardar(TIPO_CLAVE, valor));
      const otroId = await enTenant(tenantA, () => boveda.guardar(TIPO_CLAVE, randomBytes(8)));
      const otroTipo = await enTenant(tenantA, () => boveda.guardar(TIPO_PFX, randomBytes(8)));
      const otroTenant = await enTenant(tenantB, () => boveda.guardar(TIPO_CLAVE, randomBytes(8)));
      const fila = escenario.secretos.filas.get(original);
      for (const destino of [otroId, otroTipo, otroTenant]) {
        const copia = escenario.secretos.filas.get(destino);
        if (!fila || !copia) throw new Error('faltan filas');
        escenario.secretos.filas.set(destino, { ...copia, cifrado: fila.cifrado, iv: fila.iv });
      }

      await expect(enTenant(tenantA, () => boveda.leer(otroId))).rejects.toThrow(SecretoCorruptoError);
      await expect(enTenant(tenantA, () => boveda.leer(otroTipo))).rejects.toThrow(SecretoCorruptoError);
      await expect(enTenant(tenantB, () => boveda.leer(otroTenant))).rejects.toThrow(SecretoCorruptoError);
    });
  });

  describe('rotar', () => {
    it('conserva el id, sube la versión, cambia el IV, registra quién y cuándo, y lee el valor nuevo', async () => {
      const id = await enTenant(tenantA, () => boveda.guardar(TIPO_CLAVE, valor));
      const antes = escenario.secretos.filas.get(id);
      const nuevo = new TextEncoder().encode('clave-nueva');
      const rotador = uuidV7();

      await enTenant(tenantA, () => boveda.rotar(id, nuevo), rotador);

      const despues = escenario.secretos.filas.get(id);
      expect(despues).toMatchObject({ id, version: 2, rotadoPor: rotador, rotadoEn: AHORA, creadoPor: usuario });
      expect(Buffer.from(despues?.iv ?? []).equals(Buffer.from(antes?.iv ?? []))).toBe(false);
      expect(await enTenant(tenantA, () => boveda.leer(id))).toEqual(new Uint8Array(nuevo));
      expect(escenario.auditoria.entradas.at(-1)).toEqual({
        accion: 'plat.secreto.rotar',
        entidadTipo: 'secreto',
        entidadId: id,
        despues: { tipo: TIPO_CLAVE, version: 2 },
      });
    });

    it('si otra rotación ganó, responde conflicto', async () => {
      const id = await enTenant(tenantA, () => boveda.guardar(TIPO_CLAVE, valor));
      const original = escenario.secretos.actualizar.bind(escenario.secretos);
      escenario.secretos.actualizar = async (secreto, versionEsperada) => {
        await original({ ...secreto }, versionEsperada);
        await original(secreto, versionEsperada);
      };

      await expect(enTenant(tenantA, () => boveda.rotar(id, valor))).rejects.toThrow(SecretoModificadoError);
    });

    it('un secreto inexistente, un valor inválido o sin usuario no rota', async () => {
      const id = await enTenant(tenantA, () => boveda.guardar(TIPO_CLAVE, valor));

      await expect(enTenant(tenantA, () => boveda.rotar(uuidV7(), valor))).rejects.toThrow(SecretoNoEncontradoError);
      await expect(enTenant(tenantB, () => boveda.rotar(id, valor))).rejects.toThrow(SecretoNoEncontradoError);
      await expect(enTenant(tenantA, () => boveda.rotar(id, new Uint8Array(0)))).rejects.toThrow(ValorSecretoInvalidoError);
      await expect(sinUsuario(tenantA, () => boveda.rotar(id, valor))).rejects.toThrow(SecretoSinActorError);
      expect(escenario.secretos.filas.get(id)?.version).toBe(1);
    });
  });

  describe('eliminar', () => {
    it('borra la fila, audita con el tipo y la versión, y leer después da SecretoNoEncontradoError', async () => {
      const id = await enTenant(tenantA, () => boveda.guardar(TIPO_CLAVE, valor));

      await enTenant(tenantA, () => boveda.eliminar(id));

      expect(escenario.secretos.filas.has(id)).toBe(false);
      await expect(enTenant(tenantA, () => boveda.leer(id))).rejects.toThrow(SecretoNoEncontradoError);
      expect(escenario.auditoria.entradas.at(-1)).toEqual({
        accion: 'plat.secreto.eliminar',
        entidadTipo: 'secreto',
        entidadId: id,
        antes: { tipo: TIPO_CLAVE, version: 1 },
      });
    });

    it('un id inexistente o de otro tenant no falla ni audita', async () => {
      const id = await enTenant(tenantA, () => boveda.guardar(TIPO_CLAVE, valor));
      escenario.auditoria.entradas.length = 0;

      await enTenant(tenantA, () => boveda.eliminar(uuidV7()));
      await enTenant(tenantB, () => boveda.eliminar(id));

      expect(escenario.auditoria.entradas).toEqual([]);
      expect(escenario.secretos.filas.has(id)).toBe(true);
    });
  });

  describe('claves maestras', () => {
    it('sin claves configuradas guardar, leer y rotar lanzan BovedaNoConfiguradaError', async () => {
      const sinClaves = new ServicioBoveda(escenario.dependencias(undefined));

      await expect(enTenant(tenantA, () => sinClaves.guardar(TIPO_CLAVE, valor))).rejects.toThrow(BovedaNoConfiguradaError);
      await expect(enTenant(tenantA, () => sinClaves.leer(uuidV7()))).rejects.toThrow(BovedaNoConfiguradaError);
      await expect(enTenant(tenantA, () => sinClaves.rotar(uuidV7(), valor))).rejects.toThrow(BovedaNoConfiguradaError);
    });

    it('con la 2 activa se siguen leyendo los secretos de la 1 y un tenant sin clave nace con la 2', async () => {
      const id = await enTenant(tenantA, () => boveda.guardar(TIPO_CLAVE, valor));
      const rotada = clavesMaestrasDePrueba([1, 2], 2, new Map([[1, maestras.clave(1)]]));
      const bovedaRotada = new ServicioBoveda(escenario.dependencias(rotada));

      expect(await enTenant(tenantA, () => bovedaRotada.leer(id))).toEqual(new Uint8Array(valor));
      await enTenant(tenantB, () => bovedaRotada.guardar(TIPO_CLAVE, valor));
      expect(escenario.clavesTenant.filas.get(tenantA)?.versionClaveMaestra).toBe(1);
      expect(escenario.clavesTenant.filas.get(tenantB)?.versionClaveMaestra).toBe(2);
    });

    it('una clave envuelta con una versión no configurada da ClaveMaestraDesconocidaError con la versión y sin claves', async () => {
      const id = await enTenant(tenantA, () => boveda.guardar(TIPO_CLAVE, valor));
      const soloLaDos = clavesMaestrasDePrueba([2], 2);
      const bovedaSinLaUno = new ServicioBoveda(escenario.dependencias(soloLaDos));

      const error = await enTenant(tenantA, () => bovedaSinLaUno.leer(id)).catch((causa: unknown) => causa);

      expect(error).toBeInstanceOf(ClaveMaestraDesconocidaError);
      expect(error).toMatchObject({ version: 1 });
      const texto = `${String(error)} ${JSON.stringify(error)} ${inspect(error)}`;
      for (const clave of [maestras.clave(1), soloLaDos.clave(2)]) expect(texto).not.toContain(Buffer.from(clave).toString('base64'));
      expect(texto).not.toContain('clave-super-secreta');
    });
  });
});
