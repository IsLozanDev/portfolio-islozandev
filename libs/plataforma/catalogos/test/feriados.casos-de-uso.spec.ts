import { ActualizarFeriado, type ActualizarFeriadoComando } from '../src/application/feriados/actualizar-feriado.js';
import { CrearFeriado, type CrearFeriadoComando } from '../src/application/feriados/crear-feriado.js';
import { EliminarFeriado } from '../src/application/feriados/eliminar-feriado.js';
import { ListarFeriados } from '../src/application/feriados/listar-feriados.js';
import { VersionObsoletaError } from '../src/domain/errores.js';
import {
  FeriadoDuplicadoError,
  FeriadoInvalidoError,
  FeriadoNoEncontradoError,
  SucursalNoEncontradaError,
} from '../src/domain/feriados/errores.js';
import { ANA, CLIENTE, OPERADOR, OperadorRequeridoDoble } from './support/dobles.js';
import { CUSCO, GLOBALES, LIMA, escenarioFeriados, type EscenarioFeriados } from './support/dobles-feriados.js';

const comandoCrear = (cambios: Partial<CrearFeriadoComando> = {}): CrearFeriadoComando => ({
  alcance: 'TENANT',
  sucursalId: null,
  fecha: '2026-05-15',
  nombre: 'Aniversario',
  recurrenteAnual: false,
  actorId: ANA,
  ...cambios,
});

const comandoActualizar = (feriadoId: string, cambios: Partial<ActualizarFeriadoComando> = {}): ActualizarFeriadoComando => ({
  feriadoId,
  fecha: '2026-05-15',
  nombre: 'Aniversario',
  recurrenteAnual: false,
  version: 0,
  actorId: ANA,
  ...cambios,
});

describe('Feriados: casos de uso (TR-RF-029)', () => {
  let actual: EscenarioFeriados;
  const crear = (cambios: Partial<CrearFeriadoComando> = {}) => new CrearFeriado(actual.dependencias).ejecutar(comandoCrear(cambios));
  const listar = (anio: number, sucursalId: string | null = null) => new ListarFeriados(actual.dependencias).ejecutar({ anio, sucursalId });

  beforeEach(() => {
    actual = escenarioFeriados();
  });

  describe('CrearFeriado', () => {
    it('un feriado del tenant toma el tenant del contexto, nace en versión 0 y publica CREADO en la transacción', async () => {
      const guardado = await crear();
      expect(guardado).toEqual({
        id: expect.any(String),
        alcance: 'TENANT',
        sucursalId: null,
        fecha: '2026-05-15',
        nombre: 'Aniversario',
        recurrenteAnual: false,
        version: 0,
      });
      expect(actual.feriados.filas.get(guardado.id)?.tenantId).toBe(CLIENTE);
      expect(actual.publicados).toEqual([
        expect.objectContaining({
          eventType: 'feriado.actualizado',
          aggregateType: 'feriado',
          aggregateId: guardado.id,
          aggregateVersion: 0,
          payload: {
            feriado_id: guardado.id,
            accion: 'CREADO',
            alcance: 'TENANT',
            tenant_id: CLIENTE,
            sucursal_id: null,
            fecha: '2026-05-15',
            nombre: 'Aniversario',
            recurrente_anual: false,
            version: 0,
            por: ANA,
          },
        }),
      ]);
    });

    it('TR-CA-077: el 2026-10-08 del tenant choca con el global recurrente y da 409 sin escribir', async () => {
      await expect(crear({ fecha: '2026-10-08' })).rejects.toThrow(new FeriadoDuplicadoError());
      await expect(crear({ fecha: '2026-10-08' })).rejects.toThrow('La fecha ya está registrada como feriado');
      expect(actual.feriados.escrituras).toBe(0);
      expect(actual.publicados).toEqual([]);
    });

    it('TR-CA-077: una fecha repetida en el mismo nivel también da 409', async () => {
      await crear({ alcance: 'SUCURSAL', sucursalId: CUSCO, fecha: '2026-06-24' });
      await expect(crear({ alcance: 'SUCURSAL', sucursalId: CUSCO, fecha: '2026-06-24' })).rejects.toThrow(FeriadoDuplicadoError);
      await expect(crear({ alcance: 'SUCURSAL', sucursalId: LIMA, fecha: '2026-06-24' })).resolves.toMatchObject({ sucursalId: LIMA });
    });

    it('un global fuera del operador da 403 OPERADOR_REQUERIDO sin escribir', async () => {
      await expect(crear({ alcance: 'GLOBAL' })).rejects.toThrow(OperadorRequeridoDoble);
      expect(actual.feriados.escrituras).toBe(0);
    });

    it('el operador crea un global sin tenant y el evento lleva tenant null', async () => {
      actual.comoTenant(OPERADOR);
      const guardado = await crear({ alcance: 'GLOBAL', fecha: '2027-04-01', nombre: 'Jueves Santo' });
      expect(actual.feriados.filas.get(guardado.id)).toMatchObject({ esGlobal: true, tenantId: null });
      expect(actual.publicados[0].payload).toMatchObject({ accion: 'CREADO', alcance: 'GLOBAL', tenant_id: null });
    });

    it('una sucursal de otro tenant da 404 SUCURSAL_NO_ENCONTRADA', async () => {
      actual.comoTenant(OPERADOR);
      await expect(crear({ alcance: 'SUCURSAL', sucursalId: CUSCO })).rejects.toThrow(SucursalNoEncontradaError);
    });

    it('un feriado de sucursal sin sucursal es inválido', async () => {
      await expect(crear({ alcance: 'SUCURSAL' })).rejects.toThrow(new FeriadoInvalidoError('La sucursal solo aplica a feriados de sucursal'));
    });
  });

  describe('ActualizarFeriado', () => {
    it('cambia la fecha, sube la versión y publica MODIFICADO', async () => {
      const { id } = await crear();
      const resultado = await new ActualizarFeriado(actual.dependencias).ejecutar(comandoActualizar(id, { fecha: '2026-05-16' }));
      expect(resultado).toMatchObject({ fecha: '2026-05-16', version: 1, cambiado: true });
      expect(actual.publicados.at(-1)).toMatchObject({ aggregateVersion: 1, payload: { accion: 'MODIFICADO', fecha: '2026-05-16', version: 1 } });
    });

    it('sin cambios responde cambiado false, sin escribir ni publicar', async () => {
      const { id } = await crear();
      const escrituras = actual.feriados.escrituras;
      const resultado = await new ActualizarFeriado(actual.dependencias).ejecutar(comandoActualizar(id));
      expect(resultado).toMatchObject({ version: 0, cambiado: false });
      expect(actual.feriados.escrituras).toBe(escrituras);
      expect(actual.publicados).toHaveLength(1);
    });

    it('una versión obsoleta da 409 VERSION_OBSOLETA', async () => {
      const { id } = await crear();
      await expect(new ActualizarFeriado(actual.dependencias).ejecutar(comandoActualizar(id, { fecha: '2026-05-16', version: 3 }))).rejects.toThrow(
        VersionObsoletaError,
      );
    });

    it('editar hacia una fecha que ya es feriado da 409; editarse a sí mismo no choca', async () => {
      const { id } = await crear({ recurrenteAnual: true });
      const actualizar = new ActualizarFeriado(actual.dependencias);
      await expect(actualizar.ejecutar(comandoActualizar(id, { fecha: '2026-07-28', recurrenteAnual: true }))).rejects.toThrow(FeriadoDuplicadoError);
      await expect(actualizar.ejecutar(comandoActualizar(id, { nombre: 'Aniversario de la clínica', recurrenteAnual: true }))).resolves.toMatchObject({
        cambiado: true,
      });
    });

    it('cambiar el alcance es inválido', async () => {
      const { id } = await crear();
      await expect(new ActualizarFeriado(actual.dependencias).ejecutar(comandoActualizar(id, { alcance: 'SUCURSAL', sucursalId: CUSCO }))).rejects.toThrow(
        new FeriadoInvalidoError('El alcance de un feriado no se cambia'),
      );
    });

    it('editar un global desde un tenant da 404 FERIADO_NO_ENCONTRADO', async () => {
      await expect(
        new ActualizarFeriado(actual.dependencias).ejecutar(comandoActualizar(GLOBALES.angamos, { fecha: '2026-10-08', nombre: 'Angamos', recurrenteAnual: true })),
      ).rejects.toThrow(FeriadoNoEncontradoError);
    });

    it('el operador edita un global con la función DEFINER', async () => {
      actual.comoTenant(OPERADOR);
      const resultado = await new ActualizarFeriado(actual.dependencias).ejecutar(
        comandoActualizar(GLOBALES.angamos, { fecha: '2026-10-08', nombre: 'Combate naval de Angamos', recurrenteAnual: true }),
      );
      expect(resultado).toMatchObject({ alcance: 'GLOBAL', version: 1, cambiado: true });
    });

    it('un feriado de otro tenant da 404', async () => {
      const { id } = await crear();
      actual.comoTenant(OPERADOR);
      await expect(new ActualizarFeriado(actual.dependencias).ejecutar(comandoActualizar(id, { fecha: '2026-05-16' }))).rejects.toThrow(FeriadoNoEncontradoError);
    });
  });

  describe('EliminarFeriado', () => {
    it('borra el feriado del tenant y publica ELIMINADO con la versión borrada', async () => {
      const { id } = await crear();
      await new EliminarFeriado(actual.dependencias).ejecutar({ feriadoId: id, version: 0, actorId: ANA });
      expect(actual.feriados.filas.has(id)).toBe(false);
      expect(actual.publicados.at(-1)).toMatchObject({ payload: { accion: 'ELIMINADO', version: 0 } });
    });

    it('con versión obsoleta da 409 y no borra', async () => {
      const { id } = await crear();
      await expect(new EliminarFeriado(actual.dependencias).ejecutar({ feriadoId: id, version: 2, actorId: ANA })).rejects.toThrow(VersionObsoletaError);
      expect(actual.feriados.filas.has(id)).toBe(true);
    });

    it('borrar un global desde un tenant da 404; el operador sí lo borra', async () => {
      const eliminar = new EliminarFeriado(actual.dependencias);
      await expect(eliminar.ejecutar({ feriadoId: GLOBALES.juevesSanto, version: 0, actorId: ANA })).rejects.toThrow(FeriadoNoEncontradoError);
      actual.comoTenant(OPERADOR);
      await eliminar.ejecutar({ feriadoId: GLOBALES.juevesSanto, version: 0, actorId: ANA });
      expect(actual.feriados.filas.has(GLOBALES.juevesSanto)).toBe(false);
    });

    it('un id inexistente da 404', async () => {
      await expect(new EliminarFeriado(actual.dependencias).ejecutar({ feriadoId: 'no-existe', version: 0, actorId: ANA })).rejects.toThrow(
        FeriadoNoEncontradoError,
      );
    });
  });

  describe('ListarFeriados', () => {
    it('2027 trae Fiestas Patrias en 2027-07-28 con editable false para un tenant, sin el Jueves Santo de 2026', async () => {
      const lista = await listar(2027);
      expect(lista.map((feriado) => feriado.fechaEnAnio)).toEqual(['2027-07-28', '2027-07-29', '2027-10-08']);
      expect(lista[0]).toEqual({
        id: GLOBALES.fiestasPatrias,
        alcance: 'GLOBAL',
        sucursalId: null,
        fecha: '2026-07-28',
        fechaEnAnio: '2027-07-28',
        nombre: 'Fiestas Patrias',
        recurrenteAnual: true,
        version: 0,
        editable: false,
      });
    });

    it('el operador ve los globales editables', async () => {
      actual.comoTenant(OPERADOR);
      expect((await listar(2026)).every((feriado) => feriado.editable)).toBe(true);
    });

    it('TR-CA-076: el feriado de Cusco aparece en la lista de Cusco y no en la de Lima; sin sucursal, en la del tenant', async () => {
      await crear({ alcance: 'SUCURSAL', sucursalId: CUSCO, fecha: '2026-06-24', nombre: 'Inti Raymi' });
      const nombres = async (sucursalId: string | null) => (await listar(2026, sucursalId)).map((feriado) => feriado.nombre);
      expect(await nombres(CUSCO)).toContain('Inti Raymi');
      expect(await nombres(LIMA)).not.toContain('Inti Raymi');
      expect(await nombres(null)).toContain('Inti Raymi');
    });

    it('ordena por la fecha en el año y marca editables los propios', async () => {
      await crear({ fecha: '2026-01-15', nombre: 'Aniversario de la clínica', recurrenteAnual: true });
      const lista = await listar(2027);
      expect(lista.map((feriado) => [feriado.fechaEnAnio, feriado.editable])).toEqual([
        ['2027-01-15', true],
        ['2027-07-28', false],
        ['2027-07-29', false],
        ['2027-10-08', false],
      ]);
    });

    it('otro tenant no ve los feriados del cliente', async () => {
      await crear({ fecha: '2026-05-15' });
      actual.comoTenant(OPERADOR);
      expect((await listar(2026)).map((feriado) => feriado.fecha)).not.toContain('2026-05-15');
    });
  });
});
